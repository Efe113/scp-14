const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    StreamType,
    VoiceConnectionStatus,
    entersState,
    getVoiceConnection
} = require('@discordjs/voice');
const { spawn } = require('child_process');
const { getVideoInfo } = require('../../../utils.js');
const db = require('../../db.js');
const fs = require('fs');
const path = require('path');

// --- [SİSTEM YAPILANDIRMASI] ---
const CONFIG = {
    // Exe yolları (Ana dizinde olduklarını varsayıyoruz)
    YTDLP_PATH: path.join(process.cwd(), 'yt-dlp.exe'),
    FFMPEG_PATH: path.join(process.cwd(), 'ffmpeg.exe'), 
    
    CACHE_DIR: path.join(__dirname, '../../cache'),
    MAX_QUEUE_SIZE: 1000,
    FADE_DURATION: 5000, 
    DISCONNECT_TIMEOUT: 600000,
    RADIO_STATIONS: {
        'powerfm': 'http://powerfm.listenpowerapp.com/powerfm/mpeg/icecast.audio',
        'kralpop': 'http://46.20.3.204/kralpop/mpeg/icecast.audio',
        'fenomen': 'http://fenomen.listenfenomen.com/fenomen/128/icecast.audio',
        'metrofm': 'http://metrofm.listenpowerapp.com/metrofm/mpeg/icecast.audio',
        'lofi': 'http://stream.zeno.fm/0r0xa792kwzuv',
        'joyfm': 'https://joyfm.listenpowerapp.com/joyfm/mpeg/icecast.audio'
    },
    FILTERS: {
        'bassboost': 'bass=g=20,dynaudnorm=f=200',
        'nightcore': 'asetrate=48000*1.25,aresample=48000,bass=g=5',
        'vaporwave': 'asetrate=48000*0.8,aresample=48000,atempo=1.1',
        '8d': 'apulsator=hz=0.125',
        'karaoke': 'stereotools=mlev=0.015625',
        'phaser': 'aphaser=in_gain=0.4',
        'earrape': 'acrusher=level_in=8:level_out=18:bits=8:mode=log:aa=1',
        'normalizer': 'loudnorm=I=-16:TP=-1.5:LRA=11'
    }
};

if (!fs.existsSync(CONFIG.CACHE_DIR)) {
    try { fs.mkdirSync(CONFIG.CACHE_DIR, { recursive: true }); } catch (e) {}
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('OMEGA-IV Müzik Motoru: Nihai Ses Deneyimi.')
        .addStringOption(op => op.setName('sorgu').setDescription('Müzik Linki, Şarkı Adı veya Radyo').setRequired(true))
        .addIntegerOption(op => op.setName('seek').setDescription('Başlangıç saniyesi').setMinValue(0).setRequired(false))
        .addBooleanOption(op => op.setName('anons').setDescription('Anons yapılsın mı?').setRequired(false))
        .addStringOption(op => op.setName('filtre').setDescription('Ses efekti').setRequired(false)
            .addChoices(
                { name: '🔊 Bass Boost', value: 'bassboost' },
                { name: '🌙 Nightcore', value: 'nightcore' },
                { name: '🌫️ Vaporwave', value: 'vaporwave' },
                { name: '🎧 8D Audio', value: '8d' }
            ))
        .addBooleanOption(op => op.setName('force').setDescription('Hemen çal (Sırayı atla)').setRequired(false)),

    async execute(interaction, client) {
        await interaction.deferReply();
        
        const channel = interaction.member.voice.channel;
        const query = interaction.options.getString('sorgu');
        const seekTime = interaction.options.getInteger('seek') || 0;
        const doAnnounce = interaction.options.getBoolean('anons') || false;
        const initialFilterKey = interaction.options.getString('filtre');
        const forcePlay = interaction.options.getBoolean('force') || false;

        if (!channel) return interaction.followUp({ content: '❌ Önce ses kanalına girin.', ephemeral: true });
        
        const perms = channel.permissionsFor(client.user);
        if (!perms.has('Connect') || !perms.has('Speak')) return interaction.followUp('❌ Yetkim yok.');

        let searchType = 'youtube';
        let searchAddress = query;

        if (CONFIG.RADIO_STATIONS[query.toLowerCase()]) {
            searchType = 'radio_preset';
            searchAddress = CONFIG.RADIO_STATIONS[query.toLowerCase()];
        } else if (/^(http|https):\/\/[^ "]+$/.test(query)) {
            if (!query.includes('youtube') && !query.includes('spotify') && !query.includes('youtu.be')) {
                searchType = 'radio_url';
            }
        } else {
            searchAddress = `ytsearch1:${query}`;
        }

        try {
            let info;
            let songsToAdd = [];

            if (searchType.startsWith('radio')) {
                info = { 
                    title: searchType === 'radio_preset' ? `📻 ${query.toUpperCase()} Radyo` : '📡 Canlı Radyo Akışı', 
                    url: searchAddress, 
                    duration: 'LIVE', 
                    thumbnail: 'https://i.imgur.com/Q2h8yLq.png', 
                    isLive: true,
                    radioMode: true
                };
                songsToAdd.push(formatSong(info, interaction.user, initialFilterKey));
            } else {
                try {
                    info = await getVideoInfo(searchAddress);
                } catch (e) {
                    return interaction.followUp('❌ İçerik bulunamadı.');
                }

                if (!info) return interaction.followUp('❌ Sonuç yok.');

                if (Array.isArray(info)) {
                    songsToAdd = info.map(track => formatSong(track, interaction.user, initialFilterKey));
                } else {
                    const song = formatSong(info, interaction.user, initialFilterKey);
                    if (seekTime > 0) song.seek = seekTime;
                    songsToAdd.push(song);
                }
            }

            const guildId = interaction.guild.id;
            let serverQueue = client.queue.get(guildId);

            if (!serverQueue) {
                const queueConstruct = {
                    textChannel: interaction.channel,
                    voiceChannel: channel,
                    connection: null,
                    player: null,
                    resource: null,
                    songs: [],
                    loop: 0,
                    volume: db.getServerVolume(guildId) || 100,
                    filter: initialFilterKey ? CONFIG.FILTERS[initialFilterKey] : null,
                    filterName: initialFilterKey || 'Normal',
                    playing: true,
                    disconnectTimer: null,
                    autoplay: false,
                    lastPlayed: null,
                    isRadio: searchType.startsWith('radio'),
                    bitrate: channel.bitrate
                };

                client.queue.set(guildId, queueConstruct);
                queueConstruct.songs.push(...songsToAdd);

                try {
                    const connection = joinVoiceChannel({
                        channelId: channel.id,
                        guildId: channel.guild.id,
                        adapterCreator: channel.guild.voiceAdapterCreator,
                        selfDeaf: false
                    });

                    connection.on(VoiceConnectionStatus.Disconnected, async () => {
                        try {
                            await Promise.race([
                                entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                                entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                            ]);
                        } catch (error) {
                            if (client.queue.has(guildId)) client.queue.delete(guildId);
                            connection.destroy();
                        }
                    });

                    queueConstruct.connection = connection;
                    playSong(interaction.guild, queueConstruct.songs[0], client);

                    const msg = songsToAdd.length > 1 
                        ? `✅ **Playlist:** ${songsToAdd.length} parça eklendi.`
                        : `✅ **Oynatılıyor:** ${songsToAdd[0].title}`;
                    await interaction.followUp(msg);

                } catch (err) {
                    client.queue.delete(guildId);
                    return interaction.followUp(`❌ Hata: ${err.message}`);
                }

            } else {
                if (forcePlay) {
                    serverQueue.songs.splice(1, 0, ...songsToAdd);
                    serverQueue.player.stop();
                    await interaction.followUp(`⚡ **Force:** ${songsToAdd[0].title} çalınıyor.`);
                } else {
                    serverQueue.songs.push(...songsToAdd);
                    const embed = new EmbedBuilder()
                        .setColor('#2ecc71')
                        .setTitle('➕ Kuyruğa Eklendi')
                        .setDescription(`[${songsToAdd[0].title}](${songsToAdd[0].url})`)
                        .setThumbnail(songsToAdd[0].thumbnail)
                        .setFooter({ text: `Sıra: ${serverQueue.songs.length - 1}` });
                    
                    if (songsToAdd.length > 1) embed.setDescription(`**${songsToAdd.length}** parça eklendi.`);
                    return interaction.followUp({ embeds: [embed] });
                }
            }

        } catch (error) {
            console.error(error);
            await interaction.followUp('❌ Kritik hata.');
        }
    }
};

function formatSong(info, user, filterKey) {
    return {
        title: info.title || 'Bilinmeyen',
        url: info.url,
        thumbnail: info.thumbnail || 'https://i.imgur.com/AfFp7pu.png',
        duration: info.duration || '??:??',
        requester: user,
        filterKey: filterKey,
        radio: info.radioMode || false,
        seek: 0
    };
}

async function playSong(guild, song, client) {
    const serverQueue = client.queue.get(guild.id);

    if (!song) {
        if (serverQueue.disconnectTimer) clearTimeout(serverQueue.disconnectTimer);
        serverQueue.disconnectTimer = setTimeout(() => {
            if (serverQueue.connection && serverQueue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                serverQueue.connection.destroy();
                client.queue.delete(guild.id);
            }
        }, CONFIG.DISCONNECT_TIMEOUT);
        return;
    }

    if (serverQueue.disconnectTimer) { clearTimeout(serverQueue.disconnectTimer); serverQueue.disconnectTimer = null; }
    
    serverQueue.lastPlayed = song;
    if (db.incrementPlayCount) db.incrementPlayCount();

    const filters = [];
    filters.push(CONFIG.FILTERS['normalizer']);
    if (serverQueue.filter) filters.push(serverQueue.filter);
    if (song.filterKey && CONFIG.FILTERS[song.filterKey]) filters.push(CONFIG.FILTERS[song.filterKey]);
    const filterStr = filters.join(',');

    let streamProcess;
    let streamType;

    if (song.radio) {
        const ffmpegBin = fs.existsSync(CONFIG.FFMPEG_PATH) ? CONFIG.FFMPEG_PATH : 'ffmpeg';
        const ffmpegArgs = ['-re', '-i', song.url, '-map', '0:a', '-ac', '2', '-ar', '48000', '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1'];
        if (filters.length > 0) {
            const idx = ffmpegArgs.indexOf('-ac');
            ffmpegArgs.splice(idx, 0, '-af', filterStr);
        }
        streamProcess = spawn(ffmpegBin, ffmpegArgs);
        streamType = StreamType.Raw;
    } else {
        const ytDlpBin = fs.existsSync(CONFIG.YTDLP_PATH) ? CONFIG.YTDLP_PATH : 'yt-dlp';
        const ytArgs = ['-o', '-', '-q', '-f', 'bestaudio', '--no-playlist', '--geo-bypass', '--buffer-size', '16K', '--force-ipv4', '--no-check-certificate', song.url];
        if (filters.length > 0) ytArgs.push('--ppa', `ffmpeg:-af ${filterStr} -ac 2 -ar 48000`);
        if (song.seek > 0) ytArgs.unshift(`-ss`, `${song.seek}`);
        streamProcess = spawn(ytDlpBin, ytArgs);
        streamType = StreamType.Arbitrary;
    }

    const resource = createAudioResource(streamProcess.stdout, { inputType: streamType, inlineVolume: true });
    resource.volume.setVolume(serverQueue.volume / 100);
    serverQueue.resource = resource;

    if (!serverQueue.player) {
        serverQueue.player = createAudioPlayer();
        
        serverQueue.player.on(AudioPlayerStatus.Playing, () => {
            let currentVol = 0;
            const targetVol = serverQueue.volume / 100;
            const step = targetVol / 20;
            const fade = setInterval(() => {
                currentVol += step;
                if (currentVol >= targetVol) { currentVol = targetVol; clearInterval(fade); }
                if (serverQueue.resource && !serverQueue.resource.ended) serverQueue.resource.volume.setVolume(currentVol);
            }, 100);
        });

        // [KRİTİK FIX] Seek yapılıyorsa şarkıyı geçme
        serverQueue.player.on(AudioPlayerStatus.Idle, () => {
            if (!serverQueue.isSeeking) handleNextSong(guild, serverQueue, client);
        });

        serverQueue.player.on('error', error => {
            console.error(`> [PLAYER HATA] ${error.message}`);
            if (!serverQueue.isSeeking) handleNextSong(guild, serverQueue, client);
        });

        serverQueue.connection.subscribe(serverQueue.player);
    }

    serverQueue.player.play(resource);
    await sendOmegaPanel(serverQueue.textChannel, song, serverQueue);
}

function handleNextSong(guild, serverQueue, client) {
    if (serverQueue.loop === 1) playSong(guild, serverQueue.songs[0], client);
    else if (serverQueue.loop === 2) {
        const finished = serverQueue.songs.shift();
        serverQueue.songs.push(finished);
        playSong(guild, serverQueue.songs[0], client);
    } else {
        serverQueue.songs.shift();
        playSong(guild, serverQueue.songs[0], client);
    }
}

async function sendOmegaPanel(channel, song, queue) {
    const color = song.radio ? '#FFA500' : '#FF0000';
    const volBar = createVolBar(queue.volume);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(song.title)
        .setURL(song.url.length <= 512 ? song.url : null) // URL Link güvenliği
        .setAuthor({ name: song.radio ? '📡 Radyo Yayını' : '💿 OMEGA Oynatıcı', iconURL: 'https://cdn.discordapp.com/emojis/843194098939068466.gif?v=1' })
        .setDescription(`
        👤 **İsteyen:** ${song.requester}
        🎚️ **Ses:** \`${volBar} %${queue.volume}\`
        🎛️ **Filtre:** \`${queue.filterName || 'Normal'}\`
        ${song.radio ? '🌍 **Kaynak:** Canlı Akış (Low Latency)' : `🎵 **Süre:** ${song.duration}`}
        `)
        .setThumbnail(song.thumbnail)
        .setFooter({ text: `SCP-000 | v11.0 | Bitrate: ${queue.bitrate / 1000}kbps` });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('music_pause').setEmoji('⏯️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_loop').setEmoji('🔁').setStyle(ButtonStyle.Success)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('vol_down').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('vol_up').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('pl_quick_save').setEmoji('❤️').setLabel('Favorile').setStyle(ButtonStyle.Success)
    );

    // [KRİTİK FIX DÜZELTİLDİ]
    if (song.url.length <= 512) {
        // Link butonu (Custom ID OLAMAZ)
        row2.addComponents(new ButtonBuilder().setLabel('İndir').setEmoji('💾').setStyle(ButtonStyle.Link).setURL(song.url));
    } else {
        // Pasif buton (Secondary stil) -> Custom ID ZORUNLU
        row2.addComponents(
            new ButtonBuilder()
                .setCustomId('disabled_url_btn') // <-- EKSİK OLAN KISIM EKLENDİ
                .setLabel('Link Çok Uzun')
                .setEmoji('⚠️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );
    }

    const filterMenu = new StringSelectMenuBuilder()
        .setCustomId('music_filter_select')
        .setPlaceholder('🎛️ Ses Filtresi Seç')
        .addOptions(
            new StringSelectMenuOptionBuilder().setLabel('Normal (Reset)').setValue('clear').setEmoji('🔄'),
            new StringSelectMenuOptionBuilder().setLabel('Bass Boost').setValue('bassboost').setEmoji('🔊'),
            new StringSelectMenuOptionBuilder().setLabel('Nightcore').setValue('nightcore').setEmoji('🌙'),
            new StringSelectMenuOptionBuilder().setLabel('Vaporwave').setValue('vaporwave').setEmoji('🌫️'),
            new StringSelectMenuOptionBuilder().setLabel('8D Audio').setValue('8d').setEmoji('🎧'),
            new StringSelectMenuOptionBuilder().setLabel('Karaoke').setValue('karaoke').setEmoji('🎤')
        );

    const row3 = new ActionRowBuilder().addComponents(filterMenu);

    await channel.send({ embeds: [embed], components: [row1, row2, row3] });
}

function createVolBar(vol) {
    const total = 10;
    const filled = Math.round((vol / 100) * total);
    let str = '';
    for(let i=0; i<total; i++) str += i < filled ? '▮' : '▯';
    return str;
}
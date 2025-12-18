const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ComponentType,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    StreamType,
    VoiceConnectionStatus,
    entersState
} = require('@discordjs/voice');
const { spawn } = require('child_process');
const { getVideoInfo, getYoutubeVideoStats, checkDJ } = require('../../../utils.js');
const db = require('../../db.js');
const fs = require('fs');
const path = require('path');
const seekModule = require('./seek.js');

// --- [SİSTEM YAPILANDIRMASI] ---
const CONFIG = {
    YTDLP_PATH: path.join(process.cwd(), 'yt-dlp.exe'),
    FFMPEG_PATH: path.join(process.cwd(), 'ffmpeg.exe'),
    
    CACHE_DIR: path.join(__dirname, '../../cache'),
    MAX_QUEUE_SIZE: 500,
    DISCONNECT_TIMEOUT: 300000, // 5 dakika
    MAX_SONG_DURATION: 7200, // 2 saat (saniye)
    MIN_SONG_DURATION: 10, // 10 saniye
    
    RADIO_STATIONS: {
        'powerfm': { name: 'Power FM', url: 'http://powerfm.listenpowerapp.com/powerfm/mpeg/icecast.audio', color: '#FF0000' },
        'kralfm': { name: 'Kral FM', url: 'http://46.20.3.204/kralfm/mpeg/icecast.audio', color: '#FF9900' },
        'fenomen': { name: 'Fenomen FM', url: 'http://fenomen.listenfenomen.com/fenomen/128/icecast.audio', color: '#6633CC' },
        'metrofm': { name: 'Metro FM', url: 'http://metrofm.listenpowerapp.com/metrofm/mpeg/icecast.audio', color: '#00CC66' },
        'joyfm': { name: 'Joy FM', url: 'https://joyfm.listenpowerapp.com/joyfm/mpeg/icecast.audio', color: '#FF66CC' },
        'lofi': { name: 'Lo-Fi Radio', url: 'http://stream.zeno.fm/0r0xa792kwzuv', color: '#6699FF' },
        'rock': { name: 'Rock FM', url: 'http://rockfm.listenpowerapp.com/rockfm/mpeg/icecast.audio', color: '#CC3300' },
        'best': { name: 'Best FM', url: 'http://bestfm.listenpowerapp.com/bestfm/mpeg/icecast.audio', color: '#FF3366' },
        'alem': { name: 'Alem FM', url: 'http://alemfm.listenpowerapp.com/alemfm/mpeg/icecast.audio', color: '#33CCFF' },
        'super': { name: 'Super FM', url: 'http://superfm.listenpowerapp.com/superfm/mpeg/icecast.audio', color: '#FF33CC' },
        'classical': { name: 'Klasik Radyo', url: 'http://stream.radioparadise.com/classical-128', color: '#9966FF' },
        'jazz': { name: 'Caz Radyosu', url: 'http://jazz.streamr.ru/jazz-128.mp3', color: '#FF6600' }
    },
    
    AUDIO_FILTERS: {
        'none': { name: 'Normal', emoji: '🔊', description: 'Hiçbir efekt uygulanmaz', command: null },
        'bass_boost': { 
            name: 'Bass Boost', 
            emoji: '🔈', 
            description: 'Bassları güçlendirir',
            command: 'bass=g=12,dynaudnorm=f=150'
        },
        'nightcore': { 
            name: 'Nightcore', 
            emoji: '🌙', 
            description: 'Hızlandırılmış ve yüksek perdeli',
            command: 'asetrate=48000*1.25,aresample=48000'
        },
        'vaporwave': { 
            name: 'Vaporwave', 
            emoji: '🌫️', 
            description: 'Yavaşlatılmış ve lo-fi',
            command: 'asetrate=48000*0.8,aresample=48000'
        },
        'karaoke': { 
            name: 'Karaoke', 
            emoji: '🎤', 
            description: 'Vokalleri azaltır',
            command: 'stereotools=mlev=0.025'
        },
        'surround': { 
            name: '3D Surround', 
            emoji: '🎧', 
            description: 'Spatial audio efekti',
            command: 'surround'
        },
        'radio': { 
            name: 'Eski Radyo', 
            emoji: '📻', 
            description: 'Vintage radyo efekti',
            command: 'highpass=f=300,lowpass=f=3000'
        },
        'soft': { 
            name: 'Yumuşak', 
            emoji: '☁️', 
            description: 'Yumuşak ve rahatlatıcı',
            command: 'bass=g=-3,treble=g=3'
        },
        'party': { 
            name: 'Parti Modu', 
            emoji: '🎉', 
            description: 'Yüksek enerji ve bas',
            command: 'bass=g=15,treble=g=8'
        },
        'clear': { 
            name: 'Temizle', 
            emoji: '🔄', 
            description: 'Tüm filtreleri kaldır',
            command: null
        },
        '8d': { 
            name: '8D Audio', 
            emoji: '🎧', 
            description: '3D dönen ses efekti',
            command: 'apulsator=hz=0.125:amount=1'
        },
        'concert': { 
            name: 'Konser', 
            emoji: '🎤', 
            description: 'Canlı konser efekti',
            command: 'surround=level_in=3'
        },
        'deep': { 
            name: 'Deep Bass', 
            emoji: '🔊', 
            description: 'Derin bas efekti',
            command: 'bass=g=20,dynaudnorm=f=200'
        }
    },
    
    // Yeni: Otomatik öneri sistemleri
    AUTO_SUGGESTIONS: {
        ENABLED: true,
        MAX_SUGGESTIONS: 5,
        COOLDOWN: 60000 // 1 dakika
    }
};

// Klasör oluştur
if (!fs.existsSync(CONFIG.CACHE_DIR)) {
    try { fs.mkdirSync(CONFIG.CACHE_DIR, { recursive: true }); } catch (e) {}
}

// Kanal başına istatistikleri sakla
const channelStats = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('🎵 Gelişmiş müzik çalma sistemi')
        .addStringOption(op => 
            op.setName('sorgu')
                .setDescription('Şarkı adı, YouTube/Spotify linki veya radyo (powerfm, kralfm, lofi...)')
                .setRequired(true)
                .setAutocomplete(true)) // Yeni: Otomatik tamamlama eklendi
        .addIntegerOption(op => 
            op.setName('seek')
                .setDescription('Kaçıncı saniyeden başlasın? (örn: 90)')
                .setMinValue(0)
                .setMaxValue(36000) // 10 saat maksimum
                .setRequired(false))
        .addBooleanOption(op => 
            op.setName('shuffle')
                .setDescription('Playlist varsa karıştırılsın mı?')
                .setRequired(false))
        .addBooleanOption(op => 
            op.setName('autoplay')
                .setDescription('Benzer şarkılar otomatik eklensin mi?')
                .setRequired(false))
        .addBooleanOption(op => 
            op.setName('force')
                .setDescription('Hemen çal (kuyruğu atla)')
                .setRequired(false))
        .addStringOption(op => 
            op.setName('filtre')
                .setDescription('Başlangıç filtresi seçin')
                .setRequired(false)
                .addChoices(
                    { name: '🔊 Normal', value: 'none' },
                    { name: '🔈 Bass Boost', value: 'bass_boost' },
                    { name: '🌙 Nightcore', value: 'nightcore' },
                    { name: '🌫️ Vaporwave', value: 'vaporwave' },
                    { name: '🎤 Karaoke', value: 'karaoke' },
                    { name: '🎧 8D Audio', value: '8d' },
                    { name: '🎤 Konser', value: 'concert' },
                    { name: '🔊 Deep Bass', value: 'deep' }
                ))
        .addIntegerOption(op => 
            op.setName('limit')
                .setDescription('Playlistten kaç şarkı eklensin? (1-100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false))
        .addBooleanOption(op => 
            op.setName('karaoke')
                .setDescription('Karoke modu (sadece YouTube)')
                .setRequired(false))
        .addBooleanOption(op => 
            op.setName('lyrics')
                .setDescription('Şarkıyı açar açmaz sözleri göster')
                .setRequired(false)),

    // Yeni: Otomatik tamamlama özelliği
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        
        if (focusedValue.length < 2) {
            await interaction.respond([]);
            return;
        }

        // Radyo istasyonları için öneri
        const radioSuggestions = Object.entries(CONFIG.RADIO_STATIONS)
            .filter(([key, station]) => 
                station.name.toLowerCase().includes(focusedValue.toLowerCase()) ||
                key.toLowerCase().includes(focusedValue.toLowerCase())
            )
            .slice(0, 5)
            .map(([key, station]) => ({
                name: `📻 ${station.name}`,
                value: key
            }));

        await interaction.respond(radioSuggestions);
    },

    async execute(interaction, client) {
        await interaction.deferReply();
        
        const channel = interaction.member.voice.channel;
        const query = interaction.options.getString('sorgu');
        const seekTime = interaction.options.getInteger('seek') || 0;
        const shuffle = interaction.options.getBoolean('shuffle') || false;
        const autoplay = interaction.options.getBoolean('autoplay') || false;
        const forcePlay = interaction.options.getBoolean('force') || false;
        const initialFilter = interaction.options.getString('filtre') || 'none';
        const playlistLimit = interaction.options.getInteger('limit') || null;
        const karaokeMode = interaction.options.getBoolean('karaoke') || false;
        const showLyrics = interaction.options.getBoolean('lyrics') || false;

        // DJ kontrolü (isteğe bağlı)
        const isDJ = checkDJ(interaction);
        
        // Ses kanalı kontrolü
        if (!channel) {
            return interaction.followUp({ 
                content: '🔇 **Ses Kanalı Gerekli:** Müzik çalmak için önce bir ses kanalına katılmalısın!', 
                flags: MessageFlags.Ephemeral 
            });
        }
        
        // Bot izinleri kontrolü
        const perms = channel.permissionsFor(client.user);
        if (!perms.has('Connect') || !perms.has('Speak')) {
            return interaction.followUp({ 
                content: '⚠️ **Yetki Hatası:** Bu kanala bağlanmak veya konuşmak için yeterli iznim yok.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // Kanal istatistiklerini güncelle
        updateChannelStats(channel.id);

        try {
            // RADYO MODU
            if (CONFIG.RADIO_STATIONS[query.toLowerCase()]) {
                return await handleRadio(interaction, client, channel, query.toLowerCase(), forcePlay, initialFilter);
            }

            // ÖZEL MODLAR
            if (query.toLowerCase() === 'trending') {
                return await handleTrending(interaction, client, channel);
            }
            
            if (query.toLowerCase() === 'mix') {
                return await handlePersonalMix(interaction, client, channel);
            }

            // YOUTUBE/SPOTIFY MODU
            let searchQuery = query;
            let isDirectLink = false;
            
            // Link mi yoksa arama mı kontrol et
            if (query.startsWith('http') || query.includes('youtu.be') || query.includes('spotify')) {
                isDirectLink = true;
                searchQuery = query;
            } else {
                searchQuery = `ytsearch1:${query}`;
            }

            const info = await getVideoInfo(searchQuery);
            
            if (!info) {
                return interaction.followUp({ 
                    content: '🔍 **Arama Sonuçsuz:** Belirtilen içerik bulunamadı. Farklı bir isim veya link deneyin.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            if (!info || (Array.isArray(info) && info.length === 0)) {
                return interaction.followUp({ 
                    content: '❌ **İçerik Bulunamadı:** Video veya şarkı bilgisi alınamadı.', 
                    flags: MessageFlags.Ephemeral
                });
            }

            let songs = [];
            
            // Playlist veya tek şarkı
            if (Array.isArray(info)) {
                if (info.length === 0) {
                    return interaction.followUp({ 
                        content: '📭 **Playlist Boş:** Bu playlistte şarkı bulunamadı.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }
                
                // Playlist limiti uygula
                let tracks = info;
                if (playlistLimit && playlistLimit < tracks.length) {
                    tracks = tracks.slice(0, playlistLimit);
                }
                
                songs = tracks.map(track => formatSong(track, interaction.user, karaokeMode ? 'karaoke' : initialFilter));
                
                if (shuffle) {
                    songs = songs.sort(() => Math.random() - 0.5);
                }
                
            } else {
                songs = [formatSong(info, interaction.user, karaokeMode ? 'karaoke' : initialFilter)];
                
                // İstatistik bilgisi al (YouTube için)
                if (info.url.includes('youtube.com') || info.url.includes('youtu.be')) {
                    try {
                        const stats = await getYoutubeVideoStats(info.url);
                        if (stats) {
                            songs[0].views = stats.views;
                            songs[0].likes = stats.likes;
                            songs[0].uploader = stats.uploader;
                            songs[0].published = stats.published;
                        }
                    } catch (e) {
                        console.log('İstatistik bilgisi alınamadı:', e.message);
                    }
                }
            }

            // Şarkı süresi kontrolü
            const invalidSongs = songs.filter(song => {
                const durationSeconds = hmsToSeconds(song.duration);
                return durationSeconds > CONFIG.MAX_SONG_DURATION || durationSeconds < CONFIG.MIN_SONG_DURATION;
            });
            
            if (invalidSongs.length > 0) {
                return interaction.followUp({ 
                    content: `❌ **Süre Sınırı:** Bazı şarkılar çok kısa (<${CONFIG.MIN_SONG_DURATION}s) veya çok uzun (>${Math.floor(CONFIG.MAX_SONG_DURATION/3600)}sa).`, 
                    flags: MessageFlags.Ephemeral 
                });
            }

            // Seek zamanı ekle
            if (seekTime > 0) {
                songs.forEach(song => song.seek = seekTime);
            }

            // Kuyruk işlemleri
            const guildId = interaction.guild.id;
            let serverQueue = client.queue.get(guildId);

            if (!serverQueue) {
                // Yeni kuyruk oluştur
                const queueConstruct = {
                    textChannel: interaction.channel,
                    voiceChannel: channel,
                    connection: null,
                    player: null,
                    resource: null,
                    songs: [],
                    loop: 0, // 0: kapalı, 1: tek şarkı, 2: tüm liste
                    volume: db.getServerVolume ? db.getServerVolume(guildId) : 100,
                    filter: (initialFilter !== 'none' && !karaokeMode) ? CONFIG.AUDIO_FILTERS[initialFilter]?.command || null : 
                           (karaokeMode ? CONFIG.AUDIO_FILTERS['karaoke']?.command || null : null),
                    filterName: karaokeMode ? 'karaoke' : initialFilter,
                    playing: true,
                    disconnectTimer: null,
                    autoplay: autoplay,
                    lastActivity: Date.now(),
                    isRadio: false,
                    bitrate: channel.bitrate,
                    requester: interaction.user,
                    isSeeking: false,
                    currentProcess: null,
                    playHistory: [],
                    suggestionsEnabled: CONFIG.AUTO_SUGGESTIONS.ENABLED,
                    lastSuggestion: Date.now() - CONFIG.AUTO_SUGGESTIONS.COOLDOWN,
                    isDJMode: isDJ,
                    channelId: channel.id,
                    messageCollector: null
                };

                client.queue.set(guildId, queueConstruct);
                queueConstruct.songs.push(...songs);

                try {
                    // Ses bağlantısını kur
                    const connection = joinVoiceChannel({
                        channelId: channel.id,
                        guildId: channel.guild.id,
                        adapterCreator: channel.guild.voiceAdapterCreator,
                        selfDeaf: true
                    });

                    connection.on(VoiceConnectionStatus.Disconnected, async () => {
                        try {
                            await Promise.race([
                                entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                                entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                            ]);
                        } catch (error) {
                            if (client.queue.has(guildId)) {
                                client.queue.delete(guildId);
                            }
                            connection.destroy();
                        }
                    });

                    queueConstruct.connection = connection;
                    await playSong(interaction.guild, queueConstruct.songs[0], client);

                    // Başarı mesajı
                    const embed = new EmbedBuilder()
                        .setColor('#2ecc71')
                        .setTitle('🎵 Müzik Başlatıldı')
                        .setDescription(songs.length > 1 
                            ? `**${songs.length} şarkı** kuyruğa eklendi ve çalınıyor!` 
                            : `**${songs[0].title}** şimdi çalınıyor!`)
                        .addFields(
                            { name: '👤 İsteyen', value: interaction.user.username, inline: true },
                            { name: '🔊 Kanal', value: channel.name, inline: true },
                            { name: '🎛️ Mod', value: karaokeMode ? '🎤 Karaoke' : (CONFIG.AUDIO_FILTERS[initialFilter]?.name || 'Normal'), inline: true }
                        )
                        .setThumbnail(songs[0].thumbnail)
                        .setFooter({ 
                            text: `SCP Music v12.0 | ${songs.length > 1 ? 'Playlist Modu' : 'Tek Şarkı'} | 🎯 ${songs[0].duration}` 
                        });

                    if (showLyrics && songs.length === 1) {
                        embed.addFields({ 
                            name: '📜 Şarkı Sözleri', 
                            value: '`/lyrics` komutuyla şarkı sözlerini görüntüleyebilirsiniz.',
                            inline: false 
                        });
                    }

                    await interaction.followUp({ embeds: [embed] });

                    // Playlist ise ek bilgi
                    if (songs.length > 1) {
                        const totalDuration = calculateTotalDuration(songs);
                        await interaction.channel.send({
                            content: `📊 **Playlist Özeti:** ${songs.length} şarkı • Toplam süre: ${totalDuration} • Ortalama: ${formatTime(Math.floor(hmsToSeconds(totalDuration)/songs.length))}`
                        });
                    }

                } catch (err) {
                    console.error('Bağlantı hatası:', err);
                    client.queue.delete(guildId);
                    return interaction.followUp({ 
                        content: `❌ **Bağlantı Hatası:** ${err.message}`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }

            } else {
                // Mevcut kuyruğa ekle
                if (forcePlay && isDJ) {
                    serverQueue.songs.splice(1, 0, ...songs);
                    serverQueue.player.stop();
                    
                    const embed = new EmbedBuilder()
                        .setColor('#e74c3c')
                        .setTitle('⚡ Zorla Çal (DJ Yetkisi)')
                        .setDescription(`**${songs[0].title}** hemen çalınıyor!`)
                        .addFields(
                            { name: '👤 DJ', value: interaction.user.username, inline: true },
                            { name: '📍 Konum', value: '1. Sırada', inline: true }
                        )
                        .setThumbnail(songs[0].thumbnail)
                        .setFooter({ text: 'Force play etkin' });
                    
                    await interaction.followUp({ embeds: [embed] });
                } else {
                    // Kuyruk limiti kontrolü
                    if (serverQueue.songs.length + songs.length > CONFIG.MAX_QUEUE_SIZE) {
                        return interaction.followUp({
                            content: `❌ **Kuyruk Doldu:** En fazla ${CONFIG.MAX_QUEUE_SIZE} şarkı ekleyebilirsiniz.`,
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    
                    serverQueue.songs.push(...songs);
                    
                    const embed = new EmbedBuilder()
                        .setColor('#3498db')
                        .setTitle('➕ Kuyruğa Eklendi')
                        .setDescription(songs.length > 1 
                            ? `**${songs.length} şarkı** kuyruğun sonuna eklendi.` 
                            : `**${songs[0].title}** kuyruğun sonuna eklendi.`)
                        .addFields(
                            { name: '🎵 Şu An Çalan', value: serverQueue.songs[0].title.substring(0, 100), inline: true },
                            { name: '📊 Kuyruk', value: `${serverQueue.songs.length - 1} şarkı bekliyor`, inline: true },
                            { name: '👤 Ekleyen', value: interaction.user.username, inline: true },
                            { name: '⏱️ Tahmini Süre', value: calculateQueueWaitTime(serverQueue), inline: false }
                        )
                        .setThumbnail(songs[0].thumbnail)
                        .setFooter({ text: `Sıra: #${serverQueue.songs.length} | 🎯 ${songs[0].duration}` });
                    
                    await interaction.followUp({ embeds: [embed] });
                }
            }

        } catch (error) {
            console.error('Play komutu hatası:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('❌ İşlem Başarısız')
                .setDescription('Müzik çalınırken bir hata oluştu.')
                .addFields(
                    { 
                        name: '🔧 Hata Detayı', 
                        value: error.message ? error.message.substring(0, 1000) : 'Bilinmeyen hata',
                        inline: false 
                    },
                    { name: '💡 Çözüm Önerisi', value: getErrorSolution(error), inline: false }
                )
                .setFooter({ text: 'SCP Music Hata Raporu' });
            
            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};

// ==========================================
// 🎵 YENİ ÖZELLİKLER
// ==========================================

async function handleTrending(interaction, client, channel) {
    // Trend müzikleri çal (basit bir örnek)
    const trendingSongs = [
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ', // Örnek
        'https://www.youtube.com/watch?v=9bZkp7q19f0', // Örnek
    ];
    
    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🔥 Trend Şarkılar')
        .setDescription('YouTube trend şarkıları yükleniyor...')
        .setFooter({ text: 'Bu özellik geliştirme aşamasındadır.' });
    
    await interaction.followUp({ embeds: [embed] });
}

async function handlePersonalMix(interaction, client, channel) {
    // Kişisel karışım oluştur
    const userId = interaction.user.id;
    const playlists = db.getUserPlaylists(userId);
    
    if (playlists.length === 0) {
        return interaction.followUp({
            content: '❌ Kişisel karışım oluşturmak için önce playlistlerinizde şarkılar olmalı.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    // Tüm playlistlerden rastgele şarkılar seç
    let allSongs = [];
    for (const playlist of playlists.slice(0, 3)) { // İlk 3 playlist
        const pl = db.getPlaylist(userId, playlist.name);
        if (pl && pl.songs.length > 0) {
            allSongs = allSongs.concat(pl.songs);
        }
    }
    
    if (allSongs.length === 0) {
        return interaction.followUp({
            content: '❌ Playlistlerinizde şarkı bulunamadı.',
            flags: MessageFlags.Ephemeral
        });
    }
    
    // Karıştır ve limit uygula (maksimum 25 şarkı)
    const shuffled = allSongs.sort(() => Math.random() - 0.5).slice(0, 25);
    
    const songs = shuffled.map(s => ({
        title: s.title,
        url: s.url,
        thumbnail: s.thumbnail,
        duration: s.duration,
        requester: interaction.user,
        radio: false,
        seek: 0,
        filterName: 'none'
    }));
    
    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('🎭 Kişisel Karışım')
        .setDescription(`${songs.length} şarkılık kişisel karışımınız oluşturuldu!`)
        .addFields(
            { name: '🎵 Kaynak', value: `${playlists.length} playlist`, inline: true },
            { name: '👤 DJ', value: interaction.user.username, inline: true },
            { name: '🎲 Tür', value: 'Rastgele Karışım', inline: true }
        )
        .setFooter({ text: 'SCP Music AI Mix' });
    
    await interaction.followUp({ embeds: [embed] });
    
    // Kuyruğa ekle
    const guildId = interaction.guild.id;
    let serverQueue = client.queue.get(guildId);
    
    if (!serverQueue) {
        // Yeni kuyruk oluştur
        const queueConstruct = {
            textChannel: interaction.channel,
            voiceChannel: channel,
            connection: null,
            player: null,
            resource: null,
            songs: songs,
            loop: 0,
            volume: 100,
            filter: null,
            filterName: 'none',
            playing: true,
            disconnectTimer: null,
            autoplay: false,
            lastActivity: Date.now(),
            isRadio: false,
            bitrate: channel.bitrate,
            requester: interaction.user,
            isSeeking: false,
            currentProcess: null
        };
        
        client.queue.set(guildId, queueConstruct);
        
        try {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: true
            });
            
            queueConstruct.connection = connection;
            await playSong(interaction.guild, queueConstruct.songs[0], client);
        } catch (err) {
            console.error('Karışım bağlantı hatası:', err);
            client.queue.delete(guildId);
        }
    } else {
        serverQueue.songs.push(...songs);
    }
}

// ==========================================
// 🎵 YARDIMCI FONKSİYONLAR (GÜNCELLENMİŞ)
// ==========================================

async function handleRadio(interaction, client, channel, radioName, forcePlay, initialFilter) {
    const radio = CONFIG.RADIO_STATIONS[radioName];
    
    const song = {
        title: `📻 ${radio.name}`,
        url: radio.url,
        thumbnail: 'https://i.imgur.com/Q2h8yLq.png',
        duration: 'LIVE 🔴',
        requester: interaction.user,
        radio: true,
        seek: 0,
        color: radio.color,
        stationInfo: radio
    };

    const guildId = interaction.guild.id;
    let serverQueue = client.queue.get(guildId);

    if (!serverQueue) {
        const queueConstruct = {
            textChannel: interaction.channel,
            voiceChannel: channel,
            connection: null,
            player: null,
            resource: null,
            songs: [song],
            loop: 0,
            volume: db.getServerVolume ? db.getServerVolume(guildId) : 100,
            filter: null,
            filterName: 'none',
            playing: true,
            disconnectTimer: null,
            autoplay: false,
            lastActivity: Date.now(),
            isRadio: true,
            bitrate: channel.bitrate,
            requester: interaction.user,
            isSeeking: false,
            currentProcess: null,
            radioInfo: {
                name: radio.name,
                url: radio.url,
                listeners: channel.members.size
            }
        };

        client.queue.set(guildId, queueConstruct);

        try {
            const connection = joinVoiceChannel({
                channelId: channel.id,
                guildId: channel.guild.id,
                adapterCreator: channel.guild.voiceAdapterCreator,
                selfDeaf: false
            });

            queueConstruct.connection = connection;
            await playRadio(interaction.guild, song, client);

            const embed = new EmbedBuilder()
                .setColor(radio.color)
                .setTitle('📻 Canlı Radyo Yayını')
                .setDescription(`**${radio.name}** canlı yayını başlatıldı!`)
                .addFields(
                    { name: '🎙️ İstasyon', value: radio.name, inline: true },
                    { name: '🔊 Kalite', value: 'Yüksek Kalite (HQ)', inline: true },
                    { name: '📡 Durum', value: 'Canlı Yayın 🔴', inline: true },
                    { name: '👥 Dinleyen', value: `${channel.members.size} kişi`, inline: true },
                    { name: '📻 Frekans', value: 'Dijital Stream', inline: true }
                )
                .setThumbnail('https://cdn-icons-png.flaticon.com/512/3095/3095583.png')
                .setFooter({ text: 'Radyo yayını 7/24 devam eder | SCP Radio Network' });

            await interaction.followUp({ embeds: [embed] });

            // Radyo kontrol panelini gönder
            await sendRadioControlPanel(interaction.channel, song, queueConstruct);

        } catch (err) {
            console.error('Radyo bağlantı hatası:', err);
            client.queue.delete(guildId);
            return interaction.followUp({ 
                content: `❌ Radyo bağlantısı kurulamadı: ${err.message}`, 
                flags: MessageFlags.Ephemeral 
            });
        }
    } else {
        serverQueue.songs.push(song);
        
        const embed = new EmbedBuilder()
            .setColor(radio.color)
            .setTitle('➕ Radyo Eklendi')
            .setDescription(`**${radio.name}** radyo istasyonu kuyruğa eklendi.`)
            .setFooter({ text: 'Radyo yayını sırası geldiğinde başlayacak' });
        
        await interaction.followUp({ embeds: [embed] });
    }
}

function formatSong(info, user, filterName) {
    if (!info) {
        return {
            title: 'Bilinmeyen Şarkı',
            url: 'https://youtube.com',
            thumbnail: 'https://i.imgur.com/AfFp7pu.png',
            duration: '0:00',
            requester: user,
            radio: false,
            seek: 0,
            filterName: filterName,
            views: null,
            likes: null,
            uploader: null,
            published: null,
            addedAt: Date.now()
        };
    }

    return {
        title: info.title || 'Bilinmeyen Şarkı',
        url: info.url,
        thumbnail: info.thumbnail || 'https://i.imgur.com/AfFp7pu.png',
        duration: info.duration || '??:??',
        requester: user,
        radio: false,
        seek: 0,
        filterName: filterName,
        views: null,
        likes: null,
        uploader: null,
        published: null,
        addedAt: Date.now(),
        channel: info.channel || 'Bilinmeyen Kanal'
    };
}

async function playSong(guild, song, client) {
    const serverQueue = client.queue.get(guild.id);
    if (!song || !serverQueue) return;

    // Zaman aşımı temizleyici
    if (serverQueue.disconnectTimer) {
        clearTimeout(serverQueue.disconnectTimer);
        serverQueue.disconnectTimer = null;
    }

    serverQueue.lastActivity = Date.now();

    // Önceki process'i temizle
    if (serverQueue.currentProcess) {
        try {
            serverQueue.currentProcess.kill('SIGTERM');
        } catch (e) {}
        serverQueue.currentProcess = null;
    }

    // Aktif filtreyi belirle
    let activeFilterCommand = serverQueue.filter;
    let activeFilterName = serverQueue.filterName;

    if (song.filterName && song.filterName !== 'none') {
        const songFilter = CONFIG.AUDIO_FILTERS[song.filterName];
        if (songFilter && songFilter.command) {
            activeFilterCommand = songFilter.command;
            activeFilterName = song.filterName;
        }
    }

    // Gelişmiş yt-dlp argümanları
    const ytArgs = [
        '--quiet',
        '--no-warnings',
        '--no-check-certificate',
        '--prefer-ffmpeg',
        '--ffmpeg-location', CONFIG.FFMPEG_PATH,
        '--geo-bypass',
        '--force-ipv4',
        '--compat-options', 'no-youtube-unavailable-videos',
        '--ignore-errors',
        '--format', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio[ext=mp3]/bestaudio',
        '--format-sort', '+codec:mp3,+size',
        '--no-playlist',
        '--socket-timeout', '10',
        '--source-address', '0.0.0.0',
        '--output', '-',
        song.url
    ];

    if (song.seek > 0) {
        ytArgs.splice(0, 0, '--playlist-start', '1');
        ytArgs.splice(0, 0, '--match-filter', 'duration>30');
        ytArgs.splice(0, 0, '--postprocessor-args', `ffmpeg:-ss ${song.seek}`);
    }

    // Filtre uygula
    if (activeFilterCommand) {
        ytArgs.push('--postprocessor-args', `ffmpeg:-af ${activeFilterCommand} -ac 2 -ar 48000 -b:a 192k`);
    } else {
        // Varsayılan ses iyileştirme
        ytArgs.push('--postprocessor-args', 'ffmpeg:-ac 2 -ar 48000 -b:a 192k');
    }

    console.log(`[PLAY] ${guild.name}: "${song.title.substring(0, 50)}..." - Filtre: ${activeFilterName} - Süre: ${song.duration}`);

    try {
        const ytDlpProcess = spawn(CONFIG.YTDLP_PATH, ytArgs);
        
        serverQueue.currentProcess = ytDlpProcess;
        
        let errorOccurred = false;
        let errorMessage = '';
        
        ytDlpProcess.stderr.on('data', (data) => {
            const errorStr = data.toString();
            if (errorStr.includes('ERROR') || errorStr.includes('WARNING')) {
                console.log(`[yt-dlp] ${errorStr.trim()}`);
                
                if (errorStr.includes('format is not available') || errorStr.includes('Requested format')) {
                    errorOccurred = true;
                    errorMessage = 'Video formatı desteklenmiyor.';
                }
            }
        });

        ytDlpProcess.on('error', (err) => {
            console.error('[yt-dlp process error]', err.message);
            errorOccurred = true;
            errorMessage = 'Video işlenirken hata oluştu.';
        });

        ytDlpProcess.on('close', (code) => {
            if (code !== 0 && code !== null) {
                console.log(`[yt-dlp] process exited with code ${code}`);
                errorOccurred = true;
                if (!errorMessage) errorMessage = `yt-dlp kodu ${code} ile kapandı`;
            }
            if (serverQueue.currentProcess === ytDlpProcess) {
                serverQueue.currentProcess = null;
            }
            
            if (errorOccurred && !serverQueue.isSeeking) {
                console.log(`[ERROR] ${guild.name}: Şarkı atlanıyor - ${errorMessage}`);
                serverQueue.textChannel.send({
                    content: `❌ **${song.title}** çalınamıyor: ${errorMessage}`
                }).catch(() => {});
                setTimeout(() => {
                    handleSongEnd(guild, serverQueue, client);
                }, 1000);
            }
        });

        const resource = createAudioResource(ytDlpProcess.stdout, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true,
            metadata: {
                title: song.title,
                url: song.url,
                duration: song.duration
            }
        });

        resource.volume.setVolume(serverQueue.volume / 100);
        serverQueue.resource = resource;

        if (!serverQueue.player) {
            serverQueue.player = createAudioPlayer();
            
            serverQueue.player.on(AudioPlayerStatus.Playing, () => {
                console.log(`> [PLAY] ${guild.name}: "${song.title.substring(0, 50)}..." çalınıyor`);
                serverQueue.playing = true;
                
                // Geçmişe ekle
                serverQueue.playHistory.push({
                    title: song.title,
                    url: song.url,
                    playedAt: Date.now(),
                    requester: song.requester
                });
                
                // Geçmişi sınırla (son 50 şarkı)
                if (serverQueue.playHistory.length > 50) {
                    serverQueue.playHistory.shift();
                }
            });

            serverQueue.player.on(AudioPlayerStatus.Idle, () => {
                if (!serverQueue.isSeeking && !errorOccurred) {
                    setTimeout(() => {
                        handleSongEnd(guild, serverQueue, client);
                    }, 1000);
                }
            });

            serverQueue.player.on('error', error => {
                console.error(`[PLAYER ERROR] ${guild.name}:`, error.message);
                serverQueue.textChannel.send({
                    content: `⚠️ Oynatıcı hatası: ${error.message}`
                }).catch(() => {});
                if (!serverQueue.isSeeking) {
                    setTimeout(() => {
                        handleSongEnd(guild, serverQueue, client);
                    }, 1000);
                }
            });

            serverQueue.connection.subscribe(serverQueue.player);
        }

        setTimeout(() => {
            if (!errorOccurred) {
                try {
                    serverQueue.player.play(resource);
                    // Gelişmiş oynatıcı panelini gönder
                    sendEnhancedPlayerPanel(serverQueue.textChannel, song, serverQueue);
                } catch (error) {
                    console.error('Play error:', error);
                    handleSongEnd(guild, serverQueue, client);
                }
            }
        }, 500);
        
    } catch (error) {
        console.error('Play song hatası:', error);
        handleSongEnd(guild, serverQueue, client);
    }
}

// ==========================================
// 🛠️ GELİŞMİŞ UTILITY FONKSİYONLAR
// ==========================================

function updateChannelStats(channelId) {
    const now = Date.now();
    const stats = channelStats.get(channelId) || { plays: 0, lastPlay: 0 };
    stats.plays++;
    stats.lastPlay = now;
    channelStats.set(channelId, stats);
    
    // Eski verileri temizle (1 günden eski)
    setTimeout(() => {
        channelStats.delete(channelId);
    }, 86400000);
}

function calculateTotalDuration(songs) {
    let totalSeconds = 0;
    songs.forEach(song => {
        totalSeconds += hmsToSeconds(song.duration);
    });
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    if (hours > 0) {
        return `${hours}sa ${minutes}d`;
    } else if (minutes > 0) {
        return `${minutes}d ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

function calculateQueueWaitTime(serverQueue) {
    if (serverQueue.songs.length <= 1) return 'Hemen';
    
    let totalSeconds = 0;
    for (let i = 1; i < serverQueue.songs.length; i++) {
        totalSeconds += hmsToSeconds(serverQueue.songs[i].duration);
    }
    
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    if (hours > 0) {
        return `~${hours}sa ${minutes}d`;
    } else if (minutes > 0) {
        return `~${minutes}d`;
    } else {
        return '<1d';
    }
}

function getErrorSolution(error) {
    const errorMsg = error.message.toLowerCase();
    
    if (errorMsg.includes('format') || errorMsg.includes('codec')) {
        return 'Farklı bir video/şarkı deneyin. Bazı formatlar desteklenmiyor.';
    } else if (errorMsg.includes('network') || errorMsg.includes('connection')) {
        return 'İnternet bağlantınızı kontrol edin ve tekrar deneyin.';
    } else if (errorMsg.includes('private') || errorMsg.includes('unavailable')) {
        return 'Bu içerik özel veya bölgenizde kullanılamıyor.';
    } else if (errorMsg.includes('yt-dlp')) {
        return 'yt-dlp güncel değil. Lütfen bot yöneticisiyle iletişime geçin.';
    } else {
        return 'Lütfen farklı bir şarkı/link deneyin veya daha sonra tekrar deneyin.';
    }
}

function hmsToSeconds(hms) {
    if (!hms || hms === 'LIVE 🔴' || hms.includes('LIVE')) return 0;
    
    // "HH:MM:SS" veya "MM:SS" formatını parse et
    const parts = hms.split(':').map(Number);
    
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 1) {
        return parts[0];
    }
    
    return 0;
}

function formatTime(seconds) {
    if (!seconds || seconds < 0) return '0:00';
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

async function sendEnhancedPlayerPanel(channel, song, queue) {
    try {
        let color = '#5865F2';
        if (song.duration.includes('LIVE')) color = '#FF9900';
        
        const totalSeconds = hmsToSeconds(song.duration);
        const progressBar = createProgressBar(0, totalSeconds);
        const volumeBar = createVolumeBar(queue.volume);
        const activeFilterName = CONFIG.AUDIO_FILTERS[queue.filterName]?.name || 'Normal';
        
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle('🎵 Şimdi Çalıyor')
            .setDescription(`**[${song.title}](${song.url})**`)
            .setThumbnail(song.thumbnail)
            .addFields(
                { 
                    name: '📊 Bilgiler', 
                    value: `**Süre:** ${song.duration}\n**İsteyen:** ${song.requester}\n**Filtre:** ${activeFilterName}\n**Kanal:** ${song.channel || 'Bilinmiyor'}`,
                    inline: true 
                },
                { 
                    name: '🎚️ Ayarlar', 
                    value: `**Ses:** ${volumeBar} %${queue.volume}\n**Döngü:** ${['Kapalı', 'Tek Şarkı', 'Tüm Liste'][queue.loop]}\n**Kuyruk:** ${queue.songs.length - 1} şarkı\n**Kalite:** ${queue.bitrate / 1000}kbps`,
                    inline: true 
                }
            );
        
        // Ekstra bilgiler
        if (song.views || song.likes || song.uploader) {
            const extraInfo = [];
            if (song.uploader) extraInfo.push(`**Yükleyen:** ${song.uploader}`);
            if (song.views) extraInfo.push(`**Görüntülenme:** ${formatNumber(song.views)}`);
            if (song.likes) extraInfo.push(`**Beğeni:** ${formatNumber(song.likes)}`);
            if (song.published) extraInfo.push(`**Yayın Tarihi:** ${song.published}`);
            
            if (extraInfo.length > 0) {
                embed.addFields({ name: '📈 İstatistikler', value: extraInfo.join('\n'), inline: false });
            }
        }
        
        // İlerleme çubuğu
        embed.addFields({ 
            name: '⏱️ İlerleme', 
            value: `${progressBar}\n\`0:00 / ${song.duration}\``, 
            inline: false 
        });
        
        embed.setFooter({ 
            text: `SCP Music Premium | ${queue.voiceChannel.members.size} dinleyici | ${new Date().toLocaleTimeString('tr-TR')}` 
        });
        
        // Gelişmiş kontrol butonları
        const controlRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_pause').setEmoji('⏯️').setStyle(ButtonStyle.Primary).setLabel('Duraklat'),
            new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setLabel('Geç'),
            new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger).setLabel('Durdur'),
            new ButtonBuilder().setCustomId('music_loop').setEmoji('🔁').setStyle(ButtonStyle.Success).setLabel('Döngü'),
            new ButtonBuilder().setCustomId('music_shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary).setLabel('Karıştır')
        );
        
        const secondaryRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('vol_down').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('vol_up').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('pl_quick_save').setEmoji('💾').setLabel('Kaydet').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('lyrics_fetch').setEmoji('📜').setLabel('Sözler').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('queue_show').setEmoji('📋').setLabel('Kuyruk').setStyle(ButtonStyle.Secondary)
        );
        
        // Filtre menüsü
        const filterOptions = Object.entries(CONFIG.AUDIO_FILTERS).map(([key, filter]) => 
            new StringSelectMenuOptionBuilder()
                .setLabel(filter.name)
                .setDescription(filter.description)
                .setValue(key)
                .setEmoji(filter.emoji)
        );
        
        const filterMenu = new StringSelectMenuBuilder()
            .setCustomId('music_filter_select')
            .setPlaceholder(`🎛️ ${activeFilterName} (Değiştir)`)
            .addOptions(filterOptions);
        
        const filterRow = new ActionRowBuilder().addComponents(filterMenu);
        
        const message = await channel.send({ 
            embeds: [embed], 
            components: [controlRow, secondaryRow, filterRow] 
        });
        
        // Önceki mesajı sil
        if (queue.lastMessageId) {
            try {
                const oldMessage = await channel.messages.fetch(queue.lastMessageId).catch(() => null);
                if (oldMessage) await oldMessage.delete().catch(() => {});
            } catch (e) {}
        }
        
        queue.lastMessageId = message.id;
        
    } catch (error) {
        console.error('Gelişmiş panel gönderilemedi:', error);
    }
}

async function sendRadioControlPanel(channel, song, queue) {
    const embed = new EmbedBuilder()
        .setColor(song.color || '#FF9900')
        .setTitle('📻 Canlı Radyo Kontrol Paneli')
        .setDescription(`**${song.title}**`)
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/3095/3095583.png')
        .addFields(
            { name: '📡 Durum', value: 'Canlı Yayın 🔴', inline: true },
            { name: '🎚️ Ses', value: `%${queue.volume}`, inline: true },
            { name: '👥 Dinleyen', value: `${queue.voiceChannel.members.size} kişi`, inline: true },
            { name: '📻 İstasyon', value: song.stationInfo.name, inline: true },
            { name: '🔊 Bitrate', value: `${queue.bitrate / 1000}kbps`, inline: true },
            { name: '🕒 Başlangıç', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: 'Radyo yayını 7/24 devam eder | SCP Radio Network' });
    
    const controlRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setLabel('Durdur').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('vol_down').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('vol_up').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('radio_change').setEmoji('📻').setLabel('İstasyon Değiştir').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('radio_info').setEmoji('ℹ️').setLabel('Bilgi').setStyle(ButtonStyle.Secondary)
    );
    
    await channel.send({ embeds: [embed], components: [controlRow] });
}

function createProgressBar(current, total, length = 15) {
    if (total <= 0) return '▬'.repeat(length) + '🔘';
    const progress = Math.min(1, current / total);
    const filled = Math.round(progress * length);
    const empty = length - filled;
    return '▬'.repeat(filled) + '🔘' + '▬'.repeat(empty);
}

function createVolumeBar(volume, length = 10) {
    const filled = Math.round((volume / 100) * length);
    let bar = '';
    for (let i = 0; i < length; i++) {
        bar += i < filled ? '█' : '░';
    }
    return bar;
}

function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1000000000) return (num / 1000000000).toFixed(1) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// CONFIG'u dışa aktar
module.exports.CONFIG = CONFIG;

// İstatistik fonksiyonlarını dışa aktar
module.exports.getChannelStats = function(channelId) {
    return channelStats.get(channelId);
};

// Filtre uygulama fonksiyonu
module.exports.applyAudioFilter = async function(guild, filterName, client) {
    const serverQueue = client.queue.get(guild.id);
    
    if (!serverQueue || !serverQueue.songs[0]) {
        throw new Error('Şu an çalan bir şarkı yok.');
    }
    
    const currentSong = serverQueue.songs[0];
    
    if (currentSong.duration === 'LIVE 🔴' || currentSong.radio) {
        throw new Error('Canlı yayınlarda filtre değiştirilemez.');
    }
    
    const filterInfo = CONFIG.AUDIO_FILTERS[filterName];
    if (!filterInfo) {
        throw new Error('Geçersiz filtre.');
    }
    
    serverQueue.filter = filterInfo.command || null;
    serverQueue.filterName = filterName;
    
    let currentPosition = 0;
    if (serverQueue.resource && serverQueue.resource.playbackDuration) {
        currentPosition = Math.floor(serverQueue.resource.playbackDuration / 1000);
    }
    
    console.log(`[FILTER] Applying ${filterName} at position ${currentPosition}s`);
    
    if (seekModule && seekModule.performSeek) {
        await seekModule.performSeek(serverQueue, currentSong, currentPosition, { channel: serverQueue.textChannel });
    } else {
        serverQueue.player.stop();
        currentSong.seek = currentPosition;
        await playSong(guild, currentSong, client);
    }
    
    return {
        success: true,
        filter: filterInfo.name,
        position: currentPosition
    };
};
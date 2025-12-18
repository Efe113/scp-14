const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType 
} = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { spawn } = require('child_process');
const sodium = require('libsodium-wrappers');
const db = require('../../db.js');
const { getVideoInfo } = require('../../../utils.js'); // Şarkı bilgisi çekmek için

const SONGS_PER_PAGE = 10;

// [YARDIMCI] Playlist Görüntüleme Motoru
function renderPlaylistView(playlist, page) {
    const totalSongs = playlist.songs.length;
    const totalPages = Math.ceil(totalSongs / SONGS_PER_PAGE) || 1;
    page = Math.max(1, Math.min(page, totalPages));

    const startIndex = (page - 1) * SONGS_PER_PAGE;
    const currentList = playlist.songs.slice(startIndex, startIndex + SONGS_PER_PAGE);

    const embed = new EmbedBuilder()
        .setColor('#9b59b6') // Playlist Moru
        .setTitle(`📀 Playlist: ${playlist.name}`)
        .setDescription(playlist.description || '*Açıklama yok.*')
        .addFields(
            { name: '👤 Sahibi', value: `<@${playlist.ownerId}>`, inline: true },
            { name: '🔒 Gizlilik', value: playlist.isPublic ? 'Herkese Açık 🌐' : 'Özel 🔒', inline: true },
            { name: '📊 Toplam', value: `${totalSongs} Şarkı`, inline: true },
            { name: '📅 Oluşturulma', value: `<t:${Math.floor(playlist.createdAt / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: `Sayfa ${page} / ${totalPages} • ID: ${playlist.name}` });

    if (currentList.length > 0) {
        const listStr = currentList.map((s, i) => {
            const title = s.title.length > 50 ? s.title.substring(0, 47) + '...' : s.title;
            return `\`${startIndex + i + 1}.\` [${title}](${s.url}) | \`${s.duration}\``;
        }).join('\n');
        embed.addFields({ name: '🎵 Şarkı Listesi', value: listStr });
    } else {
        embed.addFields({ name: '🎵 Şarkı Listesi', value: '*Bu liste şu an boş.*' });
    }

    // Navigasyon Butonları
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`pl_prev_${playlist.ownerId}_${playlist.name}_${page}`).setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
        new ButtonBuilder().setCustomId(`pl_play_${playlist.ownerId}_${playlist.name}`).setLabel('Bu Listeyi Çal').setEmoji('▶️').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`pl_next_${playlist.ownerId}_${playlist.name}_${page}`).setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages)
    );

    return { embeds: [embed], components: [navRow] };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Kişisel playlist sistemini yönetir.')
        // 1. OLUŞTUR
        .addSubcommand(sub =>
            sub.setName('olustur')
                .setDescription('Yeni bir playlist oluşturur.')
                .addStringOption(op => op.setName('isim').setDescription('Playlist adı').setRequired(true).setMaxLength(30))
                .addStringOption(op => op.setName('aciklama').setDescription('Kısa açıklama').setRequired(false))
                .addBooleanOption(op => op.setName('herkese_acik').setDescription('Diğerleri görebilsin mi?').setRequired(false))
        )
        // 2. SİL
        .addSubcommand(sub =>
            sub.setName('sil')
                .setDescription('Bir playlisti siler.')
                .addStringOption(op => op.setName('isim').setDescription('Silinecek playlist').setRequired(true).setAutocomplete(true))
        )
        // 3. EKLE (Müzik botu için kritik)
        .addSubcommand(sub =>
            sub.setName('ekle')
                .setDescription('Playliste şarkı ekler.')
                .addStringOption(op => op.setName('playlist').setDescription('Hangi playlist?').setRequired(true).setAutocomplete(true))
                .addStringOption(op => op.setName('sarki').setDescription('Link, Şarkı Adı veya "calan" (Şu an çalanı ekler)').setRequired(true))
        )
        // 4. ÇIKART
        .addSubcommand(sub =>
            sub.setName('cikart')
                .setDescription('Playlistten şarkı siler.')
                .addStringOption(op => op.setName('playlist').setDescription('Hangi playlist?').setRequired(true).setAutocomplete(true))
                .addIntegerOption(op => op.setName('sira').setDescription('Şarkının sıra numarası (Listeden bakın)').setRequired(true).setMinValue(1))
        )
        // 5. GÖSTER (Detaylı Bakış)
        .addSubcommand(sub =>
            sub.setName('goster')
                .setDescription('Playlist içeriğini görüntüler.')
                .addStringOption(op => op.setName('isim').setDescription('Görüntülenecek playlist').setRequired(true).setAutocomplete(true))
        )
        // 6. YÜKLE (ÇAL)
        .addSubcommand(sub =>
            sub.setName('yukle')
                .setDescription('Bir playlisti kuyruğa yükler ve çalar.')
                .addStringOption(op => op.setName('isim').setDescription('Yüklenecek playlist').setRequired(true).setAutocomplete(true))
        )
        // 7. LİSTELE
        .addSubcommand(sub =>
            sub.setName('listele')
                .setDescription('Kayıtlı playlistlerinizi listeler.')
        ),

    // --- AUTOCOMPLETE (Zeki Tamamlama) ---
    async autocomplete(interaction, client) {
        const focusedValue = interaction.options.getFocused();
        const userId = interaction.user.id;
        
        // Veritabanından kullanıcının listelerini çek
        const myLists = db.getUserPlaylists(userId);
        
        // Filtrele
        const filtered = myLists.filter(pl => pl.name.toLowerCase().startsWith(focusedValue.toLowerCase()));

        await interaction.respond(
            filtered.slice(0, 25).map(choice => ({ name: choice.name, value: choice.name }))
        );
    },

    // --- EXECUTE ---
    async execute(interaction, client) {
        if (!interaction.inGuild()) return;
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        await interaction.deferReply({ ephemeral: true });

        try {
            // === OLUŞTUR ===
            if (subcommand === 'olustur') {
                const name = interaction.options.getString('isim');
                const desc = interaction.options.getString('aciklama') || '';
                const pub = interaction.options.getBoolean('herkese_acik') || false;

                if (db.getPlaylist(userId, name)) {
                    return interaction.editReply(`❌ **${name}** adında bir listeniz zaten var.`);
                }

                db.createPlaylist(userId, name, desc, pub);
                return interaction.editReply(`✅ **${name}** başarıyla oluşturuldu!`);
            }

            // === EKLE ===
            if (subcommand === 'ekle') {
                const plName = interaction.options.getString('playlist');
                let songQuery = interaction.options.getString('sarki');
                
                const playlist = db.getPlaylist(userId, plName);
                if (!playlist) return interaction.editReply('❌ Playlist bulunamadı.');

                let songData;

                // "calan" yazdıysa veya boşsa o anki şarkıyı al
                if (songQuery.toLowerCase() === 'calan') {
                    const serverQueue = client.queue.get(interaction.guild.id);
                    if (!serverQueue || !serverQueue.songs[0]) {
                        return interaction.editReply('❌ Şu an çalan bir şarkı yok.');
                    }
                    const current = serverQueue.songs[0];
                    songData = {
                        title: current.title,
                        url: current.url,
                        duration: current.duration,
                        thumbnail: current.thumbnail
                    };
                } else {
                    // Link veya isim ise ara
                    // Eğer link değilse arama formatı yap
                    const search = songQuery.startsWith('http') ? songQuery : `ytsearch1:${songQuery}`;
                    try {
                        const info = await getVideoInfo(search); // utils.js'den gelen fonksiyon
                        // Eğer array dönerse (playlist linki), sadece ilkini al
                        const track = Array.isArray(info) ? info[0] : info;
                        
                        songData = {
                            title: track.title,
                            url: track.url,
                            duration: track.duration,
                            thumbnail: track.thumbnail
                        };
                    } catch (e) {
                        return interaction.editReply('❌ Şarkı bulunamadı.');
                    }
                }

                db.addSongToPlaylist(userId, plName, songData);
                return interaction.editReply(`✅ **${plName}** listesine eklendi:\n🎵 [${songData.title}](${songData.url})`);
            }

            // === SİL ===
            if (subcommand === 'sil') {
                const name = interaction.options.getString('isim');
                if (db.deletePlaylist(userId, name)) {
                    return interaction.editReply(`🗑️ **${name}** silindi.`);
                }
                return interaction.editReply('❌ Playlist bulunamadı.');
            }

            // === ÇIKART ===
            if (subcommand === 'cikart') {
                const name = interaction.options.getString('playlist');
                const index = interaction.options.getInteger('sira');
                
                const removed = db.removeSongFromPlaylist(userId, name, index - 1); // Kullanıcı 1 der, array 0
                if (removed) {
                    return interaction.editReply(`🗑️ **${removed.t}** listeden çıkarıldı.`);
                }
                return interaction.editReply('❌ Sıra numarası geçersiz veya liste yok.');
            }

            // === LİSTELE ===
            if (subcommand === 'listele') {
                const lists = db.getUserPlaylists(userId);
                if (lists.length === 0) return interaction.editReply('📭 Hiç playlistiniz yok.');

                const embed = new EmbedBuilder()
                    .setTitle('📂 Playlistleriniz')
                    .setColor('#FFA500')
                    .setDescription(lists.map((l, i) => `**${i+1}.** ${l.name} (${l.count} şarkı)`).join('\n'));
                
                return interaction.editReply({ embeds: [embed] });
            }

            // === YÜKLE / ÇAL ===
            if (subcommand === 'yukle') {
                const name = interaction.options.getString('isim');
                const pl = db.getPlaylist(userId, name);
                if (!pl) return interaction.editReply('❌ Playlist bulunamadı.');
                if (pl.songs.length === 0) return interaction.editReply('❌ Bu playlist boş.');

                const channel = interaction.member.voice.channel;
                if (!channel) return interaction.editReply('❌ Ses kanalına girin.');

                // Şarkıları formatla
                const songs = pl.songs.map(s => ({
                    title: s.title,
                    url: s.url,
                    thumbnail: s.thumbnail,
                    duration: s.duration,
                    requester: interaction.user
                }));

                // Kuyruk Mantığı (play.js ile benzer)
                const guildId = interaction.guild.id;
                let serverQueue = client.queue.get(guildId);

                if (!serverQueue) {
                    const queueContruct = {
                        textChannel: interaction.channel,
                        voiceChannel: channel,
                        connection: null, player: null, resource: null, songs: [], loop: 0, volume: 100, filter: null, playing: true
                    };
                    client.queue.set(guildId, queueContruct);
                    queueContruct.songs.push(...songs);

                    try {
                        await sodium.ready;
                        const connection = joinVoiceChannel({
                            channelId: channel.id,
                            guildId: channel.guild.id,
                            adapterCreator: channel.guild.voiceAdapterCreator,
                            selfDeaf: false
                        });
                        queueContruct.connection = connection;
                        playSongInternal(interaction.guild, queueContruct.songs[0], client);
                        return interaction.editReply(`▶️ **${pl.name}** yüklendi ve başlatıldı (${songs.length} şarkı).`);
                    } catch (e) {
                        client.queue.delete(guildId);
                        return interaction.editReply(`❌ Hata: ${e.message}`);
                    }
                } else {
                    serverQueue.songs.push(...songs);
                    return interaction.editReply(`✅ **${pl.name}** mevcut kuyruğa eklendi (${songs.length} şarkı).`);
                }
            }

            // === GÖSTER (SAYFALI) ===
            if (subcommand === 'goster') {
                const name = interaction.options.getString('isim');
                const pl = db.getPlaylist(userId, name);
                if (!pl) return interaction.editReply('❌ Playlist bulunamadı.');

                const viewData = renderPlaylistView(pl, 1);
                const msg = await interaction.editReply(viewData);

                // Collector
                const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });

                collector.on('collect', async i => {
                    const [action, ownerId, plName, pageStr] = i.customId.split('_'); // pl_prev_ownerId_plName_1
                    let page = parseInt(pageStr);

                    if (action === 'pl') {
                        // Play butonuna özel işlem
                        if (i.customId.includes('play')) {
                            // Kullanıcının ses kanalında olup olmadığını kontrol et
                            if (!i.member.voice.channel) {
                                return i.reply({ content: '❌ Bu listeyi çalmak için bir ses kanalına katılmalısın.', ephemeral: true });
                            }

                            // Playlisti al (ownerId ve plName ile)
                            const currentPl = db.getPlaylist(ownerId, plName);
                            if (!currentPl) {
                                return i.reply({ content: '❌ Playlist bulunamadı.', ephemeral: true });
                            }

                            // Playlist sahibi kontrolü: Eğer playlist özel ise (isPublic false) ve butona basan kişi sahip değilse, engelle.
                            if (!currentPl.isPublic && currentPl.ownerId !== i.user.id) {
                                return i.reply({ content: '❌ Bu playlist özel ve sadece sahibi tarafından çalınabilir.', ephemeral: true });
                            }

                            // Şarkıları formatla
                            const songs = currentPl.songs.map(s => ({
                                title: s.title,
                                url: s.url,
                                thumbnail: s.thumbnail,
                                duration: s.duration,
                                requester: i.user
                            }));

                            // Kuyruk mantığı (play.js ile benzer)
                            const guildId = i.guild.id;
                            let serverQueue = client.queue.get(guildId);

                            if (!serverQueue) {
                                const queueContruct = {
                                    textChannel: i.channel,
                                    voiceChannel: i.member.voice.channel,
                                    connection: null, player: null, resource: null, songs: [], loop: 0, volume: 100, filter: null, playing: true
                                };
                                client.queue.set(guildId, queueContruct);
                                queueContruct.songs.push(...songs);

                                try {
                                    await sodium.ready;
                                    const connection = joinVoiceChannel({
                                        channelId: i.member.voice.channel.id,
                                        guildId: i.guild.id,
                                        adapterCreator: i.guild.voiceAdapterCreator,
                                        selfDeaf: false
                                    });
                                    queueContruct.connection = connection;
                                    playSongInternal(i.guild, queueContruct.songs[0], client);
                                    return i.reply({ content: `▶️ **${currentPl.name}** yüklendi ve başlatıldı (${songs.length} şarkı).`, ephemeral: true });
                                } catch (e) {
                                    client.queue.delete(guildId);
                                    return i.reply({ content: `❌ Hata: ${e.message}`, ephemeral: true });
                                }
                            } else {
                                serverQueue.songs.push(...songs);
                                return i.reply({ content: `✅ **${currentPl.name}** mevcut kuyruğa eklendi (${songs.length} şarkı).`, ephemeral: true });
                            }
                        }

                        // Sayfa değiştirme butonları
                        if (i.customId.includes('next')) page++;
                        if (i.customId.includes('prev')) page--;

                        const currentPl = db.getPlaylist(ownerId, plName); // Güncel veriyi çek
                        const newData = renderPlaylistView(currentPl, page);
                        await i.update(newData);
                    }
                });
            }

        } catch (error) {
            console.error(error);
            if (!interaction.replied) await interaction.editReply('❌ Bir hata oluştu.');
        }
    }
};

// [DAHİLİ OYNATICI] (play.js'den kopyalanmıştır, modülerlik için)
async function playSongInternal(guild, song, client) {
    const serverQueue = client.queue.get(guild.id);
    if (!song) {
        // Liste bitti
        return;
    }

    const ytArgs = [
        '-o', '-', '-q', '-f', 'bestaudio', '--no-playlist', '--geo-bypass',
        '--buffer-size', '16K', '--force-ipv4', '--no-check-certificate',
        song.url
    ];

    if (serverQueue.filter) {
        ytArgs.push('--ppa', `ffmpeg:-af ${serverQueue.filter} -ac 2 -ar 48000`);
    }

    const ytDlpProcess = spawn('./yt-dlp.exe', ytArgs);
    const resource = createAudioResource(ytDlpProcess.stdout, { inputType: StreamType.Arbitrary, inlineVolume: true });
    
    resource.volume.setVolume(serverQueue.volume / 100);
    serverQueue.resource = resource;

    if (!serverQueue.player) {
        serverQueue.player = createAudioPlayer();
        serverQueue.player.on(AudioPlayerStatus.Idle, () => {
            if (serverQueue.loop === 1) playSongInternal(guild, serverQueue.songs[0], client);
            else if (serverQueue.loop === 2) {
                const finished = serverQueue.songs.shift();
                serverQueue.songs.push(finished);
                playSongInternal(guild, serverQueue.songs[0], client);
            } else {
                serverQueue.songs.shift();
                playSongInternal(guild, serverQueue.songs[0], client);
            }
        });
        serverQueue.connection.subscribe(serverQueue.player);
    }
    serverQueue.player.play(resource);
}
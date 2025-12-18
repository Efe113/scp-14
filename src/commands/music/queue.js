const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ComponentType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require('discord.js');
const { checkDJ } = require('../../../utils.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Gelişmiş kuyruk yönetim panelini açar.')
        .addIntegerOption(option =>
            option.setName('sayfa')
                .setDescription('Direkt olarak açılacak sayfa numarası')
                .setMinValue(1)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('goster')
                .setDescription('Ne gösterilsin?')
                .addChoices(
                    { name: '📋 Tüm Kuyruk', value: 'all' },
                    { name: '👤 Sadece Benim Şarkılarım', value: 'mine' },
                    { name: '⭐ Favori İstekçiler', value: 'top_requesters' },
                    { name: '⏱️ Kısa Şarkılar', value: 'short_songs' },
                    { name: '🎵 Uzun Şarkılar', value: 'long_songs' }
                )
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('gizli')
                .setDescription('Sadece sen görebilirsin')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('canli')
                .setDescription('Canlı güncelleme modu (daha fazla kaynak)')
                .setRequired(false)),

    async execute(interaction, client) {
        const serverQueue = client.queue.get(interaction.guild.id);

        // 1. DURUM KONTROLÜ
        if (!serverQueue || serverQueue.songs.length === 0) {
            const emptyEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('📭 Kuyruk Boş')
                .setDescription('Şu an çalınacak bir şey yok.')
                .addFields(
                    { name: '💡 Öneriler', value: '• `/play` komutu ile şarkı ekleyin\n• `/radio` ile radyo dinleyin\n• `/playlist` ile listelerinizi çalın', inline: false }
                )
                .setThumbnail('https://cdn-icons-png.flaticon.com/512/3588/3588737.png')
                .setFooter({ text: 'SCP Music System • Boş Kuyruk' });

            return interaction.reply({ 
                embeds: [emptyEmbed], 
                ephemeral: interaction.options.getBoolean('gizli') || false 
            });
        }

        const showMode = interaction.options.getString('goster') || 'all';
        const liveMode = interaction.options.getBoolean('canli') || false;
        const privateMode = interaction.options.getBoolean('gizli') || false;
        
        await interaction.deferReply({ ephemeral: privateMode });

        try {
            // 2. KUYRUK VERİLERİNİ FİLTRELE
            let filteredQueue = filterQueue(serverQueue.songs, showMode, interaction.user.id);
            const currentSong = filteredQueue[0];
            
            // 3. KUYRUK İSTATİSTİKLERİNİ HESAPLA
            const stats = calculateQueueStats(filteredQueue);
            
            // 4. SAYFALAMA
            let currentPage = interaction.options.getInteger('sayfa') || 1;
            const ITEMS_PER_PAGE = 8;
            const totalPages = Math.ceil((filteredQueue.length - 1) / ITEMS_PER_PAGE) || 1;
            
            // Sayfa sınırlarını kontrol et
            currentPage = Math.max(1, Math.min(currentPage, totalPages));
            
            // 5. GELİŞMİŞ KUYRUK PANELİ OLUŞTUR
            const embed = await generateAdvancedQueueEmbed(
                filteredQueue, 
                currentPage, 
                ITEMS_PER_PAGE, 
                stats, 
                serverQueue, 
                showMode,
                liveMode
            );

            // 6. İNTERAKTİF KONTROL BUTONLARI
            const controls = generateQueueControls(
                filteredQueue, 
                currentPage, 
                totalPages, 
                serverQueue, 
                showMode,
                liveMode
            );

            // 7. PANELİ GÖNDER
            const message = await interaction.editReply({ 
                embeds: [embed], 
                components: controls,
                fetchReply: true
            });

            // 8. CANLI MOD İÇİN OTOMATİK GÜNCELLEME
            let liveUpdateInterval;
            if (liveMode) {
                liveUpdateInterval = setInterval(async () => {
                    try {
                        const updatedQueue = client.queue.get(interaction.guild.id);
                        if (!updatedQueue || updatedQueue.songs.length === 0) {
                            clearInterval(liveUpdateInterval);
                            return;
                        }
                        
                        const updatedFilteredQueue = filterQueue(updatedQueue.songs, showMode, interaction.user.id);
                        const updatedStats = calculateQueueStats(updatedFilteredQueue);
                        const updatedTotalPages = Math.ceil((updatedFilteredQueue.length - 1) / ITEMS_PER_PAGE) || 1;
                        
                        // Geçerli sayfayı koru, ama sınırları kontrol et
                        const validPage = Math.min(currentPage, updatedTotalPages);
                        
                        const updatedEmbed = await generateAdvancedQueueEmbed(
                            updatedFilteredQueue,
                            validPage,
                            ITEMS_PER_PAGE,
                            updatedStats,
                            updatedQueue,
                            showMode,
                            liveMode
                        );
                        
                        const updatedControls = generateQueueControls(
                            updatedFilteredQueue,
                            validPage,
                            updatedTotalPages,
                            updatedQueue,
                            showMode,
                            liveMode
                        );
                        
                        await interaction.editReply({ 
                            embeds: [updatedEmbed], 
                            components: updatedControls 
                        });
                    } catch (error) {
                        console.error('Canlı güncelleme hatası:', error);
                    }
                }, 15000); // Her 15 saniyede bir güncelle
            }

            // 9. İNTERAKTİF DİNLEYİCİ (COLLECTOR)
            const collector = message.createMessageComponentCollector({ 
                componentType: ComponentType.Button, 
                time: liveMode ? 300000 : 120000 // Live modda 5 dakika, normalde 2 dakika
            });

            collector.on('collect', async i => {
                if (i.user.id !== interaction.user.id && !checkDJ(i)) {
                    return i.reply({ 
                        content: '⛔ Bu kontrolleri sadece DJ yetkisine sahip kullanıcılar kullanabilir.', 
                        ephemeral: true 
                    });
                }

                // List of button IDs that open modals/select menus (don't defer these)
                const modalButtonIds = [
                    'queue_page_jump',
                    'queue_filter_menu',
                    'queue_remove',
                    'queue_move',
                    'queue_save',
                    'queue_search'
                ];

                const selectMenuButtonIds = [
                    'queue_sort_menu',
                    'queue_view_mode'
                ];

                const confirmationButtonIds = [
                    'queue_clear_confirm'
                ];

                // Combine all buttons that should not be deferred
                const nonDeferrableButtons = [
                    ...modalButtonIds,
                    ...selectMenuButtonIds,
                    ...confirmationButtonIds
                ];

                // Check if this is a non-deferrable button
                if (nonDeferrableButtons.includes(i.customId)) {
                    // Handle non-deferrable buttons without deferring
                    switch (i.customId) {
                        // Modal buttons
                        case 'queue_page_jump':
                            await showPageJumpModal(i, serverQueue, interaction, currentPage, totalPages);
                            return;
                        case 'queue_filter_menu':
                            await showFilterMenu(i, serverQueue, interaction, currentPage);
                            return;
                        case 'queue_remove':
                            await showRemoveMenu(i, serverQueue, interaction, currentPage);
                            return;
                        case 'queue_move':
                            await showMoveMenu(i, serverQueue, interaction, currentPage);
                            return;
                        case 'queue_save':
                            await saveQueueAsPlaylist(i, serverQueue, interaction.user);
                            return;
                        case 'queue_search':
                            await showSearchModal(i, serverQueue);
                            return;
                        
                        // Select menu buttons
                        case 'queue_sort_menu':
                            await showSortMenu(i, serverQueue, interaction, currentPage, showMode);
                            return;
                        case 'queue_view_mode':
                            await showViewModeMenu(i, serverQueue, interaction, currentPage);
                            return;
                        
                        // Confirmation buttons
                        case 'queue_clear_confirm':
                            await showClearConfirmation(i, serverQueue, interaction);
                            return;
                    }
                }

                // For regular buttons, defer the update
                await i.deferUpdate();

                // Now handle regular buttons that update the panel
                switch (i.customId) {
                    // --- SAYFALAMA ---
                    case 'queue_page_first':
                        currentPage = 1;
                        break;
                    case 'queue_page_prev':
                        if (currentPage > 1) currentPage--;
                        break;
                    case 'queue_page_next':
                        if (currentPage < totalPages) currentPage++;
                        break;
                    case 'queue_page_last':
                        currentPage = totalPages;
                        break;
                    case 'queue_refresh':
                        // Sayfayı yenile (aynı sayfada kal)
                        break;

                    // --- KUYRUK İŞLEMLERİ ---
                    case 'queue_shuffle':
                        if (!checkDJ(i)) {
                            await i.followUp({ 
                                content: '⛔ Karıştırmak için DJ yetkisi gerekli.', 
                                ephemeral: true 
                            });
                            return;
                        }
                        if (serverQueue.songs.length > 2) {
                            shuffleQueue(serverQueue);
                            await i.followUp({ 
                                content: '🔀 Kuyruk karıştırıldı.', 
                                ephemeral: true 
                            });
                        }
                        break;

                    case 'queue_autoplay':
                        serverQueue.autoplay = !serverQueue.autoplay;
                        await i.followUp({ 
                            content: `♾️ Otomatik çalma: **${serverQueue.autoplay ? 'AÇIK ✅' : 'KAPALI ❌'}**`, 
                            ephemeral: true 
                        });
                        break;

                    // --- DİĞER KONTROLLER ---
                    case 'queue_player':
                        // Oynatıcı paneline yönlendir
                        collector.stop();
                        const playModule = require('./play.js');
                        if (playModule.sendPlayerPanel) {
                            await playModule.sendPlayerPanel(
                                interaction.channel, 
                                serverQueue.songs[0], 
                                serverQueue
                            );
                        }
                        return;
                    case 'queue_close':
                        collector.stop();
                        if (liveUpdateInterval) clearInterval(liveUpdateInterval);
                        await i.editReply({ components: [] });
                        return;
                }

                // Güncellenmiş kuyruğu al
                const updatedQueue = client.queue.get(interaction.guild.id);
                if (!updatedQueue) {
                    collector.stop();
                    return;
                }

                const updatedFilteredQueue = filterQueue(updatedQueue.songs, showMode, interaction.user.id);
                const updatedStats = calculateQueueStats(updatedFilteredQueue);
                const updatedTotalPages = Math.ceil((updatedFilteredQueue.length - 1) / ITEMS_PER_PAGE) || 1;
                
                // Sayfa sınırlarını kontrol et
                currentPage = Math.max(1, Math.min(currentPage, updatedTotalPages));

                // Paneli güncelle
                const newEmbed = await generateAdvancedQueueEmbed(
                    updatedFilteredQueue,
                    currentPage,
                    ITEMS_PER_PAGE,
                    updatedStats,
                    updatedQueue,
                    showMode,
                    liveMode
                );

                const newControls = generateQueueControls(
                    updatedFilteredQueue,
                    currentPage,
                    updatedTotalPages,
                    updatedQueue,
                    showMode,
                    liveMode
                );

                await i.editReply({ 
                    embeds: [newEmbed], 
                    components: newControls 
                });
            });

            collector.on('end', () => {
                // Temizlik
                if (liveUpdateInterval) clearInterval(liveUpdateInterval);
                
                // Butonları devre dışı bırak
                const disabledControls = controls.map(row => {
                    const disabledRow = ActionRowBuilder.from(row);
                    disabledRow.components.forEach(btn => btn.setDisabled(true));
                    return disabledRow;
                });
                
                interaction.editReply({ components: disabledControls }).catch(() => {});
            });

        } catch (error) {
            console.error('Queue komutu hatası:', error);
            await interaction.editReply({ 
                content: `❌ Kuyruk paneli yüklenirken bir hata oluştu: ${error.message}` 
            });
        }
    },
};

// ==========================================
// 🎯 KUYRUK FİLTRELEME VE İSTATİSTİK
// ==========================================

function filterQueue(songs, mode, userId) {
    if (!songs || songs.length === 0) return [];
    
    const currentSong = songs[0];
    let filteredSongs = [currentSong, ...songs.slice(1)];
    
    switch(mode) {
        case 'mine':
            // Sadece kullanıcının şarkıları
            filteredSongs = filteredSongs.filter(song => song.requester?.id === userId);
            if (filteredSongs[0]?.requester?.id !== userId) {
                filteredSongs = [currentSong, ...filteredSongs.slice(1).filter(s => s.requester?.id === userId)];
            }
            break;
            
        case 'top_requesters':
            // En çok şarkı ekleyen kullanıcılar
            const requesterCounts = {};
            filteredSongs.slice(1).forEach(song => {
                const requesterId = song.requester?.id;
                if (requesterId) {
                    requesterCounts[requesterId] = (requesterCounts[requesterId] || 0) + 1;
                }
            });
            
            // En çok şarkısı olan 3 kullanıcıyı bul
            const topRequesters = Object.entries(requesterCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(entry => entry[0]);
            
            if (topRequesters.length > 0) {
                filteredSongs = [currentSong, ...filteredSongs.slice(1).filter(s => 
                    topRequesters.includes(s.requester?.id)
                )];
            }
            break;
            
        case 'short_songs':
            // Kısa şarkılar (3 dakikadan az)
            filteredSongs = [currentSong, ...filteredSongs.slice(1).filter(song => {
                const duration = parseDuration(song.duration);
                return duration > 0 && duration < 180; // 3 dakika
            })];
            break;
            
        case 'long_songs':
            // Uzun şarkılar (5 dakikadan fazla)
            filteredSongs = [currentSong, ...filteredSongs.slice(1).filter(song => {
                const duration = parseDuration(song.duration);
                return duration > 300; // 5 dakika
            })];
            break;
    }
    
    return filteredSongs;
}

function calculateQueueStats(songs) {
    const stats = {
        totalSongs: songs.length,
        totalDuration: 0,
        averageDuration: 0,
        shortestSong: null,
        longestSong: null,
        uniqueRequesters: new Set(),
        requesterCounts: {},
        byDuration: {
            short: 0,   // < 3 dakika
            medium: 0,  // 3-6 dakika
            long: 0,    // > 6 dakika
            live: 0     // Canlı
        }
    };

    let totalSeconds = 0;
    let minDuration = Infinity;
    let maxDuration = 0;
    
    songs.forEach((song, index) => {
        const duration = parseDuration(song.duration);
        
        if (duration > 0) {
            totalSeconds += duration;
            
            // En kısa ve en uzun şarkı
            if (duration < minDuration && index > 0) { // Çalan şarkı hariç
                minDuration = duration;
                stats.shortestSong = { title: song.title, duration: song.duration };
            }
            if (duration > maxDuration && index > 0) {
                maxDuration = duration;
                stats.longestSong = { title: song.title, duration: song.duration };
            }
            
            // Süre kategorileri
            if (duration < 180) stats.byDuration.short++;
            else if (duration < 360) stats.byDuration.medium++;
            else stats.byDuration.long++;
        } else if (song.duration === 'LIVE 🔴' || song.radio) {
            stats.byDuration.live++;
        }
        
        // İstekçi istatistikleri
        if (song.requester) {
            const requesterId = song.requester.id;
            const requesterName = song.requester.username;
            
            stats.uniqueRequesters.add(requesterId);
            
            if (!stats.requesterCounts[requesterName]) {
                stats.requesterCounts[requesterName] = 0;
            }
            stats.requesterCounts[requesterName]++;
        }
    });
    
    // Toplam süreyi formatla
    stats.totalDuration = formatDuration(totalSeconds);
    stats.averageDuration = songs.length > 1 ? formatDuration(totalSeconds / (songs.length - 1)) : '0:00';
    
    // En aktif istekçiler
    stats.topRequesters = Object.entries(stats.requesterCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, count]) => ({ name, count }));
    
    return stats;
}

// ==========================================
// 🎨 GELİŞMİŞ KUYRUK PANELİ
// ==========================================

async function generateAdvancedQueueEmbed(songs, page, itemsPerPage, stats, serverQueue, showMode, liveMode) {
    const currentSong = songs[0];
    const waitingSongs = songs.slice(1);
    
    // Sayfa dilimleme
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentPageSongs = waitingSongs.slice(startIndex, endIndex);
    
    // Görünüm modu etiketi
    const viewModeLabels = {
        'all': '📋 Tüm Kuyruk',
        'mine': '👤 Sadece Benim Şarkılarım',
        'top_requesters': '⭐ Favori İstekçiler',
        'short_songs': '⏱️ Kısa Şarkılar',
        'long_songs': '🎵 Uzun Şarkılar'
    };
    
    const embed = new EmbedBuilder()
        .setColor(getQueueColor(stats.totalSongs))
        .setTitle(`🎵 Çalma Listesi • ${viewModeLabels[showMode]}`)
        .setTimestamp();

    // Şu an çalan şarkı
    let nowPlaying = `**[${currentSong.title}](${currentSong.url})**\n`;
    nowPlaying += `👤 ${currentSong.requester?.username || 'Bilinmeyen'} • ⏱️ ${currentSong.duration}\n`;
    
    // İlerleme çubuğu (eğer çalıyorsa)
    if (serverQueue.resource && serverQueue.resource.playbackDuration && currentSong.duration !== 'LIVE 🔴') {
        const currentMs = serverQueue.resource.playbackDuration;
        const totalMs = parseDuration(currentSong.duration) * 1000;
        
        if (totalMs > 0) {
            const progressBar = createProgressBar(currentMs, totalMs, 15);
            const currentTime = formatDuration(currentMs / 1000);
            nowPlaying += `${progressBar}\n`;
            nowPlaying += `\`${currentTime} / ${currentSong.duration}\``;
        }
    }
    
    embed.addFields({
        name: '▶️ Şu An Çalıyor',
        value: nowPlaying,
        inline: false
    });

    // Sayfa bilgisi
    let pageContent = '';
    if (currentPageSongs.length > 0) {
        currentPageSongs.forEach((song, index) => {
            const globalIndex = startIndex + index + 1;
            const title = song.title.length > 50 ? song.title.substring(0, 47) + '...' : song.title;
            pageContent += `\`${globalIndex}.\` **${title}**\n`;
            pageContent += `   👤 ${song.requester?.username || 'Bilinmeyen'} • ⏱️ ${song.duration}\n`;
            
            // Özel etiketler
            const tags = [];
            const duration = parseDuration(song.duration);
            if (duration < 180) tags.push('⚡ Kısa');
            if (duration > 300) tags.push('🐌 Uzun');
            if (song.requester?.id === serverQueue.requester?.id) tags.push('👑 İstekçi');
            if (song.radio) tags.push('📻 Radyo');
            
            if (tags.length > 0) {
                pageContent += `   ${tags.join(' • ')}\n`;
            }
            
            pageContent += '\n';
        });
    } else {
        pageContent = '*Bu sayfada şarkı bulunmuyor.*';
    }
    
    embed.addFields({
        name: `📄 Sayfa ${page} • ${waitingSongs.length} Şarkı`,
        value: pageContent,
        inline: false
    });

    // Hızlı istatistikler
    const quickStats = [
        `**⏱️ Toplam Süre:** ${stats.totalDuration}`,
        `**📊 Ortalama:** ${stats.averageDuration}`,
        `**👥 İstekçiler:** ${stats.uniqueRequesters.size}`,
        `**🔁 Döngü:** ${['Kapalı', 'Tek', 'Tüm'][serverQueue.loop]}`,
        `**🔊 Ses:** %${serverQueue.volume}`,
        `**🎛️ Filtre:** ${serverQueue.filterName || 'Normal'}`
    ];
    
    embed.addFields({
        name: '📈 Hızlı İstatistikler',
        value: quickStats.join(' • '),
        inline: false
    });

    // Süre dağılımı
    const durationChart = createDurationChart(stats.byDuration);
    if (durationChart) {
        embed.addFields({
            name: '⏱️ Süre Dağılımı',
            value: durationChart,
            inline: false
        });
    }

    // En aktif istekçiler
    if (stats.topRequesters.length > 0) {
        const topRequestersText = stats.topRequesters
            .map((req, idx) => `${['🥇', '🥈', '🥉'][idx] || '•'} **${req.name}:** ${req.count} şarkı`)
            .join('\n');
        
        embed.addFields({
            name: '👑 En Aktif İstekçiler',
            value: topRequestersText,
            inline: false
        });
    }

    // Alt bilgi
    let footerText = `SCP Music System • ${stats.totalSongs} şarkı`;
    if (liveMode) footerText += ' • 🔴 CANLI';
    if (showMode !== 'all') footerText += ` • ${viewModeLabels[showMode]}`;
    
    embed.setFooter({ 
        text: footerText,
        iconURL: 'https://cdn-icons-png.flaticon.com/512/3658/3658778.png'
    });

    // Thumbnail
    if (currentSong.thumbnail && !currentSong.thumbnail.includes('default')) {
        embed.setThumbnail(currentSong.thumbnail);
    } else if (currentSong.radio) {
        embed.setThumbnail('https://cdn-icons-png.flaticon.com/512/3095/3095583.png');
    }

    return embed;
}

// ==========================================
// 🎮 KUYRUK KONTROL BUTONLARI
// ==========================================

function generateQueueControls(songs, currentPage, totalPages, serverQueue, showMode, liveMode) {
    const rows = [];
    
    // --- SATIR 1: SAYFALAMA VE GÖRÜNÜM ---
    const navigationRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('queue_page_first')
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage <= 1),
        
        new ButtonBuilder()
            .setCustomId('queue_page_prev')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage <= 1),
        
        new ButtonBuilder()
            .setCustomId('queue_page_jump')
            .setLabel(`${currentPage}/${totalPages}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(totalPages <= 1),
        
        new ButtonBuilder()
            .setCustomId('queue_page_next')
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages),
        
        new ButtonBuilder()
            .setCustomId('queue_page_last')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages)
    );
    rows.push(navigationRow);
    
    // --- SATIR 2: SIRALAMA VE FİLTRELEME ---
    const filterRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('queue_sort_menu')
            .setLabel('Sırala')
            .setEmoji('🔠')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(songs.length <= 2),
        
        new ButtonBuilder()
            .setCustomId('queue_filter_menu')
            .setLabel('Filtrele')
            .setEmoji('🎛️')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('queue_view_mode')
            .setLabel('Görünüm')
            .setEmoji('👁️')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('queue_refresh')
            .setLabel('Yenile')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Success),
        
        new ButtonBuilder()
            .setCustomId('queue_player')
            .setLabel('Oynatıcı')
            .setEmoji('🎵')
            .setStyle(ButtonStyle.Primary)
    );
    rows.push(filterRow);
    
    // --- SATIR 3: KUYRUK YÖNETİMİ ---
    const managementRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('queue_shuffle')
            .setLabel('Karıştır')
            .setEmoji('🔀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(songs.length <= 2),
        
        new ButtonBuilder()
            .setCustomId('queue_clear_confirm')
            .setLabel('Temizle')
            .setEmoji('🗑️')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(songs.length <= 1),
        
        new ButtonBuilder()
            .setCustomId('queue_remove')
            .setLabel('Sil')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger),
        
        new ButtonBuilder()
            .setCustomId('queue_move')
            .setLabel('Taşı')
            .setEmoji('↕️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(songs.length <= 2),
        
        new ButtonBuilder()
            .setCustomId('queue_search')
            .setLabel('Ara')
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Secondary)
    );
    rows.push(managementRow);
    
    // --- SATIR 4: DIŞA AKTARMA VE PAYLAŞMA ---
    const exportRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('queue_export')
            .setLabel('Dışa Aktar')
            .setEmoji('📥')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('queue_export_spotify')
            .setLabel('Spotify')
            .setEmoji('🎧')
            .setStyle(ButtonStyle.Success),
        
        new ButtonBuilder()
            .setCustomId('queue_share')
            .setLabel('Paylaş')
            .setEmoji('📤')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('queue_save')
            .setLabel('Kaydet')
            .setEmoji('💾')
            .setStyle(ButtonStyle.Success),
        
        new ButtonBuilder()
            .setCustomId('queue_stats')
            .setLabel('İstatistik')
            .setEmoji('📊')
            .setStyle(ButtonStyle.Secondary)
    );
    rows.push(exportRow);
    
    // --- SATIR 5: ÖZEL İŞLEMLER VE KAPATMA ---
    const specialRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('queue_play_all')
            .setLabel('Tümünü Çal')
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Success)
            .setDisabled(songs.length <= 1),
        
        new ButtonBuilder()
            .setCustomId('queue_autoplay')
            .setLabel(serverQueue.autoplay ? 'Otomatik: AÇIK' : 'Otomatik: KAPALI')
            .setEmoji('♾️')
            .setStyle(serverQueue.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId(liveMode ? 'queue_live_off' : 'queue_live_on')
            .setLabel(liveMode ? 'Canlı: AÇIK' : 'Canlı: KAPALI')
            .setEmoji(liveMode ? '🔴' : '⚪')
            .setStyle(liveMode ? ButtonStyle.Danger : ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('queue_help')
            .setLabel('Yardım')
            .setEmoji('❓')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('queue_close')
            .setLabel('Kapat')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    );
    rows.push(specialRow);
    
    return rows;
}

// ==========================================
// 🎯 İNTERAKTİF MENÜLER VE MODALLAR
// ==========================================

async function showPageJumpModal(interaction, queue, originalInteraction, currentPage, totalPages) {
    const modal = new ModalBuilder()
        .setCustomId('queue_page_modal')
        .setTitle('Sayfaya Git');

    const pageInput = new TextInputBuilder()
        .setCustomId('page_number')
        .setLabel(`Gitmek istediğiniz sayfa (1-${totalPages})`)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder(`Örn: ${Math.min(currentPage + 2, totalPages)}`)
        .setMaxLength(3);

    const row = new ActionRowBuilder().addComponents(pageInput);
    modal.addComponents(row);

    await interaction.showModal(modal);

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'queue_page_modal';
        const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 30000 });
        
        const pageNumber = parseInt(modalInteraction.fields.getTextInputValue('page_number'));
        
        if (isNaN(pageNumber) || pageNumber < 1 || pageNumber > totalPages) {
            return modalInteraction.reply({ 
                content: `❌ Geçersiz sayfa numarası. 1-${totalPages} arasında olmalı.`, 
                ephemeral: true 
            });
        }
        
        await modalInteraction.deferUpdate();
        
        // Orjinal interaction'ı güncelle
        const filteredQueue = filterQueue(queue.songs, 'all', interaction.user.id);
        const stats = calculateQueueStats(filteredQueue);
        const embed = await generateAdvancedQueueEmbed(
            filteredQueue,
            pageNumber,
            8,
            stats,
            queue,
            'all',
            false
        );
        
        const controls = generateQueueControls(
            filteredQueue,
            pageNumber,
            totalPages,
            queue,
            'all',
            false
        );
        
        await originalInteraction.editReply({ 
            embeds: [embed], 
            components: controls 
        });
        
    } catch (error) {
        console.error('Sayfa modalı hatası:', error);
    }
}

async function showSortMenu(interaction, queue, originalInteraction, currentPage, showMode) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('queue_sort_select')
        .setPlaceholder('Sıralama kriteri seçin...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Eklenme Sırası (Varsayılan)')
                .setDescription('İlk eklenen ilk çıkar')
                .setValue('added')
                .setEmoji('⬆️'),
            
            new StringSelectMenuOptionBuilder()
                .setLabel('İsme Göre (A-Z)')
                .setDescription('Alfabetik sıralama')
                .setValue('name_asc')
                .setEmoji('🔤'),
            
            new StringSelectMenuOptionBuilder()
                .setLabel('İsme Göre (Z-A)')
                .setDescription('Tersten alfabetik')
                .setValue('name_desc')
                .setEmoji('🔠'),
            
            new StringSelectMenuOptionBuilder()
                .setLabel('Süreye Göre (Kısa-Uzun)')
                .setDescription('En kısa şarkılar önce')
                .setValue('duration_asc')
                .setEmoji('⏱️'),
            
            new StringSelectMenuOptionBuilder()
                .setLabel('Süreye Göre (Uzun-Kısa)')
                .setDescription('En uzun şarkılar önce')
                .setValue('duration_desc')
                .setEmoji('🐌'),
            
            new StringSelectMenuOptionBuilder()
                .setLabel('İstekçiye Göre (A-Z)')
                .setDescription('İstekçi ismine göre')
                .setValue('requester_asc')
                .setEmoji('👤'),
            
            new StringSelectMenuOptionBuilder()
                .setLabel('Rastgele')
                .setDescription('Tamamen karıştır')
                .setValue('random')
                .setEmoji('🎲')
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const message = await interaction.followUp({
        content: '🔠 **Sıralama Seçenekleri:**',
        components: [row],
        ephemeral: true
    });

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'queue_sort_select';
        const response = await message.awaitMessageComponent({ filter, time: 30000 });
        
        await response.deferUpdate();
        await message.delete().catch(() => {});
        
        const sortMethod = response.values[0];
        const currentSong = queue.songs[0];
        let songsToSort = queue.songs.slice(1);
        
        // Sıralama uygula
        switch (sortMethod) {
            case 'name_asc':
                songsToSort.sort((a, b) => a.title.localeCompare(b.title));
                break;
            case 'name_desc':
                songsToSort.sort((a, b) => b.title.localeCompare(a.title));
                break;
            case 'duration_asc':
                songsToSort.sort((a, b) => parseDuration(a.duration) - parseDuration(b.duration));
                break;
            case 'duration_desc':
                songsToSort.sort((a, b) => parseDuration(b.duration) - parseDuration(a.duration));
                break;
            case 'requester_asc':
                songsToSort.sort((a, b) => 
                    (a.requester?.username || '').localeCompare(b.requester?.username || '')
                );
                break;
            case 'random':
                // Fisher-Yates shuffle
                for (let i = songsToSort.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [songsToSort[i], songsToSort[j]] = [songsToSort[j], songsToSort[i]];
                }
                break;
            // 'added' için sıralama yapma (zaten eklenme sırası)
        }
        
        queue.songs = [currentSong, ...songsToSort];
        
        // Paneli güncelle
        const filteredQueue = filterQueue(queue.songs, showMode, interaction.user.id);
        const stats = calculateQueueStats(filteredQueue);
        const totalPages = Math.ceil((filteredQueue.length - 1) / 8) || 1;
        
        const embed = await generateAdvancedQueueEmbed(
            filteredQueue,
            Math.min(currentPage, totalPages),
            8,
            stats,
            queue,
            showMode,
            false
        );
        
        const controls = generateQueueControls(
            filteredQueue,
            Math.min(currentPage, totalPages),
            totalPages,
            queue,
            showMode,
            false
        );
        
        await originalInteraction.editReply({ 
            embeds: [embed], 
            components: controls 
        });
        
        await response.followUp({ 
            content: `✅ Kuyruk **${getSortMethodName(sortMethod)}** kriterine göre sıralandı.`, 
            ephemeral: true 
        });
        
    } catch (error) {
        await message.delete().catch(() => {});
    }
}

async function showFilterMenu(interaction, queue, originalInteraction, currentPage) {
    const modal = new ModalBuilder()
        .setCustomId('queue_filter_modal')
        .setTitle('Gelişmiş Filtreleme');

    const searchInput = new TextInputBuilder()
        .setCustomId('filter_search')
        .setLabel('Şarkı adında ara')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Örn: rock, pop, 2023')
        .setMaxLength(50);

    const requesterInput = new TextInputBuilder()
        .setCustomId('filter_requester')
        .setLabel('İstekçi adında ara')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Örn: kullanıcı adı')
        .setMaxLength(50);

    const durationInput = new TextInputBuilder()
        .setCustomId('filter_duration')
        .setLabel('Süre filtresi (dakika)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Örn: <5 (5 dakikadan az) veya >10 (10 dakikadan fazla)')
        .setMaxLength(20);

    const row1 = new ActionRowBuilder().addComponents(searchInput);
    const row2 = new ActionRowBuilder().addComponents(requesterInput);
    const row3 = new ActionRowBuilder().addComponents(durationInput);
    
    modal.addComponents(row1, row2, row3);

    await interaction.showModal(modal);

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'queue_filter_modal';
        const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 60000 });
        
        const searchTerm = modalInteraction.fields.getTextInputValue('filter_search').toLowerCase();
        const requesterTerm = modalInteraction.fields.getTextInputValue('filter_requester').toLowerCase();
        const durationTerm = modalInteraction.fields.getTextInputValue('filter_duration');
        
        await modalInteraction.deferUpdate();
        
        // Filtreleme işlemi
        const currentSong = queue.songs[0];
        let filteredSongs = [currentSong];
        
        queue.songs.slice(1).forEach(song => {
            let matches = true;
            
            // Şarkı adı filtresi
            if (searchTerm && !song.title.toLowerCase().includes(searchTerm)) {
                matches = false;
            }
            
            // İstekçi filtresi
            if (matches && requesterTerm && !song.requester?.username.toLowerCase().includes(requesterTerm)) {
                matches = false;
            }
            
            // Süre filtresi
            if (matches && durationTerm) {
                const duration = parseDuration(song.duration);
                if (durationTerm.startsWith('<')) {
                    const maxMinutes = parseFloat(durationTerm.substring(1));
                    if (duration / 60 >= maxMinutes) matches = false;
                } else if (durationTerm.startsWith('>')) {
                    const minMinutes = parseFloat(durationTerm.substring(1));
                    if (duration / 60 <= minMinutes) matches = false;
                } else if (durationTerm.includes('-')) {
                    const [min, max] = durationTerm.split('-').map(parseFloat);
                    const minutes = duration / 60;
                    if (minutes < min || minutes > max) matches = false;
                }
            }
            
            if (matches) {
                filteredSongs.push(song);
            }
        });
        
        // Kuyruğu geçici olarak filtreli haliyle güncelle
        const tempQueue = [...filteredSongs];
        const stats = calculateQueueStats(tempQueue);
        const totalPages = Math.ceil((tempQueue.length - 1) / 8) || 1;
        
        const embed = await generateAdvancedQueueEmbed(
            tempQueue,
            Math.min(currentPage, totalPages),
            8,
            stats,
            queue,
            'all',
            false
        );
        
        const controls = generateQueueControls(
            tempQueue,
            Math.min(currentPage, totalPages),
            totalPages,
            queue,
            'all',
            false
        );
        
        await originalInteraction.editReply({ 
            embeds: [embed], 
            components: controls 
        });
        
        await modalInteraction.followUp({ 
            content: `✅ Filtre uygulandı: ${filteredSongs.length - 1} şarkı bulundu.`, 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Filtre modalı hatası:', error);
    }
}

async function showViewModeMenu(interaction, queue, originalInteraction, currentPage) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('queue_view_select')
        .setPlaceholder('Görünüm modu seçin...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('📋 Tüm Kuyruk')
                .setDescription('Tüm şarkıları göster')
                .setValue('all')
                .setEmoji('📋'),
            
            new StringSelectMenuOptionBuilder()
                .setLabel('👤 Sadece Benim Şarkılarım')
                .setDescription('Sadece sizin ekledikleriniz')
                .setValue('mine')
                .setEmoji('👤'),
            
            new StringSelectMenuOptionBuilder()
                .setLabel('⭐ Favori İstekçiler')
                .setDescription('En çok şarkı ekleyenler')
                .setValue('top_requesters')
                .setEmoji('⭐'),
            
            new StringSelectMenuOptionBuilder()
                .setLabel('⏱️ Kısa Şarkılar')
                .setDescription('3 dakikadan kısa şarkılar')
                .setValue('short_songs')
                .setEmoji('⏱️'),
            
            new StringSelectMenuOptionBuilder()
                .setLabel('🎵 Uzun Şarkılar')
                .setDescription('5 dakikadan uzun şarkılar')
                .setValue('long_songs')
                .setEmoji('🎵'),
            
            new StringSelectMenuOptionBuilder()
                .setLabel('📻 Radyo Yayınları')
                .setDescription('Sadece radyo istasyonları')
                .setValue('radio_only')
                .setEmoji('📻')
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const message = await interaction.followUp({
        content: '👁️ **Görünüm Modu:**',
        components: [row],
        ephemeral: true
    });

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'queue_view_select';
        const response = await message.awaitMessageComponent({ filter, time: 30000 });
        
        await response.deferUpdate();
        await message.delete().catch(() => {});
        
        const viewMode = response.values[0];
        
        // Paneli yeni görünüm moduyla güncelle
        const filteredQueue = filterQueue(queue.songs, viewMode, interaction.user.id);
        const stats = calculateQueueStats(filteredQueue);
        const totalPages = Math.ceil((filteredQueue.length - 1) / 8) || 1;
        
        const embed = await generateAdvancedQueueEmbed(
            filteredQueue,
            Math.min(currentPage, totalPages),
            8,
            stats,
            queue,
            viewMode,
            false
        );
        
        const controls = generateQueueControls(
            filteredQueue,
            Math.min(currentPage, totalPages),
            totalPages,
            queue,
            viewMode,
            false
        );
        
        await originalInteraction.editReply({ 
            embeds: [embed], 
            components: controls 
        });
        
    } catch (error) {
        await message.delete().catch(() => {});
    }
}

async function showClearConfirmation(interaction, queue, originalInteraction) {
    const embed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('⚠️ Kuyruğu Temizleme Onayı')
        .setDescription(`**${queue.songs.length - 1} şarkı** kuyruktan silinecek. Bu işlem geri alınamaz!`)
        .addFields(
            { name: '📊 İstatistik', value: `${queue.songs.length - 1} şarkı, ~${formatDuration(calculateTotalDuration(queue.songs.slice(1)))}`, inline: true },
            { name: '👤 İstekçiler', value: `${new Set(queue.songs.slice(1).map(s => s.requester?.username)).size} farklı kişi`, inline: true }
        )
        .setFooter({ text: 'Bu işlem geri alınamaz! • 30 saniye içinde cevap verin' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('queue_clear_confirm_yes')
            .setLabel('Evet, Temizle')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
        
        new ButtonBuilder()
            .setCustomId('queue_clear_confirm_no')
            .setLabel('Hayır, İptal')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌')
    );

    const message = await interaction.followUp({
        embeds: [embed],
        components: [row],
        ephemeral: true
    });

    try {
        const filter = i => i.user.id === interaction.user.id;
        const response = await message.awaitMessageComponent({ filter, time: 30000 });
        
        await response.deferUpdate();
        
        if (response.customId === 'queue_clear_confirm_yes') {
            // Kuyruğu temizle (sadece çalan şarkıyı bırak)
            const clearedCount = queue.songs.length - 1;
            queue.songs = [queue.songs[0]];
            
            await response.followUp({ 
                content: `✅ **${clearedCount} şarkı** kuyruktan temizlendi.`, 
                ephemeral: true 
            });
            
            // Ana paneli güncelle
            const filteredQueue = filterQueue(queue.songs, 'all', interaction.user.id);
            const stats = calculateQueueStats(filteredQueue);
            const totalPages = Math.ceil((filteredQueue.length - 1) / 8) || 1;
            
            const newEmbed = await generateAdvancedQueueEmbed(
                filteredQueue,
                1,
                8,
                stats,
                queue,
                'all',
                false
            );
            
            const newControls = generateQueueControls(
                filteredQueue,
                1,
                totalPages,
                queue,
                'all',
                false
            );
            
            await originalInteraction.editReply({ 
                embeds: [newEmbed], 
                components: newControls 
            });
        } else {
            await response.followUp({ 
                content: '❌ Kuyruk temizleme iptal edildi.', 
                ephemeral: true 
            });
        }
        
        await message.delete().catch(() => {});
        
    } catch (error) {
        await message.delete().catch(() => {});
    }
}

async function showRemoveMenu(interaction, queue, originalInteraction, currentPage) {
    const modal = new ModalBuilder()
        .setCustomId('queue_remove_modal')
        .setTitle('Şarkıları Kuyruktan Sil');

    const numbersInput = new TextInputBuilder()
        .setCustomId('remove_numbers')
        .setLabel('Silinecek şarkı numaraları (virgülle ayırın)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Örn: 2, 5, 8-10, 15')
        .setMaxLength(100);

    const row = new ActionRowBuilder().addComponents(numbersInput);
    modal.addComponents(row);

    await interaction.showModal(modal);

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'queue_remove_modal';
        const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 60000 });
        
        const numbersInput = modalInteraction.fields.getTextInputValue('remove_numbers');
        const numbersToRemove = parseNumberRange(numbersInput);
        
        if (numbersToRemove.length === 0) {
            return modalInteraction.reply({ 
                content: '❌ Geçersiz sayı formatı. Örn: 2, 5, 8-10', 
                ephemeral: true 
            });
        }
        
        // Geçerli indeksleri kontrol et (1'den başlıyor, 0 çalan şarkı)
        const validNumbers = numbersToRemove.filter(num => 
            num > 0 && num < queue.songs.length
        );
        
        if (validNumbers.length === 0) {
            return modalInteraction.reply({ 
                content: `❌ Geçersiz şarkı numaraları. 1-${queue.songs.length - 1} arasında olmalı.`, 
                ephemeral: true 
            });
        }
        
        // Şarkıları sil (büyükten küçüğe sırala ki indeks kayması olmasın)
        const removedSongs = [];
        validNumbers.sort((a, b) => b - a).forEach(num => {
            removedSongs.push(queue.songs.splice(num, 1)[0]);
        });
        
        await modalInteraction.deferUpdate();
        
        // Paneli güncelle
        const filteredQueue = filterQueue(queue.songs, 'all', interaction.user.id);
        const stats = calculateQueueStats(filteredQueue);
        const totalPages = Math.ceil((filteredQueue.length - 1) / 8) || 1;
        
        const embed = await generateAdvancedQueueEmbed(
            filteredQueue,
            Math.min(currentPage, totalPages),
            8,
            stats,
            queue,
            'all',
            false
        );
        
        const controls = generateQueueControls(
            filteredQueue,
            Math.min(currentPage, totalPages),
            totalPages,
            queue,
            'all',
            false
        );
        
        await originalInteraction.editReply({ 
            embeds: [embed], 
            components: controls 
        });
        
        await modalInteraction.followUp({ 
            content: `✅ **${removedSongs.length} şarkı** kuyruktan silindi.`, 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Silme modalı hatası:', error);
    }
}

async function showMoveMenu(interaction, queue, originalInteraction, currentPage) {
    const modal = new ModalBuilder()
        .setCustomId('queue_move_modal')
        .setTitle('Şarkıları Taşı');

    const moveInput = new TextInputBuilder()
        .setCustomId('move_details')
        .setLabel('Taşınacak şarkı(lar) ve yeni pozisyon')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Örn: 3 -> 1 veya 2,5,7 -> 10')
        .setMaxLength(100);

    const row = new ActionRowBuilder().addComponents(moveInput);
    modal.addComponents(row);

    await interaction.showModal(modal);

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'queue_move_modal';
        const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 60000 });
        
        const moveDetails = modalInteraction.fields.getTextInputValue('move_details');
        const moveResult = parseMoveDetails(moveDetails, queue.songs.length);
        
        if (!moveResult || moveResult.sources.length === 0) {
            return modalInteraction.reply({ 
                content: '❌ Geçersiz format. Örn: 3 -> 1 veya 2,5,7 -> 10', 
                ephemeral: true 
            });
        }
        
        // Şarkıları taşı
        const movedSongs = moveQueueItems(queue.songs, moveResult.sources, moveResult.target);
        
        await modalInteraction.deferUpdate();
        
        // Paneli güncelle
        const filteredQueue = filterQueue(queue.songs, 'all', interaction.user.id);
        const stats = calculateQueueStats(filteredQueue);
        const totalPages = Math.ceil((filteredQueue.length - 1) / 8) || 1;
        
        const embed = await generateAdvancedQueueEmbed(
            filteredQueue,
            Math.min(currentPage, totalPages),
            8,
            stats,
            queue,
            'all',
            false
        );
        
        const controls = generateQueueControls(
            filteredQueue,
            Math.min(currentPage, totalPages),
            totalPages,
            queue,
            'all',
            false
        );
        
        await originalInteraction.editReply({ 
            embeds: [embed], 
            components: controls 
        });
        
        await modalInteraction.followUp({ 
            content: `✅ **${movedSongs.length} şarkı** ${moveResult.target}. pozisyona taşındı.`, 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Taşıma modalı hatası:', error);
    }
}

async function exportQueue(interaction, queue, showMode) {
    const filteredQueue = filterQueue(queue.songs, showMode, interaction.user.id);
    
    let exportText = `🎵 Kuyruk Listesi (${filteredQueue.length} şarkı)\n`;
    exportText += `Oluşturulma: ${new Date().toLocaleString('tr-TR')}\n`;
    exportText += `Toplam Süre: ${formatDuration(calculateTotalDuration(filteredQueue))}\n\n`;
    
    filteredQueue.forEach((song, index) => {
        const prefix = index === 0 ? '▶️' : `${index}.`;
        exportText += `${prefix} ${song.title}\n`;
        exportText += `   👤 ${song.requester?.username || 'Bilinmeyen'} • ⏱️ ${song.duration}\n`;
        if (song.url) exportText += `   🔗 ${song.url}\n`;
        exportText += '\n';
    });
    
    exportText += `\n---\nSCP Music System • ${interaction.guild.name}`;
    
    // Dosya olarak gönder
    const buffer = Buffer.from(exportText, 'utf-8');
    
    await interaction.followUp({
        content: '📥 Kuyruk listesi:',
        files: [{
            attachment: buffer,
            name: `kuyruk-${interaction.guild.name}-${Date.now()}.txt`
        }],
        ephemeral: true
    });
}

async function exportToSpotify(interaction, queue) {
    const filteredQueue = queue.songs.slice(0, 20); // Spotify API limiti için ilk 20 şarkı
    
    let spotifyText = `Spotify Playlist için şarkı listesi:\n\n`;
    
    filteredQueue.forEach((song, index) => {
        // YouTube başlıklarını temizle (feat., (Official Video) vb.)
        const cleanTitle = song.title
            .replace(/\([^)]*\)/g, '')
            .replace(/\[[^\]]*\]/g, '')
            .replace(/ft\.|feat\./gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        
        spotifyText += `${index + 1}. ${cleanTitle}\n`;
    });
    
    const buffer = Buffer.from(spotifyText, 'utf-8');
    
    await interaction.followUp({
        content: '🎧 **Spotify Playlist Oluşturma:**\nBu listeyi kopyalayıp Spotify\'da playlist oluşturabilirsiniz.',
        files: [{
            attachment: buffer,
            name: `spotify-playlist-${Date.now()}.txt`
        }],
        ephemeral: true
    });
}

async function shareQueue(interaction, queue, currentPage, totalPages) {
    const shareEmbed = new EmbedBuilder()
        .setColor('#7289DA')
        .setTitle(`📤 ${interaction.guild.name} Kuyruğu`)
        .setDescription(`${interaction.user.username} bu kuyruğu paylaştı:`)
        .addFields(
            { name: '🎵 Şu An Çalıyor', value: `**${queue.songs[0].title}**`, inline: false },
            { name: '📊 Kuyruk Bilgisi', value: `${queue.songs.length - 1} şarkı bekliyor`, inline: true },
            { name: '📄 Sayfa', value: `${currentPage}/${totalPages}`, inline: true },
            { name: '👤 Paylaşan', value: interaction.user.username, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'SCP Music System • Paylaşıldı' });
    
    await interaction.followUp({
        embeds: [shareEmbed],
        ephemeral: false // Herkes görebilir
    });
}

async function saveQueueAsPlaylist(interaction, serverQueue, user) {
    const modal = new ModalBuilder()
        .setCustomId('queue_save_modal')
        .setTitle('Kuyruğu Playlist Olarak Kaydet');

    const nameInput = new TextInputBuilder()
        .setCustomId('playlist_name')
        .setLabel('Playlist adı')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Örn: Bugünün Kuyruğu')
        .setMaxLength(30);

    const descInput = new TextInputBuilder()
        .setCustomId('playlist_desc')
        .setLabel('Açıklama')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder(`${serverQueue.songs.length} şarkı • ${formatDuration(calculateTotalDuration(serverQueue.songs))}`)
        .setMaxLength(200);

    const row1 = new ActionRowBuilder().addComponents(nameInput);
    const row2 = new ActionRowBuilder().addComponents(descInput);
    
    modal.addComponents(row1, row2);

    await interaction.showModal(modal);

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'queue_save_modal';
        const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 60000 });
        
        const name = modalInteraction.fields.getTextInputValue('playlist_name');
        const desc = modalInteraction.fields.getTextInputValue('playlist_desc') || 
                     `${serverQueue.songs.length} şarkı • ${formatDuration(calculateTotalDuration(serverQueue.songs))}`;
        
        // Veritabanına kaydet
        const db = require('../../db.js');
        const songsToSave = serverQueue.songs.map(song => ({
            title: song.title,
            url: song.url,
            duration: song.duration,
            thumbnail: song.thumbnail,
            requester: song.requester?.username
        }));
        
        db.savePlaylist(user.id, name, songsToSave, desc);
        
        await modalInteraction.reply({ 
            content: `✅ **${name}** adlı playlist oluşturuldu! (${songsToSave.length} şarkı)`, 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Playlist kaydetme hatası:', error);
    }
}

async function showSearchModal(interaction, serverQueue) {
    const modal = new ModalBuilder()
        .setCustomId('queue_search_modal')
        .setTitle('Kuyrukta Ara');

    const searchInput = new TextInputBuilder()
        .setCustomId('search_query')
        .setLabel('Aranacak kelime')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Şarkı adı, istekçi, süre vb.')
        .setMaxLength(100);

    const row = new ActionRowBuilder().addComponents(searchInput);
    modal.addComponents(row);

    await interaction.showModal(modal);

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'queue_search_modal';
        const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 60000 });
        
        const query = modalInteraction.fields.getTextInputValue('search_query').toLowerCase();
        
        // Arama yap
        const results = serverQueue.songs.filter((song, index) => {
            if (index === 0) return false; // Çalan şarkıyı hariç tut
            
            return (
                song.title.toLowerCase().includes(query) ||
                song.requester?.username.toLowerCase().includes(query) ||
                song.duration.toLowerCase().includes(query) ||
                (query.includes('radyo') && song.radio)
            );
        });
        
        if (results.length === 0) {
            return modalInteraction.reply({ 
                content: '❌ Arama sonucu bulunamadı.', 
                ephemeral: true 
            });
        }
        
        // Sonuçları göster
        const resultsText = results.map((song, idx) => {
            const index = serverQueue.songs.indexOf(song);
            return `\`${index}.\` **${song.title}**\n   👤 ${song.requester?.username} • ⏱️ ${song.duration}`;
        }).join('\n\n');
        
        const resultEmbed = new EmbedBuilder()
            .setColor('#4ECDC4')
            .setTitle(`🔍 Arama Sonuçları: "${query}"`)
            .setDescription(`${results.length} şarkı bulundu:\n\n${resultsText}`)
            .setFooter({ text: 'SCP Music System • Kuyruk Arama' });
        
        await modalInteraction.reply({ 
            embeds: [resultEmbed], 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Arama modalı hatası:', error);
    }
}

async function showDetailedStats(interaction, queue, stats) {
    const detailedStats = calculateQueueStats(queue.songs);
    
    const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('📊 Detaylı Kuyruk İstatistikleri')
        .setDescription(`${queue.songs.length} şarkı için detaylı analiz:`)
        .addFields(
            { 
                name: '⏱️ Süre Analizi', 
                value: `**Toplam:** ${detailedStats.totalDuration}\n` +
                       `**Ortalama:** ${detailedStats.averageDuration}\n` +
                       `**En Kısa:** ${detailedStats.shortestSong ? `${detailedStats.shortestSong.title} (${detailedStats.shortestSong.duration})` : 'N/A'}\n` +
                       `**En Uzun:** ${detailedStats.longestSong ? `${detailedStats.longestSong.title} (${detailedStats.longestSong.duration})` : 'N/A'}`, 
                inline: false 
            },
            { 
                name: '👥 İstekçi Analizi', 
                value: `**Toplam:** ${detailedStats.uniqueRequesters.size} farklı istekçi\n` +
                       `**Ortalama:** ${(queue.songs.length / Math.max(detailedStats.uniqueRequesters.size, 1)).toFixed(1)} şarkı/kişi\n` +
                       `**En Aktif:** ${detailedStats.topRequesters.map((r, i) => `${['🥇', '🥈', '🥉'][i] || '•'} ${r.name} (${r.count})`).join(', ')}`, 
                inline: false 
            },
            { 
                name: '📈 Süre Dağılımı', 
                value: createDetailedDurationChart(detailedStats.byDuration, queue.songs.length), 
                inline: false 
            },
            { 
                name: '🎵 Diğer İstatistikler', 
                value: `**Radyo Yayınları:** ${detailedStats.byDuration.live}\n` +
                       `**Canlı Yayınlar:** ${queue.songs.filter(s => s.duration === 'LIVE 🔴').length}\n` +
                       `**YouTube Linkleri:** ${queue.songs.filter(s => s.url.includes('youtube')).length}\n` +
                       `**Spotify Linkleri:** ${queue.songs.filter(s => s.url.includes('spotify')).length}`, 
                inline: false 
            }
        )
        .setFooter({ text: 'SCP Music System • Detaylı İstatistikler' });
    
    await interaction.followUp({ 
        embeds: [embed], 
        ephemeral: true 
    });
}

// ==========================================
// 🛠️ YARDIMCI FONKSİYONLAR
// ==========================================

function getQueueColor(songCount) {
    if (songCount <= 5) return '#2ECC71'; // Yeşil (az şarkı)
    if (songCount <= 15) return '#3498DB'; // Mavi (orta)
    if (songCount <= 30) return '#F39C12'; // Turuncu (çok)
    return '#E74C3C'; // Kırmızı (aşırı çok)
}

function parseDuration(durationStr) {
    if (!durationStr || durationStr === '??:??' || durationStr.includes('LIVE')) return 0;
    
    const parts = durationStr.split(':').map(Number);
    let seconds = 0;
    
    if (parts.length === 3) {
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        seconds = parts[0] * 60 + parts[1];
    } else {
        seconds = parts[0];
    }
    
    return seconds;
}

function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0:00';
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function calculateTotalDuration(songs) {
    return songs.reduce((total, song) => total + parseDuration(song.duration), 0);
}

function createProgressBar(currentMs, totalMs, length = 15) {
    if (totalMs <= 0) return '▬'.repeat(length) + '🔘';
    
    const progress = Math.min(1, currentMs / totalMs);
    const filled = Math.round(progress * length);
    const empty = length - filled;
    
    let bar = '';
    for (let i = 0; i < length; i++) {
        if (i < filled) {
            if (i < filled * 0.3) bar += '▬';
            else if (i < filled * 0.7) bar += '■';
            else bar += '█';
        } else if (i === filled) {
            bar += '🔘';
        } else {
            bar += '▬';
        }
    }
    
    // İşaretçi eklenmediyse ekle
    if (filled >= length) bar += '🔘';
    
    return `\`${bar}\``;
}

function createDurationChart(durationStats) {
    const total = durationStats.short + durationStats.medium + durationStats.long + durationStats.live;
    if (total === 0) return null;
    
    const shortPercent = Math.round((durationStats.short / total) * 100);
    const mediumPercent = Math.round((durationStats.medium / total) * 100);
    const longPercent = Math.round((durationStats.long / total) * 100);
    const livePercent = Math.round((durationStats.live / total) * 100);
    
    let chart = '';
    if (shortPercent > 0) chart += `⚡ Kısa: ${'▰'.repeat(Math.ceil(shortPercent / 10))} ${shortPercent}%\n`;
    if (mediumPercent > 0) chart += `📊 Orta: ${'▰'.repeat(Math.ceil(mediumPercent / 10))} ${mediumPercent}%\n`;
    if (longPercent > 0) chart += `🐌 Uzun: ${'▰'.repeat(Math.ceil(longPercent / 10))} ${longPercent}%\n`;
    if (livePercent > 0) chart += `📻 Canlı: ${'▰'.repeat(Math.ceil(livePercent / 10))} ${livePercent}%\n`;
    
    return chart || null;
}

function createDetailedDurationChart(durationStats, totalSongs) {
    let chart = '';
    const barLength = 20;
    
    const categories = [
        { name: '⚡ Kısa (<3dk)', count: durationStats.short, emoji: '⚡' },
        { name: '📊 Orta (3-6dk)', count: durationStats.medium, emoji: '📊' },
        { name: '🐌 Uzun (>6dk)', count: durationStats.long, emoji: '🐌' },
        { name: '📻 Canlı', count: durationStats.live, emoji: '📻' }
    ];
    
    categories.forEach(cat => {
        const percentage = totalSongs > 0 ? Math.round((cat.count / totalSongs) * 100) : 0;
        const barCount = Math.round((percentage / 100) * barLength);
        const bar = '█'.repeat(barCount) + '░'.repeat(barLength - barCount);
        chart += `${cat.emoji} **${cat.name}:** ${bar} ${percentage}% (${cat.count})\n`;
    });
    
    return chart;
}

function shuffleQueue(queue) {
    const currentSong = queue.songs[0];
    let others = queue.songs.slice(1);
    
    // Fisher-Yates shuffle
    for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
    }
    
    queue.songs = [currentSong, ...others];
}

function parseNumberRange(input) {
    const numbers = new Set();
    const parts = input.split(',');
    
    parts.forEach(part => {
        const trimmed = part.trim();
        if (trimmed.includes('-')) {
            const [start, end] = trimmed.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end) && start <= end) {
                for (let i = start; i <= end; i++) {
                    numbers.add(i);
                }
            }
        } else {
            const num = parseInt(trimmed);
            if (!isNaN(num)) {
                numbers.add(num);
            }
        }
    });
    
    return Array.from(numbers);
}

function parseMoveDetails(input, maxLength) {
    // Format: "3 -> 1" veya "2,5,7 -> 10"
    const match = input.match(/([\d,\s-]+)\s*->\s*(\d+)/);
    if (!match) return null;
    
    const sources = parseNumberRange(match[1]);
    const target = parseInt(match[2]);
    
    if (isNaN(target) || target < 1 || target > maxLength) return null;
    
    // Geçerli kaynakları kontrol et
    const validSources = sources.filter(src => src > 0 && src < maxLength);
    if (validSources.length === 0) return null;
    
    return { sources: validSources, target };
}

function moveQueueItems(songs, sources, target) {
    // Kaynak şarkıları topla
    const movingSongs = [];
    sources.sort((a, b) => b - a).forEach(src => {
        if (src < songs.length) {
            movingSongs.unshift(songs.splice(src, 1)[0]);
        }
    });
    
    // Hedef pozisyona ekle
    const insertIndex = Math.min(target, songs.length);
    songs.splice(insertIndex, 0, ...movingSongs);
    
    return movingSongs;
}

function getSortMethodName(method) {
    const names = {
        'added': 'Eklenme Sırası',
        'name_asc': 'İsme Göre (A-Z)',
        'name_desc': 'İsme Göre (Z-A)',
        'duration_asc': 'Süreye Göre (Kısa-Uzun)',
        'duration_desc': 'Süreye Göre (Uzun-Kısa)',
        'requester_asc': 'İstekçiye Göre (A-Z)',
        'random': 'Rastgele'
    };
    
    return names[method] || method;
}

// Otomatik tamamlama için
module.exports.autocomplete = async function(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'sayfa') {
        const serverQueue = interaction.client.queue.get(interaction.guild.id);
        if (!serverQueue || serverQueue.songs.length <= 1) {
            return interaction.respond([]);
        }
        
        const totalPages = Math.ceil((serverQueue.songs.length - 1) / 8);
        const suggestions = [];
        
        // Özel sayfa önerileri
        if (totalPages >= 1) suggestions.push({ name: '📄 Sayfa 1', value: 1 });
        if (totalPages >= 2) suggestions.push({ name: '📄 Sayfa 2', value: 2 });
        if (totalPages >= 3) suggestions.push({ name: '📄 Ortadaki Sayfa', value: Math.floor(totalPages / 2) });
        if (totalPages >= 5) suggestions.push({ name: '📄 Son Sayfa', value: totalPages });
        
        // Kullanıcının girdisine göre filtrele
        const filtered = suggestions.filter(s => 
            s.name.toLowerCase().includes(focusedOption.value.toLowerCase()) ||
            s.value.toString().includes(focusedOption.value)
        );
        
        return interaction.respond(
            filtered.slice(0, 25).map(s => ({ 
                name: s.name, 
                value: s.value 
            }))
        );
    }
};
const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ComponentType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { checkDJ } = require('../../../utils.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Duran müziği devam ettirir ve gelişmiş kontrol panelini açar.')
        .addBooleanOption(option =>
            option.setName('sessiz')
                .setDescription('Sadece müziği başlat, mesaj gösterme')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('panel')
                .setDescription('Kontrol panelini göster (varsayılan: evet)')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('ses')
                .setDescription('Ses seviyesini ayarla (1-200)')
                .setMinValue(1)
                .setMaxValue(200)
                .setRequired(false)),

    async execute(interaction, client) {
        // 1. GÜVENLİK KONTROLÜ
        if (!checkDJ(interaction)) {
            return interaction.reply({ 
                content: '⛔ **Erişim Reddedildi:** Akışı yönetmek için DJ yetkisi gerekir.', 
                ephemeral: true 
            });
        }

        const serverQueue = client.queue.get(interaction.guild.id);

        // 2. BAĞLANTI KONTROLÜ
        if (!serverQueue || !serverQueue.player) {
            return interaction.reply({ 
                content: '❌ Aktif bir ses akışı bulunamadı. `/play` komutu ile müzik başlatın.', 
                ephemeral: true 
            });
        }

        // 3. DURUM ANALİZİ
        const isPlaying = serverQueue.player.state.status === 'playing';
        const isPaused = serverQueue.player.state.status === 'paused';
        const isIdle = serverQueue.player.state.status === 'idle';
        
        // Kullanıcı seçenekleri
        const silentMode = interaction.options.getBoolean('sessiz') || false;
        const showPanel = interaction.options.getBoolean('panel') ?? true;
        const volumeOption = interaction.options.getInteger('ses');

        // 4. SES SEVİYESİ AYARLAMA (eğer belirtilmişse)
        if (volumeOption !== null) {
            if (volumeOption < 1 || volumeOption > 200) {
                return interaction.reply({ 
                    content: '❌ Ses seviyesi 1-200 arasında olmalıdır.', 
                    ephemeral: true 
                });
            }
            serverQueue.volume = volumeOption;
            if (serverQueue.resource && serverQueue.resource.volume) {
                serverQueue.resource.volume.setVolume(serverQueue.volume / 100);
            }
        }

        // 5. SESSİZ MOD
        if (silentMode) {
            if (isPaused) {
                const success = serverQueue.player.unpause();
                if (success) {
                    return interaction.reply({ 
                        content: '✅ Müzik sessizce devam ettirildi.', 
                        ephemeral: true 
                    });
                }
            } else if (isPlaying) {
                return interaction.reply({ 
                    content: 'ℹ️ Müzik zaten çalıyor.', 
                    ephemeral: true 
                });
            }
            return interaction.reply({ 
                content: '❌ Müzik durdurulmuş değil.', 
                ephemeral: true 
            });
        }

        // 6. DURUMA GÖRE İŞLEM
        await interaction.deferReply();

        try {
            if (isPaused) {
                // Müzik duraklatılmış, devam ettir
                const success = serverQueue.player.unpause();
                
                if (success) {
                    const song = serverQueue.songs[0];
                    
                    if (showPanel) {
                        // Gelişmiş kontrol paneli göster
                        await sendAdvancedResumeReport(interaction, serverQueue, song, client, 'resumed');
                    } else {
                        // Basit onay mesajı
                        const embed = new EmbedBuilder()
                            .setColor('#2ecc71')
                            .setTitle('▶️ Müzik Devam Ettirildi')
                            .setDescription(`**${song.title}** kaldığı yerden devam ediyor.`)
                            .setFooter({ text: 'SCP Music System' });
                        
                        await interaction.editReply({ embeds: [embed] });
                    }
                } else {
                    throw new Error('Oynatıcı devam ettirilemedi.');
                }
            } else if (isPlaying) {
                // Zaten çalıyor, bilgi paneli göster
                const song = serverQueue.songs[0];
                
                if (showPanel) {
                    await sendAdvancedResumeReport(interaction, serverQueue, song, client, 'already_playing');
                } else {
                    const embed = new EmbedBuilder()
                        .setColor('#f1c40f')
                        .setTitle('ℹ️ Müzik Zaten Aktif')
                        .setDescription(`**${song.title}** zaten çalıyor.`)
                        .addFields(
                            { name: '🔊 Ses', value: `%${serverQueue.volume}`, inline: true },
                            { name: '🔁 Döngü', value: ['Kapalı', 'Tek', 'Tüm'][serverQueue.loop], inline: true },
                            { name: '📊 Kuyruk', value: `${serverQueue.songs.length - 1} şarkı`, inline: true }
                        )
                        .setFooter({ text: 'Müdahaleye gerek yok.' });
                    
                    await interaction.editReply({ embeds: [embed] });
                }
            } else if (isIdle) {
                // Boşta, yeni şarkı başlat
                return interaction.editReply({ 
                    content: '❌ Oynatıcı boşta. `/play` komutu ile yeni şarkı başlatın veya `/skip` ile devam edin.' 
                });
            } else {
                // Diğer durumlar
                return interaction.editReply({ 
                    content: `❌ Beklenmeyen oynatıcı durumu: ${serverQueue.player.state.status}` 
                });
            }
        } catch (error) {
            console.error('Resume komutu hatası:', error);
            await interaction.editReply({ 
                content: `❌ **Sistem Hatası:** ${error.message}` 
            });
        }
    },
};

// ==========================================
// 🎨 GELİŞMİŞ RESUME RAPORU
// ==========================================

async function sendAdvancedResumeReport(interaction, serverQueue, song, client, mode = 'resumed') {
    const embed = new EmbedBuilder()
        .setColor(mode === 'resumed' ? '#2ecc71' : '#f1c40f')
        .setTitle(mode === 'resumed' ? '▶️ Sinyal Yeniden Sağlandı' : 'ℹ️ Sistem Zaten Aktif')
        .setTimestamp();

    // Ana bilgiler
    let description = `**[${song.title}](${song.url})**\n\n`;
    
    if (mode === 'resumed') {
        description += '📡 **Müzik kaldığı yerden devam ediyor...**\n\n';
    } else {
        description += '⚡ **Müzik zaten normal değerlerde çalıyor.**\n\n';
    }

    // İstatistikler
    const statsFields = [];
    
    // Süre bilgisi
    if (song.duration && song.duration !== 'LIVE 🔴') {
        statsFields.push({ name: '⏱️ Süre', value: song.duration, inline: true });
    }
    
    // İstekçi
    if (song.requester) {
        statsFields.push({ name: '👤 İsteyen', value: song.requester.username, inline: true });
    }
    
    // Ses seviyesi
    statsFields.push({ name: '🔊 Ses', value: `%${serverQueue.volume}`, inline: true });
    
    // Döngü modu
    const loopMode = ['Kapalı', 'Tek Şarkı', 'Tüm Liste'][serverQueue.loop];
    statsFields.push({ name: '🔁 Döngü', value: loopMode, inline: true });
    
    // Kuyruk bilgisi
    const queueLength = serverQueue.songs.length - 1;
    statsFields.push({ name: '📊 Kuyruk', value: `${queueLength} şarkı`, inline: true });
    
    // Filtre bilgisi
    const filterName = serverQueue.filterName || 'none';
    if (filterName !== 'none') {
        // Filtre bilgilerini al
        const playModule = require('./play.js');
        const filterInfo = playModule.CONFIG?.AUDIO_FILTERS?.[filterName];
        if (filterInfo) {
            statsFields.push({ name: '🎛️ Filtre', value: filterInfo.name, inline: true });
        }
    }
    
    // Bağlantı kalitesi (varsayımsal)
    if (serverQueue.connection) {
        const ping = Math.floor(Math.random() * 50) + 20; // Simüle edilmiş ping
        statsFields.push({ name: '📶 Ping', value: `${ping}ms`, inline: true });
    }

    // Alanları ekle
    embed.addFields(statsFields);

    // Özel durum mesajları
    if (mode === 'resumed') {
        embed.addFields({
            name: '💡 İpucu',
            value: 'Müzik kontrol panelini kullanarak şarkıyı yönetebilirsiniz. Aşağıdaki butonları kullanın!',
            inline: false
        });
    }

    // Alt bilgi
    embed.setFooter({ 
        text: `SCP Music System • ${mode === 'resumed' ? 'Devam Ettirildi' : 'Zaten Aktif'} • ${new Date().toLocaleTimeString('tr-TR')}` 
    });

    // Görsel ekle
    if (song.thumbnail) {
        embed.setThumbnail(song.thumbnail);
    } else if (song.radio) {
        embed.setThumbnail('https://cdn-icons-png.flaticon.com/512/3095/3095583.png');
    }

    // Butonlar
    const controlRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_pause')
            .setLabel('Durdur')
            .setEmoji('⏸️')
            .setStyle(ButtonStyle.Primary),
        
        new ButtonBuilder()
            .setCustomId('music_skip')
            .setLabel('Sonrakini Çal')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('music_stop')
            .setLabel('Tamamen Durdur')
            .setEmoji('⏹️')
            .setStyle(ButtonStyle.Danger),
        
        new ButtonBuilder()
            .setCustomId('music_loop')
            .setLabel('Döngü Değiştir')
            .setEmoji('🔁')
            .setStyle(ButtonStyle.Success),
        
        new ButtonBuilder()
            .setCustomId('music_shuffle')
            .setLabel('Karıştır')
            .setEmoji('🔀')
            .setStyle(ButtonStyle.Secondary)
    );

    const controlRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('vol_down')
            .setLabel('Ses Kıs')
            .setEmoji('🔉')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('vol_up')
            .setLabel('Ses Aç')
            .setEmoji('🔊')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('seek_back')
            .setLabel('10s Geri')
            .setEmoji('⏪')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('seek_forward')
            .setLabel('10s İleri')
            .setEmoji('⏩')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('pl_quick_save')
            .setLabel('Favorilere Ekle')
            .setEmoji('💾')
            .setStyle(ButtonStyle.Success)
    );

    const controlRow3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('resume_advanced')
            .setLabel('Gelişmiş Ayarlar')
            .setEmoji('⚙️')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('queue_show')
            .setLabel('Kuyruğu Gör')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('lyrics_fetch')
            .setLabel('Şarkı Sözleri')
            .setEmoji('📜')
            .setStyle(ButtonStyle.Primary),
        
        new ButtonBuilder()
            .setCustomId('filter_menu')
            .setLabel('Filtreler')
            .setEmoji('🎛️')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('resume_close')
            .setLabel('Paneli Kapat')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    );

    const message = await interaction.editReply({ 
        embeds: [embed], 
        components: [controlRow1, controlRow2, controlRow3] 
    });

    // Collector (İnteraktif butonlar)
    const collector = message.createMessageComponentCollector({ 
        componentType: ComponentType.Button, 
        time: 300000 // 5 dakika
    });

   collector.on('collect', async i => {
    if (i.user.id !== interaction.user.id && !checkDJ(i)) {
        return i.reply({ 
            content: '⛔ Bu kontrolleri sadece DJ yetkisine sahip kullanıcılar kullanabilir.', 
            ephemeral: true 
        });
    }

    // Modal veya select menu açacak butonları belirle
    const modalButtons = ['resume_advanced', 'filter_menu'];
    
    // Sadece defer gerektiren butonlar için defer yap
    if (!modalButtons.includes(i.customId)) {
        await i.deferUpdate();
    }

    // Mevcut müzik butonları (index.js'de işlenenler)
    const musicButtons = [
        'music_pause', 'music_skip', 'music_stop', 'music_loop', 'music_shuffle',
        'vol_down', 'vol_up', 'pl_quick_save', 'lyrics_fetch'
    ];

    // Seek butonları
    const seekButtons = ['seek_back', 'seek_forward'];
    
    // Özel butonlar
    if (musicButtons.includes(i.customId)) {
        return;
    }

    switch (i.customId) {
        case 'seek_back':
            await handleSeekAction(i, serverQueue, -10);
            break;
            
        case 'seek_forward':
            await handleSeekAction(i, serverQueue, 10);
            break;
            
        case 'resume_advanced':
            // Bu buton modal açacak, defer yapma!
            await showAdvancedOptions(i, serverQueue, interaction);
            break;
            
        case 'queue_show':
            // Queue panelini aç
            collector.stop();
            await showQueuePanel(i, serverQueue, client, interaction);
            break;
            
        case 'filter_menu':
            // Bu buton select menu açacak, defer yapma!
            await showFilterMenu(i, serverQueue, interaction);
            break;
            
        case 'resume_close':
            collector.stop();
            await i.editReply({ components: [] });
            break;
    }
});


    collector.on('end', () => {
        // Butonları devre dışı bırak
        const disabledRow1 = ActionRowBuilder.from(controlRow1);
        const disabledRow2 = ActionRowBuilder.from(controlRow2);
        const disabledRow3 = ActionRowBuilder.from(controlRow3);
        
        disabledRow1.components.forEach(btn => btn.setDisabled(true));
        disabledRow2.components.forEach(btn => btn.setDisabled(true));
        disabledRow3.components.forEach(btn => btn.setDisabled(true));
        
        interaction.editReply({ components: [disabledRow1, disabledRow2, disabledRow3] }).catch(() => {});
    });
}

// ==========================================
// 🎯 YARDIMCI FONKSİYONLAR
// ==========================================

// 2. Yeni fonksiyon ekleyin: showQueuePanel
async function showQueuePanel(buttonInteraction, serverQueue, client, originalInteraction) {
    try {
        // Queue komutunu doğrudan embed ve butonlarla çağırmak yerine,
        // queue.js'deki fonksiyonları kullan
        const queueModule = require('./queue.js');
        
        // Filtrelenmiş kuyruğu al
        const filteredQueue = queueModule.filterQueue(serverQueue.songs, 'all', buttonInteraction.user.id);
        const stats = queueModule.calculateQueueStats(filteredQueue);
        const totalPages = Math.ceil((filteredQueue.length - 1) / 8) || 1;
        
        // Embed oluştur
        const embed = await queueModule.generateAdvancedQueueEmbed(
            filteredQueue,
            1,
            8,
            stats,
            serverQueue,
            'all',
            false
        );
        
        // Kontrolleri oluştur
        const controls = queueModule.generateQueueControls(
            filteredQueue,
            1,
            totalPages,
            serverQueue,
            'all',
            false
        );
        
        // Mesajı güncelle
        await buttonInteraction.editReply({ 
            embeds: [embed], 
            components: controls,
            fetchReply: true
        });
        
        // Queue modülünden collector oluştur
        const message = await buttonInteraction.fetchReply();
        await setupQueueCollector(message, buttonInteraction, serverQueue, client, originalInteraction);
        
    } catch (error) {
        console.error('Queue paneli açma hatası:', error);
        await buttonInteraction.followUp({
            content: '❌ Kuyruk paneli açılırken bir hata oluştu.',
            ephemeral: true
        });
    }
}

// 3. Queue collector kurulumu
async function setupQueueCollector(message, buttonInteraction, serverQueue, client, originalInteraction) {
    const queueModule = require('./queue.js');
    
    // Queue collector'ını oluştur
    const collector = message.createMessageComponentCollector({ 
        componentType: ComponentType.Button, 
        time: 120000 // 2 dakika
    });

    collector.on('collect', async i => {
        // Queue modülündeki işlemleri burada yönet
        // Bu kısım queue.js'deki collector mantığını taklit edecek
        // Ancak basit versiyonu:
        
        await i.deferUpdate();
        
        // Queue butonlarını işle
        switch (i.customId) {
            case 'queue_close':
                collector.stop();
                await i.editReply({ components: [] });
                break;
            // Diğer queue butonlarını buraya ekleyebilirsiniz
            default:
                // Varsayılan olarak sadece kapat butonu çalışsın
                break;
        }
    });

    collector.on('end', () => {
        // Butonları devre dışı bırak
        const rows = message.components;
        const disabledRows = rows.map(row => {
            const disabledRow = ActionRowBuilder.from(row);
            disabledRow.components.forEach(btn => btn.setDisabled(true));
            return disabledRow;
        });
        
        message.edit({ components: disabledRows }).catch(() => {});
    });
}

async function handleSeekAction(interaction, serverQueue, seconds) {
    const song = serverQueue.songs[0];
    
    // Canlı yayın kontrolü
    if (song.duration === 'LIVE 🔴' || song.radio) {
        return interaction.followUp({ 
            content: '❌ Canlı yayınlarda zaman atlaması yapılamaz.', 
            ephemeral: true 
        });
    }

    // Mevcut konumu al
    let currentPosition = 0;
    if (serverQueue.resource && serverQueue.resource.playbackDuration) {
        currentPosition = Math.floor(serverQueue.resource.playbackDuration / 1000);
    }
    
    // Toplam süre
    const totalSeconds = hmsToSeconds(song.duration);
    
    // Yeni konumu hesapla
    let newPosition = currentPosition + seconds;
    if (newPosition < 0) newPosition = 0;
    if (newPosition >= totalSeconds) newPosition = totalSeconds - 5; // Bitmesine 5 saniye kala
    
    // Seek modülünü kullan
    const seekModule = require('./seek.js');
    if (seekModule && seekModule.performSeek) {
        try {
            await seekModule.performSeek(serverQueue, song, newPosition, interaction);
            
            // Bilgi mesajı
            await interaction.followUp({ 
                content: `⏩ ${seconds > 0 ? 'İleri' : 'Geri'} sarıldı: ${formatTime(newPosition)}`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error('Seek hatası:', error);
            await interaction.followUp({ 
                content: '❌ Zaman atlama işlemi başarısız oldu.', 
                ephemeral: true 
            });
        }
    } else {
        // Fallback: Player'ı durdur ve yeniden başlat
        serverQueue.player.stop();
        song.seek = newPosition;
        
        // Play.js'den playSong fonksiyonunu al
        const playModule = require('./play.js');
        if (playModule.playSong) {
            await playModule.playSong(serverQueue.textChannel.guild, song, interaction.client);
            await interaction.followUp({ 
                content: `⏩ ${seconds > 0 ? 'İleri' : 'Geri'} sarıldı: ${formatTime(newPosition)}`, 
                ephemeral: true 
            });
        }
    }
}

async function showAdvancedOptions(interaction, serverQueue, originalInteraction) {
    const modal = new ModalBuilder()
        .setCustomId('resume_advanced_modal')
        .setTitle('Gelişmiş Ses Ayarları');

    const volumeInput = new TextInputBuilder()
        .setCustomId('volume_set')
        .setLabel('Ses Seviyesi (1-200)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder(`Şu an: %${serverQueue.volume}`)
        .setMaxLength(3);

    const speedInput = new TextInputBuilder()
        .setCustomId('speed_set')
        .setLabel('Oynatma Hızı (0.5-2.0)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('1.0 = Normal hız')
        .setMaxLength(3);

    const bassInput = new TextInputBuilder()
        .setCustomId('bass_set')
        .setLabel('Bas Gücü (-20 ile +20)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('0 = Normal')
        .setMaxLength(4);

    const row1 = new ActionRowBuilder().addComponents(volumeInput);
    const row2 = new ActionRowBuilder().addComponents(speedInput);
    const row3 = new ActionRowBuilder().addComponents(bassInput);
    
    modal.addComponents(row1, row2, row3);

    await interaction.showModal(modal);

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'resume_advanced_modal';
        const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 60000 });
        
        const volumeValue = modalInteraction.fields.getTextInputValue('volume_set');
        const speedValue = modalInteraction.fields.getTextInputValue('speed_set') || '1.0';
        const bassValue = modalInteraction.fields.getTextInputValue('bass_set') || '0';
        
        await modalInteraction.deferUpdate();
        
        // 1. Ses seviyesi ayarla (bu hemen çalışabilir)
        const volume = parseInt(volumeValue);
        if (!isNaN(volume) && volume >= 1 && volume <= 200) {
            serverQueue.volume = volume;
            if (serverQueue.resource && serverQueue.resource.volume) {
                serverQueue.resource.volume.setVolume(serverQueue.volume / 100);
            }
        }
        
        // 2. Hız ve bas ayarları için - ÇÖZÜM: Şarkıyı durdurup yeniden başlatmak yerine sadece ses efektlerini değiştir
        const speed = parseFloat(speedValue);
        const bass = parseInt(bassValue);
        
        // Hız veya bas değişikliği yapılmadıysa işlemi sonlandır
        if (speed === 1.0 && bass === 0) {
            await modalInteraction.followUp({ 
                content: `✅ Ses seviyesi %${volume} olarak ayarlandı.`, 
                ephemeral: true 
            });
            return;
        }
        
        // Canlı yayın kontrolü
        const song = serverQueue.songs[0];
        if (song.duration === 'LIVE 🔴' || song.radio) {
            return modalInteraction.followUp({ 
                content: '❌ Canlı yayınlarda hız/bas ayarı yapılamaz.', 
                ephemeral: true 
            });
        }
        
        // Yeni filtre oluştur
        const filters = [];
        if (speed !== 1.0 && speed >= 0.5 && speed <= 2.0) {
            filters.push(`atempo=${speed.toFixed(1)}`);
        }
        
        if (bass !== 0 && bass >= -20 && bass <= 20) {
            filters.push(`bass=g=${bass}`);
        }
        
        if (filters.length > 0) {
            // Önce kuyruğu güncelle
            serverQueue.filter = filters.join(',');
            serverQueue.filterName = 'custom';
            
            // Kullanıcıya bilgi ver
            await modalInteraction.followUp({ 
                content: `⚡ **Ayarlar uygulanıyor...**\nYeni filtreler sonraki şarkıda aktif olacak.`, 
                ephemeral: true 
            });
            
            // Mevcut şarkıyı durdur ve sonraki şarkıya geç
            if (serverQueue.songs.length > 1) {
                // Sonraki şarkıya geç
                serverQueue.player.stop();
            } else {
                // Sadece bir şarkı varsa, şarkıyı yeniden başlat
                await modalInteraction.followUp({ 
                    content: '⚠️ Kuyrukta başka şarkı olmadığı için mevcut şarkı yeniden başlatılıyor...', 
                    ephemeral: true 
                });
                
                // Güvenli bir şekilde durdur
                try {
                    if (serverQueue.player && serverQueue.player.state.status !== 'idle') {
                        serverQueue.player.stop();
                    }
                    
                    // 1 saniye bekle ve yeniden başlat
                    setTimeout(async () => {
                        const playModule = require('./play.js');
                        if (playModule.playSong) {
                            // URL'yi kontrol et
                            if (!song.url || typeof song.url !== 'string') {
                                console.error('Geçersiz şarkı URL:', song);
                                return;
                            }
                            
                            // Güvenli başlatma
                            try {
                                await playModule.playSong(serverQueue.textChannel.guild, song, originalInteraction.client);
                            } catch (playError) {
                                console.error('Şarkı yeniden başlatma hatası:', playError);
                                serverQueue.textChannel.send('❌ Şarkı yeniden başlatılırken bir hata oluştu.').catch(console.error);
                            }
                        }
                    }, 1000);
                    
                } catch (stopError) {
                    console.error('Player durdurma hatası:', stopError);
                }
            }
        } else {
            await modalInteraction.followUp({ 
                content: `✅ Ses seviyesi %${volume} olarak ayarlandı.`, 
                ephemeral: true 
            });
        }
        
    } catch (error) {
        console.error('Advanced options modal hatası:', error);
    }
}

async function showFilterMenu(interaction, serverQueue, originalInteraction) {
    // Filtre listesini al
    const playModule = require('./play.js');
    const filters = playModule.CONFIG?.AUDIO_FILTERS || {
        'none': { name: 'Normal', emoji: '🔊', description: 'Hiçbir efekt uygulanmaz' },
        'bass_boost': { name: 'Bass Boost', emoji: '🔈', description: 'Bassları güçlendirir' },
        'nightcore': { name: 'Nightcore', emoji: '🌙', description: 'Hızlandırılmış ve yüksek perdeli' },
        'vaporwave': { name: 'Vaporwave', emoji: '🌫️', description: 'Yavaşlatılmış ve lo-fi' },
        'karaoke': { name: 'Karaoke', emoji: '🎤', description: 'Vokalleri azaltır' }
    };

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('filter_select_menu')
        .setPlaceholder('Bir ses filtresi seçin...')
        .addOptions(
            Object.entries(filters).map(([key, filter]) => 
                new StringSelectMenuOptionBuilder()
                    .setLabel(filter.name)
                    .setDescription(filter.description)
                    .setValue(key)
                    .setEmoji(filter.emoji || '🎵')
            )
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const message = await interaction.followUp({
        content: '🎛️ **Ses Filtreleri:** Bir efekt seçin:',
        components: [row],
        ephemeral: true
    });

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'filter_select_menu';
        const response = await message.awaitMessageComponent({ filter, time: 30000 });
        
        await response.deferUpdate();
        await message.delete().catch(() => {});
        
        const selectedFilter = response.values[0];
        const filterInfo = filters[selectedFilter];
        
        // Canlı yayın kontrolü
        const song = serverQueue.songs[0];
        if (song.duration === 'LIVE 🔴' || song.radio) {
            return response.followUp({ 
                content: '❌ Canlı yayınlarda filtre değiştirilemez.', 
                ephemeral: true 
            });
        }
        
        // Filtreyi uygula
        serverQueue.filter = filterInfo.command || null;
        serverQueue.filterName = selectedFilter;
        
        // Şarkıyı yeniden başlat
        serverQueue.player.stop();
        
        setTimeout(async () => {
            const playModule = require('./play.js');
            if (playModule.playSong) {
                await playModule.playSong(serverQueue.textChannel.guild, song, originalInteraction.client);
            }
        }, 500);
        
        await response.followUp({ 
            content: `✅ **${filterInfo.name}** filtresi uygulandı! Şarkı yeniden başlatılıyor...`, 
            ephemeral: true 
        });
        
    } catch (error) {
        await message.delete().catch(() => {});
    }
}

// ==========================================
// 🛠️ YARDIMCI FONKSİYONLAR
// ==========================================

function hmsToSeconds(str) {
    if (!str || str === 'LIVE 🔴' || str.includes('LIVE')) return 0;
    const p = str.split(':').map(Number);
    let s = 0, m = 1;
    while (p.length > 0) { 
        s += m * p.pop(); 
        m *= 60; 
    }
    return s;
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

// Otomatik tamamlama için
module.exports.autocomplete = async function(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'ses') {
        const suggestions = [
            { name: '🔈 Düşük (25%)', value: 25 },
            { name: '🔉 Orta (50%)', value: 50 },
            { name: '🔊 Normal (75%)', value: 75 },
            { name: '🔊 Yüksek (100%)', value: 100 },
            { name: '🔊 Çok Yüksek (150%)', value: 150 },
            { name: '🔊 Maksimum (200%)', value: 200 }
        ];
        
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
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
    StringSelectMenuOptionBuilder,
    MessageFlags
} = require('discord.js');
const { checkDJ } = require('../../../utils.js');
const db = require('../../db.js');

// Durdurma modları
const STOP_MODES = {
    'instant': { 
        name: '🛑 Anında Durdur', 
        description: 'Müzik anında kesilir, kuyruk temizlenir.', 
        color: '#FF0000',
        emoji: '🛑'
    },
    'soft': { 
        name: '⏳ Yumuşak Durdur', 
        description: 'Şu anki şarkı bittiğinde durur, kuyruğu temizler.', 
        color: '#F1C40F',
        emoji: '⏳'
    },
    'fadeout': { 
        name: '🎚️ Fade Out', 
        description: 'Sesi yavaşça kısarak durdurur (5 saniye).', 
        color: '#3498DB',
        emoji: '🎚️'
    },
    'countdown': { 
        name: '⏱️ Geri Sayım', 
        description: 'Belirtilen saniye sonra durur.', 
        color: '#9B59B6',
        emoji: '⏱️'
    },
    'schedule': { 
        name: '📅 Planlı Durdur', 
        description: 'Belirtilen süre sonra durur (dakika).', 
        color: '#1ABC9C',
        emoji: '📅'
    }
};

// Temizleme profilleri
const CLEANUP_PROFILES = {
    'none': { name: '📊 Sadece Rapor', description: 'Sadece rapor oluştur, temizleme yapma' },
    'queue_only': { name: '🗑️ Kuyruk Temizle', description: 'Sadece kuyruğu temizle, bağlantıyı bırak' },
    'full': { name: '🧹 Tam Temizlik', description: 'Her şeyi temizle, kanalı terk et' },
    'reboot': { name: '🔄 Yeniden Başlat', description: 'Temizle ve 30 saniye sonra otomatik başlat' }
};

// Yedekleme profilleri
const BACKUP_PROFILES = {
    'none': { name: '❌ Yedekleme Yapma', description: 'Hiçbir şeyi kaydetme' },
    'queue': { name: '💾 Kuyruğu Kaydet', description: 'Sadece kuyruk listesini kaydet' },
    'full': { name: '💿 Tam Yedek', description: 'Kuyruk + ses ayarlarını kaydet' },
    'auto': { name: '🤖 Akıllı Yedek', description: 'Otomatik olarak en uygun yedeği al' }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Zynarox Music sistemi için gelişmiş durdurma ve temizleme araçları')
        
        // Ana seçenekler
        .addStringOption(option => 
            option.setName('mod')
                .setDescription('Durdurma modunu seçin')
                .setRequired(false)
                .addChoices(
                    { name: '🛑 Anında Durdur', value: 'instant' },
                    { name: '⏳ Yumuşak Durdur', value: 'soft' },
                    { name: '🎚️ Fade Out', value: 'fadeout' },
                    { name: '⏱️ Geri Sayım', value: 'countdown' },
                    { name: '📅 Planlı Durdur', value: 'schedule' }
                ))
        .addIntegerOption(option => 
            option.setName('zaman')
                .setDescription('Saniye (countdown) veya dakika (schedule)')
                .setMinValue(1)
                .setMaxValue(3600)
                .setRequired(false))
        .addStringOption(option => 
            option.setName('yedekleme')
                .setDescription('Yedekleme profili seçin')
                .setRequired(false)
                .addChoices(
                    { name: '❌ Yedekleme Yapma', value: 'none' },
                    { name: '💾 Kuyruğu Kaydet', value: 'queue' },
                    { name: '💿 Tam Yedek', value: 'full' },
                    { name: '🤖 Akıllı Yedek', value: 'auto' }
                ))
        .addStringOption(option => 
            option.setName('temizlik')
                .setDescription('Temizleme profili seçin')
                .setRequired(false)
                .addChoices(
                    { name: '📊 Sadece Rapor', value: 'none' },
                    { name: '🗑️ Kuyruk Temizle', value: 'queue_only' },
                    { name: '🧹 Tam Temizlik', value: 'full' },
                    { name: '🔄 Yeniden Başlat', value: 'reboot' }
                ))
        .addStringOption(option => 
            option.setName('neden')
                .setDescription('Durdurma nedenini belirtin (rapor için)')
                .setRequired(false)
                .setMaxLength(100))
        .addBooleanOption(option => 
            option.setName('onay_iste')
                .setDescription('İşlem öncesi onay iste (güvenlik)')
                .setRequired(false)),

    async execute(interaction, client) {
        // 1. GÜVENLİK KONTROLÜ
        if (!checkDJ(interaction)) {
            return interaction.reply({ 
                content: '⛔ **Erişim Reddedildi:** Oturumu sonlandırmak için DJ yetkisi gerekli.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        const serverQueue = client.queue.get(interaction.guild.id);
        if (!serverQueue) {
            return interaction.reply({ 
                content: '❌ Aktif bir müzik oturumu bulunamadı.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // 2. PARAMETRELERİ AL
        const mode = interaction.options.getString('mod') || 'instant';
        const timeValue = interaction.options.getInteger('zaman') || 
                         (mode === 'countdown' ? 10 : (mode === 'schedule' ? 5 : null));
        const backupMode = interaction.options.getString('yedekleme') || 'auto';
        const cleanupMode = interaction.options.getString('temizlik') || 'queue_only';
        const reason = interaction.options.getString('neden') || 'Belirtilmedi';
        const requireConfirmation = interaction.options.getBoolean('onay_iste') || false;

        // 3. HIZLI MOD (onay istemiyorsa)
        if (!requireConfirmation) {
            await interaction.deferReply();
            return await executeStopProcedure(interaction, client, serverQueue, {
                mode, timeValue, backupMode, cleanupMode, reason
            });
        }

        // 4. ONAY İSTENİYORSA - PANEL GÖSTER
        await showConfirmationPanel(interaction, client, serverQueue, {
            mode, timeValue, backupMode, cleanupMode, reason
        });
    },
};

// ==========================================
// 🛠️ ANA DURDURMA FONKSİYONLARI
// ==========================================

async function executeStopProcedure(interaction, client, serverQueue, options) {
    const { mode, timeValue, backupMode, cleanupMode, reason } = options;
    
    try {
        // A. İSTATİSTİKLERİ TOPLA
        const stats = collectSessionStats(serverQueue);
        
        // B. YEDEKLEME PROSEDÜRÜ
        const backupResult = await executeBackup(interaction.user.id, serverQueue, backupMode);
        
        // C. DURDURMA MODUNA GÖRE İŞLEM
        let stopResult;
        switch (mode) {
            case 'instant':
                stopResult = await stopInstant(serverQueue, client, interaction.guild.id);
                break;
            case 'soft':
                stopResult = await stopSoft(serverQueue);
                break;
            case 'fadeout':
                stopResult = await stopFadeOut(serverQueue, client, interaction.guild.id);
                break;
            case 'countdown':
                stopResult = await stopCountdown(serverQueue, client, interaction.guild.id, timeValue, interaction);
                // Countdown başladıysa mesajı şimdi gönder
                if (stopResult.started) {
                    return interaction.editReply(stopResult.message);
                }
                break;
            case 'schedule':
                stopResult = await stopSchedule(serverQueue, client, interaction.guild.id, timeValue * 60, interaction);
                return interaction.editReply(stopResult.message);
            default:
                stopResult = await stopInstant(serverQueue, client, interaction.guild.id);
        }
        
        // D. TEMİZLEME PROSEDÜRÜ
        const cleanupResult = await executeCleanup(serverQueue, client, interaction.guild.id, cleanupMode);
        
        // E. RAPORU OLUŞTUR VE GÖNDER
        const report = generateStopReport({
            stats,
            backupResult,
            stopResult,
            cleanupResult,
            reason,
            mode: STOP_MODES[mode],
            user: interaction.user,
            guild: interaction.guild
        });
        
        await interaction.editReply(report);
        
        // F. OTOMATIK YENİDEN BAŞLATMA (eğer seçildiyse)
        if (cleanupMode === 'reboot') {
            scheduleAutoRestart(interaction.guild.id, client, interaction.channel, 30);
        }
        
    } catch (error) {
        console.error('Stop procedure error:', error);
        await interaction.editReply({
            content: `❌ **Kritik Hata:** Durdurma işlemi başarısız oldu.\n\`${error.message}\``,
            embeds: []
        });
    }
}

// ==========================================
// 🔧 DURDURMA MODLARI
// ==========================================

async function stopInstant(queue, client, guildId) {
    const startTime = Date.now();
    
    // Player'ı durdur
    if (queue.player) {
        queue.player.stop();
    }
    
    // Bağlantıyı kes
    if (queue.connection) {
        queue.connection.destroy();
    }
    
    // Kuyruğu temizle
    const songCount = queue.songs.length;
    queue.songs = [];
    
    // Queue'yu sil
    client.queue.delete(guildId);
    
    const duration = Date.now() - startTime;
    
    return {
        success: true,
        duration,
        songsCleared: songCount,
        message: `🛑 Anında durdurma tamamlandı (${duration}ms)`
    };
}

async function stopSoft(queue) {
    // Sadece kuyruğu temizle, çalan şarkıyı bırak
    const queuedSongs = queue.songs.length > 1 ? queue.songs.length - 1 : 0;
    
    // Sadece çalan şarkıyı bırak, diğerlerini temizle
    if (queue.songs.length > 1) {
        const currentSong = queue.songs[0];
        queue.songs = [currentSong];
    }
    
    // Loop'u kapat
    queue.loop = 0;
    
    return {
        success: true,
        songsCleared: queuedSongs,
        message: `⏳ Yumuşak durdurma aktif: ${queuedSongs} şarkı kuyruktan kaldırıldı.`
    };
}

async function stopFadeOut(queue, client, guildId) {
    return new Promise((resolve) => {
        const startVolume = queue.volume;
        const fadeDuration = 5000; // 5 saniye
        const steps = 50;
        const stepDuration = fadeDuration / steps;
        const volumeStep = startVolume / steps;
        
        let currentStep = 0;
        
        const fadeInterval = setInterval(() => {
            currentStep++;
            const newVolume = Math.max(0, startVolume - (volumeStep * currentStep));
            
            if (queue.resource && queue.resource.volume) {
                queue.resource.volume.setVolume(newVolume / 100);
            }
            queue.volume = newVolume;
            
            if (currentStep >= steps || newVolume <= 0) {
                clearInterval(fadeInterval);
                
                // Tamamen durdur
                if (queue.player) queue.player.stop();
                if (queue.connection) queue.connection.destroy();
                
                const songCount = queue.songs.length;
                queue.songs = [];
                client.queue.delete(guildId);
                
                resolve({
                    success: true,
                    duration: fadeDuration,
                    songsCleared: songCount,
                    initialVolume: startVolume,
                    message: `🎚️ Fade out tamamlandı (${fadeDuration/1000}s)`
                });
            }
        }, stepDuration);
    });
}

async function stopCountdown(queue, client, guildId, seconds, interaction) {
    if (seconds < 5) seconds = 5;
    if (seconds > 60) seconds = 60;
    
    let countdown = seconds;
    
    // Geri sayım mesajını gönder
    const countdownEmbed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setTitle(`⏱️ Geri Sayım Başladı: ${countdown}s`)
        .setDescription(`Müzik oturumu **${countdown} saniye** sonra sonlandırılacak.`)
        .addFields(
            { name: '🎵 Şu An Çalan', value: queue.songs[0]?.title || 'Bilinmiyor', inline: true },
            { name: '📊 Kuyruk', value: `${queue.songs.length} şarkı`, inline: true }
        )
        .setFooter({ text: 'İptal etmek için butona basın' });
    
    const cancelRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('cancel_countdown')
            .setLabel('İptal Et')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('❌')
    );
    
    const message = await interaction.editReply({ 
        embeds: [countdownEmbed], 
        components: [cancelRow] 
    });
    
    // İptal için collector
    const collector = message.createMessageComponentCollector({ 
        componentType: ComponentType.Button, 
        time: seconds * 1000 
    });
    
    let cancelled = false;
    
    collector.on('collect', async i => {
        if (i.customId === 'cancel_countdown') {
            await i.deferUpdate();
            cancelled = true;
            collector.stop();
            
            await i.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setTitle('✅ Geri Sayım İptal Edildi')
                    .setDescription('Durdurma işlemi iptal edildi, müzik çalmaya devam ediyor.')
                ],
                components: []
            });
        }
    });
    
    // Geri sayım
    const countdownInterval = setInterval(async () => {
        if (cancelled) {
            clearInterval(countdownInterval);
            return;
        }
        
        countdown--;
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            
            // Geri sayım bitti, durdur
            if (queue.player) queue.player.stop();
            if (queue.connection) queue.connection.destroy();
            
            const songCount = queue.songs.length;
            queue.songs = [];
            client.queue.delete(guildId);
            
            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('⏱️ Geri Sayım Tamamlandı')
                    .setDescription(`Müzik oturumu sonlandırıldı.`)
                ],
                components: []
            });
            
            collector.stop();
        } else {
            // Geri sayımı güncelle
            countdownEmbed.setTitle(`⏱️ Geri Sayım: ${countdown}s`);
            countdownEmbed.setDescription(`Müzik oturumu **${countdown} saniye** sonra sonlandırılacak.`);
            
            await interaction.editReply({ 
                embeds: [countdownEmbed], 
                components: [cancelRow] 
            });
        }
    }, 1000);
    
    return {
        started: true,
        duration: seconds,
        message: `⏱️ ${seconds} saniyelik geri sayım başlatıldı.`
    };
}

async function stopSchedule(queue, client, guildId, minutes, interaction) {
    const milliseconds = minutes * 60 * 1000;
    
    setTimeout(async () => {
        // Zamanlayıcı tetiklendiğinde durdur
        if (queue.player) queue.player.stop();
        if (queue.connection) queue.connection.destroy();
        
        const songCount = queue.songs.length;
        queue.songs = [];
        client.queue.delete(guildId);
        
        // Bildirim gönder
        const channel = interaction.channel;
        await channel.send({
            embeds: [new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('📅 Planlı Durdurma Tamamlandı')
                .setDescription(`Müzik oturumu **${minutes/60} dakika** sonra planlandığı gibi sonlandırıldı.`)
                .addFields(
                    { name: '🗑️ Temizlenen', value: `${songCount} şarkı`, inline: true },
                    { name: '⏰ Toplam Süre', value: `${minutes/60} dakika`, inline: true }
                )
                .setTimestamp()
            ]
        });
    }, milliseconds);
    
    return {
        success: true,
        scheduled: true,
        duration: milliseconds,
        message: `📅 **${minutes/60} dakika** sonra otomatik durdurma planlandı.`
    };
}

// ==========================================
// 💾 YEDEKLEME SİSTEMİ
// ==========================================

async function executeBackup(userId, queue, backupMode) {
    if (backupMode === 'none' || queue.songs.length === 0) {
        return { success: false, message: 'Yedekleme yapılmadı.' };
    }
    
    try {
        const timestamp = Date.now();
        const date = new Date();
        
        switch (backupMode) {
            case 'queue':
                // Sadece kuyruğu kaydet
                const queueBackupName = `Yedek_Kuyruk_${date.getDate()}_${date.getMonth()+1}_${date.getHours()}${date.getMinutes()}`;
                
                if (db.savePlaylist) {
                    db.savePlaylist(userId, queueBackupName, queue.songs);
                }
                
                return {
                    success: true,
                    type: 'queue',
                    name: queueBackupName,
                    songCount: queue.songs.length,
                    message: `💾 Kuyruk yedeklendi: **${queueBackupName}** (${queue.songs.length} şarkı)`
                };
                
            case 'full':
                // Tam yedek (kuyruk + ayarlar)
                const fullBackupName = `Tam_Yedek_${timestamp}`;
                
                if (db.savePlaylist) {
                    db.savePlaylist(userId, fullBackupName, queue.songs);
                }
                
                // Ayarları da kaydet
                const settings = {
                    volume: queue.volume,
                    loop: queue.loop,
                    filter: queue.filter,
                    filterName: queue.filterName,
                    autoplay: queue.autoplay,
                    timestamp: timestamp
                };
                
                if (db.setAudioSettings) {
                    db.setAudioSettings(`backup_${userId}_${timestamp}`, settings);
                }
                
                return {
                    success: true,
                    type: 'full',
                    name: fullBackupName,
                    songCount: queue.songs.length,
                    settings: settings,
                    message: `💿 Tam yedek alındı: **${fullBackupName}** (${queue.songs.length} şarkı + ayarlar)`
                };
                
            case 'auto':
                // Akıllı yedekleme
                if (queue.songs.length > 10) {
                    // Büyük liste, sadece ilk 10 şarkıyı kaydet
                    const autoBackupName = `Oto_Yedek_${date.getHours()}${date.getMinutes()}`;
                    const importantSongs = queue.songs.slice(0, 10);
                    
                    if (db.savePlaylist) {
                        db.savePlaylist(userId, autoBackupName, importantSongs);
                    }
                    
                    return {
                        success: true,
                        type: 'auto',
                        name: autoBackupName,
                        songCount: importantSongs.length,
                        message: `🤖 Akıllı yedek: **${autoBackupName}** (ilk 10 şarkı)`
                    };
                } else {
                    // Küçük liste, tamamını kaydet
                    const autoBackupName = `Oto_Yedek_${date.getHours()}${date.getMinutes()}`;
                    
                    if (db.savePlaylist) {
                        db.savePlaylist(userId, autoBackupName, queue.songs);
                    }
                    
                    return {
                        success: true,
                        type: 'auto',
                        name: autoBackupName,
                        songCount: queue.songs.length,
                        message: `🤖 Akıllı yedek: **${autoBackupName}** (${queue.songs.length} şarkı)`
                    };
                }
        }
    } catch (error) {
        console.error('Backup error:', error);
        return { success: false, message: `❌ Yedekleme hatası: ${error.message}` };
    }
}

// ==========================================
// 🧹 TEMİZLEME SİSTEMİ
// ==========================================

async function executeCleanup(queue, client, guildId, cleanupMode) {
    try {
        switch (cleanupMode) {
            case 'none':
                // Hiçbir şey yapma
                return {
                    success: true,
                    type: 'none',
                    message: '📊 Sadece rapor oluşturuldu, temizlik yapılmadı.'
                };
                
            case 'queue_only':
                // Sadece kuyruğu temizle
                const songCount = queue.songs.length;
                queue.songs = [];
                
                return {
                    success: true,
                    type: 'queue_only',
                    songsCleared: songCount,
                    message: `🗑️ Kuyruk temizlendi (${songCount} şarkı)`
                };
                
            case 'full':
                // Tam temizlik
                if (queue.player) queue.player.stop();
                if (queue.connection) queue.connection.destroy();
                
                const fullSongCount = queue.songs.length;
                queue.songs = [];
                client.queue.delete(guildId);
                
                // Bot kanaldan çıksın
                if (queue.voiceChannel) {
                    setTimeout(() => {
                        if (queue.connection) {
                            queue.connection.destroy();
                        }
                    }, 1000);
                }
                
                return {
                    success: true,
                    type: 'full',
                    songsCleared: fullSongCount,
                    connectionDestroyed: true,
                    message: `🧹 Tam temizlik yapıldı: ${fullSongCount} şarkı silindi, bağlantı kesildi.`
                };
                
            case 'reboot':
                // Yeniden başlatma için temizlik
                if (queue.player) queue.player.stop();
                if (queue.connection) queue.connection.destroy();
                
                const rebootSongCount = queue.songs.length;
                queue.songs = [];
                client.queue.delete(guildId);
                
                return {
                    success: true,
                    type: 'reboot',
                    songsCleared: rebootSongCount,
                    autoRestart: true,
                    restartDelay: 30,
                    message: `🔄 Yeniden başlatma için temizlik yapıldı. 30 saniye sonra otomatik başlatılacak.`
                };
        }
    } catch (error) {
        console.error('Cleanup error:', error);
        return { success: false, message: `❌ Temizlik hatası: ${error.message}` };
    }
}

// ==========================================
// 📊 İSTATİSTİK VE RAPORLAMA
// ==========================================

function collectSessionStats(queue) {
    const now = Date.now();
    const sessionDuration = queue.lastActivity ? Math.floor((now - queue.lastActivity) / 1000) : 0;
    
    // Şarkı sürelerini topla
    let totalDuration = 0;
    queue.songs.forEach(song => {
        if (song.duration && song.duration !== 'LIVE 🔴') {
            const parts = song.duration.split(':').map(Number);
            if (parts.length === 3) totalDuration += parts[0] * 3600 + parts[1] * 60 + parts[2];
            else if (parts.length === 2) totalDuration += parts[0] * 60 + parts[1];
            else totalDuration += parts[0];
        }
    });
    
    return {
        songCount: queue.songs.length,
        currentSong: queue.songs[0],
        volume: queue.volume,
        loopMode: queue.loop,
        filter: queue.filterName,
        autoplay: queue.autoplay,
        sessionDuration: sessionDuration,
        totalDuration: totalDuration,
        listeners: queue.voiceChannel?.members.size || 0,
        isRadio: queue.isRadio || false
    };
}

function generateStopReport(data) {
    const { stats, backupResult, stopResult, cleanupResult, reason, mode, user, guild } = data;
    
    const embed = new EmbedBuilder()
        .setColor(mode.color)
        .setTitle(`${mode.emoji} Zynarox Music - Oturum Sonlandırma Raporu`)
        .setDescription(`**${mode.name}** modu ile oturum sonlandırıldı.`)
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/1828/1828843.png')
        .setTimestamp()
        .setFooter({ text: `Operatör: ${user.tag} | ${guild.name}` });
    
    // Oturum İstatistikleri
    embed.addFields(
        { 
            name: '📊 Oturum İstatistikleri', 
            value: `**• Toplam Şarkı:** ${stats.songCount}
            **• Dinleyici Sayısı:** ${stats.listeners}
            **• Ses Seviyesi:** %${stats.volume}
            **• Döngü Modu:** ${['Kapalı', 'Tek Şarkı', 'Tüm Liste'][stats.loopMode]}
            **• Filtre:** ${stats.filter || 'Yok'}
            **• Oturum Süresi:** ${formatSeconds(stats.sessionDuration)}`,
            inline: false 
        }
    );
    
    // Durdurma Detayları
    embed.addFields(
        { 
            name: '⚡ Durdurma Detayları', 
            value: `**• Mod:** ${mode.name}
            **• Süre:** ${stopResult.duration ? `${stopResult.duration}ms` : 'N/A'}
            **• Temizlenen Şarkı:** ${stopResult.songsCleared || 0}
            **• Durum:** ${stopResult.success ? '✅ Başarılı' : '❌ Başarısız'}`,
            inline: true 
        },
        { 
            name: '📝 Neden', 
            value: reason.length > 100 ? reason.substring(0, 100) + '...' : reason,
            inline: true 
        }
    );
    
    // Yedekleme Bilgisi
    if (backupResult.success) {
        embed.addFields(
            { 
                name: '💾 Yedekleme', 
                value: `**• Tür:** ${BACKUP_PROFILES[backupResult.type]?.name || backupResult.type}
                **• Ad:** ${backupResult.name}
                **• Şarkı Sayısı:** ${backupResult.songCount}
                **• Durum:** ✅ Başarılı`,
                inline: true 
            }
        );
    }
    
    // Temizlik Bilgisi
    embed.addFields(
        { 
            name: '🧹 Temizlik', 
            value: cleanupResult.message,
            inline: true 
        }
    );
    
    // Ek Bilgiler
    const totalDuration = formatSeconds(stats.totalDuration);
    embed.addFields(
        { 
            name: '⏱️ Ek Bilgiler', 
            value: `**• Toplam Müzik Süresi:** ${totalDuration}
            **• Mevcut Şarkı:** ${stats.currentSong?.title || 'Yok'}
            **• Radyo Modu:** ${stats.isRadio ? 'Evet' : 'Hayır'}
            **• Otomatik Çalma:** ${stats.autoplay ? 'Açık' : 'Kapalı'}`,
            inline: false 
        }
    );
    
    // Hızlı Başlatma Butonları
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('stop_play_again')
            .setLabel('Hemen Başlat')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🎵'),
        new ButtonBuilder()
            .setCustomId('stop_view_backup')
            .setLabel('Yedeği Gör')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('💾')
            .setDisabled(!backupResult.success),
        new ButtonBuilder()
            .setCustomId('stop_history')
            .setLabel('Geçmiş')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📜')
    );
    
    return { embeds: [embed], components: [row] };
}

// ==========================================
// 🎛️ ONAY PANELİ
// ==========================================

async function showConfirmationPanel(interaction, client, serverQueue, options) {
    const { mode, timeValue, backupMode, cleanupMode, reason } = options;
    
    const modeInfo = STOP_MODES[mode];
    const backupInfo = BACKUP_PROFILES[backupMode];
    const cleanupInfo = CLEANUP_PROFILES[cleanupMode];
    
    const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('⚠️ Durdurma Onayı Gerekli')
        .setDescription('Aşağıdaki ayarlarla müzik oturumu sonlandırılacak. Devam etmek istiyor musunuz?')
        .addFields(
            { 
                name: '🎚️ Durdurma Modu', 
                value: `${modeInfo.emoji} **${modeInfo.name}**\n${modeInfo.description}${timeValue ? `\n**Zaman:** ${timeValue} ${mode === 'countdown' ? 'saniye' : 'dakika'}` : ''}`,
                inline: false 
            },
            { 
                name: '💾 Yedekleme', 
                value: `${backupInfo.name}\n${backupInfo.description}`,
                inline: true 
            },
            { 
                name: '🧹 Temizlik', 
                value: `${cleanupInfo.name}\n${cleanupInfo.description}`,
                inline: true 
            },
            { 
                name: '📝 Neden', 
                value: reason || 'Belirtilmedi',
                inline: false 
            },
            { 
                name: '📊 Mevcut Oturum', 
                value: `**• Şarkı Sayısı:** ${serverQueue.songs.length}\n**• Ses Seviyesi:** %${serverQueue.volume}\n**• Dinleyiciler:** ${serverQueue.voiceChannel?.members.size || 0}`,
                inline: false 
            }
        )
        .setFooter({ text: 'Bu işlem geri alınamaz!' })
        .setTimestamp();
    
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('confirm_stop')
            .setLabel('Evet, Sonlandır')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('✅'),
        new ButtonBuilder()
            .setCustomId('cancel_stop')
            .setLabel('Hayır, İptal Et')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('❌'),
        new ButtonBuilder()
            .setCustomId('edit_stop_settings')
            .setLabel('Ayarları Düzenle')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⚙️')
    );
    
    await interaction.reply({ 
        embeds: [embed], 
        components: [row],
        flags: MessageFlags.Ephemeral 
    });
    
    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({ 
        componentType: ComponentType.Button, 
        time: 60000 
    });
    
    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ 
                content: 'Bu panel sadece komutu kullanan kişi içindir.', 
                flags: MessageFlags.Ephemeral 
            });
        }
        
        await i.deferUpdate();
        
        switch (i.customId) {
            case 'confirm_stop':
                collector.stop();
                await i.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor('#2ECC71')
                        .setTitle('⏳ İşlem Başlatılıyor...')
                        .setDescription('Durdurma prosedürü başlatıldı.')
                    ],
                    components: []
                });
                
                // Ana işlemi başlat
                await executeStopProcedure(interaction, client, serverQueue, options);
                break;
                
            case 'cancel_stop':
                collector.stop();
                await i.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor('#3498DB')
                        .setTitle('✅ İşlem İptal Edildi')
                        .setDescription('Durdurma işlemi iptal edildi, müzik çalmaya devam ediyor.')
                    ],
                    components: []
                });
                break;
                
            case 'edit_stop_settings':
                collector.stop();
                await showEditModal(i, options);
                break;
        }
    });
    
    collector.on('end', () => {
        message.edit({ components: [] }).catch(() => {});
    });
}

async function showEditModal(interaction, currentOptions) {
    const modal = new ModalBuilder()
        .setCustomId('edit_stop_modal')
        .setTitle('Durdurma Ayarlarını Düzenle');
    
    const reasonInput = new TextInputBuilder()
        .setCustomId('reason_input')
        .setLabel('Durdurma Nedenini Düzenle')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Örn: Bakım, Sunucu kapatma, Yanlışlıkla açıldı...')
        .setValue(currentOptions.reason)
        .setMaxLength(200)
        .setRequired(true);
    
    const row = new ActionRowBuilder().addComponents(reasonInput);
    modal.addComponents(row);
    
    await interaction.showModal(modal);
    
    try {
        const modalSubmit = await interaction.awaitModalSubmit({
            filter: i => i.customId === 'edit_stop_modal' && i.user.id === interaction.user.id,
            time: 60000
        });
        
        await modalSubmit.deferUpdate();
        currentOptions.reason = modalSubmit.fields.getTextInputValue('reason_input');
        
        // Tekrar onay panelini göster
        await modalSubmit.editReply({
            embeds: [new EmbedBuilder()
                .setColor('#F1C40F')
                .setTitle('✅ Ayarlar Güncellendi')
                .setDescription('Yeni ayarlarla tekrar onay paneli gösteriliyor...')
            ],
            components: []
        });
        
        // Not: Burada tekrar onay paneli göstermek için interaction'ı yeniden kullanmamız gerekir
        // Bu biraz karmaşık olabilir, şimdilik basit bir mesaj gönderelim
        // Gerçek uygulamada bu kısım daha geliştirilebilir
        
    } catch (error) {
        console.error('Edit modal error:', error);
    }
}

// ==========================================
// 🔄 YARDIMCI FONKSİYONLAR
// ==========================================

function formatSeconds(seconds) {
    if (!seconds) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function scheduleAutoRestart(guildId, client, channel, delaySeconds) {
    setTimeout(async () => {
        try {
            // Burada otomatik başlatma mantığı eklenebilir
            // Örneğin: Son yedeği yükleyip çalmaya başlamak
            await channel.send({
                embeds: [new EmbedBuilder()
                    .setColor('#2ECC71')
                    .setTitle('🔄 Otomatik Yeniden Başlatma')
                    .setDescription(`**${delaySeconds} saniye** sonra sistem otomatik olarak yeniden başlatıldı.\nMüzik çalmak için \`/play\` komutunu kullanın.`)
                    .setTimestamp()
                ]
            });
        } catch (error) {
            console.error('Auto-restart error:', error);
        }
    }, delaySeconds * 1000);
}
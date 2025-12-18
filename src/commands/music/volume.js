const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder, 
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ComponentType,
    MessageFlags
} = require('discord.js');
const { checkDJ } = require('../../../utils.js');
const db = require('../../db.js');

// Ses profilleri (müzik türlerine özel)
const SOUND_PROFILES = {
    'pop': {
        name: '🎵 Pop',
        description: 'Vokaller önde, dengeli bas',
        eq: 'bass=g=5,treble=g=3',
        volume: 80,
        color: '#FF4081'
    },
    'rock': {
        name: '🎸 Rock',
        description: 'Güçlü gitar ve davul',
        eq: 'bass=g=8,treble=g=6,equalizer=f=1000:width_type=h:width=100:g=5',
        volume: 85,
        color: '#FF5722'
    },
    'hiphop': {
        name: '🎤 Hip-Hop',
        description: 'Derin bass ve net vokaller',
        eq: 'bass=g=15,treble=g=4,equalizer=f=80:width_type=h:width=50:g=10',
        volume: 75,
        color: '#9C27B0'
    },
    'classical': {
        name: '🎻 Klasik',
        description: 'Doğal ve dengeli',
        eq: 'bass=g=2,treble=g=4',
        volume: 70,
        color: '#795548'
    },
    'electronic': {
        name: '⚡ Elektronik',
        description: 'Yüksek enerji, vurgulu bas',
        eq: 'bass=g=12,treble=g=8,equalizer=f=120:width_type=h:width=80:g=7',
        volume: 90,
        color: '#00BCD4'
    },
    'jazz': {
        name: '🎷 Caz',
        description: 'Sıcak ve yumuşak',
        eq: 'bass=g=3,treble=g=5,equalizer=f=400:width_type=h:width=200:g=4',
        volume: 65,
        color: '#8BC34A'
    },
    'lofi': {
        name: '📻 Lo-Fi',
        description: 'Rahatlatıcı, vintage ses',
        eq: 'highpass=f=200,lowpass=f=4000,afftdn=nf=-20',
        volume: 60,
        color: '#607D8B'
    }
};

// 3D Ses efektleri
const SPATIAL_EFFECTS = {
    'none': { name: 'Normal', description: 'Standart stereo' },
    'surround': { name: '🎧 Surround', description: 'Sanal çevreleme sesi' },
    '8d': { name: '🌀 8D Audio', description: 'Dönen 8D ses efekti' },
    'concert': { name: '🏟️ Konser', description: 'Konser salonu akustiği' },
    'studio': { name: '🎙️ Stüdyo', description: 'Profesyonel stüdyo efekti' },
    'karaoke': { name: '🎤 Karaoke', description: 'Vokaller ön planda' }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Gelişmiş ses kontrol merkezi - Zynarox Music')
        .addIntegerOption(option => 
            option.setName('seviye')
                .setDescription('Hedef ses seviyesi (0-200)')
                .setMinValue(0)
                .setMaxValue(200)
                .setRequired(false))
        .addBooleanOption(option => 
            option.setName('gece_modu')
                .setDescription('Gece modunu aç/kapat (daha düşük ses)')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('profil')
                .setDescription('Müzik türüne göre ses profili seçin')
                .setRequired(false)
                .addChoices(
                    { name: '🎵 Pop', value: 'pop' },
                    { name: '🎸 Rock', value: 'rock' },
                    { name: '🎤 Hip-Hop', value: 'hiphop' },
                    { name: '🎻 Klasik', value: 'classical' },
                    { name: '⚡ Elektronik', value: 'electronic' },
                    { name: '🎷 Caz', value: 'jazz' },
                    { name: '📻 Lo-Fi', value: 'lofi' }
                ))
        .addBooleanOption(option => 
            option.setName('auto_calibrate')
                .setDescription('Ortam sesine göre otomatik kalibrasyon')
                .setRequired(false)),

    async execute(interaction, client) {
        const serverQueue = client.queue.get(interaction.guild.id);
        
        // 1. Sinyal Kontrolü
        if (!serverQueue || !serverQueue.resource) {
            return interaction.reply({ 
                content: '❌ Aktif bir ses sinyali yok (Müzik çalmıyor).', 
                flags: MessageFlags.Ephemeral 
            });
        }

        // 2. Hızlı Komut Modu
        const inputVol = interaction.options.getInteger('seviye');
        const nightMode = interaction.options.getBoolean('gece_modu');
        const profile = interaction.options.getString('profil');
        const autoCalibrate = interaction.options.getBoolean('auto_calibrate');

        if (inputVol !== null || nightMode !== null || profile || autoCalibrate !== null) {
            if (!checkDJ(interaction)) return interaction.reply({ 
                content: '⛔ Yetkisiz Erişim: DJ Rolü Gerekli.', 
                flags: MessageFlags.Ephemeral 
            });
            
            let targetVolume = inputVol !== null ? inputVol : serverQueue.volume;
            
            // Gece modu
            if (nightMode !== null) {
                serverQueue.nightMode = nightMode;
                if (nightMode && targetVolume > 50) targetVolume = 50;
            }
            
            // Profil uygula
            if (profile && SOUND_PROFILES[profile]) {
                const profileData = SOUND_PROFILES[profile];
                targetVolume = profileData.volume;
                
                // EQ uygula (eğer play.js destekliyorsa)
                if (serverQueue.player && profileData.eq) {
                    // EQ için özel işlemler buraya eklenebilir
                    console.log(`[VOLUME] Profil uygulandı: ${profileData.name}`);
                }
            }
            
            // Otomatik kalibrasyon
            if (autoCalibrate) {
                // Ortamdaki kişi sayısına göre kalibrasyon
                const memberCount = serverQueue.voiceChannel?.members.size || 1;
                if (memberCount > 10) targetVolume = Math.min(targetVolume + 10, 100);
                else if (memberCount < 3) targetVolume = Math.max(targetVolume - 15, 40);
            }
            
            await smoothVolume(serverQueue, targetVolume);
            
            let message = `🎚️ Ses seviyesi **%${targetVolume}** yapıldı.`;
            if (profile) message += `\n🎵 **${SOUND_PROFILES[profile].name}** profili aktif.`;
            if (nightMode) message += `\n🌙 **Gece modu** aktif (Ses sınırlandı).`;
            if (autoCalibrate) message += `\n🔧 **Otomatik kalibrasyon** uygulandı.`;
            
            return interaction.reply({ 
                content: message, 
                flags: MessageFlags.Ephemeral 
            });
        }

        // 3. DASHBOARD MODU
        await interaction.deferReply();

        // Varsayılan Sunucu Ayarını Çek
        const defaultVol = db.getServerVolume ? db.getServerVolume(interaction.guild.id) : 100;
        const currentTime = new Date().getHours();
        const isNightTime = currentTime >= 22 || currentTime < 8;

        // --- ARAYÜZ BİLEŞENLERİ ---

        // A. PROFİL MENÜSÜ
        const profileOptions = Object.entries(SOUND_PROFILES).map(([key, prof]) => 
            new StringSelectMenuOptionBuilder()
                .setLabel(prof.name)
                .setDescription(prof.description)
                .setValue(key)
        );

        const profileMenu = new StringSelectMenuBuilder()
            .setCustomId('vol_profile')
            .setPlaceholder('🎵 Müzik Profili Seç')
            .addOptions(profileOptions);

        // B. 3D SES MENÜSÜ
        const spatialOptions = Object.entries(SPATIAL_EFFECTS).map(([key, effect]) => 
            new StringSelectMenuOptionBuilder()
                .setLabel(effect.name)
                .setDescription(effect.description)
                .setValue(key)
        );

        const spatialMenu = new StringSelectMenuBuilder()
            .setCustomId('vol_spatial')
            .setPlaceholder('🎧 3D Ses Efekti')
            .addOptions(spatialOptions);

        // C. TEMEL KONTROL BUTONLARI
        const controlRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('vol_mute').setEmoji('🔇').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('vol_down_10').setLabel('-10').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('vol_custom').setLabel(`${serverQueue.volume}%`).setStyle(ButtonStyle.Primary).setEmoji('🎛️'),
            new ButtonBuilder().setCustomId('vol_up_10').setLabel('+10').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('vol_boost').setEmoji('🚀').setStyle(ButtonStyle.Success)
        );

        // D. PRESET BUTONLARI
        const presetRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('vol_20').setLabel('20%').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('vol_50').setLabel('50%').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('vol_75').setLabel('75%').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('vol_100').setLabel('100%').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('vol_150').setLabel('150%').setStyle(ButtonStyle.Danger)
        );

        // E. SİSTEM BUTONLARI
        const systemRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('vol_night').setLabel(isNightTime ? '🌙 Gece' : '☀️ Gündüz').setStyle(isNightTime ? ButtonStyle.Secondary : ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('vol_calibrate').setLabel('Kalibre Et').setEmoji('🔧').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('vol_limit').setLabel('Sınır: 100%').setEmoji('⚠️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('vol_save').setLabel('Kaydet').setEmoji('💾').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('vol_reset').setLabel('Sıfırla').setEmoji('🔄').setStyle(ButtonStyle.Danger)
        );

        // Menü satırları
        const menuRow1 = new ActionRowBuilder().addComponents(profileMenu);
        const menuRow2 = new ActionRowBuilder().addComponents(spatialMenu);

        // Embed Gönder
        const embed = createEnhancedEmbed(serverQueue.volume, defaultVol, serverQueue.nightMode, isNightTime);
        const message = await interaction.followUp({ 
            embeds: [embed], 
            components: [menuRow1, menuRow2, controlRow, presetRow, systemRow] 
        });

        // 4. COLLECTOR (DİNLEYİCİ)
        const collector = message.createMessageComponentCollector({ time: 180000 });

        collector.on('collect', async i => {
            if (!checkDJ(i)) return i.reply({ 
                content: '⛔ Sadece DJ yetkisi olanlar müdahale edebilir.', 
                flags: MessageFlags.Ephemeral 
            });

            let targetVol = serverQueue.volume;
            let feedbackMsg = null;
            let updateInterface = true;

            // --- MODAL (MANUEL GİRİŞ) ---
            if (i.customId === 'vol_custom') {
                const modal = new ModalBuilder()
                    .setCustomId('vol_modal')
                    .setTitle('Hassas Ses Ayarı');

                const input = new TextInputBuilder()
                    .setCustomId('vol_input_val')
                    .setLabel("Ses Seviyesi (0-200)")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(serverQueue.volume.toString())
                    .setMinLength(1)
                    .setMaxLength(3);

                const actionRow = new ActionRowBuilder().addComponents(input);
                modal.addComponents(actionRow);

                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({ 
                        time: 30000, 
                        filter: (sub) => sub.customId === 'vol_modal' && sub.user.id === i.user.id 
                    });
                    
                    const val = parseInt(modalSubmit.fields.getTextInputValue('vol_input_val'));
                    if (!isNaN(val) && val >= 0 && val <= 200) {
                        targetVol = val;
                        await smoothVolume(serverQueue, targetVol);
                        await modalSubmit.deferUpdate();
                    } else {
                        await modalSubmit.reply({ 
                            content: '❌ Geçersiz değer. 0-200 arası bir sayı girin.', 
                            flags: MessageFlags.Ephemeral 
                        });
                        updateInterface = false;
                    }
                } catch (e) { 
                    updateInterface = false; 
                    console.error('Modal error:', e);
                }
            } 
            
            // --- PROFİL SEÇİMİ ---
            else if (i.isStringSelectMenu() && i.customId === 'vol_profile') {
                await i.deferUpdate();
                const selectedProfile = i.values[0];
                const profileData = SOUND_PROFILES[selectedProfile];
                
                if (profileData) {
                    targetVol = profileData.volume;
                    await smoothVolume(serverQueue, targetVol);
                    
                    // Ses profili bilgisini kaydet
                    serverQueue.soundProfile = selectedProfile;
                    
                    feedbackMsg = `🎵 **${profileData.name}** profili uygulandı. Ses: %${targetVol}`;
                }
            }
            
            // --- 3D SES SEÇİMİ ---
            else if (i.isStringSelectMenu() && i.customId === 'vol_spatial') {
                await i.deferUpdate();
                const selectedEffect = i.values[0];
                const effectData = SPATIAL_EFFECTS[selectedEffect];
                
                if (effectData) {
                    // 3D ses efektini uygula (play.js'deki filtre sistemine entegre edilebilir)
                    serverQueue.spatialEffect = selectedEffect;
                    feedbackMsg = `🎧 **${effectData.name}** efekti aktif.`;
                }
            }
            
            // --- NORMAL BUTON İŞLEMLERİ ---
            else if (i.isButton()) {
                await i.deferUpdate();

                switch (i.customId) {
                    // Temel kontroller
                    case 'vol_mute':
                        if (serverQueue.volume > 0) {
                            serverQueue.lastVolume = serverQueue.volume;
                            targetVol = 0;
                        } else {
                            targetVol = serverQueue.lastVolume || defaultVol;
                        }
                        break;
                        
                    case 'vol_down_10':
                        targetVol = Math.max(0, targetVol - 10);
                        break;
                        
                    case 'vol_up_10':
                        targetVol = Math.min(200, targetVol + 10);
                        break;
                        
                    case 'vol_boost':
                        targetVol = Math.min(200, targetVol + 25);
                        feedbackMsg = '🚀 Ses güçlendirildi!';
                        break;

                    // Presetler
                    case 'vol_20': targetVol = 20; break;
                    case 'vol_50': targetVol = 50; break;
                    case 'vol_75': targetVol = 75; break;
                    case 'vol_100': targetVol = 100; break;
                    case 'vol_150': targetVol = 150; break;

                    // Sistem
                    case 'vol_night':
                        serverQueue.nightMode = !serverQueue.nightMode;
                        if (serverQueue.nightMode && targetVol > 50) {
                            targetVol = 50;
                            feedbackMsg = '🌙 Gece modu aktif (Maks: %50)';
                        } else if (!serverQueue.nightMode) {
                            feedbackMsg = '☀️ Gece modu kapatıldı';
                        }
                        break;
                        
                    case 'vol_calibrate':
                        // Ortam kalibrasyonu
                        const memberCount = serverQueue.voiceChannel?.members.size || 1;
                        if (memberCount > 15) targetVol = Math.min(targetVol + 15, 100);
                        else if (memberCount > 5) targetVol = Math.min(targetVol + 5, 85);
                        else targetVol = Math.max(targetVol - 10, 40);
                        feedbackMsg = `🔧 ${memberCount} kişi için kalibre edildi.`;
                        break;
                        
                    case 'vol_limit':
                        // Ses sınırı aktif/pasif
                        serverQueue.volumeLimit = !serverQueue.volumeLimit;
                        feedbackMsg = serverQueue.volumeLimit ? 
                            '⚠️ Ses sınırı aktif (Maks: %100)' : 
                            '✅ Ses sınırı kaldırıldı';
                        if (serverQueue.volumeLimit && targetVol > 100) {
                            targetVol = 100;
                        }
                        break;
                        
                    case 'vol_save':
                        if (db.setServerVolume) {
                            db.setServerVolume(interaction.guild.id, targetVol);
                            // Ek ses ayarlarını kaydet
                            if (db.setAudioSettings) {
                                db.setAudioSettings(interaction.guild.id, {
                                    nightMode: serverQueue.nightMode,
                                    volumeLimit: serverQueue.volumeLimit,
                                    soundProfile: serverQueue.soundProfile,
                                    spatialEffect: serverQueue.spatialEffect
                                });
                            }
                            feedbackMsg = `✅ Ses ayarları kaydedildi.`;
                        }
                        break;
                        
                    case 'vol_reset':
                        targetVol = defaultVol;
                        serverQueue.nightMode = false;
                        serverQueue.volumeLimit = false;
                        serverQueue.soundProfile = null;
                        serverQueue.spatialEffect = 'none';
                        feedbackMsg = '🔄 Tüm ayarlar sıfırlandı.';
                        break;
                }

                // Ses sınırı kontrolü
                if (serverQueue.volumeLimit && targetVol > 100) {
                    targetVol = 100;
                    if (!feedbackMsg) feedbackMsg = '⚠️ Ses sınırı aktif (Maks: %100)';
                }

                // Gece modu kontrolü
                if (serverQueue.nightMode && targetVol > 50) {
                    targetVol = 50;
                    if (!feedbackMsg) feedbackMsg = '🌙 Gece modu: Maksimum %50';
                }

                // Ses değiştiyse uygula
                if (serverQueue.volume !== targetVol) {
                    await smoothVolume(serverQueue, targetVol);
                }
            }

            // Arayüzü güncelle
            if (updateInterface) {
                // Buton etiketlerini güncelle
                const updatedControlRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('vol_mute').setEmoji('🔇').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('vol_down_10').setLabel('-10').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('vol_custom').setLabel(`${serverQueue.volume}%`).setStyle(ButtonStyle.Primary).setEmoji('🎛️'),
                    new ButtonBuilder().setCustomId('vol_up_10').setLabel('+10').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('vol_boost').setEmoji('🚀').setStyle(ButtonStyle.Success)
                );

                const updatedPresetRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('vol_20').setLabel('20%').setStyle(ButtonStyle.Secondary).setDisabled(serverQueue.nightMode && 20 > 50),
                    new ButtonBuilder().setCustomId('vol_50').setLabel('50%').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('vol_75').setLabel('75%').setStyle(ButtonStyle.Secondary).setDisabled(serverQueue.nightMode || serverQueue.volumeLimit),
                    new ButtonBuilder().setCustomId('vol_100').setLabel('100%').setStyle(ButtonStyle.Secondary).setDisabled(serverQueue.volumeLimit),
                    new ButtonBuilder().setCustomId('vol_150').setLabel('150%').setStyle(ButtonStyle.Danger).setDisabled(serverQueue.nightMode || serverQueue.volumeLimit)
                );

                const updatedSystemRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('vol_night').setLabel(serverQueue.nightMode ? '🌙 Gece' : '☀️ Gündüz').setStyle(serverQueue.nightMode ? ButtonStyle.Secondary : ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('vol_calibrate').setLabel('Kalibre Et').setEmoji('🔧').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('vol_limit').setLabel(serverQueue.volumeLimit ? 'Sınır: AÇIK' : 'Sınır: KAPALI').setEmoji('⚠️').setStyle(serverQueue.volumeLimit ? ButtonStyle.Danger : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('vol_save').setLabel('Kaydet').setEmoji('💾').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('vol_reset').setLabel('Sıfırla').setEmoji('🔄').setStyle(ButtonStyle.Danger)
                );

                // Profil menüsünü güncelle (seçili olanı işaretle)
                const updatedProfileOptions = Object.entries(SOUND_PROFILES).map(([key, prof]) => {
                    const option = new StringSelectMenuOptionBuilder()
                        .setLabel(prof.name)
                        .setDescription(prof.description)
                        .setValue(key);
                    
                    if (serverQueue.soundProfile === key) {
                        option.setDefault(true);
                    }
                    
                    return option;
                });

                const updatedProfileMenu = new StringSelectMenuBuilder()
                    .setCustomId('vol_profile')
                    .setPlaceholder(serverQueue.soundProfile ? 
                        `🎵 ${SOUND_PROFILES[serverQueue.soundProfile]?.name}` : 
                        '🎵 Müzik Profili Seç')
                    .addOptions(updatedProfileOptions);

                // 3D ses menüsünü güncelle
                const updatedSpatialOptions = Object.entries(SPATIAL_EFFECTS).map(([key, effect]) => {
                    const option = new StringSelectMenuOptionBuilder()
                        .setLabel(effect.name)
                        .setDescription(effect.description)
                        .setValue(key);
                    
                    if (serverQueue.spatialEffect === key) {
                        option.setDefault(true);
                    }
                    
                    return option;
                });

                const updatedSpatialMenu = new StringSelectMenuBuilder()
                    .setCustomId('vol_spatial')
                    .setPlaceholder(serverQueue.spatialEffect && serverQueue.spatialEffect !== 'none' ? 
                        `🎧 ${SPATIAL_EFFECTS[serverQueue.spatialEffect]?.name}` : 
                        '🎧 3D Ses Efekti')
                    .addOptions(updatedSpatialOptions);

                const updatedMenuRow1 = new ActionRowBuilder().addComponents(updatedProfileMenu);
                const updatedMenuRow2 = new ActionRowBuilder().addComponents(updatedSpatialMenu);

                const newEmbed = createEnhancedEmbed(
                    serverQueue.volume, 
                    defaultVol, 
                    serverQueue.nightMode, 
                    isNightTime,
                    feedbackMsg,
                    serverQueue.soundProfile,
                    serverQueue.spatialEffect
                );

                await i.editReply({ 
                    embeds: [newEmbed], 
                    components: [
                        updatedMenuRow1, 
                        updatedMenuRow2, 
                        updatedControlRow, 
                        updatedPresetRow, 
                        updatedSystemRow
                    ] 
                });
            }
        });

        collector.on('end', () => {
            // Butonları devre dışı bırak
            try {
                const disabledControlRow = new ActionRowBuilder().addComponents(
                    controlRow.components.map(b => ButtonBuilder.from(b).setDisabled(true))
                );
                const disabledPresetRow = new ActionRowBuilder().addComponents(
                    presetRow.components.map(b => ButtonBuilder.from(b).setDisabled(true))
                );
                const disabledSystemRow = new ActionRowBuilder().addComponents(
                    systemRow.components.map(b => ButtonBuilder.from(b).setDisabled(true))
                );
                
                interaction.editReply({ 
                    components: [
                        new ActionRowBuilder().addComponents(profileMenu.setDisabled(true)),
                        new ActionRowBuilder().addComponents(spatialMenu.setDisabled(true)),
                        disabledControlRow, 
                        disabledPresetRow, 
                        disabledSystemRow
                    ] 
                }).catch(() => {});
            } catch (error) {
                console.error('Volume panel disable error:', error);
            }
        });
    },
};

// ==========================================
// 🛠️ MÜHENDİSLİK FONKSİYONLARI
// ==========================================

async function smoothVolume(queue, targetVol, duration = 300) {
    const startVol = queue.volume;
    
    // Aynı seviyeyse işlem yapma
    if (startVol === targetVol) return;
    
    const steps = Math.abs(targetVol - startVol);
    const stepDelay = duration / steps;
    
    return new Promise((resolve) => {
        let currentVol = startVol;
        const direction = targetVol > startVol ? 1 : -1;
        
        const adjustInterval = setInterval(() => {
            currentVol += direction;
            
            // Ses sınırı kontrolü
            if (queue.volumeLimit && currentVol > 100) {
                currentVol = 100;
            }
            
            // Gece modu kontrolü
            if (queue.nightMode && currentVol > 50) {
                currentVol = 50;
            }
            
            // Ses seviyesini uygula
            if (queue.resource && queue.resource.volume) {
                queue.resource.volume.setVolume(currentVol / 100);
            }
            
            // Queue'yu güncelle
            queue.volume = currentVol;
            
            // Hedefe ulaşıldıysa dur
            if ((direction === 1 && currentVol >= targetVol) || 
                (direction === -1 && currentVol <= targetVol)) {
                clearInterval(adjustInterval);
                queue.volume = targetVol; // Tam değeri ayarla
                if (queue.resource && queue.resource.volume) {
                    queue.resource.volume.setVolume(targetVol / 100);
                }
                resolve();
            }
        }, stepDelay);
    });
}

function createEnhancedEmbed(vol, defaultVol, nightMode, isNightTime, alertMsg = null, soundProfile = null, spatialEffect = null) {
    // Ses analizi
    const dbVal = (20 * Math.log10(vol / 50)).toFixed(1);
    const bar = createVUMeter(vol);
    const wave = createSoundWave(vol);
    
    // Renk ve uyarılar
    let color = '#2ecc71'; // Normal
    let warning = '✅ Sinyal Stabil';
    
    if (vol === 0) {
        color = '#95a5a6';
        warning = '🔇 Sessiz Mod';
    } else if (vol > 150) {
        color = '#e74c3c';
        warning = '⚠️ YÜKSEK RİSK: Distorsiyon tehlikesi!';
    } else if (vol > 100) {
        color = '#f39c12';
        warning = '⚠️ DİKKAT: Yüksek ses seviyesi';
    } else if (vol < 20) {
        color = '#3498db';
        warning = '🔉 Düşük Ses';
    }
    
    // Profil bilgisi
    let profileInfo = 'Standart';
    if (soundProfile && SOUND_PROFILES[soundProfile]) {
        const profile = SOUND_PROFILES[soundProfile];
        profileInfo = `${profile.name} (${profile.description})`;
        color = profile.color;
    }
    
    // 3D ses bilgisi
    let spatialInfo = 'Stereo';
    if (spatialEffect && spatialEffect !== 'none' && SPATIAL_EFFECTS[spatialEffect]) {
        spatialInfo = SPATIAL_EFFECTS[spatialEffect].name;
    }
    
    // Gece modu bilgisi
    const nightInfo = nightMode ? '🌙 AKTİF' : '☀️ PASİF';
    
    const embed = new EmbedBuilder()
        .setTitle('🎛️ Zynarox Music - Ses Kontrol Merkezi')
        .setDescription(`
        **Ses Seviyesi Analizi**
        ${wave}
        
        **VU Metre**
        ${bar}
        
        **📊 Ses İstatistikleri**
        > 🔊 **Aktif Seviye:** %${vol} (${dbVal} dB)
        > 💾 **Varsayılan:** %${defaultVol}
        > 🎵 **Profil:** ${profileInfo}
        > 🎧 **Ses Modu:** ${spatialInfo}
        > ${isNightTime ? '🌃' : '☀️'} **Gece Modu:** ${nightInfo}
        
        **🚨 Sistem Uyarısı:** ${warning}
        ${alertMsg ? `\n**📢 Sistem Mesajı:** ${alertMsg}` : ''}
        `)
        .setColor(color)
        .addFields(
            { 
                name: '🎚️ Kontroller', 
                value: '`-10` `+10` - Hızlı ayar\n`🎛️` - Hassas ayar\n`🚀` - Boost (%25)\n`🔇` - Sessiz/Konuşma', 
                inline: true 
            },
            { 
                name: '⚡ Presetler', 
                value: '`20%` `50%` `75%` `100%` `150%`\nHızlı ses seviyeleri', 
                inline: true 
            },
            { 
                name: '🔧 Sistem', 
                value: `${isNightTime ? '🌙' : '☀️'} Gece Modu\n🔧 Kalibrasyon\n⚠️ Ses Sınırı\n💾 Kaydet\n🔄 Sıfırla`, 
                inline: true 
            }
        )
        .setFooter({ text: 'Zynarox Music v12 | Professional Audio System' })
        .setTimestamp();

    return embed;
}

function createVUMeter(vol) {
    const total = 20;
    const filled = Math.round((vol / 200) * total);
    
    let meter = '';
    for (let i = 1; i <= total; i++) {
        if (i <= filled) {
            if (i > 15) meter += '🟥';
            else if (i > 10) meter += '🟨';
            else if (i > 5) meter += '🟩';
            else meter += '🟦';
        } else {
            meter += '⬜';
        }
    }
    
    return `\`${meter}\``;
}

function createSoundWave(vol) {
    const height = 5;
    const width = 20;
    let wave = '';
    
    // Basit bir ses dalgası simülasyonu
    for (let h = height; h > 0; h--) {
        let line = '';
        for (let w = 0; w < width; w++) {
            const amplitude = Math.sin(w * 0.5 + Date.now() / 1000) * (vol / 100);
            const waveHeight = Math.round(amplitude * height);
            
            if (Math.abs(waveHeight) >= h) {
                line += '█';
            } else {
                line += '░';
            }
        }
        wave += `\`${line}\`\n`;
    }
    
    return wave;
}
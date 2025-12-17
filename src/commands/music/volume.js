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
    ComponentType 
} = require('discord.js');
const { checkDJ } = require('../../../utils.js');
const db = require('../../db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Tam otomatik ses kontrol merkezi.')
        .addIntegerOption(option => 
            option.setName('seviye')
                .setDescription('Hedef ses seviyesi (0-100)')
                .setMinValue(0)
                .setMaxValue(100)
                .setRequired(false)),

    async execute(interaction, client) {
        const serverQueue = client.queue.get(interaction.guild.id);
        
        // 1. Sinyal Kontrolü
        if (!serverQueue || !serverQueue.resource) {
            return interaction.reply({ content: '❌ Aktif bir ses sinyali yok (Müzik çalmıyor).', ephemeral: true });
        }

        // 2. Hızlı Komut Modu
        const inputVol = interaction.options.getInteger('seviye');
        if (inputVol !== null) {
            if (!checkDJ(interaction)) return interaction.reply({ content: '⛔ Yetkisiz Erişim: DJ Rolü Gerekli.', ephemeral: true });
            
            await smoothVolume(serverQueue, inputVol);
            return interaction.reply({ content: `🎚️ Ses seviyesi manuel olarak **%${inputVol}** yapıldı.`, ephemeral: true });
        }

        // 3. DASHBOARD MODU
        await interaction.deferReply();

        // Varsayılan Sunucu Ayarını Çek (Yoksa 100)
        const defaultVol = db.getServerVolume ? db.getServerVolume(interaction.guild.id) : 100;

        // --- ARAYÜZ BİLEŞENLERİ (FIXED) ---

        // A. Preset Menüsü (Akıllı Oluşturucu)
        // Standart seçenekler
        let presetOptions = [
            { label: 'Mute (Sessiz)', value: '0', emoji: '🔇' },
            { label: 'Lounge (%30)', value: '30', emoji: '🔉' },
            { label: 'Standart (%50)', value: '50', emoji: '🎧' },
            { label: 'Boost (%100)', value: '100', emoji: '🔊' }
        ];

        // Varsayılan değer listede var mı?
        const isDefaultInList = presetOptions.some(opt => opt.value === String(defaultVol));

        if (isDefaultInList) {
            // Varsa, o seçeneğin etiketini güncelle (örn: "Boost (%100)" -> "Boost (%100) - Varsayılan")
            presetOptions = presetOptions.map(opt => {
                if (opt.value === String(defaultVol)) {
                    return { ...opt, label: `${opt.label} (Varsayılan)`, emoji: '💾' };
                }
                return opt;
            });
        } else {
            // Yoksa (örn: 65), listeye yeni seçenek olarak ekle
            presetOptions.push({
                label: `Varsayılan (%${defaultVol})`,
                value: String(defaultVol),
                emoji: '💾'
            });
        }

        // Menüyü İnşa Et
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('vol_preset')
            .setPlaceholder('🎚️ Hızlı Seçim (Presets)')
            .addOptions(
                presetOptions.map(opt => 
                    new StringSelectMenuOptionBuilder()
                        .setLabel(opt.label)
                        .setValue(opt.value)
                        .setEmoji(opt.emoji)
                )
            );

        // B. Kontrol Butonları
        const controlRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('vol_down_10').setLabel('-10').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('vol_down_5').setLabel('-5').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('vol_custom').setLabel('Manuel Giriş').setStyle(ButtonStyle.Primary).setEmoji('⌨️'),
            new ButtonBuilder().setCustomId('vol_up_5').setLabel('+5').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('vol_up_10').setLabel('+10').setStyle(ButtonStyle.Secondary)
        );

        // C. Hafıza Butonları
        const systemRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('vol_save').setLabel(`Şu anki seviyeyi (%${serverQueue.volume}) kaydet`).setStyle(ButtonStyle.Success).setEmoji('💾'),
            new ButtonBuilder().setCustomId('vol_reset').setLabel('Sıfırla').setStyle(ButtonStyle.Danger).setEmoji('🔄')
        );

        const menuRow = new ActionRowBuilder().addComponents(selectMenu);

        // Embed Gönder
        const embed = createEngineerEmbed(serverQueue.volume, defaultVol);
        const message = await interaction.followUp({ 
            embeds: [embed], 
            components: [menuRow, controlRow, systemRow] 
        });

        // 4. COLLECTOR (DİNLEYİCİ)
        const collector = message.createMessageComponentCollector({ time: 120000 });

        collector.on('collect', async i => {
            if (!checkDJ(i)) return i.reply({ content: '⛔ Sadece DJ yetkisi olanlar müdahale edebilir.', ephemeral: true });

            let targetVol = serverQueue.volume;
            let feedbackMsg = null;
            let updateInterface = true;

            // --- MODAL (MANUEL GİRİŞ) İŞLEMİ ---
            if (i.customId === 'vol_custom') {
                const modal = new ModalBuilder()
                    .setCustomId('vol_modal')
                    .setTitle('Hassas Ses Ayarı');

                const input = new TextInputBuilder()
                    .setCustomId('vol_input_val')
                    .setLabel("İstediğiniz Seviye (0-100)")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(serverQueue.volume.toString())
                    .setMinLength(1)
                    .setMaxLength(3);

                const actionRow = new ActionRowBuilder().addComponents(input);
                modal.addComponents(actionRow);

                await i.showModal(modal);

                try {
                    const modalSubmit = await i.awaitModalSubmit({ time: 30000, filter: (sub) => sub.customId === 'vol_modal' && sub.user.id === i.user.id });
                    
                    const val = parseInt(modalSubmit.fields.getTextInputValue('vol_input_val'));
                    if (!isNaN(val) && val >= 0 && val <= 200) {
                        targetVol = val;
                        await smoothVolume(serverQueue, targetVol);
                        await modalSubmit.deferUpdate();
                    } else {
                        await modalSubmit.reply({ content: '❌ Geçersiz sayı.', ephemeral: true });
                        updateInterface = false;
                    }
                } catch (e) { updateInterface = false; }
            } 
            
            // --- NORMAL BUTON İŞLEMLERİ ---
            else {
                await i.deferUpdate();

                if (i.isStringSelectMenu()) {
                    targetVol = parseInt(i.values[0]);
                } 
                else if (i.isButton()) {
                    switch (i.customId) {
                        case 'vol_down_10': targetVol = Math.max(0, targetVol - 10); break;
                        case 'vol_down_5':  targetVol = Math.max(0, targetVol - 5); break;
                        case 'vol_up_5':    targetVol = Math.min(100, targetVol + 5); break;
                        case 'vol_up_10':   targetVol = Math.min(100, targetVol + 10); break;
                        
                        case 'vol_save':
                            if (db.setServerVolume) {
                                db.setServerVolume(interaction.guild.id, targetVol);
                                feedbackMsg = `✅ Sunucu varsayılan sesi **%${targetVol}** olarak veritabanına işlendi.`;
                            } else {
                                feedbackMsg = `⚠️ Veritabanı modülü 'setServerVolume' fonksiyonunu desteklemiyor.`;
                            }
                            break;

                        case 'vol_reset':
                            targetVol = defaultVol;
                            feedbackMsg = `🔄 Varsayılan sunucu ayarına dönüldü (%${defaultVol}).`;
                            break;
                    }
                }

                if (i.customId !== 'vol_save' && i.customId !== 'vol_custom') {
                    if (serverQueue.volume !== targetVol) {
                        await smoothVolume(serverQueue, targetVol);
                    }
                }
            }

            if (updateInterface) {
                const newSystemRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('vol_save').setLabel(`Şu anki seviyeyi (%${targetVol}) kaydet`).setStyle(ButtonStyle.Success).setEmoji('💾'),
                    new ButtonBuilder().setCustomId('vol_reset').setLabel('Sıfırla').setStyle(ButtonStyle.Danger).setEmoji('🔄')
                );

                const newEmbed = createEngineerEmbed(serverQueue.volume, defaultVol, feedbackMsg);
                await interaction.editReply({ embeds: [newEmbed], components: [menuRow, controlRow, newSystemRow] });
            }
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder().addComponents(controlRow.components.map(b => ButtonBuilder.from(b).setDisabled(true)));
            interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });
    },
};

// ==========================================
// 🛠️ MÜHENDİSLİK FONKSİYONLARI
// ==========================================

async function smoothVolume(queue, targetVol) {
    const startVol = queue.volume;
    const steps = 5;
    const duration = 200;
    const volDiff = targetVol - startVol;

    return new Promise((resolve) => {
        let currentStep = 0;
        const fadeInterval = setInterval(() => {
            currentStep++;
            const newVol = startVol + (volDiff * (currentStep / steps));
            if (queue.resource && queue.resource.volume) queue.resource.volume.setVolume(newVol / 100);
            if (currentStep >= steps) {
                clearInterval(fadeInterval);
                queue.volume = targetVol;
                resolve();
            }
        }, duration / steps);
    });
}

function createEngineerEmbed(vol, defaultVol, alertMsg = null) {
    const dbVal = (20 * Math.log10(vol / 50)).toFixed(1);
    const bar = createVUBar(vol);
    const color = vol > 90 ? '#e74c3c' : (vol > 50 ? '#f1c40f' : '#2ecc71');
    const warning = vol > 100 ? '⚠️ DİKKAT: Yüksek Distorsiyon Riski' : '✅ Sinyal Stabil';

    return new EmbedBuilder()
        .setTitle('🎛️ Ana Ses Kontrol Terminali')
        .setDescription(`
        **Çıkış Kazancı (Gain)**
        ${bar}
        
        🎚️ **Aktif Seviye:** %${vol} (${dbVal} dB)
        💾 **Sunucu Varsayılanı:** %${defaultVol}
        📊 **Sinyal Durumu:** ${warning}
        ${alertMsg ? `\n> **Sistem Mesajı:** ${alertMsg}` : ''}
        `)
        .setColor(color)
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/5694/5694833.png')
        .setFooter({ text: 'Auto-Save & Smooth Fading Enabled' });
}

function createVUBar(vol) {
    const total = 15;
    const filled = Math.round((vol / 100) * total);
    let str = '';
    for (let i = 1; i <= total; i++) {
        if (i <= filled) str += i > 12 ? '🟥' : (i > 8 ? '🟨' : '🟩');
        else str += '⬛';
    }
    return `\`${str}\``;
}
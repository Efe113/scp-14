const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { checkDJ } = require('../../../utils.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Duran ses akışını yeniden başlatır ve kontrol panelini açar.'),

    async execute(interaction, client) {
        // 1. GÜVENLİK KONTROLÜ
        if (!checkDJ(interaction)) {
            return interaction.reply({ content: '⛔ **Erişim Reddedildi:** Akışı yönetmek için DJ yetkisi gerekir.', ephemeral: true });
        }

        const serverQueue = client.queue.get(interaction.guild.id);

        // 2. BAĞLANTI KONTROLÜ
        if (!serverQueue || !serverQueue.player) {
            return interaction.reply({ content: '❌ Aktif bir ses sinyali bulunamadı.', ephemeral: true });
        }

        // 3. DURUM ANALİZİ (Zaten çalıyor mu?)
        if (serverQueue.player.state.status === 'playing') {
            // Zaten çalıyorsa hata verme, bunun yerine "Bilgi Kartı" göster (Kullanıcı dostu)
            const currentSong = serverQueue.songs[0];
            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('▶️ Sistem Zaten Aktif')
                .setDescription(`Ses akışı şu an normal değerlerde devam ediyor.`)
                .addFields({ name: '🎵 Şu An Çalıyor', value: `[${currentSong.title}](${currentSong.url})` })
                .setFooter({ text: 'Müdahaleye gerek yok.' });
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // 4. İŞLEM: UNPAUSE (DEVAM ET)
        const success = serverQueue.player.unpause();

        if (success) {
            const song = serverQueue.songs[0];
            
            // Görsel Kart (Embed)
            const embed = new EmbedBuilder()
                .setColor('#2ecc71') // Yeşil (Play)
                .setTitle('▶️ Sinyal Yeniden Sağlandı')
                .setDescription(`**${song.title}** kaldığı yerden devam ediyor.`)
                .addFields(
                    { name: '⏱️ Süre', value: `${song.duration}`, inline: true },
                    { name: '📡 İsteyen', value: `${song.requester.username}`, inline: true },
                    { name: '🎚️ Ses', value: `%${serverQueue.volume}`, inline: true }
                )
                .setThumbnail(song.thumbnail)
                .setTimestamp();

            // Taktiksel Butonlar (Global ID'ler kullanıldı, index.js bunları tanır)
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('music_pause').setLabel('Tekrar Durdur').setStyle(ButtonStyle.Secondary).setEmoji('⏸️'),
                new ButtonBuilder().setCustomId('music_skip').setLabel('Geç').setStyle(ButtonStyle.Secondary).setEmoji('⏭️'),
                new ButtonBuilder().setCustomId('vol_down').setLabel('Kıs').setStyle(ButtonStyle.Secondary).setEmoji('🔉'),
                new ButtonBuilder().setCustomId('vol_up').setLabel('Aç').setStyle(ButtonStyle.Secondary).setEmoji('🔊')
            );

            await interaction.reply({ embeds: [embed], components: [row] });

        } else {
            // Nadir Hata Durumu
            await interaction.reply({ content: '❌ **Sistem Hatası:** Oynatıcı yanıt vermiyor (Deadlock). Lütfen `/play` ile yeniden başlatın.', ephemeral: true });
        }
    },
};
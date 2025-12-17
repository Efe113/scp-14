const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { checkDJ } = require('../../../utils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Zaman akışını dondurur (Müziği duraklatır).'),

    async execute(interaction, client) {
        // 1. GÜVENLİK KONTROLÜ
        if (!checkDJ(interaction)) {
            return interaction.reply({ content: '⛔ **Erişim Reddedildi:** Zamanı dondurmak için DJ yetkisi gerekir.', ephemeral: true });
        }

        const serverQueue = client.queue.get(interaction.guild.id);

        // 2. BAĞLANTI KONTROLÜ
        if (!serverQueue || !serverQueue.player) {
            return interaction.reply({ content: '❌ Şu an dondurulacak bir ses akışı yok.', ephemeral: true });
        }

        // 3. DURUM ANALİZİ (Zaten duraklatılmış mı?)
        if (serverQueue.player.state.status === 'paused') {
            const embed = new EmbedBuilder()
                .setColor('#f1c40f')
                .setDescription('⚠️ Müzik zaten duraklatılmış durumda.');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // 4. İŞLEM: PAUSE (DONDUR)
        const success = serverQueue.player.pause();

        if (success) {
            const currentSong = serverQueue.songs[0];
            
            // Görsel Rapor (Embed)
            const embed = new EmbedBuilder()
                .setColor('#3498db') // Mavi (Freeze/Ice)
                .setTitle('⏸️ Protokol Stasis Aktif')
                .setDescription(`**${currentSong.title}** olduğu yerde donduruldu.`)
                .addFields(
                    { name: '⏳ Durum', value: 'Beklemede (Paused)', inline: true },
                    { name: '👤 Operatör', value: `${interaction.user.username}`, inline: true }
                )
                .setThumbnail(currentSong.thumbnail)
                .setFooter({ text: 'Devam ettirmek için butona basın 👇' })
                .setTimestamp();

            // Kontrol Butonları (Resume butonu ekliyoruz)
            // 'music_pause' butonu toggle mantığıyla çalıştığı için (pause/unpause), 
            // buraya koyduğumuzda 'Resume' işlevi görecektir.
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('music_pause') 
                    .setLabel('Devam Et (Resume)')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('▶️'),
                new ButtonBuilder()
                    .setCustomId('music_stop')
                    .setLabel('İptal Et')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('⏹️')
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        } else {
            await interaction.reply({ content: '❌ **Sistem Hatası:** Oynatıcı dondurulamadı.', ephemeral: true });
        }
    },
};
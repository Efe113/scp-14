const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Döngü modunu değiştirir (Kapalı -> Şarkı -> Liste).'),

    async execute(interaction, client) {
        const serverQueue = client.queue.get(interaction.guild.id);
        if (!serverQueue) return interaction.reply('❌ Müzik çalmıyor.');

        // Modu değiştir
        serverQueue.loop = (serverQueue.loop + 1) % 3;

        let modeText = '';
        switch (serverQueue.loop) {
            case 0: modeText = '⛔ Döngü Kapalı'; break;
            case 1: modeText = '🔂 Tek Şarkı Döngüsü'; break;
            case 2: modeText = '🔁 Liste Döngüsü'; break;
        }

        await interaction.reply(`Durum Güncellendi: **${modeText}**`);
    },
};
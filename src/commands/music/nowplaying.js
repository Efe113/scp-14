const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Şu an çalan şarkının detaylarını gösterir.'),

    async execute(interaction, client) {
        const serverQueue = client.queue.get(interaction.guild.id);

        if (!serverQueue || !serverQueue.songs[0]) {
            return interaction.reply({ content: '❌ Şu an hiçbir şey çalmıyor.', ephemeral: true });
        }

        const song = serverQueue.songs[0];

        const embed = new EmbedBuilder()
            .setColor('#FFFF00')
            .setTitle('💿 Şu An Çalıyor')
            .setDescription(`[${song.title}](${song.url})`)
            .setThumbnail(song.thumbnail)
            .addFields(
                { name: 'Süre', value: song.duration, inline: true },
                { name: 'İsteyen', value: song.requester.username, inline: true },
                { name: 'Kanal', value: song.channel, inline: true }
            );

        await interaction.reply({ embeds: [embed] });
    },
};
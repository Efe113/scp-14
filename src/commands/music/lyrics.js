const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const finder = require('lyrics-finder');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Şarkı sözlerini bulur.')
        .addStringOption(option => 
            option.setName('sorgu')
                .setDescription('Şarkı adı (Boş bırakırsanız çalan şarkıyı arar)')
                .setRequired(false)),

    async execute(interaction, client) {
        await interaction.deferReply();

        let songName = interaction.options.getString('sorgu');
        const serverQueue = client.queue.get(interaction.guild.id);

        // Eğer isim girilmediyse, şu an çalan şarkıyı al
        if (!songName) {
            if (serverQueue && serverQueue.songs.length > 0) {
                // Şarkı başlığındaki gereksiz "Official Video" vb. temizle
                songName = serverQueue.songs[0].title
                    .replace(/\\(Official.*?\\)/gi, '')
                    .replace(/\\(Music Video\\)/gi, '')
                    .replace(/\\(Lyric Video\\)/gi, '');
            } else {
                return interaction.followUp('❌ İsim girmediniz ve şu an çalan bir şarkı yok.');
            }
        }

        try {
            // Sözleri Ara
            let lyrics = await finder("", songName) || "Sözler bulunamadı.";

            // Discord Mesaj Sınırı (4096 karakter) Kontrolü
            if (lyrics.length > 4000) {
                lyrics = lyrics.substring(0, 4000) + '... (Devamı çok uzun)';
            }

            const embed = new EmbedBuilder()
                .setColor('#FFFFFF')
                .setTitle(`📜 Şarkı Sözleri: ${songName}`)
                .setDescription(lyrics)
                .setFooter({ text: 'Lyrics Finder Engine' });

            await interaction.followUp({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.followUp('❌ Sözler aranırken bir hata oluştu.');
        }
    },
};
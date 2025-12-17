const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkDJ } = require('../../../utils.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Şarkıları akıllıca atlar.')
        .addIntegerOption(option => 
            option.setName('miktar')
                .setDescription('Kaç şarkı atlanacak? (Varsayılan: 1)')
                .setMinValue(1)
                .setMaxValue(50)
                .setRequired(false)),

    async execute(interaction, client) {
        // 1. GÜVENLİK
        if (!checkDJ(interaction)) {
            return interaction.reply({ content: '⛔ **Erişim Reddedildi:** DJ yetkisi gerekli.', ephemeral: true });
        }

        const serverQueue = client.queue.get(interaction.guild.id);
        if (!serverQueue || !serverQueue.player) {
            return interaction.reply({ content: '❌ Şu an atlanacak bir şarkı yok.', ephemeral: true });
        }

        // 2. AYARLARI AL
        // Kullanıcı sayı girmezse 1 kabul et
        const skipAmount = interaction.options.getInteger('miktar') || 1;
        const queueLength = serverQueue.songs.length;

        // 3. SENARYO A: KUYRUKTAN FAZLA ATLAMA (Temizle ve Bitir)
        if (skipAmount >= queueLength) {
            serverQueue.songs = []; // Hepsini sil
            serverQueue.player.stop(); // Müziği kes
            
            const embed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('🛑 Kuyruk Sonlandı')
                .setDescription(`**${skipAmount}** şarkı atlanmak istendi ancak liste sonuna gelindi. Müzik durduruldu.`)
                .setFooter({ text: 'Oturum bitti.' });
            
            return interaction.reply({ embeds: [embed] });
        }

        // 4. SENARYO B: NORMAL ATLAMA (Loop Breaker Dahil)
        
        // Atlanan şarkıların isimlerini rapor için topla
        const skippedSongs = serverQueue.songs.slice(0, skipAmount);
        const skippedNames = skippedSongs.map((s, i) => `\`${i+1}.\` ${s.title.substring(0, 30)}...`).join('\n');

        // [KRİTİK HAMLE] Dizi Manipülasyonu
        // Eğer 3 şarkı atlanacaksa:
        // [0] (Çalan), [1], [2] -> Bunlar ÇÖPE GİDECEK.
        // [3] -> Yeni Çalan olacak.
        
        // Not: play.js'deki 'Idle' eventi normalde shift() yapar (bir tane siler).
        // Biz burada manuel silme yapacağımız için, player.stop() demeden önce
        // listeyi MANUEL olarak ayarlamalıyız.
        
        // Döngü varsa geçici olarak kapat (Yoksa atlananlar geri gelir)
        const oldLoopState = serverQueue.loop;
        if (serverQueue.loop !== 0) {
            serverQueue.loop = 0; 
        }

        // Şarkıları diziden uçur (Çalan şarkı dahil ilk N tanesini sil)
        // DİKKAT: 'Idle' eventi tetiklendiğinde otomatik bir shift() daha yapılacak.
        // Bu yüzden (skipAmount - 1) kadar siliyoruz ki, stop() deyince sonuncuyu da sistem silsin.
        
        if (skipAmount > 1) {
            serverQueue.songs.splice(0, skipAmount - 1);
        }

        // Gelecek şarkıyı belirle (Rapor için)
        // Şu anki [0] silinecek, [1] çalacak. (Splice sonrası indexler değişti)
        const nextSong = serverQueue.songs[1]; 

        // Player'ı durdur -> Bu 'Idle' olayını tetikler -> Sistem [0]'ı siler -> [1] çalmaya başlar.
        serverQueue.player.stop();

        // Eski döngü ayarını geri yükle (Biraz gecikmeli)
        setTimeout(() => {
            serverQueue.loop = oldLoopState;
        }, 1000);

        // 5. GÖRSEL RAPOR
        const embed = new EmbedBuilder()
            .setColor('#3498db')
            .setTitle(`⏭️ HyperJump Aktif: ${skipAmount} Şarkı Atlandı`)
            .setDescription(`**Silinenler:**\n${skippedNames}`)
            .addFields(
                { name: '🎵 Şimdi Sırada', value: `[${nextSong.title}](${nextSong.url})`, inline: true },
                { name: '⏱️ Süre', value: `${nextSong.duration}`, inline: true }
            )
            .setThumbnail(nextSong.thumbnail)
            .setFooter({ text: `Komut: ${interaction.user.tag} | Loop: ${oldLoopState !== 0 ? 'Geçici Devredışı' : 'Kapalı'}` });

        await interaction.reply({ embeds: [embed] });
    },
};
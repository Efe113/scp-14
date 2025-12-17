const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { checkDJ } = require('../../../utils.js');
const db = require('../../db.js'); // Yedekleme için DB erişimi

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Müzik oturumunu akıllı bir şekilde sonlandırır.')
        .addStringOption(option => 
            option.setName('mod')
                .setDescription('Nasıl durdurulacak?')
                .setRequired(false)
                .addChoices(
                    { name: '🛑 Hemen Durdur (Force)', value: 'force' },
                    { name: '⏳ Şarkı Bitince (Soft)', value: 'soft' }
                ))
        .addBooleanOption(option => 
            option.setName('yedekle')
                .setDescription('Kalan listeyi veritabanına yedekleyelim mi?')
                .setRequired(false)),

    async execute(interaction, client) {
        // 1. GÜVENLİK
        if (!checkDJ(interaction)) {
            return interaction.reply({ content: '⛔ **Erişim Reddedildi:** Yetkisiz personel (DJ Rolü Gerekli).', ephemeral: true });
        }

        const serverQueue = client.queue.get(interaction.guild.id);
        if (!serverQueue) {
            return interaction.reply({ content: '❌ Aktif bir oturum bulunamadı.', ephemeral: true });
        }

        // Seçenekleri Al
        const mode = interaction.options.getString('mod') || 'force';
        const doBackup = interaction.options.getBoolean('yedekle') || false;

        // --- SENARYO A: SOFT STOP (Şarkı Bitince) ---
        if (mode === 'soft') {
            // Döngüyü kapat, kuyruğu temizle (sadece çalan kalsın)
            serverQueue.loop = 0; 
            serverQueue.songs = [serverQueue.songs[0]]; // Diğerlerini sil, çalan kalsın
            
            // Kullanıcıya bilgi ver
            const embed = new EmbedBuilder()
                .setColor('#f1c40f') // Sarı (Bekleme)
                .setTitle('⏳ Yumuşak İniş Başlatıldı')
                .setDescription(`**${serverQueue.songs[0].title}** şarkısı bittiğinde bot kanaldan ayrılacak.`)
                .setFooter({ text: 'Not: Sırada bekleyen diğer şarkılar listeden çıkarıldı.' });
            
            return interaction.reply({ embeds: [embed] });
        }

        // --- SENARYO B: FORCE STOP (Hemen) ---
        
        await interaction.deferReply();

        // 2. YEDEKLEME PROTOKOLÜ
        let backupMsg = 'Yedekleme yapılmadı.';
        if (doBackup && serverQueue.songs.length > 0) {
            const date = new Date();
            const backupName = `OtoYedek_${date.getDate()}/${date.getMonth()+1}_${date.getHours()}:${date.getMinutes()}`;
            
            // db.js içindeki savePlaylist fonksiyonunu kullan
            db.savePlaylist(interaction.user.id, backupName, serverQueue.songs);
            backupMsg = `✅ Kalan ${serverQueue.songs.length} şarkı **"${backupName}"** olarak kaydedildi.`;
        }

        // 3. İSTATİSTİK VE RAPOR VERİLERİ
        const songsDeleted = serverQueue.songs.length;
        const channelName = serverQueue.voiceChannel ? serverQueue.voiceChannel.name : 'Bilinmiyor';

        // 4. TEMİZLİK (CLEANUP)
        if (serverQueue.disconnectTimer) clearTimeout(serverQueue.disconnectTimer);
        serverQueue.songs = []; // Diziyi boşalt
        
        if (serverQueue.player) serverQueue.player.stop(); // Sesi kes
        if (serverQueue.connection) serverQueue.connection.destroy(); // Bağlantıyı kopar
        
        client.queue.delete(interaction.guild.id); // Hafızayı sil

        // 5. NİHAİ RAPOR (EMBED)
        const embed = new EmbedBuilder()
            .setColor('#FF0000') // Kırmızı (Shutdown)
            .setTitle('🛑 SİSTEM KAPATILDI')
            .setDescription('Ses motoru devredışı bırakıldı ve bağlantı güvenli bir şekilde kesildi.')
            .addFields(
                { name: '🔌 Kanal', value: `#${channelName}`, inline: true },
                { name: '🗑️ Temizlenen', value: `${songsDeleted} Öğe`, inline: true },
                { name: '💾 Veri Kurtarma', value: backupMsg, inline: false }
            )
            .setThumbnail('https://cdn-icons-png.flaticon.com/512/1828/1828843.png')
            .setFooter({ text: `Operatör: ${interaction.user.tag}` })
            .setTimestamp();

        await interaction.followUp({ embeds: [embed] });
    },
};
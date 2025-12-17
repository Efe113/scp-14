const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { checkDJ } = require('../../../utils.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Kuyruğu gelişmiş algoritmalarla yeniden düzenler.'),

    async execute(interaction, client) {
        // 1. GÜVENLİK VE DURUM KONTROLÜ
        if (!checkDJ(interaction)) return interaction.reply({ content: '⛔ **Erişim Reddedildi:** DJ yetkisi gerekli.', ephemeral: true });

        const serverQueue = client.queue.get(interaction.guild.id);
        if (!serverQueue || serverQueue.songs.length < 3) {
            return interaction.reply({ content: '❌ Karıştırmak için kuyrukta (çalan hariç) en az 2 şarkı olmalı.', ephemeral: true });
        }

        await interaction.deferReply();

        // 2. YEDEKLEME (BACKUP) SİSTEMİ
        // Karıştırmadan önce mevcut sırayı hafızaya alıyoruz (Undo için)
        // Shallow copy yeterlidir çünkü şarkı objelerini değiştirmiyoruz, sadece sırasını değiştiriyoruz.
        serverQueue.backupSongs = [...serverQueue.songs];

        // 3. ARAYÜZÜ HAZIRLA
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('shuf_standard').setLabel('Rastgele (Standart)').setStyle(ButtonStyle.Primary).setEmoji('🎲'),
            new ButtonBuilder().setCustomId('shuf_fair').setLabel('Adil Dağıtım (Smart)').setStyle(ButtonStyle.Success).setEmoji('🧠'),
            new ButtonBuilder().setCustomId('shuf_undo').setLabel('Geri Al (Undo)').setStyle(ButtonStyle.Danger).setEmoji('↩️'),
            new ButtonBuilder().setCustomId('shuf_save').setLabel('Onayla & Kapat').setStyle(ButtonStyle.Secondary).setEmoji('✅')
        );

        // İlk açılışta Standart Karıştırma yapalım
        shuffleStandard(serverQueue);

        const embed = createShuffleEmbed(serverQueue, 'Standart Fisher-Yates');
        const message = await interaction.followUp({ embeds: [embed], components: [buttons] });

        // 4. İNTERAKTİF DİNLEYİCİ
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

        collector.on('collect', async i => {
            if (!checkDJ(i)) return i.reply({ content: '⛔ Yetkisiz erişim.', ephemeral: true });
            
            await i.deferUpdate();
            let algoName = '';

            switch (i.customId) {
                case 'shuf_standard':
                    shuffleStandard(serverQueue);
                    algoName = 'Standart Fisher-Yates';
                    break;

                case 'shuf_fair':
                    shuffleFair(serverQueue);
                    algoName = 'Akıllı Adil Dağıtım (Smart)';
                    break;

                case 'shuf_undo':
                    if (serverQueue.backupSongs) {
                        serverQueue.songs = [...serverQueue.backupSongs];
                        algoName = 'Orijinal Sıra (Geri Alındı)';
                    } else {
                        return i.followUp({ content: '❌ Yedek bulunamadı.', ephemeral: true });
                    }
                    break;

                case 'shuf_save':
                    collector.stop();
                    return;
            }

            const newEmbed = createShuffleEmbed(serverQueue, algoName);
            await i.editReply({ embeds: [newEmbed], components: [buttons] });
        });

        collector.on('end', () => {
            // Butonları devre dışı bırak
            const disabledRow = new ActionRowBuilder().addComponents(
                buttons.components.map(b => ButtonBuilder.from(b).setDisabled(true))
            );
            interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });
    },
};

// ==========================================
// 🛠️ ALGORİTMA LABORATUVARI
// ==========================================

// 1. STANDART KARIŞTIRMA (Fisher-Yates)
// Tamamen rastgele kaos.
function shuffleStandard(queue) {
    const currentSong = queue.songs[0]; // Çalanı koru
    let songsToShuffle = queue.songs.slice(1);

    for (let i = songsToShuffle.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [songsToShuffle[i], songsToShuffle[j]] = [songsToShuffle[j], songsToShuffle[i]];
    }

    queue.songs = [currentSong, ...songsToShuffle];
}

// 2. ADİL KARIŞTIRMA (Fair/Smart Shuffle)
// Kullanıcıları gruplar ve sırayla her kullanıcıdan bir şarkı seçer.
// Örn: [UserA, UserA, UserA, UserB] -> [UserA, UserB, UserA, UserA]
function shuffleFair(queue) {
    const currentSong = queue.songs[0];
    const songsToShuffle = queue.songs.slice(1);
    
    // Şarkıları isteyen kişiye göre grupla
    const userMap = new Map();
    songsToShuffle.forEach(song => {
        const userId = song.requester.id;
        if (!userMap.has(userId)) userMap.set(userId, []);
        userMap.get(userId).push(song);
    });

    const newOrder = [];
    const users = Array.from(userMap.keys());
    
    // Kullanıcı listesini de karıştır ki hep aynı kişi başlamasın
    for (let i = users.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [users[i], users[j]] = [users[j], users[i]];
    }

    // Round-Robin dağıtım
    let active = true;
    while (active) {
        active = false;
        for (const userId of users) {
            const userSongs = userMap.get(userId);
            if (userSongs.length > 0) {
                // O kullanıcının listesinden rastgele bir tane al
                const randomIndex = Math.floor(Math.random() * userSongs.length);
                newOrder.push(userSongs.splice(randomIndex, 1)[0]);
                active = true; // Hala şarkı var, döngü devam etsin
            }
        }
    }

    queue.songs = [currentSong, ...newOrder];
}

// 3. GÖRSEL RAPORLAYICI
function createShuffleEmbed(queue, algorithm) {
    // İlk 10 şarkıyı göster
    const preview = queue.songs.slice(1, 11).map((s, i) => {
        return `\`${i + 1}.\` **${s.title.substring(0, 40)}** • *${s.requester.username}*`;
    }).join('\n');

    const remaining = Math.max(0, queue.songs.length - 11);
    
    return new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('🎲 Kuyruk Mikseri')
        .setDescription(`
        **Aktif Algoritma:** ${algorithm}
        
        **Yeni Sıralama (Önizleme):**
        ${preview}
        ${remaining > 0 ? `*...ve ${remaining} şarkı daha.*` : ''}
        `)
        .addFields(
            { name: '📊 Toplam', value: `${queue.songs.length}`, inline: true },
            { name: '💿 Şu An Çalan', value: queue.songs[0].title.substring(0, 50), inline: true }
        )
        .setFooter({ text: 'Beğenmedin mi? Butonları kullanarak tekrar dene.' });
}
const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType 
} = require('discord.js');
const { checkDJ } = require('../../../utils.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Gelişmiş kuyruk yönetim panelini açar.'),

    async execute(interaction, client) {
        const serverQueue = client.queue.get(interaction.guild.id);

        // 1. DURUM KONTROLÜ
        if (!serverQueue || serverQueue.songs.length === 0) {
            return interaction.reply({ 
                content: '📭 **Kuyruk Boş:** Şu an çalınacak bir şey yok. `/play` ile ekleme yapabilirsin.', 
                ephemeral: true 
            });
        }

        await interaction.deferReply();

        // 2. DEĞİŞKENLER
        let currentPage = 0;
        const ITEMS_PER_PAGE = 10;

        // 3. İLK GÖRÜNÜMÜ OLUŞTUR
        const embed = generateQueueEmbed(serverQueue, currentPage, ITEMS_PER_PAGE);
        const controls = generateControls(serverQueue, currentPage, ITEMS_PER_PAGE);

        const message = await interaction.followUp({ embeds: [embed], components: controls });

        // 4. İNTERAKTİF DİNLEYİCİ (COLLECTOR)
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 }); // 2 dakika

        collector.on('collect', async i => {
            // Butona basan kişi komutu yazan kişi mi? (Opsiyonel, herkes gezebilsin diye kapattım)
            // if (i.user.id !== interaction.user.id) return i.reply({ content: 'Bu panel senin değil.', ephemeral: true });

            await i.deferUpdate();

            const totalPages = Math.ceil((serverQueue.songs.length - 1) / ITEMS_PER_PAGE) || 1;

            switch (i.customId) {
                // --- SAYFALAMA ---
                case 'q_prev':
                    if (currentPage > 0) currentPage--;
                    break;
                
                case 'q_next':
                    if (currentPage < totalPages - 1) currentPage++;
                    break;

                case 'q_refresh':
                    // Sadece sayfayı yenile (Değişkenler zaten güncel serverQueue'dan çekilecek)
                    break;

                // --- AKSİYONLAR (DJ Yetkisi İster) ---
                case 'q_clear':
                    if (!checkDJ(i)) {
                        return i.followUp({ content: '⛔ Kuyruğu temizlemek için DJ yetkisi gerekli.', ephemeral: true });
                    }
                    if (serverQueue.songs.length > 1) {
                        serverQueue.songs = [serverQueue.songs[0]]; // Sadece çalanı bırak
                        i.followUp({ content: '🗑️ Kuyruk temizlendi (Çalan şarkı hariç).', ephemeral: true });
                        currentPage = 0; // Başa dön
                    }
                    break;

                case 'q_shuffle':
                    if (!checkDJ(i)) {
                        return i.followUp({ content: '⛔ Karıştırmak için DJ yetkisi gerekli.', ephemeral: true });
                    }
                    if (serverQueue.songs.length > 2) {
                        shuffleQueue(serverQueue);
                        i.followUp({ content: '🔀 Kuyruk karıştırıldı.', ephemeral: true });
                    }
                    break;
            }

            // Sayfayı Güncelle
            const newEmbed = generateQueueEmbed(serverQueue, currentPage, ITEMS_PER_PAGE);
            const newControls = generateControls(serverQueue, currentPage, ITEMS_PER_PAGE);
            
            await i.editReply({ embeds: [newEmbed], components: newControls });
        });

        collector.on('end', () => {
            // Süre bitince butonları kaldır
            interaction.editReply({ components: [] }).catch(() => {});
        });
    },
};

// ==========================================
// 🛠️ YARDIMCI FONKSİYONLAR
// ==========================================

// 1. EMBED OLUŞTURUCU
function generateQueueEmbed(queue, page, itemsPerPage) {
    const current = queue.songs[0];
    const rest = queue.songs.slice(1); // Bekleyenler
    const totalPages = Math.ceil(rest.length / itemsPerPage) || 1;
    
    // Sayfa Dilimleme
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const currentList = rest.slice(start, end);

    // İlerleme Çubuğu Hesapla
    let progressBar = '';
    let timeString = '';
    
    if (queue.resource && queue.resource.playbackDuration) {
        const currentMs = queue.resource.playbackDuration;
        const totalMs = hmsToMs(current.duration);
        
        if (totalMs > 0) {
            progressBar = createProgressBar(currentMs, totalMs);
            timeString = `\`${msToHms(currentMs)} / ${current.duration}\``;
        } else {
            progressBar = 'CANLI YAYIN 🔴';
            timeString = '`Live`';
        }
    }

    // Toplam Süre Hesapla
    const totalDurationMs = queue.songs.reduce((acc, song) => acc + hmsToMs(song.duration), 0);
    const totalDurationStr = msToHms(totalDurationMs);

    const embed = new EmbedBuilder()
        .setColor('#2b2d31') // Discord Dark Theme uyumlu
        .setTitle(`🎵 Çalma Listesi (${queue.songs.length} Şarkı)`)
        .setDescription(`
        **Şu An Çalıyor:**
        [${current.title}](${current.url})
        ${progressBar}
        ${timeString} | İste: ${current.requester}
        
        **Sırada Bekleyenler:**
        ${currentList.length > 0 
            ? currentList.map((s, i) => `**${start + i + 1}.** ${s.title.substring(0, 45)}... | \`${s.duration}\` | ${s.requester}`).join('\n') 
            : '_Bu sayfada şarkı yok._'}
        `)
        .addFields(
            { name: '⏱️ Toplam Süre', value: totalDurationStr, inline: true },
            { name: '🔂 Döngü Modu', value: ['Kapalı', 'Tek Şarkı', 'Tüm Liste'][queue.loop], inline: true },
            { name: '🔊 Ses', value: `%${queue.volume}`, inline: true }
        )
        .setFooter({ text: `Sayfa ${page + 1} / ${totalPages} | SCP Music System` })
        .setThumbnail(current.thumbnail);

    return embed;
}

// 2. BUTON OLUŞTURUCU
function generateControls(queue, page, itemsPerPage) {
    const totalPages = Math.ceil((queue.songs.length - 1) / itemsPerPage) || 1;

    // Row 1: Navigasyon
    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('q_prev')
            .setEmoji('⬅️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0), // İlk sayfadaysa devre dışı
        
        new ButtonBuilder()
            .setCustomId('q_refresh')
            .setLabel('Yenile')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🔄'),

        new ButtonBuilder()
            .setCustomId('q_next')
            .setEmoji('➡️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1) // Son sayfadaysa devre dışı
    );

    // Row 2: Yönetim (Eğer şarkı varsa göster)
    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('q_shuffle')
            .setLabel('Karıştır')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔀')
            .setDisabled(queue.songs.length < 3),
        
        new ButtonBuilder()
            .setCustomId('q_clear')
            .setLabel('Temizle')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️')
            .setDisabled(queue.songs.length <= 1)
    );

    return [navRow, actionRow];
}

// 3. YARDIMCI MATEMATİK
function createProgressBar(current, total) {
    const length = 15;
    const progress = Math.min(length, Math.round((current / total) * length));
    const empty = length - progress;
    return '▬'.repeat(progress) + '🔘' + '▬'.repeat(empty);
}

function hmsToMs(hms) {
    if (!hms || hms.includes('Live')) return 0;
    const p = hms.split(':').map(Number);
    let s = 0;
    if (p.length === 3) s = p[0] * 3600 + p[1] * 60 + p[2];
    else if (p.length === 2) s = p[0] * 60 + p[1];
    else s = p[0];
    return s * 1000;
}

function msToHms(ms) {
    if (!ms) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    return `${minutes}:${pad(seconds)}`;
}

function pad(num) {
    return num.toString().padStart(2, '0');
}

// Basit Shuffle (commands/shuffle.js ile aynı mantık)
function shuffleQueue(queue) {
    const current = queue.songs[0];
    let others = queue.songs.slice(1);
    for (let i = others.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [others[i], others[j]] = [others[j], others[i]];
    }
    queue.songs = [current, ...others];
}
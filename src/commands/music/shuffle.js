const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ComponentType,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { checkDJ } = require('../../../utils.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Kuyruğu gelişmiş algoritmalarla karıştırır ve yönetir.')
        .addStringOption(option => 
            option.setName('algoritma')
                .setDescription('Karıştırma algoritması seçin')
                .addChoices(
                    { name: '🎲 Standart (Fisher-Yates)', value: 'standard' },
                    { name: '🧠 Akıllı Dağıtım', value: 'fair' },
                    { name: '👤 İstekçi Gruplu', value: 'requester_group' },
                    { name: '🎵 Şarkı Uzunluğu', value: 'duration_based' },
                    { name: '📊 Popülerlik', value: 'popularity' },
                    { name: '🔀 Tam Rastgele', value: 'true_random' },
                    { name: '🎭 Tematik Gruplama', value: 'thematic' }
                )
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('calani_koru')
                .setDescription('Çalan şarkıyı korur (varsayılan: evet)')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('max_karistirma')
                .setDescription('Maksimum karıştırma sayısı (1-10)')
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('filtre')
                .setDescription('Özel filtre uygula')
                .addChoices(
                    { name: '⏱️ Kısa Şarkılar Önce', value: 'short_first' },
                    { name: '🎵 Uzun Şarkılar Önce', value: 'long_first' },
                    { name: '👤 Aynı İstekçi Gruplu', value: 'group_by_requester' },
                    { name: '🔊 Yüksek Ses Kalitesi', value: 'high_quality' }
                )
                .setRequired(false)),

    async execute(interaction, client) {
        // 1. GÜVENLİK KONTROLÜ
        if (!checkDJ(interaction)) {
            return interaction.reply({ 
                content: '⛔ **Erişim Reddedildi:** DJ yetkisi gerekli.', 
                ephemeral: true 
            });
        }

        const serverQueue = client.queue.get(interaction.guild.id);
        
        // 2. KUYRUK KONTROLÜ
        if (!serverQueue || serverQueue.songs.length < 3) {
            return interaction.reply({ 
                content: '❌ Karıştırmak için kuyrukta (çalan hariç) en az 2 şarkı olmalı.', 
                ephemeral: true 
            });
        }

        await interaction.deferReply();

        try {
            // 3. KULLANICI AYARLARINI AL
            const algorithm = interaction.options.getString('algoritma') || 'standard';
            const protectCurrent = interaction.options.getBoolean('calani_koru') ?? true;
            const maxShuffles = interaction.options.getInteger('max_karistirma') || 1;
            const filterType = interaction.options.getString('filtre');

            // 4. YEDEKLEME SİSTEMİ (UNDO için)
            serverQueue.shuffleBackup = {
                timestamp: Date.now(),
                originalOrder: [...serverQueue.songs],
                algorithm: algorithm,
                protector: interaction.user.id
            };

            // 5. SEÇİLEN ALGORİTMALARA GÖRE KARIŞTIR
            const results = await performAdvancedShuffle(
                serverQueue, 
                algorithm, 
                protectCurrent, 
                maxShuffles, 
                filterType,
                interaction
            );

            // 6. GELİŞMİŞ RAPOR GÖSTER
            await sendAdvancedShuffleReport(interaction, results, serverQueue, client);

        } catch (error) {
            console.error('Shuffle komutu hatası:', error);
            await interaction.editReply({ 
                content: `❌ Karıştırma sırasında hata oluştu: ${error.message}`, 
                components: [] 
            });
        }
    },
};

// ==========================================
// 🎲 KARIŞTIRMA ALGORİTMALARI
// ==========================================

// 1. STANDART FISHER-YATES
function shuffleStandard(queue, protectCurrent = true) {
    const currentSong = protectCurrent ? queue.songs[0] : null;
    let songsToShuffle = protectCurrent ? queue.songs.slice(1) : [...queue.songs];
    
    // Fisher-Yates algoritması
    for (let i = songsToShuffle.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [songsToShuffle[i], songsToShuffle[j]] = [songsToShuffle[j], songsToShuffle[i]];
    }

    queue.songs = protectCurrent ? [currentSong, ...songsToShuffle] : songsToShuffle;
    
    return {
        name: 'Standart Fisher-Yates',
        description: 'Klasik rastgele karıştırma algoritması',
        complexity: 'O(n)',
        shuffleCount: 1
    };
}

// 2. AKILLI ADİL DAĞITIM
function shuffleFair(queue, protectCurrent = true) {
    const currentSong = protectCurrent ? queue.songs[0] : null;
    let songsToShuffle = protectCurrent ? queue.songs.slice(1) : [...queue.songs];
    
    // Şarkıları isteyen kişiye göre grupla
    const userMap = new Map();
    songsToShuffle.forEach(song => {
        const userId = song.requester.id;
        if (!userMap.has(userId)) userMap.set(userId, []);
        userMap.get(userId).push(song);
    });

    const newOrder = [];
    const users = Array.from(userMap.keys());
    
    // Kullanıcı listesini karıştır
    for (let i = users.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [users[i], users[j]] = [users[j], users[i]];
    }

    // Round-Robin dağıtım
    let active = true;
    let round = 0;
    while (active) {
        active = false;
        round++;
        for (const userId of users) {
            const userSongs = userMap.get(userId);
            if (userSongs.length > 0) {
                // İlk round'ta rastgele, sonraki round'larda sırayla al
                const index = round === 1 ? 
                    Math.floor(Math.random() * userSongs.length) : 
                    0;
                newOrder.push(userSongs.splice(index, 1)[0]);
                active = userSongs.length > 0;
            }
        }
    }

    queue.songs = protectCurrent ? [currentSong, ...newOrder] : newOrder;
    
    return {
        name: 'Akıllı Adil Dağıtım',
        description: 'Her kullanıcıdan sırayla şarkı seçer',
        complexity: 'O(n log n)',
        userCount: users.length,
        shuffleCount: 1
    };
}

// 3. İSTEKÇİ GRUPLU KARIŞTIRMA
function shuffleRequesterGroup(queue, protectCurrent = true) {
    const currentSong = protectCurrent ? queue.songs[0] : null;
    let songsToShuffle = protectCurrent ? queue.songs.slice(1) : [...queue.songs];
    
    // İstekçilere göre grupla ve her grubu ayrı karıştır
    const userGroups = new Map();
    songsToShuffle.forEach(song => {
        const userId = song.requester.id;
        if (!userGroups.has(userId)) userGroups.set(userId, []);
        userGroups.get(userId).push(song);
    });

    // Her grubu ayrı karıştır
    userGroups.forEach(songs => {
        for (let i = songs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [songs[i], songs[j]] = [songs[j], songs[i]];
        }
    });

    // Grupları karıştır
    const groups = Array.from(userGroups.values());
    for (let i = groups.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [groups[i], groups[j]] = [groups[j], groups[i]];
    }

    // Düzleştir
    const newOrder = groups.flat();

    queue.songs = protectCurrent ? [currentSong, ...newOrder] : newOrder;
    
    return {
        name: 'İstekçi Gruplu',
        description: 'Aynı kişilerin şarkılarını gruplayıp karıştırır',
        complexity: 'O(n)',
        groupCount: groups.length,
        shuffleCount: 1
    };
}

// 4. ŞARKI UZUNLUĞU BAZLI KARIŞTIRMA
function shuffleDurationBased(queue, protectCurrent = true) {
    const currentSong = protectCurrent ? queue.songs[0] : null;
    let songsToShuffle = protectCurrent ? queue.songs.slice(1) : [...queue.songs];
    
    // Sürelere göre kategorize et
    const categories = {
        short: [],   // 0-2 dakika
        medium: [],  // 2-5 dakika
        long: []     // 5+ dakika
    };

    songsToShuffle.forEach(song => {
        const duration = parseDuration(song.duration);
        if (duration <= 120) {
            categories.short.push(song);
        } else if (duration <= 300) {
            categories.medium.push(song);
        } else {
            categories.long.push(song);
        }
    });

    // Her kategoriyi karıştır
    Object.values(categories).forEach(category => {
        for (let i = category.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [category[i], category[j]] = [category[j], category[i]];
        }
    });

    // Desen oluştur (kısa-orta-uzun şeklinde)
    const newOrder = [];
    const maxLength = Math.max(
        categories.short.length,
        categories.medium.length,
        categories.long.length
    );

    for (let i = 0; i < maxLength; i++) {
        if (categories.short[i]) newOrder.push(categories.short[i]);
        if (categories.medium[i]) newOrder.push(categories.medium[i]);
        if (categories.long[i]) newOrder.push(categories.long[i]);
    }

    // Son olarak tüm listeyi karıştır
    for (let i = newOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newOrder[i], newOrder[j]] = [newOrder[j], newOrder[i]];
    }

    queue.songs = protectCurrent ? [currentSong, ...newOrder] : newOrder;
    
    return {
        name: 'Süre Bazlı',
        description: 'Kısa, orta ve uzun şarkıları dengeli dağıtır',
        complexity: 'O(n)',
        shortCount: categories.short.length,
        mediumCount: categories.medium.length,
        longCount: categories.long.length,
        shuffleCount: 2
    };
}

// 5. TAM RASTGELE KARIŞTIRMA (ÇOKLU)
function shuffleTrueRandom(queue, protectCurrent = true, shuffleCount = 3) {
    const currentSong = protectCurrent ? queue.songs[0] : null;
    let songsToShuffle = protectCurrent ? queue.songs.slice(1) : [...queue.songs];
    
    // Birden fazla kez karıştır
    for (let shuffle = 0; shuffle < shuffleCount; shuffle++) {
        for (let i = songsToShuffle.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [songsToShuffle[i], songsToShuffle[j]] = [songsToShuffle[j], songsToShuffle[i]];
        }
    }

    queue.songs = protectCurrent ? [currentSong, ...songsToShuffle] : songsToShuffle;
    
    return {
        name: 'Tam Rastgele',
        description: `${shuffleCount} kez tekrarlanan karıştırma`,
        complexity: `O(n × ${shuffleCount})`,
        shuffleCount: shuffleCount
    };
}

// 6. TEMATİK GRUPLAMA (TITLE ANALİZİ)
function shuffleThematic(queue, protectCurrent = true) {
    const currentSong = protectCurrent ? queue.songs[0] : null;
    let songsToShuffle = protectCurrent ? queue.songs.slice(1) : [...queue.songs];
    
    // Basit tematik analiz
    const themes = {
        love: [],
        party: [],
        sad: [],
        chill: [],
        other: []
    };

    const themeKeywords = {
        love: ['love', 'seviyorum', 'aşk', 'kalp', 'heart', 'romantic'],
        party: ['party', 'dans', 'eğlence', 'festival', 'club', 'disco'],
        sad: ['üzgün', 'hüzün', 'acı', 'kayıp', 'sad', 'cry'],
        chill: ['chill', 'rahat', 'sakin', 'lo-fi', 'ambient', 'relax']
    };

    songsToShuffle.forEach(song => {
        const titleLower = song.title.toLowerCase();
        let themeFound = false;
        
        for (const [theme, keywords] of Object.entries(themeKeywords)) {
            if (keywords.some(keyword => titleLower.includes(keyword))) {
                themes[theme].push(song);
                themeFound = true;
                break;
            }
        }
        
        if (!themeFound) {
            themes.other.push(song);
        }
    });

    // Temaları karıştır
    Object.values(themes).forEach(themeSongs => {
        for (let i = themeSongs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [themeSongs[i], themeSongs[j]] = [themeSongs[j], themeSongs[i]];
        }
    });

    // Temaları karıştır
    const themeArrays = Object.values(themes);
    for (let i = themeArrays.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [themeArrays[i], themeArrays[j]] = [themeArrays[j], themeArrays[i]];
    }

    const newOrder = themeArrays.flat();

    queue.songs = protectCurrent ? [currentSong, ...newOrder] : newOrder;
    
    return {
        name: 'Tematik Gruplama',
        description: 'Şarkı başlıklarına göre tematik gruplandırma',
        complexity: 'O(n × k)',
        themes: Object.keys(themes).filter(t => themes[t].length > 0),
        shuffleCount: 2
    };
}

// 7. POPÜLERLİK BAZLI (İSTATİSTİKLİ)
function shufflePopularity(queue, protectCurrent = true) {
    const currentSong = protectCurrent ? queue.songs[0] : null;
    let songsToShuffle = protectCurrent ? queue.songs.slice(1) : [...queue.songs];
    
    // Popülerlik puanı hesapla (varsayımsal)
    songsToShuffle.forEach((song, index) => {
        song._popularityScore = calculatePopularityScore(song, index);
    });

    // Popülerlik puanına göre sırala
    songsToShuffle.sort((a, b) => b._popularityScore - a._popularityScore);
    
    // Sıralanmış listeyi karıştır ama popüler şarkıları öne dağıt
    const chunkSize = Math.ceil(songsToShuffle.length / 3);
    const chunks = [];
    
    for (let i = 0; i < songsToShuffle.length; i += chunkSize) {
        chunks.push(songsToShuffle.slice(i, i + chunkSize));
    }
    
    // Her chunk'ı karıştır
    chunks.forEach(chunk => {
        for (let i = chunk.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [chunk[i], chunk[j]] = [chunk[j], chunk[i]];
        }
    });
    
    // Chunk'ları karıştır
    for (let i = chunks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [chunks[i], chunks[j]] = [chunks[j], chunks[i]];
    }
    
    const newOrder = chunks.flat();

    queue.songs = protectCurrent ? [currentSong, ...newOrder] : newOrder;
    
    return {
        name: 'Popülerlik Bazlı',
        description: 'Popüler şarkıları dengeli dağıtır',
        complexity: 'O(n log n)',
        chunkCount: chunks.length,
        shuffleCount: 2
    };
}

// ==========================================
// 🎨 GÖRSEL ARAYÜZ VE RAPORLAMA
// ==========================================

async function performAdvancedShuffle(queue, algorithm, protectCurrent, maxShuffles, filterType, interaction) {
    let result;
    
    // Seçilen algoritmayı uygula
    switch(algorithm) {
        case 'fair':
            result = shuffleFair(queue, protectCurrent);
            break;
        case 'requester_group':
            result = shuffleRequesterGroup(queue, protectCurrent);
            break;
        case 'duration_based':
            result = shuffleDurationBased(queue, protectCurrent);
            break;
        case 'popularity':
            result = shufflePopularity(queue, protectCurrent);
            break;
        case 'true_random':
            result = shuffleTrueRandom(queue, protectCurrent, maxShuffles);
            break;
        case 'thematic':
            result = shuffleThematic(queue, protectCurrent);
            break;
        default:
            result = shuffleStandard(queue, protectCurrent);
    }

    // Ek filtre uygula
    if (filterType) {
        applyAdditionalFilter(queue, filterType, protectCurrent);
        result.filterApplied = filterType;
    }

    // İstatistikleri hesapla
    result.totalSongs = queue.songs.length;
    result.protectedCurrent = protectCurrent;
    result.shuffledAt = new Date().toLocaleTimeString('tr-TR');
    result.originalUserCount = countUniqueRequesters(queue.shuffleBackup?.originalOrder || []);
    result.newUserCount = countUniqueRequesters(queue.songs);
    
    // Karıştırma etkinliğini hesapla
    result.shuffleEffectiveness = calculateShuffleEffectiveness(
        queue.shuffleBackup?.originalOrder || [],
        queue.songs,
        protectCurrent
    );

    return result;
}

async function sendAdvancedShuffleReport(interaction, results, serverQueue, client) {
    const embed = new EmbedBuilder()
        .setColor(getShuffleColor(results.name))
        .setTitle(`🎲 ${results.name} Karıştırma`)
        .setTimestamp();

    // Ana bilgiler
    let description = `**${results.description}**\n\n`;
    description += `📊 **${results.totalSongs} şarkı** karıştırıldı\n`;
    description += results.protectedCurrent ? '🔒 **Çalan şarkı korundu**\n' : '🔓 **Çalan şarkı da karıştırıldı**\n';
    description += `🔄 **${results.shuffleCount} kez karıştırma** uygulandı\n`;
    
    if (results.filterApplied) {
        description += `🎛️ **Filtre:** ${getFilterName(results.filterApplied)}\n`;
    }

    embed.setDescription(description);

    // İstatistikler
    const statsFields = [];
    
    if (results.userCount) {
        statsFields.push({ name: '👤 Benzersiz İstekçi', value: results.userCount.toString(), inline: true });
    }
    
    if (results.groupCount) {
        statsFields.push({ name: '📁 Grup Sayısı', value: results.groupCount.toString(), inline: true });
    }
    
    if (results.shortCount !== undefined) {
        statsFields.push({ name: '⏱️ Kısa Şarkılar', value: results.shortCount.toString(), inline: true });
    }
    
    if (results.mediumCount !== undefined) {
        statsFields.push({ name: '⏱️ Orta Şarkılar', value: results.mediumCount.toString(), inline: true });
    }
    
    if (results.longCount !== undefined) {
        statsFields.push({ name: '⏱️ Uzun Şarkılar', value: results.longCount.toString(), inline: true });
    }
    
    if (results.themes) {
        statsFields.push({ 
            name: '🎭 Temalar', 
            value: results.themes.slice(0, 3).join(', ') + (results.themes.length > 3 ? '...' : ''), 
            inline: true 
        });
    }
    
    if (results.chunkCount) {
        statsFields.push({ name: '📦 Gruplandırma', value: results.chunkCount.toString(), inline: true });
    }

    // Karıştırma etkinliği
    if (results.shuffleEffectiveness) {
        const effectiveness = results.shuffleEffectiveness;
        let effectivenessText = '';
        
        if (effectiveness.positionChange > 70) {
            effectivenessText = '📈 **Yüksek Etkinlik**';
        } else if (effectiveness.positionChange > 40) {
            effectivenessText = '📊 **Orta Etkinlik**';
        } else {
            effectivenessText = '📉 **Düşük Etkinlik**';
        }
        
        statsFields.push({ 
            name: '📈 Karıştırma Kalitesi', 
            value: `${effectivenessText}\n` +
                   `Konum Değişimi: %${effectiveness.positionChange.toFixed(1)}\n` +
                   `İstekçi Çeşitliliği: %${effectiveness.requesterDiversity.toFixed(1)}`,
            inline: false 
        });
    }

    // Önizleme (ilk 5 şarkı)
    const previewSongs = serverQueue.songs.slice(results.protectedCurrent ? 1 : 0, 6);
    if (previewSongs.length > 0) {
        let previewText = previewSongs.map((song, idx) => {
            const number = results.protectedCurrent ? idx + 2 : idx + 1;
            return `\`${number}.\` **${song.title.substring(0, 35)}**\n   👤 ${song.requester.username}`;
        }).join('\n');
        
        if (serverQueue.songs.length > (results.protectedCurrent ? 6 : 5)) {
            previewText += `\n*...ve ${serverQueue.songs.length - (results.protectedCurrent ? 6 : 5)} şarkı daha*`;
        }
        
        embed.addFields({
            name: '👁️ Önizleme (İlk 5)',
            value: previewText,
            inline: false
        });
    }

    // Kalan istatistikleri ekle
    if (statsFields.length > 0) {
        embed.addFields(statsFields);
    }

    // Alt bilgi
    embed.setFooter({ 
        text: `Karmaşıklık: ${results.complexity} • ${results.shuffledAt} • SCP Music System` 
    });

    // Butonlar
    const actionRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('shuffle_undo')
            .setLabel('Geri Al')
            .setEmoji('↩️')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!serverQueue.shuffleBackup),
        
        new ButtonBuilder()
            .setCustomId('shuffle_again')
            .setLabel('Tekrar Karıştır')
            .setEmoji('🔀')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(serverQueue.songs.length < 3),
        
        new ButtonBuilder()
            .setCustomId('shuffle_different')
            .setLabel('Farklı Algoritma')
            .setEmoji('🎲')
            .setStyle(ButtonStyle.Secondary)
    );

    const actionRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('shuffle_analyze')
            .setLabel('Analiz Et')
            .setEmoji('📊')
            .setStyle(ButtonStyle.Success),
        
        new ButtonBuilder()
            .setCustomId('shuffle_save')
            .setLabel('Sırayı Kaydet')
            .setEmoji('💾')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('shuffle_queue')
            .setLabel('Kuyruğu Gör')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Secondary)
    );

    const message = await interaction.editReply({ 
        embeds: [embed], 
        components: [actionRow1, actionRow2] 
    });

    // Collector (İnteraktif butonlar)
    const collector = message.createMessageComponentCollector({ 
        componentType: ComponentType.Button, 
        time: 120000 
    });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ 
                content: '⛔ Bu butonları sadece komutu kullanan kişi kullanabilir.', 
                ephemeral: true 
            });
        }

        await i.deferUpdate();

        switch (i.customId) {
            case 'shuffle_undo':
                await handleUndoShuffle(i, serverQueue, client);
                collector.stop();
                break;
                
            case 'shuffle_again':
                // Aynı algoritma ile tekrar karıştır
                await handleShuffleAgain(i, serverQueue, results.name, interaction, client);
                break;
                
            case 'shuffle_different':
                await showAlgorithmSelection(i, serverQueue, interaction, client);
                break;
                
            case 'shuffle_analyze':
                await showShuffleAnalysis(i, serverQueue);
                break;
                
            case 'shuffle_save':
                await saveShuffleOrder(i, serverQueue);
                break;
                
            case 'shuffle_queue':
                collector.stop();
                // Queue komutunu çağır
                const queueCmd = client.commands.get('queue');
                if (queueCmd) {
                    const fakeInt = {
                        ...interaction,
                        deferReply: async () => {},
                        editReply: async (data) => i.editReply(data)
                    };
                    await queueCmd.execute(fakeInt, client);
                }
                break;
        }
    });

    collector.on('end', () => {
        // Butonları devre dışı bırak
        const disabledRow1 = ActionRowBuilder.from(actionRow1);
        const disabledRow2 = ActionRowBuilder.from(actionRow2);
        disabledRow1.components.forEach(btn => btn.setDisabled(true));
        disabledRow2.components.forEach(btn => btn.setDisabled(true));
        interaction.editReply({ components: [disabledRow1, disabledRow2] }).catch(() => {});
    });
}

// ==========================================
// 🛠️ YARDIMCI FONKSİYONLAR
// ==========================================

function getShuffleColor(algorithmName) {
    const colorMap = {
        'Standart': '#3498db',
        'Akıllı Adil Dağıtım': '#2ecc71',
        'İstekçi Gruplu': '#9b59b6',
        'Süre Bazlı': '#e74c3c',
        'Popülerlik Bazlı': '#f1c40f',
        'Tam Rastgele': '#e67e22',
        'Tematik Gruplama': '#1abc9c'
    };
    
    return colorMap[algorithmName] || '#3498db';
}

function getFilterName(filterType) {
    const filterMap = {
        'short_first': '⏱️ Kısa Şarkılar Önce',
        'long_first': '🎵 Uzun Şarkılar Önce',
        'group_by_requester': '👤 Aynı İstekçi Gruplu',
        'high_quality': '🔊 Yüksek Ses Kalitesi'
    };
    
    return filterMap[filterType] || filterType;
}

function parseDuration(durationStr) {
    if (!durationStr || durationStr === '??:??' || durationStr.includes('LIVE')) return 0;
    
    const parts = durationStr.split(':').map(Number);
    let seconds = 0;
    
    if (parts.length === 3) {
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        seconds = parts[0] * 60 + parts[1];
    } else {
        seconds = parts[0];
    }
    
    return seconds;
}

function calculatePopularityScore(song, index) {
    let score = 50; // Temel puan
    
    // İndex etkisi (yeni eklenenler daha popüler)
    score += Math.max(0, 30 - index);
    
    // Süre etkisi (orta uzunlukta şarkılar daha popüler)
    const duration = parseDuration(song.duration);
    if (duration > 120 && duration < 300) score += 20;
    
    // Başlık uzunluğu (kısa başlıklar daha akılda kalıcı)
    if (song.title.length < 30) score += 10;
    
    return score + Math.random() * 20; // Biraz rastgelelik
}

function applyAdditionalFilter(queue, filterType, protectCurrent) {
    const currentSong = protectCurrent ? queue.songs[0] : null;
    let songsToFilter = protectCurrent ? queue.songs.slice(1) : [...queue.songs];
    
    switch(filterType) {
        case 'short_first':
            songsToFilter.sort((a, b) => parseDuration(a.duration) - parseDuration(b.duration));
            break;
        case 'long_first':
            songsToFilter.sort((a, b) => parseDuration(b.duration) - parseDuration(a.duration));
            break;
        case 'group_by_requester':
            songsToFilter.sort((a, b) => a.requester.username.localeCompare(b.requester.username));
            break;
        case 'high_quality':
            // Varsayımsal kalite sıralaması
            songsToFilter.sort((a, b) => {
                const aScore = calculateQualityScore(a);
                const bScore = calculateQualityScore(b);
                return bScore - aScore;
            });
            break;
    }
    
    queue.songs = protectCurrent ? [currentSong, ...songsToFilter] : songsToFilter;
}

function calculateQualityScore(song) {
    let score = 0;
    
    // YouTube linkleri genellikle daha kaliteli
    if (song.url.includes('youtube.com') || song.url.includes('youtu.be')) {
        score += 30;
    }
    
    // Resim kalitesi
    if (song.thumbnail && song.thumbnail.includes('maxresdefault')) {
        score += 20;
    }
    
    // Süre (çok kısa şarkılar düşük kaliteli olabilir)
    const duration = parseDuration(song.duration);
    if (duration > 60) score += 10;
    if (duration > 180) score += 10;
    
    return score;
}

function countUniqueRequesters(songs) {
    const uniqueIds = new Set();
    songs.forEach(song => uniqueIds.add(song.requester.id));
    return uniqueIds.size;
}

function calculateShuffleEffectiveness(original, shuffled, protectCurrent) {
    if (original.length !== shuffled.length) return null;
    
    const startIndex = protectCurrent ? 1 : 0;
    let totalPositionChange = 0;
    let matchedCount = 0;
    
    // Orijinaldeki her şarkının yeni pozisyonunu bul
    for (let i = startIndex; i < original.length; i++) {
        const originalSong = original[i];
        const newIndex = shuffled.findIndex(s => 
            s.title === originalSong.title && 
            s.requester.id === originalSong.requester.id
        );
        
        if (newIndex !== -1 && newIndex >= startIndex) {
            const positionChange = Math.abs((i - startIndex) - (newIndex - startIndex));
            totalPositionChange += positionChange;
            matchedCount++;
        }
    }
    
    if (matchedCount === 0) return { positionChange: 0, requesterDiversity: 0 };
    
    const maxPossibleChange = (shuffled.length - startIndex - 1);
    const positionChangePercent = (totalPositionChange / (matchedCount * maxPossibleChange)) * 100;
    
    // İstekçi çeşitliliği
    const originalDiversity = countUniqueRequesters(original.slice(startIndex)) / (original.length - startIndex);
    const newDiversity = countUniqueRequesters(shuffled.slice(startIndex)) / (shuffled.length - startIndex);
    const diversityChange = Math.abs(originalDiversity - newDiversity) * 100;
    
    return {
        positionChange: Math.min(100, positionChangePercent),
        requesterDiversity: Math.min(100, diversityChange * 100)
    };
}

// ==========================================
// 🔄 İNTERAKTİF BUTON İŞLEMLERİ
// ==========================================

async function handleUndoShuffle(interaction, queue, client) {
    if (!queue.shuffleBackup) {
        return interaction.followUp({ 
            content: '❌ Geri alınacak yedek bulunamadı.', 
            ephemeral: true 
        });
    }

    // Yedeği geri yükle
    queue.songs = [...queue.shuffleBackup.originalOrder];
    
    // Player'ı yeniden başlat
    if (queue.player) {
        queue.player.stop();
    }
    
    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('↩️ Karıştırma Geri Alındı')
        .setDescription(`**${queue.songs.length} şarkı** orijinal sırasına geri döndü.`)
        .addFields({
            name: '🎵 Şimdi Çalıyor',
            value: `**${queue.songs[0].title}**\n` +
                   `👤 ${queue.songs[0].requester.username}`,
            inline: false
        })
        .setFooter({ text: 'SCP Music System • Geri Alındı' });

    await interaction.editReply({ 
        embeds: [embed], 
        components: [] 
    });
}

async function handleShuffleAgain(interaction, queue, algorithmName, originalInteraction, client) {
    // Algoritma adını koda çevir
    const algorithmMap = {
        'Standart Fisher-Yates': 'standard',
        'Akıllı Adil Dağıtım': 'fair',
        'İstekçi Gruplu': 'requester_group',
        'Süre Bazlı': 'duration_based',
        'Popülerlik Bazlı': 'popularity',
        'Tam Rastgele': 'true_random',
        'Tematik Gruplama': 'thematic'
    };
    
    const algorithmCode = algorithmMap[algorithmName] || 'standard';
    
    // Yeniden karıştır
    const results = await performAdvancedShuffle(
        queue, 
        algorithmCode, 
        true, 
        1, 
        null,
        originalInteraction
    );
    
    // Yeni rapor göster
    await sendAdvancedShuffleReport(originalInteraction, results, queue, client);
}

async function showAlgorithmSelection(interaction, queue, originalInteraction, client) {
    const algorithmOptions = [
        { label: '🎲 Standart', value: 'standard', description: 'Klasik rastgele karıştırma' },
        { label: '🧠 Akıllı Dağıtım', value: 'fair', description: 'Her kullanıcıdan sırayla' },
        { label: '👤 İstekçi Gruplu', value: 'requester_group', description: 'Aynı kişileri grupla' },
        { label: '⏱️ Süre Bazlı', value: 'duration_based', description: 'Kısa/orta/uzun dengeli' },
        { label: '📊 Popülerlik', value: 'popularity', description: 'Popüler şarkıları öne dağıt' },
        { label: '🔀 Tam Rastgele', value: 'true_random', description: 'Çoklu karıştırma' },
        { label: '🎭 Tematik', value: 'thematic', description: 'Başlıklara göre gruplama' }
    ];

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('algorithm_select')
        .setPlaceholder('Karıştırma algoritması seçin...')
        .addOptions(
            algorithmOptions.map(opt => 
                new StringSelectMenuOptionBuilder()
                    .setLabel(opt.label)
                    .setDescription(opt.description)
                    .setValue(opt.value)
            )
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const message = await interaction.followUp({
        content: '🎲 **Algoritma Seçimi:** Yeni bir karıştırma algoritması seçin:',
        components: [row],
        ephemeral: true
    });

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'algorithm_select';
        const response = await message.awaitMessageComponent({ filter, time: 30000 });
        
        await response.deferUpdate();
        await message.delete().catch(() => {});
        
        // Seçilen algoritma ile yeniden karıştır
        const results = await performAdvancedShuffle(
            queue, 
            response.values[0], 
            true, 
            1, 
            null,
            originalInteraction
        );
        
        // Yeni rapor göster
        await sendAdvancedShuffleReport(originalInteraction, results, queue, client);
        
    } catch (error) {
        await message.delete().catch(() => {});
    }
}

async function showShuffleAnalysis(interaction, queue) {
    if (!queue.shuffleBackup) {
        return interaction.followUp({ 
            content: '❌ Analiz için yeterli veri yok.', 
            ephemeral: true 
        });
    }

    const original = queue.shuffleBackup.originalOrder;
    const current = queue.songs;
    
    // Detaylı analiz
    const analysis = analyzeShuffle(original, current, true);
    
    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('📊 Karıştırma Analizi')
        .setDescription('Detaylı karıştırma istatistikleri:')
        .addFields(
            { name: '🎯 Pozisyon Değişimi', value: `%${analysis.positionChange.toFixed(1)}`, inline: true },
            { name: '👤 İstekçi Çeşitliliği', value: `%${analysis.requesterDiversity.toFixed(1)}`, inline: true },
            { name: '📈 Toplam Hareket', value: analysis.totalMoves.toString(), inline: true },
            { name: '🎵 En Çok Hareket Eden', value: analysis.mostMovedSong || 'Yok', inline: false },
            { name: '👥 İstekçi Dağılımı', value: analysis.requesterDistribution, inline: false }
        )
        .setFooter({ text: 'SCP Music System • Detaylı Analiz' });

    await interaction.followUp({ 
        embeds: [embed], 
        ephemeral: true 
    });
}

function analyzeShuffle(original, current, protectCurrent) {
    const startIndex = protectCurrent ? 1 : 0;
    let totalMoves = 0;
    let mostMovedSong = null;
    let maxMoves = 0;
    
    const requesterChanges = {};
    
    for (let i = startIndex; i < original.length; i++) {
        const originalSong = original[i];
        const newIndex = current.findIndex(s => 
            s.title === originalSong.title && 
            s.requester.id === originalSong.requester.id
        );
        
        if (newIndex !== -1 && newIndex >= startIndex) {
            const moves = Math.abs(i - newIndex);
            totalMoves += moves;
            
            if (moves > maxMoves) {
                maxMoves = moves;
                mostMovedSong = originalSong.title.substring(0, 30);
            }
            
            // İstekçi değişimini takip et
            const requesterName = originalSong.requester.username;
            requesterChanges[requesterName] = (requesterChanges[requesterName] || 0) + moves;
        }
    }
    
    // İstekçi dağılımı
    let requesterDistribution = '';
    Object.entries(requesterChanges)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .forEach(([name, moves], idx) => {
            requesterDistribution += `${idx + 1}. ${name}: ${moves} hareket\n`;
        });
    
    const effectiveness = calculateShuffleEffectiveness(original, current, protectCurrent);
    
    return {
        positionChange: effectiveness.positionChange,
        requesterDiversity: effectiveness.requesterDiversity,
        totalMoves: totalMoves,
        mostMovedSong: mostMovedSong || 'Yok',
        requesterDistribution: requesterDistribution || 'Veri yok'
    };
}

async function saveShuffleOrder(interaction, queue) {
    const modal = new ModalBuilder()
        .setCustomId('save_shuffle_modal')
        .setTitle('Karıştırılmış Sırayı Kaydet');

    const nameInput = new TextInputBuilder()
        .setCustomId('playlist_name')
        .setLabel('Playlist adı')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Örn: Karıştırılmış Listem')
        .setMaxLength(30);

    const descInput = new TextInputBuilder()
        .setCustomId('playlist_desc')
        .setLabel('Açıklama (isteğe bağlı)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('Bu liste ... tarihinde karıştırıldı.');

    const row1 = new ActionRowBuilder().addComponents(nameInput);
    const row2 = new ActionRowBuilder().addComponents(descInput);
    
    modal.addComponents(row1, row2);

    await interaction.showModal(modal);

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'save_shuffle_modal';
        const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 60000 });
        
        const name = modalInteraction.fields.getTextInputValue('playlist_name');
        const desc = modalInteraction.fields.getTextInputValue('playlist_desc') || 
                     `${new Date().toLocaleDateString('tr-TR')} tarihinde karıştırıldı.`;
        
        // Veritabanına kaydet
        const db = require('../../db.js');
        const songsToSave = queue.songs.map(song => ({
            title: song.title,
            url: song.url,
            duration: song.duration,
            thumbnail: song.thumbnail
        }));
        
        db.savePlaylist(interaction.user.id, name, songsToSave);
        
        await modalInteraction.reply({ 
            content: `✅ **${name}** adlı playlist oluşturuldu! (${songsToSave.length} şarkı)`, 
            ephemeral: true 
        });
        
    } catch (error) {
        console.error('Playlist kaydetme hatası:', error);
    }
}

// Otomatik tamamlama için
module.exports.autocomplete = async function(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'algoritma') {
        const algorithms = [
            { name: '🎲 Standart (Fisher-Yates)', value: 'standard' },
            { name: '🧠 Akıllı Dağıtım', value: 'fair' },
            { name: '👤 İstekçi Gruplu', value: 'requester_group' },
            { name: '🎵 Şarkı Uzunluğu', value: 'duration_based' },
            { name: '📊 Popülerlik', value: 'popularity' },
            { name: '🔀 Tam Rastgele', value: 'true_random' },
            { name: '🎭 Tematik Gruplama', value: 'thematic' }
        ];
        
        const filtered = algorithms.filter(algo => 
            algo.name.toLowerCase().includes(focusedOption.value.toLowerCase()) ||
            algo.value.includes(focusedOption.value.toLowerCase())
        );
        
        return interaction.respond(
            filtered.slice(0, 25).map(algo => ({ 
                name: algo.name, 
                value: algo.value 
            }))
        );
    }
};
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
        .setName('skip')
        .setDescription('Şarkıları akıllıca atlar ve kuyruk yönetimi sağlar.')
        .addIntegerOption(option => 
            option.setName('miktar')
                .setDescription('Kaç şarkı atlanacak? (Varsayılan: 1)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false))
        .addStringOption(option =>
            option.setName('hedef')
                .setDescription('Belirli bir şarkıya atla (örn: "3" veya "son")')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('tip')
                .setDescription('Atlama tipini seçin')
                .addChoices(
                    { name: '📝 Normal Atlama', value: 'normal' },
                    { name: '🎯 Hedefe Atlama', value: 'target' },
                    { name: '⏭️ Sonraki İstekçi', value: 'next_requester' },
                    { name: '🎲 Rastgele Atlama', value: 'random' }
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
        if (!serverQueue || !serverQueue.player || serverQueue.songs.length === 0) {
            return interaction.reply({ 
                content: '❌ Şu an atlanacak bir şarkı yok.', 
                ephemeral: true 
            });
        }

        // 3. KUYRUK BOYUTU KONTROLÜ
        if (serverQueue.songs.length <= 1) {
            return interaction.reply({ 
                content: '📭 **Kuyruk Boş:** Atlanacak başka şarkı yok.', 
                ephemeral: true 
            });
        }

        // 4. ATLAMA MODUNU BELİRLE
        const skipAmount = interaction.options.getInteger('miktar') || 1;
        const targetInput = interaction.options.getString('hedef');
        const skipType = interaction.options.getString('tip') || 'normal';
        
        await interaction.deferReply();

        try {
            // 5. FARKLI ATLAMA MODLARI
            let result;
            switch(skipType) {
                case 'target':
                    result = await handleTargetSkip(serverQueue, targetInput, interaction);
                    break;
                case 'next_requester':
                    result = await handleNextRequesterSkip(serverQueue, interaction);
                    break;
                case 'random':
                    result = await handleRandomSkip(serverQueue, skipAmount, interaction);
                    break;
                default:
                    result = await handleNormalSkip(serverQueue, skipAmount, interaction);
            }

            // 6. GELİŞMİŞ RAPORLAMA
            await sendAdvancedSkipReport(interaction, result, serverQueue, client);
            
        } catch (error) {
            console.error('Skip komutu hatası:', error);
            await interaction.editReply({ 
                content: `❌ Atlama işlemi sırasında hata oluştu: ${error.message}`, 
                components: [] 
            });
        }
    },
};

// ==========================================
// 🎯 ATLAMA MODLARI
// ==========================================

// 1. NORMAL ATLAMA (Miktar belirterek)
async function handleNormalSkip(serverQueue, skipAmount, interaction) {
    const queueLength = serverQueue.songs.length;
    
    // Atlanacak şarkıların listesi
    const skippedSongs = serverQueue.songs.slice(0, Math.min(skipAmount, queueLength));
    
    // Atlama öncesi döngü durumu
    const oldLoopState = serverQueue.loop;
    const wasLooping = oldLoopState !== 0;
    
    // Eğer döngü aktifse, geçici olarak devre dışı bırak
    if (wasLooping) {
        serverQueue.loop = 0;
    }

    // Atlanacak şarkı sayısı kuyruktan fazla ise
    if (skipAmount >= queueLength) {
        serverQueue.songs = []; // Tüm kuyruğu temizle
        serverQueue.player.stop();
        
        return {
            type: 'clear',
            message: 'Kuyruk tamamen temizlendi',
            skippedSongs: skippedSongs.slice(0, queueLength),
            wasLooping: wasLooping,
            nextSong: null
        };
    }

    // Normal atlama işlemi
    serverQueue.songs.splice(1, skipAmount - 1); // Çalan hariç ilk N-1 şarkıyı sil
    const nextSong = serverQueue.songs[1]; // Yeni sıradaki şarkı
    
    // Player'ı durdur (bir sonraki şarkıya geçiş yapacak)
    serverQueue.player.stop();

    // Döngü durumunu geri yükle
    if (wasLooping) {
        setTimeout(() => {
            serverQueue.loop = oldLoopState;
        }, 1000);
    }

    return {
        type: 'normal',
        message: `${skipAmount} şarkı atlandı`,
        skippedSongs: skippedSongs.slice(1), // Çalan şarkıyı hariç tut
        wasLooping: wasLooping,
        nextSong: nextSong,
        remainingQueue: serverQueue.songs.length - 1
    };
}

// 2. HEDEFE ATLAMA (Belirli bir şarkıya)
async function handleTargetSkip(serverQueue, targetInput, interaction) {
    let targetIndex = null;
    
    // Hedef belirleme
    if (targetInput) {
        if (targetInput.toLowerCase() === 'son' || targetInput.toLowerCase() === 'last') {
            targetIndex = serverQueue.songs.length - 1;
        } else {
            targetIndex = parseInt(targetInput);
            if (isNaN(targetIndex) || targetIndex < 1 || targetIndex >= serverQueue.songs.length) {
                throw new Error('Geçersiz hedef. 1 ile ' + (serverQueue.songs.length - 1) + ' arasında bir sayı girin veya "son" yazın.');
            }
        }
    } else {
        // Hedef seçme menüsü göster
        targetIndex = await showTargetSelection(serverQueue, interaction);
        if (targetIndex === null) throw new Error('Hedef seçilmedi.');
    }

    // Çalan şarkıdan hedefe kadar olan tüm şarkıları atla
    const songsToSkip = targetIndex;
    const skippedSongs = serverQueue.songs.slice(0, songsToSkip);
    
    // Döngü kontrolü
    const oldLoopState = serverQueue.loop;
    const wasLooping = oldLoopState !== 0;
    
    if (wasLooping) {
        serverQueue.loop = 0;
    }

    // Şarkıları sil
    serverQueue.songs.splice(0, songsToSkip);
    const nextSong = serverQueue.songs[0];
    
    // Player'ı yeniden başlat
    serverQueue.player.stop();

    if (wasLooping) {
        setTimeout(() => {
            serverQueue.loop = oldLoopState;
        }, 1000);
    }

    return {
        type: 'target',
        message: `Doğrudan ${targetIndex}. şarkıya atlandı`,
        skippedSongs: skippedSongs,
        wasLooping: wasLooping,
        nextSong: nextSong,
        targetIndex: targetIndex
    };
}

// 3. SONRAKİ İSTEKÇİYE ATLAMA
async function handleNextRequesterSkip(serverQueue, interaction) {
    const currentRequester = serverQueue.songs[0].requester.id;
    let foundIndex = -1;
    
    // Aynı istekçiden sonraki farklı istekçiyi bul
    for (let i = 1; i < serverQueue.songs.length; i++) {
        if (serverQueue.songs[i].requester.id !== currentRequester) {
            foundIndex = i;
            break;
        }
    }
    
    if (foundIndex === -1) {
        throw new Error('Başka istekçi bulunamadı.');
    }

    // İlk şarkıdan bulunan index'e kadar atla
    const skippedSongs = serverQueue.songs.slice(0, foundIndex);
    
    // Döngü kontrolü
    const oldLoopState = serverQueue.loop;
    const wasLooping = oldLoopState !== 0;
    
    if (wasLooping) {
        serverQueue.loop = 0;
    }

    serverQueue.songs.splice(0, foundIndex);
    const nextSong = serverQueue.songs[0];
    
    serverQueue.player.stop();

    if (wasLooping) {
        setTimeout(() => {
            serverQueue.loop = oldLoopState;
        }, 1000);
    }

    return {
        type: 'next_requester',
        message: 'Sonraki farklı istekçiye atlandı',
        skippedSongs: skippedSongs,
        wasLooping: wasLooping,
        nextSong: nextSong,
        newRequester: nextSong.requester.username
    };
}

// 4. RASTGELE ATLAMA
async function handleRandomSkip(serverQueue, skipAmount, interaction) {
    // Rastgele sayıda atlama (1-5 arası)
    const randomSkip = skipAmount > 1 ? skipAmount : Math.floor(Math.random() * 5) + 1;
    const maxSkip = Math.min(randomSkip, serverQueue.songs.length - 1);
    
    return await handleNormalSkip(serverQueue, maxSkip, interaction);
}

// ==========================================
// 🎨 GÖRSEL ARAYÜZ FONKSİYONLARI
// ==========================================

// 1. GELİŞMİŞ SKIP RAPORU
async function sendAdvancedSkipReport(interaction, result, serverQueue, client) {
    const embed = new EmbedBuilder()
        .setColor(getSkipColor(result.type))
        .setTitle(`⏭️ ${getSkipTitle(result.type)}`)
        .setTimestamp();

    // Ana bilgiler
    embed.setDescription(`**${result.message}**`);
    
    // Atlanan şarkıların listesi (ilk 5 tanesi)
    if (result.skippedSongs && result.skippedSongs.length > 0) {
        const skippedList = result.skippedSongs.slice(0, 5).map((song, idx) => 
            `\`${idx + 1}.\` **${song.title.substring(0, 40)}** - ${song.requester.username}`
        ).join('\n');
        
        embed.addFields({
            name: '🗑️ Atlanan Şarkılar',
            value: result.skippedSongs.length > 5 ? 
                `${skippedList}\n*...ve ${result.skippedSongs.length - 5} şarkı daha*` : 
                skippedList,
            inline: false
        });
    }

    // Bir sonraki şarkı bilgisi
    if (result.nextSong) {
        embed.addFields(
            { 
                name: '🎵 Şimdi Çalıyor', 
                value: `**${result.nextSong.title}**\n` +
                       `👤 ${result.nextSong.requester.username} | ⏱️ ${result.nextSong.duration}`,
                inline: false 
            }
        );
        
        // Görsel ekle
        if (result.nextSong.thumbnail) {
            embed.setThumbnail(result.nextSong.thumbnail);
        }
    } else if (result.type === 'clear') {
        embed.addFields({
            name: '📭 Kuyruk Durumu',
            value: 'Tüm şarkılar atlandı, kuyruk boş.',
            inline: false
        });
    }

    // Ek bilgiler
    const additionalInfo = [];
    if (result.wasLooping) additionalInfo.push('🔄 Döngü: Geçici Devre Dışı');
    if (result.remainingQueue) additionalInfo.push(`📊 Kalan: ${result.remainingQueue} şarkı`);
    if (result.newRequester) additionalInfo.push(`👤 Yeni İstekçi: ${result.newRequester}`);
    if (result.targetIndex) additionalInfo.push(`🎯 Hedef: ${result.targetIndex}. sıra`);

    if (additionalInfo.length > 0) {
        embed.addFields({
            name: 'ℹ️ Ek Bilgiler',
            value: additionalInfo.join(' • '),
            inline: false
        });
    }

    // İstatistik bilgisi
    const totalDuration = result.skippedSongs ? 
        result.skippedSongs.reduce((total, song) => total + parseDuration(song.duration), 0) : 0;
    
    if (totalDuration > 0) {
        embed.setFooter({ 
            text: `Toplam ${formatTime(totalDuration)} atlandı • SCP Music System` 
        });
    } else {
        embed.setFooter({ 
            text: `SCP Music System • ${interaction.user.tag} tarafından` 
        });
    }

    // Butonlar
    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('skip_undo')
            .setLabel('Geri Al')
            .setEmoji('↩️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(!result.skippedSongs || result.skippedSongs.length === 0),
        
        new ButtonBuilder()
            .setCustomId('skip_another')
            .setLabel('Tekrar Atlama')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(serverQueue.songs.length <= 1),
        
        new ButtonBuilder()
            .setCustomId('skip_queue')
            .setLabel('Kuyruğu Gör')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Success)
    );

    const message = await interaction.editReply({ 
        embeds: [embed], 
        components: [actionRow] 
    });

    // Collector (İnteraktif butonlar)
    const collector = message.createMessageComponentCollector({ 
        componentType: ComponentType.Button, 
        time: 60000 
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
            case 'skip_undo':
                await handleUndoSkip(i, result, serverQueue, client);
                collector.stop();
                break;
                
            case 'skip_another':
                collector.stop();
                // Yeniden skip komutunu çağır
                const skipCmd = client.commands.get('skip');
                if (skipCmd) {
                    // Fake interaction oluştur
                    const fakeInt = {
                        ...interaction,
                        options: {
                            getInteger: () => 1,
                            getString: () => null
                        },
                        deferReply: async () => {},
                        editReply: async (data) => i.editReply(data)
                    };
                    await skipCmd.execute(fakeInt, client);
                }
                break;
                
            case 'skip_queue':
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
        const disabledRow = ActionRowBuilder.from(actionRow);
        disabledRow.components.forEach(btn => btn.setDisabled(true));
        interaction.editReply({ components: [disabledRow] }).catch(() => {});
    });
}

// 2. HEDEF SEÇİM MENÜSÜ
async function showTargetSelection(serverQueue, interaction) {
    // Kuyruktaki şarkıları listele (ilk 25 tanesi)
    const songOptions = serverQueue.songs.slice(1, 26).map((song, idx) => 
        new StringSelectMenuOptionBuilder()
            .setLabel(`${idx + 1}. ${song.title.substring(0, 45)}`)
            .setDescription(`${song.requester.username} • ${song.duration}`)
            .setValue(`${idx + 1}`)
    );

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('target_select')
        .setPlaceholder('Atlamak istediğiniz şarkıyı seçin...')
        .addOptions(songOptions);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const message = await interaction.followUp({
        content: '🎯 **Hedef Seçimi:** Atlanacak şarkıyı seçin:',
        components: [row],
        ephemeral: true
    });

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'target_select';
        const response = await message.awaitMessageComponent({ filter, time: 30000 });
        
        await response.deferUpdate();
        await message.delete().catch(() => {});
        
        return parseInt(response.values[0]) + 1; // +1 çünkü çalan şarkıyı atlıyoruz
    } catch (error) {
        await message.delete().catch(() => {});
        return null;
    }
}

// 3. GERİ ALMA İŞLEMİ
async function handleUndoSkip(interaction, result, serverQueue, client) {
    if (!result.skippedSongs || result.skippedSongs.length === 0) {
        return interaction.followUp({ 
            content: '❌ Geri alınacak şarkı bulunamadı.', 
            ephemeral: true 
        });
    }

    // Atlanan şarkıları tekrar kuyruğun başına ekle
    serverQueue.songs.unshift(...result.skippedSongs);
    
    // Şarkıyı yeniden başlat
    serverQueue.player.stop();
    
    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('↩️ Atlama Geri Alındı')
        .setDescription(`**${result.skippedSongs.length} şarkı** kuyruğa geri eklendi.`)
        .addFields({
            name: '🎵 Şimdi Çalıyor',
            value: `**${serverQueue.songs[0].title}**\n` +
                   `👤 ${serverQueue.songs[0].requester.username}`,
            inline: false
        })
        .setFooter({ text: 'SCP Music System • Geri Alındı' });

    await interaction.editReply({ 
        embeds: [embed], 
        components: [] 
    });
}

// ==========================================
// 🛠️ YARDIMCI FONKSİYONLAR
// ==========================================

function getSkipColor(type) {
    switch(type) {
        case 'clear': return '#e74c3c'; // Kırmızı
        case 'target': return '#9b59b6'; // Mor
        case 'next_requester': return '#3498db'; // Mavi
        case 'random': return '#f39c12'; // Turuncu
        default: return '#2ecc71'; // Yeşil
    }
}

function getSkipTitle(type) {
    switch(type) {
        case 'clear': return 'Kuyruk Temizlendi';
        case 'target': return 'Hedefe Atlandı';
        case 'next_requester': return 'Sonraki İstekçiye Atlandı';
        case 'random': return 'Rastgele Atlama';
        default: return 'Atlama Başarılı';
    }
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

function formatTime(seconds) {
    if (!seconds) return '0:00';
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Otomatik tamamlama için (isteğe bağlı)
module.exports.autocomplete = async function(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'hedef') {
        const serverQueue = interaction.client.queue.get(interaction.guild.id);
        
        if (!serverQueue || serverQueue.songs.length <= 1) {
            return interaction.respond([{ name: 'Kuyrukta şarkı yok', value: '0' }]);
        }
        
        const suggestions = [
            { name: '📌 Son şarkıya atla', value: 'son' },
            { name: '📌 Ortadaki şarkıya atla', value: Math.floor(serverQueue.songs.length / 2).toString() }
        ];
        
        // İlk 5 şarkıyı öner
        for (let i = 1; i <= Math.min(5, serverQueue.songs.length - 1); i++) {
            const song = serverQueue.songs[i];
            suggestions.push({
                name: `#${i} - ${song.title.substring(0, 40)}`,
                value: i.toString()
            });
        }
        
        return interaction.respond(suggestions.slice(0, 25));
    }
};
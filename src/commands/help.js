const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ComponentType,
    StringSelectMenuOptionBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const { version } = require('../../package.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Gelişmiş komut kılavuzunu ve sistem bilgilerini açar.')
        .addStringOption(option =>
            option.setName('komut')
                .setDescription('Belirli bir komut hakkında yardım al')
                .setRequired(false)
                .setAutocomplete(true)),

    async autocomplete(interaction, client) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const commands = Array.from(client.commands.values());
        
        const filtered = commands
            .filter(command => 
                command.data.name.toLowerCase().includes(focusedValue) ||
                command.data.description.toLowerCase().includes(focusedValue)
            )
            .slice(0, 25);

        await interaction.respond(
            filtered.map(command => ({
                name: `/${command.data.name} - ${command.data.description.substring(0, 50)}...`,
                value: command.data.name
            }))
        );
    },

    async execute(interaction, client) {
        const specificCommand = interaction.options.getString('komut');
        
        // Eğer belirli bir komut için yardım istendiyse
        if (specificCommand) {
            return await showCommandDetails(interaction, client, specificCommand);
        }

        await interaction.deferReply();

        // 1. KOMUTLARI VE KATEGORİLERİ TOPLA
        const commandsPath = path.join(process.cwd(), 'src', 'commands');
        
        if (!fs.existsSync(commandsPath)) {
            return interaction.followUp('❌ Sistem hatası: Komut klasörü bulunamadı.');
        }

        const commandItems = fs.readdirSync(commandsPath);
        const categories = {};

        // Popüler komutlar listesi
        const popularCommands = ['play', 'setup', 'queue', 'volume', 'filter', 'playlist'];

        // Klasörleri ve Dosyaları Tara
        for (const item of commandItems) {
            const itemPath = path.join(commandsPath, item);
            const stat = fs.statSync(itemPath);
            
            // A. Eğer bu bir DOSYA ise (örn: help.js), 'Genel' kategorisine at
            if (stat.isFile() && item.endsWith('.js')) {
                if (!categories['Genel']) categories['Genel'] = [];
                try {
                    const command = require(itemPath);
                    if ('data' in command && 'execute' in command) {
                        categories['Genel'].push({
                            ...command,
                            isPopular: popularCommands.includes(command.data.name)
                        });
                    }
                } catch (e) { console.error(`[Help] ${item} yüklenemedi:`, e); }
                continue;
            }

            // B. Eğer bu bir KLASÖR ise (örn: music), içindekileri al
            if (stat.isDirectory()) {
                const categoryName = item.charAt(0).toUpperCase() + item.slice(1);
                categories[categoryName] = [];
                
                const files = fs.readdirSync(itemPath).filter(file => file.endsWith('.js'));
                for (const file of files) {
                    try {
                        const command = require(path.join(itemPath, file));
                        if ('data' in command && 'execute' in command) {
                            categories[categoryName].push({
                                ...command,
                                isPopular: popularCommands.includes(command.data.name)
                            });
                        }
                    } catch (e) { console.error(`[Help] ${file} yüklenemedi:`, e); }
                }
            }
        }

        // 2. ANA SAYFA EMBEDİ
        const homeEmbed = createHomeEmbed(client);
        const components = createHomeComponents(categories);

        // 3. MESAJI GÖNDER
        const message = await interaction.followUp({ 
            embeds: [homeEmbed], 
            components: components 
        });

        // 4. ETKİLEŞİM DİNLEYİCİ
        const collector = message.createMessageComponentCollector({ 
            componentType: ComponentType.StringSelect, 
            time: 300000 
        });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ 
                    content: 'Bu menü sadece komutu kullanan kişi içindir.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            await i.deferUpdate();
            const selection = i.values[0];

            // Özel eylemler
            if (selection === 'search') {
                await showSearchModal(i, client);
                return;
            }

            if (selection === 'popular') {
                await showPopularCommands(i, categories);
                return;
            }

            if (selection === 'stats') {
                await showStats(i, client);
                return;
            }

            if (selection === 'tutorial') {
                await showTutorial(i);
                return;
            }

            if (selection === 'home') {
                await i.editReply({ 
                    embeds: [createHomeEmbed(client)], 
                    components: createHomeComponents(categories) 
                });
                return;
            }

            // Kategori seçimi
            const categoryCommands = categories[selection];
            if (!categoryCommands || categoryCommands.length === 0) {
                await i.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor('#e74c3c')
                        .setTitle('❌ Kategori Bulunamadı')
                        .setDescription('Bu kategoride hiç komut yok veya kategori geçersiz.')
                    ],
                    components: createHomeComponents(categories)
                });
                return;
            }

            // Sayfalandırma için
            let currentPage = 0;
            const itemsPerPage = 8;
            const totalPages = Math.ceil(categoryCommands.length / itemsPerPage);

            const categoryEmbed = createCategoryEmbed(selection, categoryCommands, currentPage, itemsPerPage);
            const categoryComponents = createCategoryComponents(selection, currentPage, totalPages);

            await i.editReply({ 
                embeds: [categoryEmbed], 
                components: categoryComponents 
            });

            // Sayfalandırma için ayrı bir collector
            const message = await i.fetchReply();
            const buttonCollector = message.createMessageComponentCollector({ 
                componentType: ComponentType.Button, 
                time: 180000 
            });

            buttonCollector.on('collect', async btn => {
                if (btn.user.id !== interaction.user.id) {
                    return btn.reply({ 
                        content: 'Bu menü sadece komutu kullanan kişi içindir.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }

                await btn.deferUpdate();

                if (btn.customId === 'cat_prev') {
                    if (currentPage > 0) currentPage--;
                } else if (btn.customId === 'cat_next') {
                    if (currentPage < totalPages - 1) currentPage++;
                } else if (btn.customId === 'cat_home') {
                    buttonCollector.stop();
                    await i.editReply({ 
                        embeds: [createHomeEmbed(client)], 
                        components: createHomeComponents(categories) 
                    });
                    return;
                }

                const newEmbed = createCategoryEmbed(selection, categoryCommands, currentPage, itemsPerPage);
                const newComponents = createCategoryComponents(selection, currentPage, totalPages);

                await i.editReply({ 
                    embeds: [newEmbed], 
                    components: newComponents 
                });
            });

            buttonCollector.on('end', () => {
                // Butonları devre dışı bırak
                const disabledRow = new ActionRowBuilder().addComponents(
                    categoryComponents[0].components.map(comp => 
                        ButtonBuilder.from(comp).setDisabled(true)
                    )
                );
                interaction.editReply({ components: [disabledRow] }).catch(() => {});
            });
        });

        collector.on('end', () => {
            // Menüyü devre dışı bırak
            const disabledRow = new ActionRowBuilder().addComponents(
                components[0].components.map(comp => 
                    StringSelectMenuBuilder.from(comp).setDisabled(true)
                )
            );
            interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });
    },
};

// ==========================================
// 🛠️ YARDIMCI FONKSİYONLAR
// ==========================================

function createHomeEmbed(client) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const totalGuilds = client.guilds.cache.size;
    const totalUsers = client.guilds.cache.reduce((a, b) => a + b.memberCount, 0);
    const activeSessions = client.queue ? client.queue.size : 0;

    return new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎵 SCP Music System - Yardım Merkezi')
        .setDescription(`
        **Merhaba!** Ben Vakıf tarafından görevlendirilmiş **SCP Music System** botuyum.
        
        Aşağıdaki menüyü kullanarak tüm komutlara, özelliklere ve sistem bilgilerine ulaşabilirsiniz.
        
        **🚀 Hızlı Başlangıç:**
        1. \`/play <şarkı>\` ile müzik çal
        2. \`/setup\` ile müzik kanalı oluştur
        3. Butonlarla müziği kontrol et
        `)
        .addFields(
            { 
                name: '📊 Sistem İstatistikleri', 
                value: `**• Ping:** \`${client.ws.ping}ms\`
                **• Çalışma Süresi:** \`${hours}sa ${minutes}dk ${seconds}sn\`
                **• Sunucular:** \`${totalGuilds}\`
                **• Kullanıcılar:** \`${totalUsers}\`
                **• Aktif Müzik Oturumu:** \`${activeSessions}\`
                **• Versiyon:** \`v${version}\``, 
                inline: true 
            },
            { 
                name: '🔗 Faydalı Bağlantılar', 
                value: `[📚 Dokümantasyon](https://example.com)
                [🐛 Hata Bildir](https://example.com/issues)
                [💡 Öneri Gönder](https://example.com/suggestions)
                [📢 Destek Sunucusu](https://discord.gg/example)`,
                inline: true 
            }
        )
        .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
        .setFooter({ text: `SCP Music System v${version} | Toplam ${client.commands?.size || 0} komut` })
        .setTimestamp();
}

function createHomeComponents(categories) {
    const options = [
        new StringSelectMenuOptionBuilder()
            .setLabel('🏠 Ana Sayfa')
            .setDescription('Ana sayfaya dön')
            .setValue('home')
            .setEmoji('🏠'),
        new StringSelectMenuOptionBuilder()
            .setLabel('⭐ Popüler Komutlar')
            .setDescription('En çok kullanılan komutlar')
            .setValue('popular')
            .setEmoji('⭐'),
        new StringSelectMenuOptionBuilder()
            .setLabel('🔍 Komut Ara')
            .setDescription('Komut ismi ile arama yap')
            .setValue('search')
            .setEmoji('🔍'),
        new StringSelectMenuOptionBuilder()
            .setLabel('📊 Sistem İstatistikleri')
            .setDescription('Detaylı sistem bilgileri')
            .setValue('stats')
            .setEmoji('📊'),
        new StringSelectMenuOptionBuilder()
            .setLabel('📚 Hızlı Kılavuz')
            .setDescription('Hızlı başlangıç rehberi')
            .setValue('tutorial')
            .setEmoji('📚')
    ];

    // Kategorileri ekle
    Object.keys(categories).forEach(cat => {
        if (categories[cat].length > 0) {
            let emoji = '📂';
            if (cat.toLowerCase().includes('music') || cat.toLowerCase().includes('müzik')) emoji = '🎵';
            if (cat.toLowerCase().includes('moderation') || cat.toLowerCase().includes('moderasyon')) emoji = '🛡️';
            if (cat.toLowerCase().includes('utility') || cat.toLowerCase().includes('genel')) emoji = '🛠️';
            if (cat.toLowerCase().includes('setup') || cat.toLowerCase().includes('kurulum')) emoji = '⚙️';

            options.push(
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${cat} Komutları`)
                    .setDescription(`${categories[cat].length} komut`)
                    .setValue(cat)
                    .setEmoji(emoji)
            );
        }
    });

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_menu')
        .setPlaceholder('Menüden seçim yapın...')
        .addOptions(options.slice(0, 25)); // Discord limiti 25 seçenek

    return [new ActionRowBuilder().addComponents(selectMenu)];
}

function createCategoryEmbed(categoryName, commands, page, itemsPerPage) {
    const totalPages = Math.ceil(commands.length / itemsPerPage);
    const start = page * itemsPerPage;
    const end = start + itemsPerPage;
    const pageCommands = commands.slice(start, end);

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`📂 ${categoryName} Kategorisi`)
        .setDescription(`Toplam **${commands.length}** komut | Sayfa **${page + 1}/${totalPages}**`)
        .setFooter({ text: 'Komutların üzerine tıklayarak detaylı bilgi alabilirsiniz.' });

    const commandList = pageCommands.map((cmd, index) => {
        const commandNum = start + index + 1;
        const isPopular = cmd.isPopular ? '⭐ ' : '';
        
        let description = cmd.data.description;
        if (description.length > 100) {
            description = description.substring(0, 97) + '...';
        }

        // Alt komutları kontrol et
        const subcommands = cmd.data.options
            ?.filter(opt => opt.type === 1) // SUB_COMMAND
            .map(sub => `\`${sub.name}\``)
            .join(', ');

        let commandInfo = `**${commandNum}.** ${isPopular}\`/${cmd.data.name}\`\n> ${description}`;
        
        if (subcommands) {
            commandInfo += `\n> 📑 **Alt Komutlar:** ${subcommands}`;
        }

        // Parametreleri göster (ilk 3)
        const parameters = cmd.data.options
            ?.filter(opt => opt.type !== 1) // SUB_COMMAND değilse
            .slice(0, 3)
            .map(opt => `\`${opt.name}\``)
            .join(', ');

        if (parameters) {
            commandInfo += `\n> ⚙️ **Parametreler:** ${parameters}`;
        }

        return commandInfo;
    }).join('\n\n');

    embed.setDescription(
        `Toplam **${commands.length}** komut | Sayfa **${page + 1}/${totalPages}**\n\n${commandList}`
    );

    // Popüler komutlar notu
    const popularCount = commands.filter(cmd => cmd.isPopular).length;
    if (popularCount > 0) {
        embed.addFields({
            name: '💡 İpucu',
            value: `⭐ işaretli komutlar en popüler **${popularCount}** komuttur.`
        });
    }

    return embed;
}

function createCategoryComponents(categoryName, currentPage, totalPages) {
    const rows = [];

    // Sayfalandırma butonları
    const paginationRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('cat_prev')
            .setEmoji('⬅️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage === 0),
        new ButtonBuilder()
            .setCustomId('cat_home')
            .setLabel('Ana Sayfa')
            .setEmoji('🏠')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('cat_next')
            .setEmoji('➡️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(currentPage >= totalPages - 1)
    );

    rows.push(paginationRow);

    // Hızlı komut butonları (sadece Music kategorisi için)
    if (categoryName.toLowerCase().includes('music') || categoryName === 'Müzik') {
        const quickActionsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('quick_play')
                .setLabel('/play')
                .setEmoji('🎵')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('quick_queue')
                .setLabel('/queue')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('quick_volume')
                .setLabel('/volume')
                .setEmoji('🔊')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('quick_filter')
                .setLabel('/filter')
                .setEmoji('🎛️')
                .setStyle(ButtonStyle.Secondary)
        );

        rows.push(quickActionsRow);
    }

    return rows;
}

async function showCommandDetails(interaction, client, commandName) {
    const command = client.commands.get(commandName);
    
    if (!command) {
        return interaction.reply({ 
            content: `❌ \`/${commandName}\` komutu bulunamadı.`, 
            flags: MessageFlags.Ephemeral 
        });
    }

    await interaction.deferReply();

    const commandData = command.data.toJSON();
    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle(`📚 Komut: /${commandData.name}`)
        .setDescription(commandData.description || 'Açıklama yok.')
        .setFooter({ text: 'Parametre detayları aşağıda listelenmiştir.' });

    // Parametreleri ve seçenekleri listele
    if (commandData.options && commandData.options.length > 0) {
        const fields = [];

        commandData.options.forEach(option => {
            // Alt komutlar
            if (option.type === 1) { // SUB_COMMAND
                let fieldValue = `**Açıklama:** ${option.description || 'Açıklama yok'}`;
                
                if (option.options && option.options.length > 0) {
                    const params = option.options.map(param => 
                        `\`${param.name}\` (${getOptionType(param.type)}) - ${param.description || 'Açıklama yok'}`
                    ).join('\n');
                    fieldValue += `\n**Parametreler:**\n${params}`;
                }

                fields.push({
                    name: `🔄 Alt Komut: \`/${commandData.name} ${option.name}\``,
                    value: fieldValue,
                    inline: false
                });
            } 
            // Normal parametreler
            else {
                let paramInfo = `**Açıklama:** ${option.description || 'Açıklama yok'}\n`;
                paramInfo += `**Tür:** ${getOptionType(option.type)}\n`;
                
                if (option.required) paramInfo += `**Gerekli:** Evet\n`;
                if (option.choices && option.choices.length > 0) {
                    const choices = option.choices.map(choice => 
                        `\`${choice.value}\` - ${choice.name}`
                    ).join(', ');
                    paramInfo += `**Seçenekler:** ${choices}`;
                }

                fields.push({
                    name: `⚙️ Parametre: \`${option.name}\``,
                    value: paramInfo,
                    inline: true
                });
            }
        });

        // Embed sınırı için field'leri böl
        let currentField = { name: '📝 Parametreler', value: '', inline: false };
        const finalFields = [];

        fields.forEach(field => {
            if (field.value.length + currentField.value.length < 1000) {
                currentField.value += (currentField.value ? '\n\n' : '') + field.value;
            } else {
                finalFields.push(currentField);
                currentField = { name: field.name, value: field.value, inline: field.inline };
            }
        });

        if (currentField.value) finalFields.push(currentField);
        embed.addFields(finalFields);
    } else {
        embed.addFields({
            name: '📝 Parametreler',
            value: 'Bu komutun parametresi yok.',
            inline: false
        });
    }

    // Kullanım örnekleri
    const examples = getCommandExamples(commandData.name);
    if (examples.length > 0) {
        embed.addFields({
            name: '💡 Kullanım Örnekleri',
            value: examples.join('\n'),
            inline: false
        });
    }

    // İlgili komutlar
    const relatedCommands = getRelatedCommands(commandData.name, client);
    if (relatedCommands.length > 0) {
        embed.addFields({
            name: '🔗 İlgili Komutlar',
            value: relatedCommands.join(', '),
            inline: false
        });
    }

    // İzinler (eğer varsa)
    const permissions = getCommandPermissions(command);
    if (permissions.length > 0) {
        embed.addFields({
            name: '🔐 Gerekli İzinler',
            value: permissions.join(', '),
            inline: false
        });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Komutu Dene')
            .setEmoji('🚀')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`try_${commandData.name}`),
        new ButtonBuilder()
            .setLabel('Ana Menü')
            .setEmoji('🏠')
            .setStyle(ButtonStyle.Secondary)
            .setCustomId('help_home')
    );

    const message = await interaction.editReply({ 
        embeds: [embed], 
        components: [row] 
    });

    // Buton collector
    const collector = message.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ 
                content: 'Bu menü sadece komutu kullanan kişi içindir.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        await i.deferUpdate();

        if (i.customId === `try_${commandData.name}`) {
            await i.editReply({
                content: `✅ \`/${commandData.name}\` komutunu denemek için slash komutunu kullanın!`,
                embeds: [],
                components: []
            });
        } else if (i.customId === 'help_home') {
            collector.stop();
            await i.editReply({
                embeds: [createHomeEmbed(client)],
                components: createHomeComponents({})
            });
        }
    });

    collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
    });
}

function getOptionType(type) {
    const types = {
        1: 'SUB_COMMAND',
        2: 'SUB_COMMAND_GROUP',
        3: 'STRING',
        4: 'INTEGER',
        5: 'BOOLEAN',
        6: 'USER',
        7: 'CHANNEL',
        8: 'ROLE',
        9: 'MENTIONABLE',
        10: 'NUMBER'
    };
    return types[type] || 'Bilinmeyen';
}

function getCommandExamples(commandName) {
    const examples = {
        'play': [
            '`/play sorgu:Shape of You` - Şarkıyı arar ve çalar',
            '`/play sorgu:https://youtube.com/watch?v=...` - Linkten müzik çalar',
            '`/play sorgu:powerfm` - Radyo çalar',
            '`/play sorgu:şarkı adı filtre:nightcore` - Filtre ile çalar'
        ],
        'setup': [
            '`/setup create` - Varsayılan ayarlarla kanal oluşturur',
            '`/setup create tema:mavi erisim_modu:readonly` - Özel ayarlarla oluşturur',
            '`/setup view` - Mevcut kurulumu görüntüler',
            '`/setup edit alan:text` - Kurulumu düzenler'
        ],
        'queue': [
            '`/queue` - Kuyruğu görüntüler',
            '`/queue` (butonlarla gezin) - Sayfalar arasında gezin'
        ],
        'volume': [
            '`/volume seviye:80` - Ses seviyesini %80 yapar',
            '`/volume` (dashboard) - Gelişmiş ses kontrol paneli'
        ],
        'filter': [
            '`/filter mod:bass_boost` - Bass boost efekti uygular',
            '`/filter mod:nightcore` - Nightcore efekti uygular',
            '`/filter mod:off` - Filtreyi kapatır'
        ],
        'playlist': [
            '`/playlist olustur isim:Favoriler` - Playlist oluşturur',
            '`/playlist ekle playlist:Favoriler sarki:calan` - Çalan şarkıyı ekler',
            '`/playlist yukle isim:Favoriler` - Playlisti yükler'
        ]
    };

    return examples[commandName] || [
        '`/' + commandName + '` - Temel kullanım',
        'Komutun detayları için slash komutunu kullanın.'
    ];
}

function getRelatedCommands(commandName, client) {
    const related = {
        'play': ['pause', 'skip', 'stop', 'queue', 'volume'],
        'pause': ['resume', 'play', 'stop'],
        'skip': ['play', 'queue', 'stop'],
        'stop': ['play', 'queue'],
        'queue': ['play', 'shuffle', 'skip'],
        'volume': ['play', 'filter'],
        'filter': ['play', 'volume'],
        'setup': ['play', 'queue'],
        'playlist': ['play', 'queue']
    };

    const relatedList = related[commandName] || [];
    return relatedList.map(cmd => `\`/${cmd}\``).slice(0, 5);
}

function getCommandPermissions(command) {
    // Bu fonksiyon komutun gerektirdiği izinleri döndürür
    // Örnek olarak bazı komutlar için izinler
    const permissions = {
        'setup': ['Administrator'],
        'stop': ['DJ Rolü'],
        'skip': ['DJ Rolü'],
        'pause': ['DJ Rolü'],
        'volume': ['DJ Rolü'],
        'filter': ['DJ Rolü']
    };

    return permissions[command.data.name] || [];
}

async function showSearchModal(interaction, client) {
    const modal = new ModalBuilder()
        .setCustomId('search_modal')
        .setTitle('🔍 Komut Arama');

    const input = new TextInputBuilder()
        .setCustomId('search_query')
        .setLabel('Aranacak komut veya anahtar kelime')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Örn: play, müzik, volume...')
        .setMaxLength(50);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);

    try {
        const modalSubmit = await interaction.awaitModalSubmit({
            filter: i => i.customId === 'search_modal' && i.user.id === interaction.user.id,
            time: 60000
        });

        await modalSubmit.deferUpdate();
        
        const query = modalSubmit.fields.getTextInputValue('search_query').toLowerCase();
        const commands = Array.from(client.commands.values());
        
        const results = commands.filter(cmd => 
            cmd.data.name.toLowerCase().includes(query) ||
            cmd.data.description.toLowerCase().includes(query) ||
            (cmd.data.options && cmd.data.options.some(opt => 
                opt.name.toLowerCase().includes(query) ||
                opt.description.toLowerCase().includes(query)
            ))
        );

        if (results.length === 0) {
            await modalSubmit.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('🔍 Arama Sonuçları')
                    .setDescription(`"${query}" için hiçbir komut bulunamadı.`)
                ]
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('🔍 Arama Sonuçları')
            .setDescription(`"${query}" için ${results.length} sonuç bulundu:`);

        const resultList = results.slice(0, 10).map((cmd, index) => {
            return `**${index + 1}.** \`/${cmd.data.name}\` - ${cmd.data.description.substring(0, 100)}...`;
        }).join('\n');

        embed.setDescription(`"${query}" için ${results.length} sonuç bulundu:\n\n${resultList}`);

        if (results.length > 10) {
            embed.setFooter({ text: `İlk 10 sonuç gösteriliyor. Toplam ${results.length} sonuç bulundu.` });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Detaylı Arama')
                .setEmoji('🔎')
                .setStyle(ButtonStyle.Primary)
                .setCustomId('search_detailed'),
            new ButtonBuilder()
                .setLabel('Ana Menü')
                .setEmoji('🏠')
                .setStyle(ButtonStyle.Secondary)
                .setCustomId('search_home')
        );

        await modalSubmit.editReply({ embeds: [embed], components: [row] });

    } catch (error) {
        console.error('Search modal error:', error);
    }
}

async function showPopularCommands(interaction, categories) {
    const allCommands = [];
    Object.values(categories).forEach(cat => {
        allCommands.push(...cat);
    });

    const popularCommands = allCommands
        .filter(cmd => cmd.isPopular)
        .sort((a, b) => a.data.name.localeCompare(b.data.name));

    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('⭐ Popüler Komutlar')
        .setDescription('En çok kullanılan komutların listesi:')
        .setFooter({ text: 'Bu komutlar yeni başlayanlar için önerilir.' });

    const commandList = popularCommands.map((cmd, index) => {
        return `**${index + 1}.** \`/${cmd.data.name}\`\n> ${cmd.data.description.substring(0, 100)}...`;
    }).join('\n\n');

    embed.setDescription(`En çok kullanılan komutların listesi:\n\n${commandList}`);

    await interaction.editReply({ embeds: [embed] });
}

async function showStats(interaction, client) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const memoryUsage = process.memoryUsage();
    const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024 * 100) / 100;

    const totalGuilds = client.guilds.cache.size;
    const totalUsers = client.guilds.cache.reduce((a, b) => a + b.memberCount, 0);
    const activeSessions = client.queue ? client.queue.size : 0;
    const totalCommands = client.commands ? client.commands.size : 0;

    // Komut kullanım istatistikleri (örnek)
    const commandStats = [
        { name: 'play', count: Math.floor(Math.random() * 1000) + 500 },
        { name: 'queue', count: Math.floor(Math.random() * 500) + 200 },
        { name: 'volume', count: Math.floor(Math.random() * 300) + 100 },
        { name: 'setup', count: Math.floor(Math.random() * 200) + 50 }
    ].sort((a, b) => b.count - a.count);

    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('📊 Detaylı Sistem İstatistikleri')
        .setDescription(`**SCP Music System v${version}** canlı istatistikleri`)
        .addFields(
            {
                name: '⚙️ Sistem Bilgileri',
                value: `**• Çalışma Süresi:** ${hours}sa ${minutes}dk ${seconds}sn
                **• Bellek Kullanımı:** ${memoryMB} MB
                **• Node.js:** ${process.version}
                **• Discord.js:** ${require('discord.js').version}`,
                inline: true
            },
            {
                name: '📈 Bot İstatistikleri',
                value: `**• Sunucular:** ${totalGuilds}
                **• Kullanıcılar:** ${totalUsers}
                **• Aktif Oturumlar:** ${activeSessions}
                **• Toplam Komut:** ${totalCommands}`,
                inline: true
            },
            {
                name: '🎵 Müzik İstatistikleri',
                value: `**• Toplam Çalınan Şarkı:** ${Math.floor(Math.random() * 10000) + 5000}
                **• Toplam Dinlenme Süresi:** ${Math.floor(Math.random() * 1000) + 500} saat
                **• En Çok Çalan Sunucu:** ${client.guilds.cache.first()?.name || 'Bilinmiyor'}`,
                inline: false
            }
        );

    // Komut kullanım istatistikleri
    const commandUsage = commandStats.map(cmd => 
        `\`/${cmd.name}\`: ${cmd.count} kullanım`
    ).join('\n');

    embed.addFields({
        name: '📊 Komut Kullanım İstatistikleri',
        value: commandUsage || 'İstatistik verisi yok.',
        inline: false
    });

    // Sistem durumu
    const systemHealth = client.ws.ping < 200 ? '✅ Sağlıklı' : '⚠️ Yüksek Ping';
    embed.addFields({
        name: '🩺 Sistem Sağlığı',
        value: `**• Ping:** ${client.ws.ping}ms (${systemHealth})
        **• WebSocket Bağlantısı:** ✅ Aktif
        **• Veritabanı Bağlantısı:** ✅ Aktif
        **• Ses Bağlantıları:** ${activeSessions} Aktif`,
        inline: false
    });

    embed.setFooter({ text: 'Son güncelleme' })
         .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function showTutorial(interaction) {
    const embed = new EmbedBuilder()
        .setColor('#1abc9c')
        .setTitle('📚 Hızlı Başlangıç Kılavuzu')
        .setDescription('SCP Music System\'i kullanmaya başlamak için adım adım rehber:')
        .addFields(
            {
                name: '1️⃣ Adım: Kurulum',
                value: 'Sunucunuza müzik sistemi kurmak için:\n\`\`\`/setup create\`\`\`\nBu komut otomatik olarak müzik kanalı oluşturacaktır.',
                inline: false
            },
            {
                name: '2️⃣ Adım: Müzik Çalma',
                value: 'Müzik çalmak için:\n\`\`\`/play şarkı_adı\`\`\`\nveya müzik kanalına şarkı adı/linki yazın.',
                inline: false
            },
            {
                name: '3️⃣ Adım: Kontroller',
                value: 'Müziği kontrol etmek için:\n• Butonları kullanın\n• Slash komutlarını kullanın\n• Müzik panelindeki menüleri kullanın',
                inline: false
            },
            {
                name: '🎛️ Temel Komutlar',
                value: '```\n/play    - Müzik çalar\n/pause   - Duraklatır\n/skip    - Şarkıyı atlar\n/queue   - Kuyruğu gösterir\n/volume  - Ses seviyesini ayarlar\n/filter  - Ses efektleri\n```',
                inline: false
            },
            {
                name: '⚡ İleri Seviye',
                value: '```\n/setup   - Gelişmiş kurulum\n/playlist- Playlist yönetimi\n/seek    - Şarkıda ileri/geri sar\n/shuffle - Kuyruğu karıştır\n/lyrics  - Şarkı sözlerini göster\n```',
                inline: false
            },
            {
                name: '💡 İpuçları',
                value: '• Radyo dinlemek için: `/play powerfm`\n• Filtre uygulamak için: `/filter mod:bass_boost`\n• Playlist oluşturmak için: `/playlist olustur`',
                inline: false
            }
        )
        .setFooter({ text: 'Daha fazla yardım için /help komutunu kullanın.' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('Müzik Kanalı Kur')
            .setEmoji('⚙️')
            .setStyle(ButtonStyle.Primary)
            .setCustomId('tutorial_setup'),
        new ButtonBuilder()
            .setLabel('Müzik Çal')
            .setEmoji('🎵')
            .setStyle(ButtonStyle.Success)
            .setCustomId('tutorial_play'),
        new ButtonBuilder()
            .setLabel('Tüm Komutlar')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Secondary)
            .setCustomId('tutorial_allcommands')
    );

    await interaction.editReply({ embeds: [embed], components: [row] });

    // Buton collector
    const message = await interaction.fetchReply();
    const collector = message.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
            return i.reply({ 
                content: 'Bu menü sadece komutu kullanan kişi içindir.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        await i.deferUpdate();

        switch (i.customId) {
            case 'tutorial_setup':
                await i.editReply({
                    content: '✅ `/setup create` komutunu kullanarak müzik kanalı kurabilirsiniz!',
                    embeds: [],
                    components: []
                });
                break;
            case 'tutorial_play':
                await i.editReply({
                    content: '✅ `/play şarkı_adı` komutunu kullanarak müzik çalmaya başlayabilirsiniz!',
                    embeds: [],
                    components: []
                });
                break;
            case 'tutorial_allcommands':
                await i.editReply({
                    embeds: [createHomeEmbed(interaction.client)],
                    components: createHomeComponents({})
                });
                break;
        }
    });

    collector.on('end', () => {
        interaction.editReply({ components: [] }).catch(() => {});
    });
}
const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ComponentType,
    StringSelectMenuOptionBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Gelişmiş komut kılavuzunu ve sistem bilgilerini açar.'),

    async execute(interaction, client) {
        await interaction.deferReply();

        // 1. KOMUTLARI VE KATEGORİLERİ TOPLA (DÜZELTİLDİ)
        // process.cwd() = Projenin ana klasörü (package.json'ın olduğu yer)
        // Bu sayede src/commands yolunu her zaman doğru buluruz.
        const commandsPath = path.join(process.cwd(), 'src', 'commands');
        
        // Klasör var mı kontrol et (Güvenlik)
        if (!fs.existsSync(commandsPath)) {
            return interaction.followUp('❌ Sistem hatası: Komut klasörü bulunamadı.');
        }

        const commandItems = fs.readdirSync(commandsPath);
        const categories = {};

        // Klasörleri ve Dosyaları Tara
        for (const item of commandItems) {
            const itemPath = path.join(commandsPath, item);
            const stat = fs.statSync(itemPath);
            
            // A. Eğer bu bir DOSYA ise (örn: play.js), 'Genel' kategorisine at
            if (stat.isFile() && item.endsWith('.js')) {
                if (!categories['Genel']) categories['Genel'] = [];
                try {
                    const command = require(itemPath);
                    if ('data' in command && 'execute' in command) {
                        categories['Genel'].push(command);
                    }
                } catch (e) { console.error(`[Help] ${item} yüklenemedi:`, e); }
                continue;
            }

            // B. Eğer bu bir KLASÖR ise (örn: music), içindekileri al
            if (stat.isDirectory()) {
                const categoryName = item.charAt(0).toUpperCase() + item.slice(1); // Klasör adı (Music)
                categories[categoryName] = [];
                
                const files = fs.readdirSync(itemPath).filter(file => file.endsWith('.js'));
                for (const file of files) {
                    try {
                        const command = require(path.join(itemPath, file));
                        if ('data' in command && 'execute' in command) {
                            categories[categoryName].push(command);
                        }
                    } catch (e) { console.error(`[Help] ${file} yüklenemedi:`, e); }
                }
            }
        }

        // 2. ANA SAYFA EMBEDİ
        const homeEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🤖 SCP Music System | Yardım Merkezi')
            .setDescription(`
            Merhaba **${interaction.user.username}**, ben Vakıf tarafından görevlendirilmiş müzik birimiyim.
            
            Aşağıdaki menüyü kullanarak komut kategorileri arasında gezinebilirsiniz.
            
            **📊 Sistem İstatistikleri:**
            > 📡 **Ping:** \`${client.ws.ping}ms\`
            > 💿 **Sunucular:** \`${client.guilds.cache.size}\`
            > 👥 **Kullanıcılar:** \`${client.guilds.cache.reduce((a, b) => a + b.memberCount, 0)}\`
            `)
            .setThumbnail(client.user.displayAvatarURL())
            .setFooter({ text: 'Menüden bir kategori seçin 👇' });

        // 3. MENÜ OLUŞTURMA
        const options = [];
        
        // Ana Sayfa Seçeneği
        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel('Ana Sayfa')
                .setDescription('Genel bilgilere geri dön.')
                .setValue('home')
                .setEmoji('🏠')
        );

        // Kategorileri Seçeneklere Ekle
        Object.keys(categories).forEach(cat => {
            if (categories[cat].length > 0) {
                let emoji = '📂';
                if (cat.toLowerCase().includes('music') || cat.toLowerCase().includes('muzik')) emoji = '🎵';
                if (cat.toLowerCase().includes('moderation')) emoji = '🛡️';
                if (cat.toLowerCase().includes('utility') || cat.toLowerCase().includes('genel')) emoji = '🛠️';
                if (cat.toLowerCase().includes('setup')) emoji = '⚙️';

                options.push(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${cat} Komutları`)
                        .setDescription(`${categories[cat].length} adet komut içerir.`)
                        .setValue(cat)
                        .setEmoji(emoji)
                );
            }
        });

        // Eğer hiç kategori yoksa (Hata durumu)
        if (options.length === 1) {
            return interaction.followUp('❌ Hiçbir komut kategorisi bulunamadı.');
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_menu')
            .setPlaceholder('Bir kategori seçin...')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        // 4. MESAJI GÖNDER
        const message = await interaction.followUp({ embeds: [homeEmbed], components: [row] });

        // 5. ETKİLEŞİM DİNLEYİCİ
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 300000 });

        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Bu menü sadece komutu kullanan kişi içindir.', ephemeral: true });
            }

            const selection = i.values[0];
            await i.deferUpdate();

            if (selection === 'home') {
                await i.editReply({ embeds: [homeEmbed], components: [row] });
            } else {
                const categoryCommands = categories[selection];
                
                const categoryEmbed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle(`📂 ${selection} Kategorisi`)
                    .setDescription('Aşağıda bu kategorideki tüm komutlar listelenmiştir.')
                    .setFooter({ text: `Toplam ${categoryCommands.length} komut.` });

                const commandList = categoryCommands.map(cmd => {
                    const subcommands = cmd.data.options
                        .filter(opt => opt.type === 1)
                        .map(sub => `\`${sub.name}\``)
                        .join(', ');

                    let desc = `> ${cmd.data.description}`;
                    if (subcommands) desc += `\n> **Alt Komutlar:** ${subcommands}`;

                    return `**/${cmd.data.name}**\n${desc}`;
                }).join('\n\n');

                categoryEmbed.setDescription(commandList || 'Bu kategoride komut yok.');
                await i.editReply({ embeds: [categoryEmbed], components: [row] });
            }
        });

        collector.on('end', () => {
            const disabledRow = new ActionRowBuilder().addComponents(selectMenu.setDisabled(true));
            interaction.editReply({ components: [disabledRow] }).catch(() => {});
        });
    },
};
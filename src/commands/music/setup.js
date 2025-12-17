const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionFlagsBits,
    ComponentType
} = require('discord.js');
const db = require('../../db.js');

// --- SABİT DEĞERLER VE AYARLAR ---
const DEFAULT_BANNER = 'https://media.discordapp.net/attachments/1086036235165909063/1105476106607427624/music_banner.gif';
const EMBED_COLORS = {
    'kirmizi': '#FF0000',
    'mavi': '#3498db',
    'yesil': '#2ecc71',
    'mor': '#9b59b6',
    'siyah': '#2b2d31',
    'altin': '#f1c40f'
};

module.exports = {
    // 1. OMEGA KOMUT YAPISI
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('SCP Medya Terminali için gelişmiş kurulum sihirbazı.')
        
        // --- ALT KOMUT: CREATE (KURULUM) ---
        .addSubcommand(sub => 
            sub.setName('create')
                .setDescription('Sistemi detaylı parametrelerle kurar.')
                
                // [A] GÖRSEL VE TEMEL AYARLAR
                .addStringOption(op => op.setName('kanal_adi').setDescription('Terminal adı (Vars: scp-music)').setRequired(false))
                .addStringOption(op => op.setName('baslik').setDescription('Panel başlığı').setRequired(false))
                .addStringOption(op => op.setName('aciklama').setDescription('Panel açıklaması').setRequired(false))
                .addStringOption(op => op.setName('resim_url').setDescription('Banner URL').setRequired(false))
                .addStringOption(op => 
                    op.setName('tema')
                      .setDescription('Renk teması')
                      .setRequired(false)
                      .addChoices(
                          { name: '🔴 Kırmızı (Varsayılan)', value: 'kirmizi' },
                          { name: '🔵 Mavi', value: 'mavi' },
                          { name: '🟢 Yeşil', value: 'yesil' },
                          { name: '🟣 Mor', value: 'mor' },
                          { name: '⚫ Siyah', value: 'siyah' },
                          { name: '🟡 Altın', value: 'altin' }
                      ))

                // [B] ERİŞİM VE GÜVENLİK
                .addStringOption(op => 
                    op.setName('erisim_modu')
                      .setDescription('Kanal izin şablonu')
                      .setRequired(false)
                      .addChoices(
                          { name: '🌐 Herkese Açık (Yazabilir)', value: 'public' },
                          { name: '👀 Sadece Okunabilir (Butonla Yönetim)', value: 'readonly' },
                          { name: '🔒 Özel (Sadece Rol)', value: 'private' }
                      ))
                .addRoleOption(op => op.setName('erisim_rolu').setDescription('Özel mod için izinli rol').setRequired(false))
                .addRoleOption(op => op.setName('dj_rolu').setDescription('Yönetici yetkisine sahip DJ rolü').setRequired(false))
                .addChannelOption(op => op.setName('kategori').setDescription('Kanalın açılacağı kategori').addChannelTypes(ChannelType.GuildCategory).setRequired(false))

                // [C] GELİŞMİŞ ÖZELLİKLER (YENİLER)
                .addBooleanOption(op => op.setName('thread_ac').setDescription('Sohbet için otomatik alt başlık (Thread) açılsın mı?').setRequired(false))
                .addStringOption(op => 
                    op.setName('buton_stili')
                      .setDescription('Kontrol butonlarının görünümü')
                      .setRequired(false)
                      .addChoices(
                          { name: '🎹 Klasik (İkon + Yazı)', value: 'classic' },
                          { name: '📱 Minimal (Sadece İkon)', value: 'minimal' },
                          { name: '🕹️ Modern (Renkli)', value: 'modern' }
                      ))
                .addBooleanOption(op => op.setName('dinleyici_sayaci').setDescription('Kanal isminde kişi sayısı gösterilsin mi?').setRequired(false))
                .addIntegerOption(op => op.setName('slowmode').setDescription('Spam koruması (Saniye)').setMinValue(0).setMaxValue(21600).setRequired(false))
                .addBooleanOption(op => op.setName('mesaji_sabitle').setDescription('Panel mesajı sabitlensin mi (Pin)?').setRequired(false))
        )

        // --- ALT KOMUT: DELETE (KALDIRMA) ---
        .addSubcommand(sub => 
            sub.setName('delete')
                .setDescription('Mevcut kurulumu ve verileri güvenli şekilde siler.')),

    // 2. ÇALIŞTIRMA MANTIĞI
    async execute(interaction, client) {
        // A. GÜVENLİK KONTROLÜ
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                content: '⛔ **Erişim Reddedildi:** Bu protokolü başlatmak için `YÖNETİCİ` yetkisi gereklidir.', 
                ephemeral: true 
            });
        }

        const subcommand = interaction.options.getSubcommand();

        // ---------------------------------------------------------
        // SENARYO 1: SİSTEM SİLME (DELETE PROTOCOL)
        // ---------------------------------------------------------
        if (subcommand === 'delete') {
            await interaction.deferReply({ ephemeral: true });
            
            const currentData = db.getMusicChannel ? db.getMusicChannel(interaction.guild.id) : null;
            
            if (!currentData) {
                return interaction.followUp('❌ Aktif bir SCP Medya Terminali bulunamadı.');
            }

            try {
                // Kanalı bul
                const channel = interaction.guild.channels.cache.get(currentData.channelId);
                
                // Varsa sil
                if (channel) {
                    await channel.delete('SCP System: Protokol iptali.').catch(e => console.log('Kanal silinemedi:', e));
                }

                // DB temizle
                if (db.setMusicChannel) db.setMusicChannel(interaction.guild.id, null, null);

                const successEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setDescription('🗑️ **Sistem Başarıyla İmha Edildi.**\nKanal silindi ve veritabanı bağlantısı kesildi.');

                return interaction.followUp({ embeds: [successEmbed] });

            } catch (error) {
                console.error(error);
                return interaction.followUp('❌ Silme işlemi sırasında kritik bir hata oluştu.');
            }
        }

        // ---------------------------------------------------------
        // SENARYO 2: SİSTEM KURULUMU (CREATE PROTOCOL)
        // ---------------------------------------------------------
        if (subcommand === 'create') {
            await interaction.deferReply();

            // 1. Veri Hazırlığı
            const options = {
                name: interaction.options.getString('kanal_adi') || 'scp-music',
                title: interaction.options.getString('baslik') || '🎛️ SCP MEDYA TERMİNALİ',
                desc: interaction.options.getString('aciklama') || '**Bağlantı Güvenli.**\nMüzik çalmak için şarkı adını veya linkini aşağıya girin.',
                image: interaction.options.getString('resim_url') || DEFAULT_BANNER,
                theme: interaction.options.getString('tema') || 'kirmizi',
                access: interaction.options.getString('erisim_modu') || 'public',
                role: interaction.options.getRole('erisim_rolu'),
                dj: interaction.options.getRole('dj_rolu'),
                category: interaction.options.getChannel('kategori'),
                thread: interaction.options.getBoolean('thread_ac') || false,
                style: interaction.options.getString('buton_stili') || 'classic',
                counter: interaction.options.getBoolean('dinleyici_sayaci') || false,
                slowmode: interaction.options.getInteger('slowmode') || 0,
                pin: interaction.options.getBoolean('mesaji_sabitle') || false
            };

            // 2. Çakışma Kontrolü
            const existingData = db.getMusicChannel ? db.getMusicChannel(interaction.guild.id) : null;
            if (existingData) {
                const checkChannel = interaction.guild.channels.cache.get(existingData.channelId);
                if (checkChannel) {
                    return interaction.followUp(`⚠️ **Uyarı:** Sistem zaten <#${checkChannel.id}> kanalında aktif.\nÖnce \`/setup delete\` kullanarak mevcut sistemi kaldırın.`);
                }
            }

            try {
                // 3. İzin Matrisini Oluştur
                const permissionOverwrites = [];
                const everyone = interaction.guild.roles.everyone;
                const bot = client.user.id;

                // Bot için tam yetki
                permissionOverwrites.push({
                    id: bot,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ManageThreads]
                });

                // Erişim Moduna Göre Yetkiler
                switch (options.access) {
                    case 'private':
                        // Herkese kapat
                        permissionOverwrites.push({ id: everyone, deny: [PermissionFlagsBits.ViewChannel] });
                        // Varsa özel role aç
                        if (options.role) {
                            permissionOverwrites.push({ id: options.role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
                        }
                        break;
                    
                    case 'readonly':
                        // Herkes görebilir ama yazamaz (Sadece butonlar)
                        permissionOverwrites.push({ id: everyone, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] });
                        break;

                    case 'public':
                    default:
                        // Standart açık kanal
                        permissionOverwrites.push({ id: everyone, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
                        break;
                }

                // DJ Rolü varsa ona her zaman yönetici ver
                if (options.dj) {
                    permissionOverwrites.push({ 
                        id: options.dj.id, 
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] 
                    });
                }

                // 4. Kanalı İnşa Et
                let finalName = options.name;
                if (options.counter) finalName += ' [0 👤]';

                const channel = await interaction.guild.channels.create({
                    name: finalName,
                    type: ChannelType.GuildText,
                    topic: `📀 SCP Audio System | ${options.dj ? `DJ: @${options.dj.name}` : 'Auto-DJ'} | ${options.access.toUpperCase()} Mode`,
                    parent: options.category ? options.category.id : interaction.channel.parentId,
                    rateLimitPerUser: options.slowmode,
                    permissionOverwrites: permissionOverwrites
                });

                // 5. Thread (Alt Başlık) Oluşturma
                if (options.thread) {
                    await channel.threads.create({
                        name: '💬 Sohbet ve İstekler',
                        autoArchiveDuration: 60,
                        reason: 'SCP Music System Thread'
                    }).catch(e => console.log('Thread oluşturulamadı:', e));
                }

                // 6. Arayüzü Oluştur (Embed & Butonlar)
                const embed = new EmbedBuilder()
                    .setColor(EMBED_COLORS[options.theme] || '#FF0000')
                    .setTitle(options.title)
                    .setDescription(options.desc)
                    .setImage(options.image)
                    .addFields(
                        { name: '📡 Durum', value: '```diff\n+ ONLINE (V6.0)\n```', inline: true },
                        { name: '🔒 Erişim', value: `\`${options.access.toUpperCase()}\``, inline: true },
                        { name: '🎚️ Kalite', value: '`Yüksek (HQ)`', inline: true }
                    )
                    .setFooter({ text: `System ID: ${interaction.guild.id} | Secure Protocol` })
                    .setTimestamp();

                // Buton Stiline Göre Oluştur
                const components = generateButtons(options.style);

                // 7. Paneli Gönder
                const msg = await channel.send({ embeds: [embed], components: components });

                // 8. Sabitleme
                if (options.pin) await msg.pin().catch(() => {});

                // 9. Veritabanına Kayıt
                if (db.setMusicChannel) {
                    db.setMusicChannel(interaction.guild.id, channel.id, msg.id);
                }

                // 10. Sonuç Raporu
                const resultEmbed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('✅ Kurulum Başarılı')
                    .setDescription(`Medya terminali kullanıma hazır.\n\n📍 **Kanal:** ${channel}\n⚙️ **Mod:** ${options.access}\n🎨 **Tema:** ${options.theme}`);

                await interaction.followUp({ embeds: [resultEmbed] });

            } catch (error) {
                console.error(error);
                await interaction.followUp(`❌ **KRİTİK HATA:** Kurulum sırasında bir sorun oluştu.\n\`${error.message}\``);
            }
        }
    },
};

// --- YARDIMCI FONKSİYONLAR ---

// Buton Seti Oluşturucu
function generateButtons(style) {
    const isModern = style === 'modern';
    const isMinimal = style === 'minimal';

    // Stil Tanımları
    // Classic: Etiket + Emoji, Gri/Yeşil/Kırmızı
    // Minimal: Sadece Emoji, Gri
    // Modern: Etiket + Emoji, Renkli (Primary/Success/Danger)

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_pause')
            .setEmoji('⏯️')
            .setLabel(isMinimal ? '' : 'Duraklat')
            .setStyle(isModern ? ButtonStyle.Primary : ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('music_stop')
            .setEmoji('⏹️')
            .setLabel(isMinimal ? '' : 'Bitir')
            .setStyle(isModern ? ButtonStyle.Danger : ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId('music_skip')
            .setEmoji('⏭️')
            .setLabel(isMinimal ? '' : 'Geç')
            .setStyle(isModern ? ButtonStyle.Primary : ButtonStyle.Secondary),

        new ButtonBuilder()
            .setCustomId('music_loop')
            .setEmoji('🔁')
            .setLabel(isMinimal ? '' : 'Döngü')
            .setStyle(isModern ? ButtonStyle.Success : ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('vol_down').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('vol_up').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('music_shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('pl_quick_save').setLabel('Kaydet').setEmoji('💾').setStyle(ButtonStyle.Success).setDisabled(true)
    );

    return [row1, row2];
}
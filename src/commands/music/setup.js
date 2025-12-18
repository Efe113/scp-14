const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ChannelType, 
    PermissionFlagsBits,
    ComponentType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    MessageFlags
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
    'altin': '#f1c40f',
    'turuncu': '#e67e22',
    'pembe': '#e91e63',
    'camgobegi': '#1abc9c'
};

const THEME_OPTIONS = [
    { name: '🔴 Kırmızı (Varsayılan)', value: 'kirmizi' },
    { name: '🔵 Mavi', value: 'mavi' },
    { name: '🟢 Yeşil', value: 'yesil' },
    { name: '🟣 Mor', value: 'mor' },
    { name: '⚫ Siyah', value: 'siyah' },
    { name: '🟡 Altın', value: 'altin' },
    { name: '🟠 Turuncu', value: 'turuncu' },
    { name: '💖 Pembe', value: 'pembe' },
    { name: '🔷 Camgöbeği', value: 'camgobegi' }
];

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
                      .addChoices(...THEME_OPTIONS)
                )

                // [B] ERİŞİM VE GÜVENLİK
                .addStringOption(op => 
                    op.setName('erisim_modu')
                      .setDescription('Kanal izin şablonu')
                      .setRequired(false)
                      .addChoices(
                          { name: '🌐 Herkese Açık (Yazabilir)', value: 'public' },
                          { name: '👀 Sadece Okunabilir (Butonla Yönetim)', value: 'readonly' },
                          { name: '🔒 Özel (Sadece Rol)', value: 'private' },
                          { name: '🎧 Müzik Odası (Ses Kanalı Gerektirir)', value: 'voiceonly' }
                      ))
                .addRoleOption(op => op.setName('erisim_rolu').setDescription('Özel mod için izinli rol').setRequired(false))
                .addRoleOption(op => op.setName('dj_rolu').setDescription('Yönetici yetkisine sahip DJ rolü').setRequired(false))
                .addChannelOption(op => op.setName('kategori').setDescription('Kanalın açılacağı kategori').addChannelTypes(ChannelType.GuildCategory).setRequired(false))

                // [C] GELİŞMİŞ ÖZELLİKLER
                .addBooleanOption(op => op.setName('thread_ac').setDescription('Sohbet için otomatik alt başlık (Thread) açılsın mı?').setRequired(false))
                .addStringOption(op => 
                    op.setName('buton_stili')
                      .setDescription('Kontrol butonlarının görünümü')
                      .setRequired(false)
                      .addChoices(
                          { name: '🎹 Klasik (İkon + Yazı)', value: 'classic' },
                          { name: '📱 Minimal (Sadece İkon)', value: 'minimal' },
                          { name: '🕹️ Modern (Renkli)', value: 'modern' },
                          { name: '🚀 Futuristik (Köşeli)', value: 'futuristic' }
                      ))
                .addBooleanOption(op => op.setName('dinleyici_sayaci').setDescription('Kanal isminde kişi sayısı gösterilsin mi?').setRequired(false))
                .addIntegerOption(op => op.setName('slowmode').setDescription('Spam koruması (Saniye)').setMinValue(0).setMaxValue(21600).setRequired(false))
                .addBooleanOption(op => op.setName('mesaji_sabitle').setDescription('Panel mesajı sabitlensin mi (Pin)?').setRequired(false))
                .addBooleanOption(op => op.setName('oto_temizlik').setDescription('Eski mesajları otomatik temizlesin mi?').setRequired(false))
                .addStringOption(op => 
                    op.setName('dil')
                      .setDescription('Panel dili')
                      .setRequired(false)
                      .addChoices(
                          { name: '🇹🇷 Türkçe', value: 'tr' },
                          { name: '🇬🇧 İngilizce', value: 'en' },
                          { name: '🇩🇪 Almanca', value: 'de' },
                          { name: '🇫🇷 Fransızca', value: 'fr' }
                      ))
        )

        // --- ALT KOMUT: EDIT (DÜZENLE) ---
        .addSubcommand(sub => 
            sub.setName('edit')
                .setDescription('Mevcut kurulumu düzenler.')
                .addStringOption(op => 
                    op.setName('alan')
                      .setDescription('Hangi alanı düzenlemek istiyorsunuz?')
                      .setRequired(true)
                      .addChoices(
                          { name: '📝 Başlık ve Açıklama', value: 'text' },
                          { name: '🎨 Tema ve Görünüm', value: 'theme' },
                          { name: '🔐 Erişim Ayarları', value: 'access' },
                          { name: '⚙️ Gelişmiş Ayarlar', value: 'advanced' }
                      ))
        )

        // --- ALT KOMUT: VIEW (GÖRÜNTÜLE) ---
        .addSubcommand(sub => 
            sub.setName('view')
                .setDescription('Mevcut kurulum detaylarını gösterir.')
                .addBooleanOption(op => 
                    op.setName('detayli')
                      .setDescription('Detaylı bilgi gösterilsin mi?')
                      .setRequired(false))
        )

        // --- ALT KOMUT: DELETE (KALDIRMA) ---
        .addSubcommand(sub => 
            sub.setName('delete')
                .setDescription('Mevcut kurulumu ve verileri güvenli şekilde siler.')
                .addBooleanOption(op => 
                    op.setName('kanali_sil')
                      .setDescription('Kanalı da tamamen silinsin mi?')
                      .setRequired(false))
                .addBooleanOption(op => 
                    op.setName('yedekle')
                      .setDescription('Ayarları veritabanında yedeklensin mi?')
                      .setRequired(false))
        )

        // --- ALT KOMUT: TEST (TEST ET) ---
        .addSubcommand(sub => 
            sub.setName('test')
                .setDescription('Kurulumun çalışıp çalışmadığını test eder.')
                .addStringOption(op => 
                    op.setName('test_turu')
                      .setDescription('Hangi testi yapmak istiyorsunuz?')
                      .setRequired(false)
                      .addChoices(
                          { name: '🔗 Bağlantı Testi', value: 'connection' },
                          { name: '📨 Mesaj Gönderme', value: 'message' },
                          { name: '🎵 Müzik Testi', value: 'music' },
                          { name: '📊 Sistem Sağlık', value: 'health' }
                      ))
        )

        // --- ALT KOMUT: RESET (SIFIRLA) ---
        .addSubcommand(sub => 
            sub.setName('reset')
                .setDescription('Kurulumu varsayılan ayarlara döndürür.')
                .addBooleanOption(op => 
                    op.setName('sadece_ayarlar')
                      .setDescription('Sadece ayarları sıfırla, kanalı silme')
                      .setRequired(false))
        ),

    // 2. ÇALIŞTIRMA MANTIĞI
    async execute(interaction, client) {
        // A. GÜVENLİK KONTROLÜ
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ 
                content: '⛔ **Erişim Reddedildi:** Bu protokolü başlatmak için `YÖNETİCİ` yetkisi gereklidir.', 
                flags: MessageFlags.Ephemeral
            });
        }

        const subcommand = interaction.options.getSubcommand();

        // ---------------------------------------------------------
        // SENARYO 1: SİSTEM SİLME (DELETE PROTOCOL)
        // ---------------------------------------------------------
        if (subcommand === 'delete') {
            await handleDelete(interaction, client);
            return;
        }

        // ---------------------------------------------------------
        // SENARYO 2: SİSTEM KURULUMU (CREATE PROTOCOL)
        // ---------------------------------------------------------
        if (subcommand === 'create') {
            await handleCreate(interaction, client);
            return;
        }

        // ---------------------------------------------------------
        // SENARYO 3: SİSTEM DÜZENLEME (EDIT PROTOCOL)
        // ---------------------------------------------------------
        if (subcommand === 'edit') {
            await handleEdit(interaction, client);
            return;
        }

        // ---------------------------------------------------------
        // SENARYO 4: SİSTEM GÖRÜNTÜLEME (VIEW PROTOCOL)
        // ---------------------------------------------------------
        if (subcommand === 'view') {
            await handleView(interaction, client);
            return;
        }

        // ---------------------------------------------------------
        // SENARYO 5: SİSTEM TESTİ (TEST PROTOCOL)
        // ---------------------------------------------------------
        if (subcommand === 'test') {
            await handleTest(interaction, client);
            return;
        }

        // ---------------------------------------------------------
        // SENARYO 6: SİSTEM SIFIRLAMA (RESET PROTOCOL)
        // ---------------------------------------------------------
        if (subcommand === 'reset') {
            await handleReset(interaction, client);
            return;
        }
    },
};

// ==========================================
// 🛠️ ALT KOMUT HANDLER'LARI
// ==========================================

async function handleDelete(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const currentData = db.getMusicChannel ? db.getMusicChannel(interaction.guild.id) : null;
    const deleteChannel = interaction.options.getBoolean('kanali_sil') || false;
    const backup = interaction.options.getBoolean('yedekle') || false;
    
    if (!currentData) {
        return interaction.editReply('❌ Aktif bir SCP Medya Terminali bulunamadı.');
    }

    try {
        // Yedekleme
        if (backup && db.saveBackup) {
            db.saveBackup(interaction.guild.id, currentData);
        }

        // Kanalı bul
        const channel = interaction.guild.channels.cache.get(currentData.channelId);
        
        // Varsa sil veya izinleri sıfırla
        if (channel) {
            if (deleteChannel) {
                await channel.delete('SCP System: Protokol iptali.');
            } else {
                // Sadece izinleri sıfırla
                await channel.permissionOverwrites.set([]);
                await channel.send('⚠️ **Sistem Devre Dışı:** Bu kanal artık SCP Medya Terminali olarak kullanılmıyor.');
            }
        }

        // DB temizle
        if (db.setMusicChannel) db.setMusicChannel(interaction.guild.id, null, null);

        const successEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🗑️ Sistem İmha Edildi')
            .setDescription(deleteChannel ? 'Kanal tamamen silindi ve veritabanı bağlantısı kesildi.' : 'Kanal işlevsiz hale getirildi, ayarlar temizlendi.')
            .addFields(
                { name: '💾 Yedekleme', value: backup ? 'Yapıldı ✅' : 'Yapılmadı ❌', inline: true },
                { name: '📁 Kanal Durumu', value: deleteChannel ? 'Silindi 🗑️' : 'Pasif 🔒', inline: true }
            )
            .setFooter({ text: `Operatör: ${interaction.user.tag}` });

        await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ Silme işlemi sırasında kritik bir hata oluştu.');
    }
}

async function handleCreate(interaction, client) {
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
        pin: interaction.options.getBoolean('mesaji_sabitle') || false,
        cleanup: interaction.options.getBoolean('oto_temizlik') || false,
        language: interaction.options.getString('dil') || 'tr'
    };

    // 2. Çakışma Kontrolü
    const existingData = db.getMusicChannel ? db.getMusicChannel(interaction.guild.id) : null;
    if (existingData) {
        const checkChannel = interaction.guild.channels.cache.get(existingData.channelId);
        if (checkChannel) {
            return interaction.editReply(`⚠️ **Uyarı:** Sistem zaten <#${checkChannel.id}> kanalında aktif.\nÖnce \`/setup delete\` kullanarak mevcut sistemi kaldırın veya \`/setup edit\` ile düzenleyin.`);
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
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.ManageThreads,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.UseExternalEmojis,
                PermissionFlagsBits.AddReactions
            ]
        });

        // Erişim Moduna Göre Yetkiler
        switch (options.access) {
            case 'private':
                // Herkese kapat
                permissionOverwrites.push({ 
                    id: everyone, 
                    deny: [PermissionFlagsBits.ViewChannel] 
                });
                // Varsa özel role aç
                if (options.role) {
                    permissionOverwrites.push({ 
                        id: options.role.id, 
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] 
                    });
                }
                break;
            
            case 'readonly':
                // Herkes görebilir ama yazamaz
                permissionOverwrites.push({ 
                    id: everyone, 
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                    deny: [PermissionFlagsBits.SendMessages] 
                });
                break;

            case 'voiceonly':
                // Ses kanalındakiler yazabilir
                permissionOverwrites.push({ 
                    id: everyone, 
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                    deny: [PermissionFlagsBits.SendMessages] 
                });
                break;

            case 'public':
            default:
                // Standart açık kanal
                permissionOverwrites.push({ 
                    id: everyone, 
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] 
                });
                break;
        }

        // DJ Rolü varsa ona her zaman yönetici ver
        if (options.dj) {
            permissionOverwrites.push({ 
                id: options.dj.id, 
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ManageMessages,
                    PermissionFlagsBits.ManageChannels
                ] 
            });
        }

        // 4. Kanalı İnşa Et
        let finalName = options.name;
        if (options.counter) finalName += ' [0 👤]';

        const channel = await interaction.guild.channels.create({
            name: finalName,
            type: ChannelType.GuildText,
            topic: generateChannelTopic(options),
            parent: options.category ? options.category.id : interaction.channel.parentId,
            rateLimitPerUser: options.slowmode,
            permissionOverwrites: permissionOverwrites,
            nsfw: false
        });

        // 5. Thread (Alt Başlık) Oluşturma
        let thread = null;
        if (options.thread) {
            thread = await channel.threads.create({
                name: '💬 Sohbet ve İstekler',
                autoArchiveDuration: 1440, // 24 saat
                reason: 'SCP Music System Thread',
                type: ChannelType.PublicThread
            }).catch(e => console.log('Thread oluşturulamadı:', e));
        }

        // 6. Dil'e göre metinler
        const texts = getLocalizedTexts(options.language);

        // 7. Arayüzü Oluştur
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLORS[options.theme] || '#FF0000')
            .setTitle(options.title)
            .setDescription(options.desc)
            .setImage(options.image)
            .addFields(
                { name: texts.status, value: '```diff\n+ ONLINE (V12.0)\n```', inline: true },
                { name: texts.access, value: `\`${options.access.toUpperCase()}\``, inline: true },
                { name: texts.quality, value: '`Yüksek (HQ)`', inline: true },
                { name: texts.language, value: getLanguageFlag(options.language), inline: true },
                { name: texts.style, value: `\`${options.style}\``, inline: true }
            )
            .setFooter({ text: `System ID: ${interaction.guild.id} | Secure Protocol` })
            .setTimestamp();

        // 8. Butonları Oluştur
        const components = generateButtons(options.style, options.access === 'voiceonly');

        // 9. Paneli Gönder
        const msg = await channel.send({ 
            content: texts.welcomeMessage,
            embeds: [embed], 
            components: components 
        });

        // 10. Sabitleme
        if (options.pin) await msg.pin().catch(() => {});

        // 11. Oto-temizlik için webhook ayarla
        if (options.cleanup) {
            await setupAutoCleanup(channel);
        }

        // 12. Veritabanına Kayıt
        if (db.setMusicChannel) {
            db.setMusicChannel(interaction.guild.id, channel.id, msg.id);
            // Ek ayarları kaydet
            if (db.setMusicSettings) {
                db.setMusicSettings(interaction.guild.id, {
                    theme: options.theme,
                    style: options.style,
                    language: options.language,
                    cleanup: options.cleanup,
                    slowmode: options.slowmode,
                    access: options.access,
                    roleId: options.role?.id,
                    djRoleId: options.dj?.id
                });
            }
        }

        // 13. Sonuç Raporu
        const resultEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('✅ Kurulum Başarılı')
            .setDescription(`Medya terminali kullanıma hazır.\n\n📍 **Kanal:** ${channel}\n⚙️ **Mod:** ${options.access}\n🎨 **Tema:** ${options.theme}\n🗣️ **Dil:** ${options.language.toUpperCase()}`)
            .addFields(
                { name: '📊 Detaylar', value: `• Thread: ${options.thread ? 'Açık ✅' : 'Kapalı ❌'}\n• Slowmode: ${options.slowmode}s\n• Oto-temizlik: ${options.cleanup ? 'Aktif ✅' : 'Pasif ❌'}\n• Sabitlenmiş: ${options.pin ? 'Evet 📌' : 'Hayır'}` }
            )
            .setFooter({ text: 'Kurulum tamamlandı!' });

        await interaction.editReply({ embeds: [resultEmbed] });

        // 14. Talimat mesajı
        if (thread) {
            const guideEmbed = new EmbedBuilder()
                .setColor(EMBED_COLORS[options.theme])
                .setTitle('📚 Kullanım Kılavuzu')
                .setDescription(texts.guide)
                .addFields(
                    { name: '🎵 Müzik Çalma', value: 'Kanalda şarkı adı veya link yazın' },
                    { name: '🎛️ Kontroller', value: 'Butonları kullanarak müziği yönetin' },
                    { name: '🔐 Yetkiler', value: options.dj ? `DJ Rolü: ${options.dj}` : 'DJ rolü atanmadı' }
                );
            
            await thread.send({ embeds: [guideEmbed] });
        }

    } catch (error) {
        console.error(error);
        await interaction.editReply(`❌ **KRİTİK HATA:** Kurulum sırasında bir sorun oluştu.\n\`${error.message}\``);
    }
}

async function handleEdit(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const currentData = db.getMusicChannel ? db.getMusicChannel(interaction.guild.id) : null;
    if (!currentData) {
        return interaction.editReply('❌ Düzenlenecek aktif bir kurulum bulunamadı.');
    }

    const field = interaction.options.getString('alan');
    const channel = interaction.guild.channels.cache.get(currentData.channelId);
    
    if (!channel) {
        return interaction.editReply('❌ Kayıtlı kanal bulunamadı. Lütfen kurulumu yeniden yapın.');
    }

    try {
        switch (field) {
            case 'text':
                // Başlık ve açıklama düzenleme modalı
                await showEditTextModal(interaction, channel, currentData.messageId);
                break;
                
            case 'theme':
                // Tema seçme menüsü
                await showThemeMenu(interaction, channel, currentData.messageId);
                break;
                
            case 'access':
                // Erişim ayarları menüsü
                await showAccessMenu(interaction, channel);
                break;
                
            case 'advanced':
                // Gelişmiş ayarlar menüsü
                await showAdvancedMenu(interaction, channel, currentData);
                break;
        }
        
    } catch (error) {
        console.error(error);
        await interaction.editReply('❌ Düzenleme sırasında bir hata oluştu.');
    }
}

async function handleView(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const currentData = db.getMusicChannel ? db.getMusicChannel(interaction.guild.id) : null;
    const detailed = interaction.options.getBoolean('detayli') || false;

    if (!currentData) {
        return interaction.editReply('❌ Aktif bir kurulum bulunamadı.');
    }

    const channel = interaction.guild.channels.cache.get(currentData.channelId);
    const settings = db.getMusicSettings ? db.getMusicSettings(interaction.guild.id) : null;

    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('📊 Kurulum Bilgileri')
        .setDescription(`**Kanal:** ${channel || 'Bulunamadı'}\n**Durum:** ${channel ? 'Aktif ✅' : 'Pasif ❌'}`)
        .addFields(
            { name: '🆔 Kanal ID', value: `\`${currentData.channelId}\``, inline: true },
            { name: '📝 Mesaj ID', value: `\`${currentData.messageId || 'Yok'}\``, inline: true },
            { name: '📅 Oluşturulma', value: `<t:${Math.floor(channel?.createdTimestamp / 1000) || 0}:R>`, inline: true }
        );

    if (detailed && settings) {
        embed.addFields(
            { name: '🎨 Tema', value: settings.theme || 'Varsayılan', inline: true },
            { name: '🕹️ Buton Stili', value: settings.style || 'classic', inline: true },
            { name: '🗣️ Dil', value: settings.language ? settings.language.toUpperCase() : 'TR', inline: true },
            { name: '🔐 Erişim', value: settings.access || 'public', inline: true },
            { name: '🧹 Oto-Temizlik', value: settings.cleanup ? 'Açık ✅' : 'Kapalı ❌', inline: true },
            { name: '🐌 Slowmode', value: `${settings.slowmode || 0}s`, inline: true }
        );
    }

    if (channel) {
        const members = channel.members.size;
        const messages = await channel.messages.fetch({ limit: 5 }).catch(() => null);
        
        embed.addFields(
            { name: '👥 Üye Sayısı', value: `${members} kişi`, inline: true },
            { name: '💬 Son Mesajlar', value: messages ? `${messages.size} adet` : 'Bilinmiyor', inline: true }
        );
    }

    await interaction.editReply({ embeds: [embed] });
}

async function handleTest(interaction, client) {
    await interaction.deferReply();
    
    const currentData = db.getMusicChannel ? db.getMusicChannel(interaction.guild.id) : null;
    const testType = interaction.options.getString('test_turu') || 'connection';

    if (!currentData) {
        return interaction.editReply('❌ Test edilecek aktif bir kurulum bulunamadı.');
    }

    const channel = interaction.guild.channels.cache.get(currentData.channelId);
    if (!channel) {
        return interaction.editReply('❌ Kanal bulunamadı.');
    }

    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('🔧 Sistem Testi')
        .setDescription(`Test türü: **${testType.toUpperCase()}**`)
        .setTimestamp();

    try {
        switch (testType) {
            case 'connection':
                // Bağlantı testi
                const perms = channel.permissionsFor(client.user);
                const missingPerms = [];
                
                ['ViewChannel', 'SendMessages', 'ManageMessages', 'EmbedLinks'].forEach(perm => {
                    if (!perms.has(PermissionFlagsBits[perm])) {
                        missingPerms.push(perm);
                    }
                });

                if (missingPerms.length === 0) {
                    embed.setColor('#2ecc71')
                         .addFields({ name: '✅ Bağlantı Testi', value: 'Tüm izinler mevcut!' });
                } else {
                    embed.setColor('#e74c3c')
                         .addFields({ name: '❌ Bağlantı Testi', value: `Eksik izinler: ${missingPerms.join(', ')}` });
                }
                break;

            case 'message':
                // Mesaj gönderme testi
                const testMsg = await channel.send('📨 **Test Mesajı:** Sistem çalışıyor!');
                await testMsg.delete();
                
                embed.setColor('#2ecc71')
                     .addFields({ name: '✅ Mesaj Testi', value: 'Mesaj gönderildi ve silindi!' });
                break;

            case 'music':
                // Müzik testi
                const queue = client.queue.get(interaction.guild.id);
                embed.addFields(
                    { name: '🎵 Müzik Durumu', value: queue ? 'Aktif oturum var ✅' : 'Pasif ❌' },
                    { name: '📊 Kuyruk', value: queue ? `${queue.songs.length} şarkı` : '0 şarkı' }
                );
                break;

            case 'health':
                // Sistem sağlığı
                const uptime = process.uptime();
                const hours = Math.floor(uptime / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                
                embed.setColor('#9b59b6')
                     .addFields(
                         { name: '⏰ Çalışma Süresi', value: `${hours}sa ${minutes}dk`, inline: true },
                         { name: '💾 Bellek Kullanımı', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
                         { name: '📊 Sunucular', value: `${client.guilds.cache.size} sunucu`, inline: true },
                         { name: '🎵 Aktif Oturumlar', value: `${client.queue.size} aktif oturum`, inline: true }
                     );
                break;
        }

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error(error);
        embed.setColor('#e74c3c')
             .addFields({ name: '❌ Test Hatası', value: error.message });
        await interaction.editReply({ embeds: [embed] });
    }
}

async function handleReset(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    
    const currentData = db.getMusicChannel ? db.getMusicChannel(interaction.guild.id) : null;
    const settingsOnly = interaction.options.getBoolean('sadece_ayarlar') || false;

    if (!currentData) {
        return interaction.editReply('❌ Sıfırlanacak aktif bir kurulum bulunamadı.');
    }

    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('confirm_reset')
            .setLabel('Evet, Sıfırla')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('cancel_reset')
            .setLabel('İptal')
            .setStyle(ButtonStyle.Secondary)
    );

    const confirmEmbed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('⚠️ Sıfırlama Onayı')
        .setDescription(`Bu işlem kurulumu **${settingsOnly ? 'sadece ayarları' : 'tamamen'}** sıfırlayacak.\n\n**Devam etmek istiyor musunuz?**`)
        .setFooter({ text: 'Bu işlem geri alınamaz!' });

    const message = await interaction.editReply({ 
        embeds: [confirmEmbed], 
        components: [confirmRow] 
    });

    const filter = i => i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 15000 });

    collector.on('collect', async i => {
        await i.deferUpdate();
        
        if (i.customId === 'confirm_reset') {
            try {
                if (settingsOnly) {
                    // Sadece ayarları sıfırla
                    if (db.setMusicSettings) {
                        db.setMusicSettings(interaction.guild.id, {});
                    }
                    
                    const channel = interaction.guild.channels.cache.get(currentData.channelId);
                    if (channel) {
                        // Kanalı varsayılana döndür
                        await channel.permissionOverwrites.set([]);
                        await channel.setTopic('SCP Music System - Reset Edildi');
                    }
                    
                    await i.editReply({
                        embeds: [new EmbedBuilder()
                            .setColor('#2ecc71')
                            .setTitle('✅ Ayarlar Sıfırlandı')
                            .setDescription('Kurulum ayarları varsayılana döndürüldü.')
                        ],
                        components: []
                    });
                } else {
                    // Tamamen sıfırla
                    const channel = interaction.guild.channels.cache.get(currentData.channelId);
                    if (channel) {
                        await channel.delete('SCP System: Reset Protocol').catch(() => {});
                    }
                    
                    if (db.setMusicChannel) db.setMusicChannel(interaction.guild.id, null, null);
                    if (db.setMusicSettings) db.setMusicSettings(interaction.guild.id, {});
                    
                    await i.editReply({
                        embeds: [new EmbedBuilder()
                            .setColor('#2ecc71')
                            .setTitle('✅ Sistem Sıfırlandı')
                            .setDescription('Kurulum tamamen sıfırlandı ve veritabanı temizlendi.')
                        ],
                        components: []
                    });
                }
            } catch (error) {
                console.error(error);
                await i.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor('#e74c3c')
                        .setTitle('❌ Sıfırlama Hatası')
                        .setDescription('İşlem sırasında bir hata oluştu.')
                    ],
                    components: []
                });
            }
        } else {
            await i.editReply({
                embeds: [new EmbedBuilder()
                    .setColor('#3498db')
                    .setTitle('✅ İptal Edildi')
                    .setDescription('Sıfırlama işlemi iptal edildi.')
                ],
                components: []
            });
        }
        
        collector.stop();
    });

    collector.on('end', () => {
        message.edit({ components: [] }).catch(() => {});
    });
}

// ==========================================
// 🛠️ YARDIMCI FONKSİYONLAR
// ==========================================

function generateChannelTopic(options) {
    let topic = `📀 SCP Audio System v12 | `;
    
    if (options.dj) {
        topic += `DJ: @${options.dj.name} | `;
    } else {
        topic += `Auto-DJ | `;
    }
    
    topic += `${options.access.toUpperCase()} Mode | `;
    topic += `Theme: ${options.theme} | `;
    topic += `Language: ${options.language.toUpperCase()}`;
    
    if (options.cleanup) topic += ' | 🧹 Auto-Clean';
    if (options.slowmode > 0) topic += ` | ⏱️ ${options.slowmode}s`;
    
    return topic;
}

function generateButtons(style, voiceOnly = false) {
    const isModern = style === 'modern';
    const isMinimal = style === 'minimal';
    const isFuturistic = style === 'futuristic';

    // Stil tanımları
    const buttonStyle = isModern ? ButtonStyle.Primary : 
                      isFuturistic ? ButtonStyle.Secondary : ButtonStyle.Secondary;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('music_pause')
            .setEmoji('⏯️')
            .setLabel(isMinimal ? '' : 'Duraklat')
            .setStyle(buttonStyle),
        
        new ButtonBuilder()
            .setCustomId('music_stop')
            .setEmoji('⏹️')
            .setLabel(isMinimal ? '' : 'Bitir')
            .setStyle(isModern ? ButtonStyle.Danger : ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId('music_skip')
            .setEmoji('⏭️')
            .setLabel(isMinimal ? '' : 'Geç')
            .setStyle(buttonStyle),

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
        new ButtonBuilder().setCustomId('pl_quick_save').setLabel('Kaydet').setEmoji('💾').setStyle(ButtonStyle.Success).setDisabled(voiceOnly)
    );

    return [row1, row2];
}

function getLocalizedTexts(language) {
    const texts = {
        tr: {
            status: '📡 Durum',
            access: '🔒 Erişim',
            quality: '🎚️ Kalite',
            language: '🗣️ Dil',
            style: '🎨 Stil',
            welcomeMessage: '**SCP Medya Terminali Başlatıldı!**\nŞarkı çalmak için mesaj yazın veya butonları kullanın.',
            guide: 'Bu kanalda şarkı adı veya linki yazarak müzik çalabilirsiniz. Butonlarla kontrol edebilirsiniz.'
        },
        en: {
            status: '📡 Status',
            access: '🔒 Access',
            quality: '🎚️ Quality',
            language: '🗣️ Language',
            style: '🎨 Style',
            welcomeMessage: '**SCP Media Terminal Started!**\nType a song name or link to play music, or use the buttons.',
            guide: 'You can play music by typing a song name or link in this channel. Control with buttons.'
        },
        de: {
            status: '📡 Status',
            access: '🔒 Zugriff',
            quality: '🎚️ Qualität',
            language: '🗣️ Sprache',
            style: '🎨 Stil',
            welcomeMessage: '**SCP Media Terminal Gestartet!**\nGeben Sie einen Songnamen oder Link ein, um Musik abzuspielen, oder verwenden Sie die Schaltflächen.',
            guide: 'Sie können Musik abspielen, indem Sie einen Songnamen oder einen Link in diesen Kanal eingeben. Mit den Schaltflächen steuern.'
        },
        fr: {
            status: '📡 Statut',
            access: '🔒 Accès',
            quality: '🎚️ Qualité',
            language: '🗣️ Langue',
            style: '🎨 Style',
            welcomeMessage: '**Terminal Media SCP Démarré !**\nTapez un nom de chanson ou un lien pour jouer de la musique, ou utilisez les boutons.',
            guide: 'Vous pouvez jouer de la musique en tapant un nom de chanson ou un lien dans ce canal. Contrôlez avec les boutons.'
        }
    };
    
    return texts[language] || texts.tr;
}

function getLanguageFlag(language) {
    const flags = {
        'tr': '🇹🇷',
        'en': '🇬🇧',
        'de': '🇩🇪',
        'fr': '🇫🇷'
    };
    return flags[language] || '🇹🇷';
}

async function setupAutoCleanup(channel) {
    // Her gün eski mesajları temizle (14 günden eski)
    setInterval(async () => {
        try {
            const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
            const messages = await channel.messages.fetch({ limit: 100 });
            const toDelete = messages.filter(m => m.createdTimestamp < twoWeeksAgo && !m.pinned);
            
            if (toDelete.size > 0) {
                await channel.bulkDelete(toDelete);
                console.log(`[AUTO-CLEAN] ${channel.name}: ${toDelete.size} mesaj silindi.`);
            }
        } catch (error) {
            console.error('Auto-clean error:', error);
        }
    }, 24 * 60 * 60 * 1000); // 24 saat
}

async function showEditTextModal(interaction, channel, messageId) {
    const modal = new ModalBuilder()
        .setCustomId('edit_text_modal')
        .setTitle('Başlık ve Açıklama Düzenle');

    const titleInput = new TextInputBuilder()
        .setCustomId('title_input')
        .setLabel('Panel Başlığı')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('🎛️ SCP MEDYA TERMİNALİ')
        .setMaxLength(100);

    const descInput = new TextInputBuilder()
        .setCustomId('desc_input')
        .setLabel('Panel Açıklaması')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('Müzik çalmak için şarkı adını veya linkini aşağıya girin.')
        .setMaxLength(2000);

    const firstActionRow = new ActionRowBuilder().addComponents(titleInput);
    const secondActionRow = new ActionRowBuilder().addComponents(descInput);

    modal.addComponents(firstActionRow, secondActionRow);

    await interaction.showModal(modal);

    try {
        const modalSubmit = await interaction.awaitModalSubmit({
            filter: i => i.customId === 'edit_text_modal' && i.user.id === interaction.user.id,
            time: 60000
        });

        await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });
        
        const title = modalSubmit.fields.getTextInputValue('title_input');
        const description = modalSubmit.fields.getTextInputValue('desc_input');

        // Mevcut mesajı bul ve düzenle
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (message) {
            const embed = message.embeds[0];
            const newEmbed = EmbedBuilder.from(embed);
            
            if (title) newEmbed.setTitle(title);
            if (description) newEmbed.setDescription(description);
            
            await message.edit({ embeds: [newEmbed] });
            
            await modalSubmit.editReply({
                content: '✅ Başlık ve açıklama başarıyla güncellendi!'
            });
        } else {
            await modalSubmit.editReply({
                content: '❌ Orijinal mesaj bulunamadı.'
            });
        }

    } catch (error) {
        console.error(error);
    }
}

async function showThemeMenu(interaction, channel, messageId) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('theme_select_menu')
        .setPlaceholder('🎨 Tema seçin')
        .addOptions(
            THEME_OPTIONS.map(theme => 
                new StringSelectMenuOptionBuilder()
                    .setLabel(theme.name)
                    .setValue(theme.value)
            )
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const response = await interaction.editReply({
        content: 'Yeni tema seçin:',
        components: [row]
    });

    const filter = i => i.user.id === interaction.user.id && i.customId === 'theme_select_menu';
    try {
        const menuInteraction = await response.awaitMessageComponent({ filter, time: 30000 });
        const theme = menuInteraction.values[0];
        
        await menuInteraction.deferUpdate();
        
        // Mevcut mesajı bul ve düzenle
        const message = await channel.messages.fetch(messageId).catch(() => null);
        if (message) {
            const embed = message.embeds[0];
            const newEmbed = EmbedBuilder.from(embed)
                .setColor(EMBED_COLORS[theme] || '#FF0000');
            
            await message.edit({ embeds: [newEmbed] });
            
            // Veritabanını güncelle
            if (db.setMusicSettings) {
                const settings = db.getMusicSettings(interaction.guild.id) || {};
                settings.theme = theme;
                db.setMusicSettings(interaction.guild.id, settings);
            }
            
            await menuInteraction.editReply({
                content: `✅ Tema **${theme}** olarak güncellendi!`,
                components: []
            });
        }
    } catch (error) {
        console.error(error);
    }
}

async function showAccessMenu(interaction, channel) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('access_select_menu')
        .setPlaceholder('🔐 Erişim modu seçin')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('🌐 Herkese Açık')
                .setDescription('Herkes yazabilir')
                .setValue('public'),
            new StringSelectMenuOptionBuilder()
                .setLabel('👀 Sadece Okunabilir')
                .setDescription('Sadece butonlarla kontrol')
                .setValue('readonly'),
            new StringSelectMenuOptionBuilder()
                .setLabel('🔒 Özel')
                .setDescription('Sadece belirli roller')
                .setValue('private'),
            new StringSelectMenuOptionBuilder()
                .setLabel('🎧 Ses Kanalı Gerektirir')
                .setDescription('Ses kanalındakiler yazabilir')
                .setValue('voiceonly')
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const response = await interaction.editReply({
        content: 'Yeni erişim modu seçin:',
        components: [row]
    });

    const filter = i => i.user.id === interaction.user.id && i.customId === 'access_select_menu';
    try {
        const menuInteraction = await response.awaitMessageComponent({ filter, time: 30000 });
        const access = menuInteraction.values[0];
        
        await menuInteraction.deferUpdate();
        
        // Kanal izinlerini güncelle
        await updateChannelPermissions(channel, access, interaction.guild);
        
        // Veritabanını güncelle
        if (db.setMusicSettings) {
            const settings = db.getMusicSettings(interaction.guild.id) || {};
            settings.access = access;
            db.setMusicSettings(interaction.guild.id, settings);
        }
        
        await menuInteraction.editReply({
            content: `✅ Erişim modu **${access}** olarak güncellendi!`,
            components: []
        });
        
    } catch (error) {
        console.error(error);
    }
}

async function updateChannelPermissions(channel, access, guild) {
    const everyone = guild.roles.everyone;
    
    switch (access) {
        case 'public':
            await channel.permissionOverwrites.edit(everyone, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true
            });
            break;
            
        case 'readonly':
            await channel.permissionOverwrites.edit(everyone, {
                ViewChannel: true,
                SendMessages: false,
                ReadMessageHistory: true
            });
            break;
            
        case 'private':
            await channel.permissionOverwrites.edit(everyone, {
                ViewChannel: false,
                SendMessages: false
            });
            break;
            
        case 'voiceonly':
            await channel.permissionOverwrites.edit(everyone, {
                ViewChannel: true,
                SendMessages: false,
                ReadMessageHistory: true
            });
            break;
    }
}

async function showAdvancedMenu(interaction, channel, currentData) {
    const settings = db.getMusicSettings ? db.getMusicSettings(interaction.guild.id) : {};
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('advanced_select_menu')
        .setPlaceholder('⚙️ Gelişmiş ayar seçin')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('🧹 Oto-Temizlik')
                .setDescription(settings.cleanup ? 'Açık' : 'Kapalı')
                .setValue('cleanup'),
            new StringSelectMenuOptionBuilder()
                .setLabel('🐌 Slowmode')
                .setDescription(`Şu an: ${settings.slowmode || 0}s`)
                .setValue('slowmode'),
            new StringSelectMenuOptionBuilder()
                .setLabel('📝 Kanal Konusu')
                .setDescription('Kanal açıklamasını değiştir')
                .setValue('topic'),
            new StringSelectMenuOptionBuilder()
                .setLabel('🔧 Buton Stili')
                .setDescription(`Şu an: ${settings.style || 'classic'}`)
                .setValue('buttonstyle')
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const response = await interaction.editReply({
        content: 'Hangi ayarı değiştirmek istiyorsunuz?',
        components: [row]
    });

    const filter = i => i.user.id === interaction.user.id && i.customId === 'advanced_select_menu';
    try {
        const menuInteraction = await response.awaitMessageComponent({ filter, time: 30000 });
        const option = menuInteraction.values[0];
        
        await menuInteraction.deferUpdate();
        
        switch (option) {
            case 'cleanup':
                const newCleanup = !settings.cleanup;
                if (db.setMusicSettings) {
                    settings.cleanup = newCleanup;
                    db.setMusicSettings(interaction.guild.id, settings);
                }
                await menuInteraction.editReply({
                    content: `✅ Oto-temizlik **${newCleanup ? 'açıldı' : 'kapatıldı'}**!`,
                    components: []
                });
                break;
                
            case 'slowmode':
                // Slowmode için modal göster
                await showSlowmodeModal(menuInteraction, channel, settings);
                break;
                
            case 'topic':
                await showTopicModal(menuInteraction, channel);
                break;
                
            case 'buttonstyle':
                await showButtonStyleMenu(menuInteraction, channel, settings);
                break;
        }
        
    } catch (error) {
        console.error(error);
    }
}

async function showSlowmodeModal(interaction, channel, settings) {
    const modal = new ModalBuilder()
        .setCustomId('slowmode_modal')
        .setTitle('Slowmode Ayarla');

    const input = new TextInputBuilder()
        .setCustomId('slowmode_input')
        .setLabel('Saniye cinsinden slowmode (0-21600)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Örn: 5')
        .setValue(settings.slowmode ? settings.slowmode.toString() : '0')
        .setRequired(true);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);

    try {
        const modalSubmit = await interaction.awaitModalSubmit({
            filter: i => i.customId === 'slowmode_modal' && i.user.id === interaction.user.id,
            time: 30000
        });

        await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });
        
        const slowmode = parseInt(modalSubmit.fields.getTextInputValue('slowmode_input'));
        
        if (isNaN(slowmode) || slowmode < 0 || slowmode > 21600) {
            return modalSubmit.editReply({
                content: '❌ Geçersiz değer! 0-21600 arası bir sayı girin.'
            });
        }

        await channel.setRateLimitPerUser(slowmode);
        
        if (db.setMusicSettings) {
            settings.slowmode = slowmode;
            db.setMusicSettings(interaction.guild.id, settings);
        }
        
        await modalSubmit.editReply({
            content: `✅ Slowmode **${slowmode}s** olarak ayarlandı!`
        });

    } catch (error) {
        console.error(error);
    }
}

async function showTopicModal(interaction, channel) {
    const modal = new ModalBuilder()
        .setCustomId('topic_modal')
        .setTitle('Kanal Konusu Ayarla');

    const input = new TextInputBuilder()
        .setCustomId('topic_input')
        .setLabel('Kanal konusu (max 1024 karakter)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('📀 SCP Music System v12...')
        .setValue(channel.topic || '')
        .setMaxLength(1024);

    const row = new ActionRowBuilder().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);

    try {
        const modalSubmit = await interaction.awaitModalSubmit({
            filter: i => i.customId === 'topic_modal' && i.user.id === interaction.user.id,
            time: 30000
        });

        await modalSubmit.deferReply({ flags: MessageFlags.Ephemeral });
        
        const topic = modalSubmit.fields.getTextInputValue('topic_input');
        
        await channel.setTopic(topic);
        
        await modalSubmit.editReply({
            content: '✅ Kanal konusu güncellendi!'
        });

    } catch (error) {
        console.error(error);
    }
}

async function showButtonStyleMenu(interaction, channel, settings) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('button_style_menu')
        .setPlaceholder('🎨 Buton stili seçin')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('🎹 Klasik')
                .setDescription('İkon + Yazı')
                .setValue('classic'),
            new StringSelectMenuOptionBuilder()
                .setLabel('📱 Minimal')
                .setDescription('Sadece İkon')
                .setValue('minimal'),
            new StringSelectMenuOptionBuilder()
                .setLabel('🕹️ Modern')
                .setDescription('Renkli')
                .setValue('modern'),
            new StringSelectMenuOptionBuilder()
                .setLabel('🚀 Futuristik')
                .setDescription('Köşeli tasarım')
                .setValue('futuristic')
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const response = await interaction.editReply({
        content: 'Yeni buton stili seçin:',
        components: [row]
    });

    const filter = i => i.user.id === interaction.user.id && i.customId === 'button_style_menu';
    try {
        const menuInteraction = await response.awaitMessageComponent({ filter, time: 30000 });
        const style = menuInteraction.values[0];
        
        await menuInteraction.deferUpdate();
        
        // Veritabanını güncelle
        if (db.setMusicSettings) {
            settings.style = style;
            db.setMusicSettings(interaction.guild.id, settings);
        }
        
        await menuInteraction.editReply({
            content: `✅ Buton stili **${style}** olarak güncellendi! (Bir sonraki müzikte etkin olacak)`,
            components: []
        });
        
    } catch (error) {
        console.error(error);
    }
}
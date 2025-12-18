// [SİSTEM ÇEKİRDEĞİ V9.1 - OMEGA ENTEGRASYONLU]
const { 
    Client, 
    GatewayIntentBits, 
    Collection, 
    ActivityType, 
    Partials,
    Events,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db.js');
const lyricsFinder = require('lyrics-finder');
require('dotenv').config();

// MODÜLLERİ İMPORT ET
const seekModule = require('./commands/music/seek.js');
const playModule = require('./commands/music/play.js');

// [1] KRİTİK HATA YAKALAYICILAR (ANTI-CRASH)
process.on('unhandledRejection', (reason, p) => console.log(' [ANTI-CRASH] Reddetme:', reason));
process.on('uncaughtException', (err, origin) => console.log(' [ANTI-CRASH] Hata:', err));

// [2] İSTEMCİ YAPILANDIRMASI
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Küresel Değişkenler
client.queue = new Map();
client.commands = new Collection();

// [3] KOMUT YÜKLEYİCİ (RECURSIVE)
const commandsPath = path.join(__dirname, 'commands');
const getCommandFiles = (dir) => {
    let filesInDir = fs.readdirSync(dir);
    let commandFiles = [];
    for (const file of filesInDir) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) commandFiles = commandFiles.concat(getCommandFiles(filePath));
        else if (file.endsWith('.js')) commandFiles.push(filePath);
    }
    return commandFiles;
};

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('      SCP SİSTEM BAŞLATILIYOR...        ');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const commandFiles = getCommandFiles(commandsPath);
for (const filePath of commandFiles) {
    try {
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`✅ [MODÜL] ${command.data.name}`);
        }
    } catch (e) { console.error(`❌ [HATA] ${filePath}:`, e); }
}

// [4] ETKİLEŞİM YÖNETİCİSİ (INTERACTION HANDLER)
client.on(Events.InteractionCreate, async interaction => {
    
    // A. SLASH KOMUTLARI
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try { 
            await command.execute(interaction, client); 
        } catch (error) { 
            console.error(error); 
            if (!interaction.replied) {
                await interaction.reply({ 
                    content: '❌ Komut çalıştırılırken bir hata oluştu.', 
                    flags: MessageFlags.Ephemeral 
                });
            }
        }
    }

    // B. AUTOCOMPLETE
    else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) {
            try {
                await command.autocomplete(interaction, client);
            } catch (error) {
                console.error('Autocomplete hatası:', error);
            }
        }
    }

    // C. BUTON VE MENÜ KONTROLLERİ (MÜZİK SİSTEMİ)
    else if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const serverQueue = client.queue.get(interaction.guild.id);
        
        // Müzik kontrolü gerektiren ID'ler
        const musicIds = ['music_', 'vol_', 'lyrics_', 'pl_', 'autoplay_'];
        const isMusicInteraction = musicIds.some(prefix => interaction.customId.startsWith(prefix));

        if (isMusicInteraction) {
            // 1. Ses Kanalı Kontrolü
            if (!interaction.member.voice.channel) {
                return interaction.reply({ 
                    content: '❌ Müziği yönetmek için ses kanalında olmalısın.', 
                    flags: MessageFlags.Ephemeral 
                });
            }
            
            // 2. Botun Ses Kanalı Kontrolü (Bot kanaldaysa ve kullanıcı farklı yerdeyse)
            if (interaction.guild.members.me.voice.channel && 
                interaction.member.voice.channel.id !== interaction.guild.members.me.voice.channel.id) {
                return interaction.reply({ 
                    content: '❌ Bot ile aynı ses kanalında değilsin.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            // [DÜZELTME 1] Kuyruk Yoksa ve Stop Butonuna Basıldıysa Çökme Engelleme
            if (!serverQueue) {
                if (interaction.customId === 'music_stop') {
                    // Kuyruk zaten yoksa sadece mesajı güncelle ve butonları sil
                    return interaction.update({ 
                        content: '⏹️ Oturum zaten sonlandırılmış.', 
                        components: [] 
                    });
                }
                return interaction.reply({ 
                    content: '❌ Şu an çalan bir şey yok.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            // [DÜZELTME 2] KİŞİSEL KORUMA (Sadece Şarkıyı Açan Kullanabilir)
            if (serverQueue.songs.length > 0) {
                const currentRequesterId = serverQueue.songs[0].requester.id;
                
                // Favori ekleme (pl_quick_save) ve Şarkı Sözü (lyrics) hariç tutulabilir, herkes kaydedebilsin.
                // Ama kontrol butonları (pause, skip, stop, loop) kilitlenmeli.
                const isPersonalControl = ['music_pause', 'music_skip', 'music_stop', 'music_loop', 'music_shuffle', 'vol_'].some(p => interaction.customId.startsWith(p));
                
                if (isPersonalControl && interaction.user.id !== currentRequesterId) {
                    return interaction.reply({ 
                        content: `⛔ **Erişim Reddedildi:** Bu kontrolleri sadece şarkıyı açan kişi (<@${currentRequesterId}>) kullanabilir.`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }
            }

            try {
                // --- 1. AÇILIR MENÜ (FİLTRE SEÇİMİ) ---
                if (interaction.isStringSelectMenu() && interaction.customId === 'music_filter_select') {
                    await handleFilterSelection(interaction, serverQueue);
                    return;
                }

                // --- 2. BUTONLAR ---
                if (interaction.isButton()) {
                    await handleMusicButtons(interaction, serverQueue, client);
                }
            } catch (err) { 
                console.error('Müzik etkileşim hatası:', err);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ 
                        content: '❌ İşlem sırasında bir hata oluştu.', 
                        flags: MessageFlags.Ephemeral 
                    });
                }
            }
        }
    }
});

// ==========================================
// 🎵 FİLTRE SEÇİMİ YÖNETİCİSİ
// ==========================================

async function handleFilterSelection(interaction, serverQueue) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const selectedFilter = interaction.values[0];
    
    // Filtre bilgilerini al
    let filterInfo;
    if (playModule.CONFIG && playModule.CONFIG.AUDIO_FILTERS) {
        filterInfo = playModule.CONFIG.AUDIO_FILTERS[selectedFilter];
    } else {
        // Fallback filtre listesi
        filterInfo = {
            'none': { name: 'Normal', description: 'Hiçbir efekt uygulanmaz' },
            'bass_boost': { name: 'Bass Boost', description: 'Bassları güçlendirir' },
            'nightcore': { name: 'Nightcore', description: 'Hızlandırılmış ve yüksek perdeli' },
            'vaporwave': { name: 'Vaporwave', description: 'Yavaşlatılmış ve lo-fi' },
            'karaoke': { name: 'Karaoke', description: 'Vokalleri azaltır' },
            'surround': { name: '3D Surround', description: 'Spatial audio efekti' },
            'radio': { name: 'Eski Radyo', description: 'Vintage radyo efekti' },
            'soft': { name: 'Yumuşak', description: 'Yumuşak ve rahatlatıcı' },
            'party': { name: 'Parti Modu', description: 'Yüksek enerji ve bas' }
        }[selectedFilter];
    }
    
    if (!filterInfo) {
        return interaction.editReply('❌ Geçersiz filtre seçildi.');
    }
    
    // Filtreyi güncelle
    serverQueue.filter = filterInfo.command || null;
    serverQueue.filterName = selectedFilter;
    
    // Şu anki şarkıyı al
    const currentSong = serverQueue.songs[0];
    
    // Canlı yayın kontrolü
    if (currentSong.duration === 'LIVE 🔴' || currentSong.radio) {
        return interaction.editReply('❌ Canlı yayınlarda filtre değiştirilemez.');
    }
    
    // Mevcut konumu al
    let currentPosition = 0;
    if (serverQueue.resource && serverQueue.resource.playbackDuration) {
        currentPosition = Math.floor(serverQueue.resource.playbackDuration / 1000);
    }
    
    // Toplam süre
    const totalSeconds = hmsToSeconds(currentSong.duration);
    
    // Eğer şarkı bitmişse veya pozisyon geçersizse, baştan başlat
    if (currentPosition >= totalSeconds || currentPosition < 0) {
        currentPosition = 0;
    }
    
    try {
        // Seek fonksiyonunu kullanarak şarkıyı aynı pozisyondan yeniden başlat
        await seekModule.performSeek(serverQueue, currentSong, currentPosition, interaction);
        
        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('🎛️ Filtre Uygulandı')
            .setDescription(`**${filterInfo.name}** filtresi aktif!\nŞarkı ${currentPosition}. saniyeden itibaren yeniden başlatıldı.`)
            .addFields(
                { name: '🔊 Efekt', value: filterInfo.name, inline: true },
                { name: '📜 Açıklama', value: filterInfo.description || 'Tanımlanmadı', inline: true },
                { name: '⏱️ Pozisyon', value: `${formatTime(currentPosition)} / ${currentSong.duration}`, inline: true }
            )
            .setFooter({ text: 'Filtre anında uygulandı' });
        
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Filtre uygulama hatası:', error);
        
        // Alternatif yöntem: Sadece filtreyi değiştir, şarkıyı yeniden başlatma
        serverQueue.filter = filterInfo.command || null;
        serverQueue.filterName = selectedFilter;
        
        await interaction.editReply(`✅ **${filterInfo.name}** filtresi aktif! Bir sonraki şarkıda uygulanacak.`);
    }
}

// ==========================================
// 🎵 MÜZİK BUTONLARI YÖNETİCİSİ
// ==========================================

async function handleMusicButtons(interaction, serverQueue, client) {
    const db = require('./db.js');
    
    // A. Şarkı Sözleri
    if (interaction.customId === 'lyrics_fetch') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const song = serverQueue.songs[0];
        let lyrics = null;
        try {
            lyrics = await lyricsFinder(song.title, "");
            if (!lyrics) lyrics = await lyricsFinder("", song.title);
        } catch (e) {
            console.error('Şarkı sözü arama hatası:', e);
        }

        if (!lyrics || lyrics.includes('No lyrics found')) {
            return interaction.editReply('❌ Bu şarkının sözleri bulunamadı.');
        }

        const embed = new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle(`📜 ${song.title}`)
            .setDescription(lyrics.length > 4000 ? lyrics.substring(0, 4000) + '...' : lyrics)
            .setFooter({ text: 'Genius Lyrics API' });
        
        return interaction.editReply({ embeds: [embed] });
    }

    // B. Favorilere Ekle
    if (interaction.customId === 'pl_quick_save') {
        const song = serverQueue.songs[0];
        const playlistName = "Favoriler";
        
        let playlist = db.getPlaylist(interaction.user.id, playlistName);
        if (!playlist) {
            db.createPlaylist(interaction.user.id, playlistName, "Hızlı kaydedilenler", false);
        }
        
        const success = db.addSongToPlaylist(interaction.user.id, playlistName, song);
        if (success) {
            return interaction.reply({ 
                content: `❤️ **${song.title}** favorilere eklendi!`, 
                flags: MessageFlags.Ephemeral 
            });
        } else {
            return interaction.reply({ 
                content: '⚠️ Şarkı zaten favorilerde veya bir hata oluştu.', 
                flags: MessageFlags.Ephemeral 
            });
        }
    }

    // C. Autoplay (Benzerlerini Çal)
    if (interaction.customId === 'autoplay_toggle') {
        if (serverQueue.songs[0].requester.id !== interaction.user.id) {
            return interaction.reply({ 
                content: '⛔ Sadece şarkıyı açan kişi autoplay\'i değiştirebilir.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        serverQueue.autoplay = !serverQueue.autoplay;
        return interaction.reply({ 
            content: `♾️ Autoplay: **${serverQueue.autoplay ? 'AÇIK ✅' : 'KAPALI ❌'}**`, 
            flags: MessageFlags.Ephemeral 
        });
    }

    // D. Temel Kontroller
    switch (interaction.customId) {
        case 'music_pause':
            await interaction.deferUpdate();
            if (serverQueue.player.state.status === 'paused') {
                serverQueue.player.unpause();
            } else {
                serverQueue.player.pause();
            }
            break;

        case 'music_skip':
            await interaction.deferUpdate();
            serverQueue.player.stop(); // Şarkıyı bitirir, play.js'deki 'Idle' event'i sıradakini çalar
            break;

        case 'music_stop':
            await interaction.deferUpdate();
            serverQueue.songs = [];
            serverQueue.player.stop();
            if (serverQueue.connection) {
                serverQueue.connection.destroy();
            }
            client.queue.delete(interaction.guild.id);
            
            // Mesajı güncelle, bittiğini göster
            interaction.editReply({ 
                content: '🛑 Oturum sahibi tarafından sonlandırıldı.', 
                components: [] 
            }).catch(()=>{});
            break;

        case 'music_loop':
            await interaction.deferUpdate();
            serverQueue.loop = (serverQueue.loop + 1) % 3;
            const modes = ['⛔ Kapalı', '🔂 Tek', '🔁 Liste'];
            interaction.followUp({ 
                content: `Döngü Modu: **${modes[serverQueue.loop]}**`, 
                flags: MessageFlags.Ephemeral 
            });
            break;

        case 'music_shuffle':
            await interaction.deferUpdate();
            if (serverQueue.songs.length > 2) {
                const current = serverQueue.songs[0];
                const others = serverQueue.songs.slice(1).sort(() => Math.random() - 0.5);
                serverQueue.songs = [current, ...others];
                interaction.followUp({ 
                    content: '🔀 Liste karıştırıldı.', 
                    flags: MessageFlags.Ephemeral 
                });
            } else {
                interaction.followUp({ 
                    content: '❌ Karıştırmak için en az 3 şarkı gerek.', 
                    flags: MessageFlags.Ephemeral 
                });
            }
            break;

        case 'vol_down':
            await interaction.deferUpdate();
            serverQueue.volume = Math.max(0, serverQueue.volume - 10);
            if (serverQueue.resource && serverQueue.resource.volume) {
                serverQueue.resource.volume.setVolume(serverQueue.volume / 100);
            }
            break;

        case 'vol_up':
            await interaction.deferUpdate();
            serverQueue.volume = Math.min(150, serverQueue.volume + 10);
            if (serverQueue.resource && serverQueue.resource.volume) {
                serverQueue.resource.volume.setVolume(serverQueue.volume / 100);
            }
            break;
    }
}

// ==========================================
// 🛠️ YARDIMCI FONKSİYONLAR
// ==========================================

function hmsToSeconds(str) {
    if (!str || str === 'LIVE 🔴' || str.includes('LIVE')) return 0;
    const parts = str.split(':').map(Number);
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
    if (!seconds || seconds < 0) return '0:00';
    
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// [5] MESAJ DİNLEYİCİSİ (SETUP KANALI İÇİN)
client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;
    
    const settings = db.getMusicChannel ? db.getMusicChannel(message.guild.id) : null;
    
    if (settings && message.channel.id === settings.channelId) {
        setTimeout(() => message.delete().catch(() => {}), 500);

        if (!message.member.voice.channel) {
            const m = await message.channel.send(`❌ ${message.author}, önce bir ses kanalına gir.`);
            setTimeout(() => m.delete(), 3000);
            return;
        }
        
        const playCmd = client.commands.get('play');
        if (playCmd) {
            const fakeInt = {
                guild: message.guild,
                channel: message.channel,
                member: message.member,
                user: message.author,
                client: client,
                options: { 
                    getString: (name) => name === 'sorgu' ? message.content : null,
                    getInteger: () => null,
                    getBoolean: () => false
                },
                deferReply: async () => {},
                followUp: async (data) => {
                    const m = await message.channel.send(data);
                    if (!data.embeds) setTimeout(() => m.delete().catch(()=>{}), 5000);
                    return m;
                }
            };
            try { 
                console.log(`> [OTONOM] İstek: ${message.content}`);
                await playCmd.execute(fakeInt, client); 
            } catch(e) { 
                console.error('Otonom play hatası:', e);
            }
        }
    }
});

// [6] OTO-TEMİZLİK (BOT SES KANALINDAN DÜŞERSE)
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (oldState.member.id === client.user.id) {
        if (oldState.channelId && !newState.channelId) { 
            const queue = client.queue.get(oldState.guild.id);
            if (queue) {
                if (queue.player) queue.player.stop();
                if (queue.disconnectTimer) clearTimeout(queue.disconnectTimer);
                client.queue.delete(oldState.guild.id);
                console.log(`> [OTONOM] ${oldState.guild.name}: Bağlantı kesildi, temizlendi.`);
            }
        }
    }
});

// [7] BAŞLATMA
client.once(Events.ClientReady, c => {
    console.log(`> [SİSTEM] ${c.user.tag} GÖREVE HAZIR.`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('      SCP MÜZİK SİSTEMİ AKTİF          ');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Bot durumunu ayarla
    client.user.setActivity({ 
        name: '🎵 /play ile müzik çal', 
        type: ActivityType.Listening 
    });
    
    // Alternatif durumlar (her 30 saniyede bir değişsin)
    let statusIndex = 0;
    const statuses = [
        { name: '🎵 /play ile müzik çal', type: ActivityType.Listening },
        { name: `${client.guilds.cache.size} sunucu`, type: ActivityType.Watching },
        { name: 'SCP Music System v12', type: ActivityType.Playing },
        { name: '🎛️ /filter ile efekt uygula', type: ActivityType.Listening }
    ];
    
    setInterval(() => {
        statusIndex = (statusIndex + 1) % statuses.length;
        client.user.setActivity(statuses[statusIndex]);
    }, 30000);
});

client.login(process.env.DISCORD_TOKEN).catch(err => {
    console.error('❌ TOKEN HATASI: Discord token geçersiz veya eksik!');
    console.error('   .env dosyanızda DISCORD_TOKEN değişkenini kontrol edin.');
    process.exit(1);
});
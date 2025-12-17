// [SİSTEM ÇEKİRDEĞİ V9.1 - OMEGA ENTEGRASYONLU]
const { 
    Client, 
    GatewayIntentBits, 
    Collection, 
    ActivityType, 
    Partials,
    Events,
    EmbedBuilder
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const db = require('./db.js');
const lyricsFinder = require('lyrics-finder');
require('dotenv').config();

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
        try { await command.execute(interaction, client); } 
        catch (error) { 
            console.error(error); 
            if (!interaction.replied) interaction.reply({ content: '❌ Hata oluştu.', ephemeral: true });
        }
    }

    // B. AUTOCOMPLETE
    else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) await command.autocomplete(interaction, client);
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
                return interaction.reply({ content: '❌ Müziği yönetmek için ses kanalında olmalısın.', ephemeral: true });
            }
            
            // 2. Botun Ses Kanalı Kontrolü (Bot kanaldaysa ve kullanıcı farklı yerdeyse)
            if (interaction.guild.members.me.voice.channel && interaction.member.voice.channel.id !== interaction.guild.members.me.voice.channel.id) {
                return interaction.reply({ content: '❌ Bot ile aynı ses kanalında değilsin.', ephemeral: true });
            }

            // [DÜZELTME 1] Kuyruk Yoksa ve Stop Butonuna Basıldıysa Çökme Engelleme
            if (!serverQueue) {
                if (interaction.customId === 'music_stop') {
                    // Kuyruk zaten yoksa sadece mesajı güncelle ve butonları sil
                    return interaction.update({ content: '⏹️ Oturum zaten sonlandırılmış.', components: [] });
                }
                return interaction.reply({ content: '❌ Şu an çalan bir şey yok.', ephemeral: true });
            }

            // [DÜZELTME 2] KİŞİSEL KORUMA (Sadece Şarkıyı Açan Kullanabilir)
            // Eğer kuyrukta şarkı varsa ve butonlara basan kişi şarkıyı isteyen kişi (requester) değilse engelle.
            if (serverQueue.songs.length > 0) {
                const currentRequesterId = serverQueue.songs[0].requester.id;
                
                // Favori ekleme (pl_quick_save) ve Şarkı Sözü (lyrics) hariç tutulabilir, herkes kaydedebilsin.
                // Ama kontrol butonları (pause, skip, stop, loop) kilitlenmeli.
                const isPersonalControl = ['music_pause', 'music_skip', 'music_stop', 'music_loop', 'music_shuffle', 'vol_'].some(p => interaction.customId.startsWith(p));
                
                if (isPersonalControl && interaction.user.id !== currentRequesterId) {
                    return interaction.reply({ 
                        content: `⛔ **Erişim Reddedildi:** Bu kontrolleri sadece şarkıyı açan kişi (<@${currentRequesterId}>) kullanabilir.`, 
                        ephemeral: true 
                    });
                }
            }

            try {
                // --- 1. AÇILIR MENÜ (FİLTRE SEÇİMİ) ---
                if (interaction.isStringSelectMenu() && interaction.customId === 'music_filter_select') {
                    // Filtre seçimini de sadece şarkı sahibi yapsın istiyorsan buraya da yukarıdaki kontrolü ekleyebilirsin.
                    if (serverQueue.songs[0].requester.id !== interaction.user.id) {
                         return interaction.reply({ content: '⛔ Filtreleri sadece şarkıyı açan değiştirebilir.', ephemeral: true });
                    }

                    await interaction.deferReply({ ephemeral: true });
                    const selectedFilter = interaction.values[0];
                    
                    serverQueue.filterName = selectedFilter;
                    
                    const FILTERS = {
                        'clear': null,
                        'bassboost': 'bass=g=20,dynaudnorm=f=200',
                        'nightcore': 'asetrate=48000*1.25,aresample=48000,bass=g=5',
                        'vaporwave': 'asetrate=48000*0.8,aresample=48000,atempo=1.1',
                        '8d': 'apulsator=hz=0.125',
                        'karaoke': 'stereotools=mlev=0.015625'
                    };

                    serverQueue.filter = FILTERS[selectedFilter] || null;
                    
                    await interaction.editReply(`✅ **Filtre Seçildi:** \`${selectedFilter.toUpperCase()}\`\n*Not: Efektin uygulanması için bir sonraki şarkıya geçilmeli veya seek yapılmalıdır.*`);
                }

                // --- 2. BUTONLAR ---
                if (interaction.isButton()) {
                    
                    // A. Şarkı Sözleri
                    if (interaction.customId === 'lyrics_fetch') {
                        await interaction.deferReply({ ephemeral: true });
                        const song = serverQueue.songs[0];
                        let lyrics = null;
                        try {
                            lyrics = await lyricsFinder(song.title, "");
                            if (!lyrics) lyrics = await lyricsFinder("", song.title);
                        } catch (e) {}

                        if (!lyrics) return interaction.editReply('❌ Sözler bulunamadı.');

                        const embed = new EmbedBuilder()
                            .setColor('#F1C40F')
                            .setTitle(`📜 ${song.title}`)
                            .setDescription(lyrics.length > 4000 ? lyrics.substring(0, 4000) + '...' : lyrics)
                            .setFooter({ text: 'Genius Lyrics' });
                        
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
                            return interaction.reply({ content: `❤️ **${song.title}** favorilere eklendi!`, ephemeral: true });
                        } else {
                            return interaction.reply({ content: '⚠️ Şarkı zaten favorilerde veya bir hata oluştu.', ephemeral: true });
                        }
                    }

                    // C. Autoplay (Benzerlerini Çal)
                    if (interaction.customId === 'autoplay_toggle') {
                         if (serverQueue.songs[0].requester.id !== interaction.user.id) return interaction.reply({ content: '⛔ Yetkisiz.', ephemeral: true });

                        serverQueue.autoplay = !serverQueue.autoplay;
                        return interaction.reply({ 
                            content: `♾️ Autoplay: **${serverQueue.autoplay ? 'AÇIK ✅' : 'KAPALI ❌'}**`, 
                            ephemeral: true 
                        });
                    }

                    // D. Temel Kontroller
                    switch (interaction.customId) {
                        case 'music_pause':
                            await interaction.deferUpdate();
                            if (serverQueue.player.state.status === 'paused') serverQueue.player.unpause();
                            else serverQueue.player.pause();
                            break;

                        case 'music_skip':
                            await interaction.deferUpdate();
                            serverQueue.player.stop(); // Şarkıyı bitirir, play.js'deki 'Idle' event'i sıradakini çalar
                            break;

                        case 'music_stop':
                            // [DÜZELTME 3] ServerQueue kontrolü (Buraya geldiğinde serverQueue kesinlikle var demektir, yukarıda kontrol ettik)
                            await interaction.deferUpdate();
                            serverQueue.songs = [];
                            serverQueue.player.stop();
                            if (serverQueue.connection) serverQueue.connection.destroy();
                            client.queue.delete(interaction.guild.id);
                            
                            // Mesajı güncelle, bittiğini göster
                            interaction.editReply({ content: '🛑 Oturum sahibi tarafından sonlandırıldı.', components: [] }).catch(()=>{});
                            break;

                        case 'music_loop':
                            await interaction.deferUpdate();
                            serverQueue.loop = (serverQueue.loop + 1) % 3;
                            const modes = ['⛔ Kapalı', '🔂 Tek', '🔁 Liste'];
                            interaction.followUp({ content: `Döngü Modu: **${modes[serverQueue.loop]}**`, ephemeral: true });
                            break;

                        case 'music_shuffle':
                            await interaction.deferUpdate();
                            if (serverQueue.songs.length > 2) {
                                const current = serverQueue.songs[0];
                                const others = serverQueue.songs.slice(1).sort(() => Math.random() - 0.5);
                                serverQueue.songs = [current, ...others];
                                interaction.followUp({ content: '🔀 Liste karıştırıldı.', ephemeral: true });
                            } else {
                                interaction.followUp({ content: '❌ Karıştırmak için en az 3 şarkı gerek.', ephemeral: true });
                            }
                            break;

                        case 'vol_down':
                            await interaction.deferUpdate();
                            serverQueue.volume = Math.max(0, serverQueue.volume - 10);
                            serverQueue.resource.volume.setVolume(serverQueue.volume / 100);
                            break;

                        case 'vol_up':
                            await interaction.deferUpdate();
                            serverQueue.volume = Math.min(150, serverQueue.volume + 10);
                            serverQueue.resource.volume.setVolume(serverQueue.volume / 100);
                            break;
                    }
                }
            } catch (err) { console.error(err); }
        }
    }
});

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
            } catch(e) { console.error(e); }
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
    client.user.setActivity({ name: 'Vakıf Frekanslarını', type: ActivityType.Listening });
});

client.login(process.env.DISCORD_TOKEN);
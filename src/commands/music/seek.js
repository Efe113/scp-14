const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ComponentType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require('discord.js');
const { createAudioResource, StreamType } = require('@discordjs/voice');
const { spawn } = require('child_process');
const { checkDJ } = require('../../../utils');
const fs = require('fs');
const path = require('path');

// Play.js'den CONFIG ve yardımcı fonksiyonları al
const playModule = require('./play.js');

// Yapılandırma - play.js'den al
const CONFIG = playModule.CONFIG || {
    YTDLP_PATH: path.join(process.cwd(), 'yt-dlp.exe'),
    AUDIO_FILTERS: {
        'none': { name: 'Normal', emoji: '🔊', description: 'Hiçbir efekt uygulanmaz' },
        'bass_boost': { 
            name: 'Bass Boost', 
            emoji: '🔈', 
            description: 'Bassları güçlendirir',
            command: 'bass=g=15,dynaudnorm=f=200'
        },
        'nightcore': { 
            name: 'Nightcore', 
            emoji: '🌙', 
            description: 'Hızlandırılmış ve yüksek perdeli',
            command: 'asetrate=48000*1.25,aresample=48000,bass=g=8'
        },
        'vaporwave': { 
            name: 'Vaporwave', 
            emoji: '🌫️', 
            description: 'Yavaşlatılmış ve lo-fi',
            command: 'asetrate=48000*0.8,aresample=48000,atempo=0.9'
        },
        'karaoke': { 
            name: 'Karaoke', 
            emoji: '🎤', 
            description: 'Vokalleri azaltır',
            command: 'stereotools=mlev=0.03'
        },
        'surround': { 
            name: '3D Surround', 
            emoji: '🎧', 
            description: 'Spatial audio efekti',
            command: 'surround'
        },
        'radio': { 
            name: 'Eski Radyo', 
            emoji: '📻', 
            description: 'Vintage radyo efekti',
            command: 'highpass=f=200,lowpass=f=4000,afftdn=nf=-25'
        },
        'soft': { 
            name: 'Yumuşak', 
            emoji: '☁️', 
            description: 'Yumuşak ve rahatlatıcı',
            command: 'bass=g=-5,treble=g=5'
        },
        'party': { 
            name: 'Parti Modu', 
            emoji: '🎉', 
            description: 'Yüksek enerji ve bas',
            command: 'bass=g=20,treble=g=10,volume=1.5'
        }
    }
};

module.exports = {
    // 1. KOMUT TANIMI (Genişletilmiş)
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Şarkının zaman çizelgesinde ileri/geri sarar.')
        .addStringOption(option => 
            option.setName('zaman')
                .setDescription('Saniye (90), Format (1:30), Yüzde (%50) veya "rastgele"')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('birim')
                .setDescription('Zaman birimi (otomatik algılanır)')
                .addChoices(
                    { name: '⏱️ Saniye', value: 'seconds' },
                    { name: '📊 Yüzde', value: 'percentage' },
                    { name: '🎲 Rastgele', value: 'random' },
                    { name: '⏭️ Bölüm', value: 'section' }
                )
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('hassas')
                .setDescription('Hassas arama yap (yavaş ama doğru)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('geri_sarma')
                .setDescription('Geri sarma modu (negatif zaman için)')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('tampon')
                .setDescription('Tampon süresi ekle (5 saniye)')
                .setRequired(false)),

    // 2. KOMUT YÜRÜTME
    async execute(interaction, client) {
        // A. Güvenlik
        if (!checkDJ(interaction)) {
            return interaction.reply({ 
                content: '⛔ **Yetki Hatası:** DJ rolü gereklidir.', 
                ephemeral: true 
            });
        }
        
        const serverQueue = client.queue.get(interaction.guild.id);
        if (!serverQueue || !serverQueue.playing || !serverQueue.songs[0]) {
            return interaction.reply({ 
                content: '❌ Şu an sarılabilecek bir medya yok.', 
                ephemeral: true 
            });
        }

        const song = serverQueue.songs[0];
        
        // Canlı yayın kontrolü
        if (song.duration === 'LIVE 🔴' || song.radio) {
            return interaction.reply({ 
                content: '❌ Canlı yayınlarda zaman atlaması yapılamaz.', 
                ephemeral: true 
            });
        }

        // B. Zaman Hesaplama
        let inputTime = interaction.options.getString('zaman');
        const unitType = interaction.options.getString('birim');
        const preciseMode = interaction.options.getBoolean('hassas') || false;
        const rewindMode = interaction.options.getBoolean('geri_sarma') || false;
        const addBuffer = interaction.options.getBoolean('tampon') || false;
        
        const totalSeconds = hmsToSeconds(song.duration);
        
        // Toplam süre kontrolü
        if (totalSeconds <= 0) {
            return interaction.reply({ 
                content: '❌ Bu şarkının süre bilgisi yok veya canlı yayın.', 
                ephemeral: true 
            });
        }

        let targetSeconds;
        try {
            targetSeconds = await parseAdvancedTime(
                inputTime, 
                totalSeconds, 
                unitType, 
                rewindMode,
                interaction
            );
        } catch (error) {
            return interaction.reply({ 
                content: `❌ Zaman ayrıştırma hatası: ${error.message}`, 
                ephemeral: true 
            });
        }

        // Geçerlilik kontrolü
        if (targetSeconds < 0) targetSeconds = 0;
        if (targetSeconds >= totalSeconds - 1) {
            targetSeconds = totalSeconds - 5; // Şarkının bitmesine 5 saniye kala
        }

        await interaction.deferReply();

        // C. Seek Operasyonu
        const result = await performAdvancedSeek(
            serverQueue, 
            song, 
            targetSeconds, 
            {
                preciseMode,
                addBuffer,
                interaction,
                unitType,
                originalInput: inputTime
            }
        );

        // D. Gelişmiş Rapor Göster
        await sendAdvancedSeekReport(interaction, result, serverQueue, client);
    },
};

// ==========================================
// 🎯 GELİŞMİŞ ZAMAN AYRIŞTIRMA
// ==========================================

async function parseAdvancedTime(input, totalSeconds, unitType = 'auto', rewindMode = false, interaction = null) {
    input = input.trim().toLowerCase();
    
    // Özel durumlar
    if (input === 'rastgele' || input === 'random') {
        return Math.floor(Math.random() * totalSeconds);
    }
    
    if (input === 'yarı' || input === 'half') {
        return Math.floor(totalSeconds / 2);
    }
    
    if (input === 'çeyrek' || input === 'quarter') {
        return Math.floor(totalSeconds / 4);
    }
    
    if (input === 'son' || input === 'end') {
        return Math.max(0, totalSeconds - 30); // Son 30 saniye
    }
    
    if (input === 'baş' || input === 'start') {
        return 0;
    }

    // Yüzde formatı (%50)
    if (input.endsWith('%') || unitType === 'percentage') {
        const percentage = parseFloat(input.replace('%', ''));
        if (isNaN(percentage) || percentage < 0 || percentage > 100) {
            throw new Error('Geçersiz yüzde. 0-100 arasında olmalı.');
        }
        return Math.floor((percentage / 100) * totalSeconds);
    }

    // Bölüm formatı (örn: "2/3" veya "3:10/4:20")
    if (input.includes('/')) {
        return parseSectionTime(input, totalSeconds);
    }

    // Saniye formatı (90)
    if (/^\d+$/.test(input) || unitType === 'seconds') {
        let seconds = parseInt(input);
        if (rewindMode) seconds = -seconds;
        return seconds;
    }

    // Zaman formatı (1:30, 1:30:45)
    if (input.includes(':')) {
        const parts = input.split(':').reverse();
        let seconds = 0;
        if (parts[0]) seconds += parseFloat(parts[0]);
        if (parts[1]) seconds += parseInt(parts[1]) * 60;
        if (parts[2]) seconds += parseInt(parts[2]) * 3600;
        
        if (rewindMode) seconds = -seconds;
        return seconds;
    }

    // Metin formatı (örn: "1 dakika 30 saniye")
    const textTime = parseTextTime(input);
    if (textTime !== null) {
        return rewindMode ? -textTime : textTime;
    }

    throw new Error('Geçersiz zaman formatı. Örn: 90, 1:30, %50, rastgele');
}

function parseSectionTime(input, totalSeconds) {
    // Format: "2/3" veya "1:30/4:20"
    const [partStr, totalStr] = input.split('/');
    
    let partSeconds, totalParts;
    
    if (partStr.includes(':') && totalStr.includes(':')) {
        // Zaman formatı: "1:30/4:20"
        partSeconds = hmsToSeconds(partStr);
        totalParts = hmsToSeconds(totalStr);
    } else {
        // Sayı formatı: "2/3"
        const partNum = parseInt(partStr);
        totalParts = parseInt(totalStr);
        
        if (isNaN(partNum) || isNaN(totalParts) || totalParts <= 0 || partNum <= 0 || partNum > totalParts) {
            throw new Error('Geçersiz bölüm formatı. Örn: 2/3 veya 1:30/4:20');
        }
        
        // Bölüm başına düşen süre
        const sectionDuration = totalSeconds / totalParts;
        partSeconds = (partNum - 1) * sectionDuration;
    }
    
    return Math.min(partSeconds, totalSeconds - 1);
}

function parseTextTime(input) {
    const patterns = [
        // "1 dakika 30 saniye"
        /(\d+)\s*dakika(?:\s*(\d+)\s*saniye)?/i,
        // "2 saat 15 dakika"
        /(\d+)\s*saat(?:\s*(\d+)\s*dakika)?/i,
        // "30 saniye"
        /(\d+)\s*saniye/i,
        // "1.5 dakika" (ondalık)
        /(\d+(?:\.\d+)?)\s*dakika/i,
    ];

    for (const pattern of patterns) {
        const match = input.match(pattern);
        if (match) {
            const hours = input.includes('saat') ? parseInt(match[1]) || 0 : 0;
            const minutes = input.includes('dakika') ? parseFloat(match[1] || match[2] || 0) : 0;
            const seconds = input.includes('saniye') ? parseInt(match[1] || match[2] || 0) : 0;
            
            return (hours * 3600) + (minutes * 60) + seconds;
        }
    }

    return null;
}

// ==========================================
// 🎯 GELİŞMİŞ SEEK MOTORU
// ==========================================

async function performAdvancedSeek(queue, song, seconds, options = {}) {
    const {
        preciseMode = false,
        addBuffer = false,
        interaction = null,
        unitType = 'seconds',
        originalInput = ''
    } = options;

    try {
        // URL kontrolü
        if (!song.url || typeof song.url !== 'string' || !song.url.includes('http')) {
            console.error('Geçersiz URL:', song.url);
            throw new Error('Geçersiz şarkı URL\'si');
        }

        // Durum güncellemesi
        queue.isSeeking = true;
        
        // Tampon süresi ekle
        let seekSeconds = seconds;
        if (addBuffer && seekSeconds > 5) {
            seekSeconds -= 5; // 5 saniye geriden başla
        }

        // Hassas mod için ek argümanlar
        const ytArgs = buildSeekArguments(song.url, seekSeconds, queue, preciseMode);
        
        // FFmpeg ek argümanları
        if (preciseMode) {
            ytArgs.push('--external-downloader', 'ffmpeg');
            ytArgs.push('--external-downloader-args', 'ffmpeg_i:-ss');
        }

        console.log(`[SEEK] ${queue.textChannel.guild.name}: "${song.title}" -> ${formatTime(seconds)} (${unitType})`);

        // Akışı başlat
        const ytDlpProcess = spawn(CONFIG.YTDLP_PATH || path.join(process.cwd(), 'yt-dlp.exe'), ytArgs);

        // Hata yönetimi
        let processError = null;
        let errorLog = '';
        
        ytDlpProcess.stderr.on('data', (data) => {
            const errorStr = data.toString();
            errorLog += errorStr;
            
            if (errorStr.includes('ERROR') || errorStr.includes('WARNING')) {
                console.log(`[seek yt-dlp stderr] ${errorStr.trim()}`);
            }
            
            // Özel hata tespiti
            if (errorStr.includes('format is not available') || 
                errorStr.includes('Requested format') ||
                errorStr.includes('Unable to download')) {
                processError = errorStr;
            }
        });

        ytDlpProcess.on('error', (err) => {
            console.error('[seek yt-dlp process error]', err);
            processError = err.message;
        });

        // Hata durumunda fallback
        if (processError) {
            console.log('[SEEK] Fallback moda geçiliyor...');
            return await performSeekFallback(queue, song, seconds, options);
        }

        const resource = createAudioResource(ytDlpProcess.stdout, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true,
            metadata: {
                title: song.title,
                url: song.url,
                seekPosition: seconds
            }
        });

        resource.volume.setVolume(queue.volume / 100);
        queue.resource = resource;

        // Oynatıcıyı güncelle
        if (queue.player) {
            queue.player.stop();
            setTimeout(() => {
                queue.player.play(resource);
            }, 100);
        }

        // Seek bayrağını kaldır
        setTimeout(() => { 
            queue.isSeeking = false;
            queue.lastSeekTime = Date.now();
            queue.lastSeekPosition = seconds;
        }, 2000);

        // Sonuçları döndür
        const totalDuration = hmsToSeconds(song.duration);
        const percentage = totalDuration > 0 ? Math.round((seconds / totalDuration) * 100) : 0;
        
        return {
            success: true,
            position: seconds,
            formattedPosition: formatTime(seconds),
            totalDuration: song.duration,
            formattedTotal: formatTime(totalDuration),
            percentage: percentage,
            songTitle: song.title,
            mode: preciseMode ? 'hassas' : 'normal',
            unitType: unitType,
            originalInput: originalInput,
            bufferApplied: addBuffer,
            timestamp: new Date().toLocaleTimeString('tr-TR')
        };

    } catch (error) {
        console.error('Advanced seek hatası:', error);
        
        // Fallback denemesi
        try {
            return await performSeekFallback(queue, song, seconds, options);
        } catch (fallbackError) {
            throw new Error(`Seek işlemi başarısız: ${error.message}`);
        }
    }
}

function buildSeekArguments(url, seconds, queue, preciseMode = false) {
    const args = [
        '-o', '-',
        '-q',
        '-f', 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best',
        '--no-playlist',
        '--geo-bypass',
        '--no-warnings',
        '--force-ipv4',
        '--no-check-certificate',
        '--ignore-errors',
        '--compat-options', 'no-youtube-unavailable-videos',
        url
    ];

    // Hassas mod için ek ayarlar
    if (preciseMode) {
        args.push('--no-part');
        args.push('--hls-prefer-native');
        args.push('--no-cache-dir');
        args.push('--buffer-size', '64K');
    } else {
        args.push('--buffer-size', '32K');
    }

    // Filtreleri koru
    let filterCommand = null;
    
    if (queue.filterName && CONFIG.AUDIO_FILTERS[queue.filterName]) {
        const filterInfo = CONFIG.AUDIO_FILTERS[queue.filterName];
        if (filterInfo.command) {
            filterCommand = filterInfo.command;
        }
    } else if (queue.filter) {
        filterCommand = queue.filter;
    }

    // Filtre uygula
    if (filterCommand) {
        args.push('--ppa', `ffmpeg:-af ${filterCommand} -ac 2 -ar 48000`);
    }

    // SEEK PARAMETRESİ (en başa ekle)
    args.unshift('-ss', `${seconds}`);

    return args;
}

async function performSeekFallback(queue, song, seconds, options) {
    console.log(`[SEEK FALLBACK] Alternatif yöntem deneniyor: ${seconds}s`);
    
    // Basit yöntem: ffmpeg doğrudan
    const ffmpegArgs = [
        '-ss', `${seconds}`,
        '-i', song.url,
        '-f', 'mp3',
        '-ac', '2',
        '-ar', '48000',
        '-'
    ];

    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);
    
    const resource = createAudioResource(ffmpegProcess.stdout, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true
    });

    resource.volume.setVolume(queue.volume / 100);
    queue.resource = resource;

    if (queue.player) {
        queue.player.stop();
        queue.player.play(resource);
    }

    return {
        success: true,
        position: seconds,
        formattedPosition: formatTime(seconds),
        totalDuration: song.duration,
        formattedTotal: formatTime(hmsToSeconds(song.duration)),
        percentage: Math.round((seconds / hmsToSeconds(song.duration)) * 100),
        songTitle: song.title,
        mode: 'fallback',
        timestamp: new Date().toLocaleTimeString('tr-TR'),
        note: 'Fallback mod kullanıldı'
    };
}

// ==========================================
// 🎨 GELİŞMİŞ SEEK RAPORU
// ==========================================

async function sendAdvancedSeekReport(interaction, result, serverQueue, client) {
    const embed = new EmbedBuilder()
        .setColor(getSeekColor(result.percentage))
        .setTitle(`⏩ Zaman Çizelgesi Atlaması`)
        .setTimestamp();

    // Ana bilgiler
    let description = `**${result.songTitle}**\n\n`;
    
    // İlerleme çubuğu
    const totalSeconds = hmsToSeconds(result.totalDuration);
    const progressBar = createDynamicProgressBar(result.position, totalSeconds);
    
    description += `${progressBar}\n\n`;
    description += `⏱️ **Konum:** \`${result.formattedPosition} / ${result.formattedTotal}\`\n`;
    description += `📊 **Yüzde:** %${result.percentage}\n`;
    
    if (result.mode !== 'normal') {
        description += `⚡ **Mod:** ${result.mode === 'hassas' ? 'Hassas Arama' : 'Basit Mod'}\n`;
    }
    
    if (result.bufferApplied) {
        description += `🛡️ **Tampon:** 5 saniye uygulandı\n`;
    }
    
    if (result.note) {
        description += `📝 **Not:** ${result.note}\n`;
    }

    embed.setDescription(description);

    // İstatistikler
    const statsFields = [];
    
    // Kalan süre
    const remainingSeconds = totalSeconds - result.position;
    if (remainingSeconds > 0) {
        statsFields.push({ 
            name: '⏳ Kalan Süre', 
            value: formatTime(remainingSeconds), 
            inline: true 
        });
    }
    
    // Atlanan süre
    if (serverQueue.lastSeekPosition !== undefined) {
        const lastSeekDiff = Math.abs(result.position - serverQueue.lastSeekPosition);
        if (lastSeekDiff > 0) {
            statsFields.push({ 
                name: '↔️ Son Atlama', 
                value: formatTime(lastSeekDiff), 
                inline: true 
            });
        }
    }
    
    // Ortalama atlama
    statsFields.push({ 
        name: '📈 İlerleme', 
        value: `${Math.floor((result.position / totalSeconds) * 100)}% tamamlandı`, 
        inline: true 
    });

    // Filtre ve ses bilgisi
    const activeFilterName = CONFIG.AUDIO_FILTERS[serverQueue.filterName]?.name || 'Normal';
    statsFields.push({ 
        name: '🎛️ Filtre', 
        value: activeFilterName, 
        inline: true 
    });
    
    statsFields.push({ 
        name: '🔊 Ses', 
        value: `%${serverQueue.volume}`, 
        inline: true 
    });
    
    // İstekçi bilgisi
    if (serverQueue.songs[0].requester) {
        statsFields.push({ 
            name: '👤 İstekçi', 
            value: serverQueue.songs[0].requester.username, 
            inline: true 
        });
    }

    // Alanları ekle
    if (statsFields.length > 0) {
        embed.addFields(statsFields);
    }

    // Alt bilgi
    embed.setFooter({ 
        text: `SCP Music System • ${result.timestamp} • ${serverQueue.songs.length} şarkı kuyrukta` 
    });

    // Görsel ekle (şarkı thumbnail'i)
    if (serverQueue.songs[0].thumbnail) {
        embed.setThumbnail(serverQueue.songs[0].thumbnail);
    }

    // Butonlar
    const actionRow1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('seek_quick_back_30')
            .setLabel('-30s')
            .setEmoji('⏪')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('seek_quick_back_10')
            .setLabel('-10s')
            .setEmoji('◀️')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('seek_custom')
            .setLabel('Özel Zaman')
            .setEmoji('🎯')
            .setStyle(ButtonStyle.Primary),
        
        new ButtonBuilder()
            .setCustomId('seek_quick_forward_10')
            .setLabel('+10s')
            .setEmoji('▶️')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('seek_quick_forward_30')
            .setLabel('+30s')
            .setEmoji('⏩')
            .setStyle(ButtonStyle.Secondary)
    );

    const actionRow2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('seek_jump_start')
            .setLabel('Başa Dön')
            .setEmoji('⏮️')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('seek_jump_mid')
            .setLabel('Ortaya Git')
            .setEmoji('⏸️')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('seek_jump_end')
            .setLabel('Sona Git')
            .setEmoji('⏭️')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('seek_advanced')
            .setLabel('Gelişmiş')
            .setEmoji('⚙️')
            .setStyle(ButtonStyle.Secondary)
    );

    const actionRow3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('seek_undo')
            .setLabel('Geri Al')
            .setEmoji('↩️')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!serverQueue.lastSeekPosition),
        
        new ButtonBuilder()
            .setCustomId('seek_save')
            .setLabel('Kaydet')
            .setEmoji('💾')
            .setStyle(ButtonStyle.Success),
        
        new ButtonBuilder()
            .setCustomId('seek_share')
            .setLabel('Paylaş')
            .setEmoji('📤')
            .setStyle(ButtonStyle.Secondary),
        
        new ButtonBuilder()
            .setCustomId('seek_close')
            .setLabel('Kapat')
            .setEmoji('❌')
            .setStyle(ButtonStyle.Danger)
    );

    const message = await interaction.editReply({ 
        embeds: [embed], 
        components: [actionRow1, actionRow2, actionRow3] 
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
        
        const currentPosition = result.position;
        const totalDuration = hmsToSeconds(result.totalDuration);
        let newPosition = currentPosition;
        
        // Hızlı atlama butonları
        if (i.customId.startsWith('seek_quick_')) {
            const amount = parseInt(i.customId.split('_').pop());
            
            if (i.customId.includes('back')) {
                newPosition = Math.max(0, currentPosition - amount);
            } else if (i.customId.includes('forward')) {
                newPosition = Math.min(totalDuration - 1, currentPosition + amount);
            }
            
            // Yeni seek işlemi
            const newResult = await performAdvancedSeek(
                serverQueue, 
                serverQueue.songs[0], 
                newPosition, 
                {
                    interaction: i,
                    preciseMode: false
                }
            );
            
            // Raporu güncelle
            await sendAdvancedSeekReport(interaction, newResult, serverQueue, client);
            return;
        }
        
        // Özel atlama butonları
        switch (i.customId) {
            case 'seek_jump_start':
                newPosition = 0;
                break;
                
            case 'seek_jump_mid':
                newPosition = Math.floor(totalDuration / 2);
                break;
                
            case 'seek_jump_end':
                newPosition = Math.max(0, totalDuration - 30); // Son 30 saniye
                break;
                
            case 'seek_custom':
                await showCustomSeekModal(i, serverQueue, interaction, client);
                collector.stop();
                return;
                
            case 'seek_advanced':
                await showAdvancedSeekMenu(i, serverQueue, interaction, client);
                collector.stop();
                return;
                
            case 'seek_undo':
                if (serverQueue.lastSeekPosition !== undefined) {
                    newPosition = serverQueue.lastSeekPosition;
                }
                break;
                
            case 'seek_save':
                await saveSeekPosition(i, serverQueue, currentPosition);
                return;
                
            case 'seek_share':
                await shareSeekPosition(i, serverQueue, currentPosition);
                return;
                
            case 'seek_close':
                collector.stop();
                await i.editReply({ components: [] });
                return;
        }
        
        // Eğer pozisyon değiştiyse yeni seek yap
        if (newPosition !== currentPosition) {
            const newResult = await performAdvancedSeek(
                serverQueue, 
                serverQueue.songs[0], 
                newPosition, 
                {
                    interaction: i,
                    preciseMode: false
                }
            );
            
            await sendAdvancedSeekReport(interaction, newResult, serverQueue, client);
        }
    });

    collector.on('end', () => {
        // Butonları devre dışı bırak
        const disabledRow1 = ActionRowBuilder.from(actionRow1);
        const disabledRow2 = ActionRowBuilder.from(actionRow2);
        const disabledRow3 = ActionRowBuilder.from(actionRow3);
        
        disabledRow1.components.forEach(btn => btn.setDisabled(true));
        disabledRow2.components.forEach(btn => btn.setDisabled(true));
        disabledRow3.components.forEach(btn => btn.setDisabled(true));
        
        interaction.editReply({ components: [disabledRow1, disabledRow2, disabledRow3] }).catch(() => {});
    });
}

// ==========================================
// 🎨 ÖZEL SEEK MODALI VE MENÜLERİ
// ==========================================

async function showCustomSeekModal(interaction, queue, originalInteraction, client) {
    const modal = new ModalBuilder()
        .setCustomId('custom_seek_modal')
        .setTitle('Özel Zaman Atlaması');

    const timeInput = new TextInputBuilder()
        .setCustomId('seek_time')
        .setLabel('Zaman (örn: 90, 1:30, %50, rastgele)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('90 veya 1:30 veya %50')
        .setMaxLength(50);

    const optionsInput = new TextInputBuilder()
        .setCustomId('seek_options')
        .setLabel('Seçenekler (hassas, tampon, geri)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('hassas, tampon, geri (virgülle ayır)')
        .setMaxLength(100);

    const row1 = new ActionRowBuilder().addComponents(timeInput);
    const row2 = new ActionRowBuilder().addComponents(optionsInput);
    
    modal.addComponents(row1, row2);

    await interaction.showModal(modal);

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'custom_seek_modal';
        const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 60000 });
        
        const timeValue = modalInteraction.fields.getTextInputValue('seek_time');
        const optionsValue = modalInteraction.fields.getTextInputValue('seek_options') || '';
        
        const options = {
            preciseMode: optionsValue.includes('hassas'),
            addBuffer: optionsValue.includes('tampon'),
            rewindMode: optionsValue.includes('geri')
        };
        
        await modalInteraction.deferUpdate();
        
        // Zamanı parse et
        const totalSeconds = hmsToSeconds(queue.songs[0].duration);
        const targetSeconds = await parseAdvancedTime(
            timeValue, 
            totalSeconds, 
            'auto', 
            options.rewindMode,
            modalInteraction
        );
        
        // Seek işlemi
        const result = await performAdvancedSeek(
            queue, 
            queue.songs[0], 
            targetSeconds, 
            {
                ...options,
                interaction: modalInteraction,
                originalInput: timeValue
            }
        );
        
        // Raporu göster
        await sendAdvancedSeekReport(originalInteraction, result, queue, client);
        
    } catch (error) {
        console.error('Custom seek modal hatası:', error);
        await interaction.followUp({ 
            content: `❌ Özel seek hatası: ${error.message}`, 
            ephemeral: true 
        });
    }
}

async function showAdvancedSeekMenu(interaction, queue, originalInteraction, client) {
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('advanced_seek_menu')
        .setPlaceholder('Gelişmiş seek seçenekleri...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('🎯 Hassas Arama')
                .setDescription('Daha doğru ama yavaş arama')
                .setValue('precise'),
            
            new StringSelectMenuOptionBuilder()
                .setLabel('🛡️ Tamponlu Arama')
                .setDescription('5 saniye geriden başla')
                .setValue('buffered'),
            
            new StringSelectMenuOptionBuilder()
                .setLabel('🔢 Yüzde ile Git')
                .setDescription('Yüzde belirterek git')
                .setValue('percentage'),
            
            new StringSelectMenuOptionBuilder()
                .setLabel('📊 Bölümlere Git')
                .setDescription('Şarkıyı bölümlere ayır')
                .setValue('sections'),
            
            new StringSelectMenuOptionBuilder()
                .setLabel('🎲 Rastgele Konum')
                .setDescription('Şarkıda rastgele yere git')
                .setValue('random')
        );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const message = await interaction.followUp({
        content: '⚙️ **Gelişmiş Seek Seçenekleri:**',
        components: [row],
        ephemeral: true
    });

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'advanced_seek_menu';
        const response = await message.awaitMessageComponent({ filter, time: 30000 });
        
        await response.deferUpdate();
        await message.delete().catch(() => {});
        
        const selectedOption = response.values[0];
        const song = queue.songs[0];
        const totalSeconds = hmsToSeconds(song.duration);
        let targetSeconds;
        
        switch (selectedOption) {
            case 'precise':
                // Hassas mod ile mevcut pozisyonda kal
                targetSeconds = queue.lastSeekPosition || 0;
                break;
                
            case 'buffered':
                // Tamponlu mod
                targetSeconds = Math.max(0, (queue.lastSeekPosition || 0) - 5);
                break;
                
            case 'percentage':
                // Yüzde modalı göster
                await showPercentageModal(response, queue, originalInteraction, client);
                return;
                
            case 'sections':
                // Bölüm seçme menüsü
                await showSectionMenu(response, queue, originalInteraction, client);
                return;
                
            case 'random':
                // Rastgele pozisyon
                targetSeconds = Math.floor(Math.random() * totalSeconds);
                break;
        }
        
        // Seek işlemi
        const result = await performAdvancedSeek(
            queue, 
            song, 
            targetSeconds, 
            {
                preciseMode: selectedOption === 'precise',
                addBuffer: selectedOption === 'buffered',
                interaction: response,
                unitType: selectedOption
            }
        );
        
        // Raporu göster
        await sendAdvancedSeekReport(originalInteraction, result, queue, client);
        
    } catch (error) {
        await message.delete().catch(() => {});
    }
}

async function showPercentageModal(interaction, queue, originalInteraction, client) {
    const modal = new ModalBuilder()
        .setCustomId('percentage_seek_modal')
        .setTitle('Yüzde ile Zaman Atla');

    const percentageInput = new TextInputBuilder()
        .setCustomId('seek_percentage')
        .setLabel('Yüzde değeri (0-100)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('örn: 50 (şarkının yarısı)')
        .setMaxLength(3);

    const row = new ActionRowBuilder().addComponents(percentageInput);
    modal.addComponents(row);

    await interaction.showModal(modal);

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'percentage_seek_modal';
        const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 30000 });
        
        const percentage = parseFloat(modalInteraction.fields.getTextInputValue('seek_percentage'));
        
        if (isNaN(percentage) || percentage < 0 || percentage > 100) {
            return modalInteraction.reply({ 
                content: '❌ Geçersiz yüzde değeri. 0-100 arasında olmalı.', 
                ephemeral: true 
            });
        }
        
        await modalInteraction.deferUpdate();
        
        const song = queue.songs[0];
        const totalSeconds = hmsToSeconds(song.duration);
        const targetSeconds = Math.floor((percentage / 100) * totalSeconds);
        
        // Seek işlemi
        const result = await performAdvancedSeek(
            queue, 
            song, 
            targetSeconds, 
            {
                interaction: modalInteraction,
                unitType: 'percentage',
                originalInput: `${percentage}%`
            }
        );
        
        // Raporu göster
        await sendAdvancedSeekReport(originalInteraction, result, queue, client);
        
    } catch (error) {
        console.error('Percentage modal hatası:', error);
    }
}

async function showSectionMenu(interaction, queue, originalInteraction, client) {
    const song = queue.songs[0];
    const totalSeconds = hmsToSeconds(song.duration);
    
    // Bölüm seçenekleri oluştur
    const sections = [
        { label: '🎵 Giriş (İlk %10)', value: '0.1', emoji: '🎶' },
        { label: '📈 Yükseliş (İlk %25)', value: '0.25', emoji: '📈' },
        { label: '🎤 Nakarat (İlk %33)', value: '0.33', emoji: '🎤' },
        { label: '🎼 Orta Bölüm (%50)', value: '0.5', emoji: '🎼' },
        { label: '🎸 Solo (%66)', value: '0.66', emoji: '🎸' },
        { label: '📉 Final (%75)', value: '0.75', emoji: '📉' },
        { label: '🎹 Outro (Son %10)', value: '0.9', emoji: '🎹' }
    ];

    const options = sections.map(section => 
        new StringSelectMenuOptionBuilder()
            .setLabel(section.label)
            .setDescription(`${formatTime(totalSeconds * parseFloat(section.value))} konumu`)
            .setValue(section.value)
            .setEmoji(section.emoji)
    );

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('section_seek_menu')
        .setPlaceholder('Bir bölüm seçin...')
        .addOptions(options);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const message = await interaction.followUp({
        content: '📊 **Şarkı Bölümleri:** Hangi bölüme gitmek istersiniz?',
        components: [row],
        ephemeral: true
    });

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'section_seek_menu';
        const response = await message.awaitMessageComponent({ filter, time: 30000 });
        
        await response.deferUpdate();
        await message.delete().catch(() => {});
        
        const sectionRatio = parseFloat(response.values[0]);
        const targetSeconds = Math.floor(totalSeconds * sectionRatio);
        
        // Seek işlemi
        const result = await performAdvancedSeek(
            queue, 
            song, 
            targetSeconds, 
            {
                interaction: response,
                unitType: 'section',
                originalInput: `${Math.round(sectionRatio * 100)}% bölüm`
            }
        );
        
        // Raporu göster
        await sendAdvancedSeekReport(originalInteraction, result, queue, client);
        
    } catch (error) {
        await message.delete().catch(() => {});
    }
}

// ==========================================
// 💾 KAYDETME VE PAYLAŞMA
// ==========================================

async function saveSeekPosition(interaction, queue, position) {
    const song = queue.songs[0];
    const totalSeconds = hmsToSeconds(song.duration);
    const percentage = Math.round((position / totalSeconds) * 100);
    
    const modal = new ModalBuilder()
        .setCustomId('save_seek_modal')
        .setTitle('Seek Pozisyonunu Kaydet');

    const nameInput = new TextInputBuilder()
        .setCustomId('bookmark_name')
        .setLabel('Yer imi adı')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder(`örn: ${song.title.substring(0, 20)}... ${percentage}%`)
        .setMaxLength(50);

    const notesInput = new TextInputBuilder()
        .setCustomId('bookmark_notes')
        .setLabel('Notlar (isteğe bağlı)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder('Bu şarkının en güzel bölümü...')
        .setMaxLength(500);

    const row1 = new ActionRowBuilder().addComponents(nameInput);
    const row2 = new ActionRowBuilder().addComponents(notesInput);
    
    modal.addComponents(row1, row2);

    await interaction.showModal(modal);

    try {
        const filter = i => i.user.id === interaction.user.id && i.customId === 'save_seek_modal';
        const modalInteraction = await interaction.awaitModalSubmit({ filter, time: 60000 });
        
        const name = modalInteraction.fields.getTextInputValue('bookmark_name');
        const notes = modalInteraction.fields.getTextInputValue('bookmark_notes');
        
        // Veritabanına kaydet (db.js gerektirir)
        const db = require('../../db.js');
        if (db.saveSeekBookmark) {
            db.saveSeekBookmark(
                interaction.user.id,
                song.url,
                song.title,
                position,
                totalSeconds,
                name,
                notes
            );
            
            await modalInteraction.reply({ 
                content: `✅ **${name}** yer imi kaydedildi!`, 
                ephemeral: true 
            });
        } else {
            // Fallback: JSON dosyasına kaydet
            saveToLocalBookmarks(interaction.user.id, {
                song: song.title,
                url: song.url,
                position: position,
                total: totalSeconds,
                percentage: percentage,
                name: name,
                notes: notes,
                timestamp: Date.now()
            });
            
            await modalInteraction.reply({ 
                content: `📝 **${name}** yer imi kaydedildi (yerel)`, 
                ephemeral: true 
            });
        }
        
    } catch (error) {
        console.error('Seek kaydetme hatası:', error);
        await interaction.followUp({ 
            content: '❌ Yer imi kaydedilemedi.', 
            ephemeral: true 
        });
    }
}

function saveToLocalBookmarks(userId, bookmark) {
    const bookmarksPath = path.join(__dirname, '../../seek_bookmarks.json');
    let bookmarks = {};
    
    try {
        if (fs.existsSync(bookmarksPath)) {
            bookmarks = JSON.parse(fs.readFileSync(bookmarksPath, 'utf-8'));
        }
        
        if (!bookmarks[userId]) {
            bookmarks[userId] = [];
        }
        
        bookmarks[userId].push(bookmark);
        
        // En fazla 100 yer imi sakla
        if (bookmarks[userId].length > 100) {
            bookmarks[userId] = bookmarks[userId].slice(-100);
        }
        
        fs.writeFileSync(bookmarksPath, JSON.stringify(bookmarks, null, 2));
    } catch (error) {
        console.error('Yer imi dosyasına yazma hatası:', error);
    }
}

async function shareSeekPosition(interaction, queue, position) {
    const song = queue.songs[0];
    const totalSeconds = hmsToSeconds(song.duration);
    const percentage = Math.round((position / totalSeconds) * 100);
    const formattedTime = formatTime(position);
    const formattedTotal = formatTime(totalSeconds);
    
    const shareText = `🎵 **${song.title}**\n` +
                     `⏱️ ${formattedTime} / ${formattedTotal} (%${percentage})\n` +
                     `🔗 ${song.url}&t=${Math.floor(position)}s\n` +
                     `👤 Paylaşan: ${interaction.user.username}`;
    
    await interaction.followUp({ 
        content: shareText, 
        ephemeral: true 
    });
}

// ==========================================
// 🛠️ YARDIMCI FONKSİYONLAR
// ==========================================

function getSeekColor(percentage) {
    if (percentage < 25) return '#3498db'; // Mavi (başlangıç)
    if (percentage < 50) return '#2ecc71'; // Yeşil (ilk yarı)
    if (percentage < 75) return '#f1c40f'; // Sarı (ortalar)
    return '#e74c3c'; // Kırmızı (sonlar)
}

function hmsToSeconds(str) {
    if (!str || str === 'LIVE 🔴' || str.includes('LIVE')) return 0;
    const p = str.split(':').map(Number);
    let s = 0, m = 1;
    while (p.length > 0) { 
        s += m * p.pop(); 
        m *= 60; 
    }
    return s;
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

function createDynamicProgressBar(current, total, length = 20) {
    if (total <= 0 || current < 0) return '▬'.repeat(length) + '🔘';
    
    const progress = Math.min(1, current / total);
    const filled = Math.round(progress * length);
    const empty = length - filled;
    
    let bar = '';
    
    // İlk kısım: dolu kısım
    for (let i = 0; i < filled; i++) {
        // Farklı karakterlerle renklendirme
        if (i < filled * 0.3) {
            bar += '▬'; // Başlangıç
        } else if (i < filled * 0.7) {
            bar += '■'; // Orta
        } else {
            bar += '█'; // Son
        }
    }
    
    // İşaretçi
    bar += '🔘';
    
    // Kalan kısım
    for (let i = 0; i < empty - 1; i++) {
        bar += '▬';
    }
    
    return `\`${bar}\``;
}

// performSeek fonksiyonunu dışa aktar (index.js için)
module.exports.performSeek = performAdvancedSeek;

// Otomatik tamamlama için
module.exports.autocomplete = async function(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    
    if (focusedOption.name === 'zaman') {
        const suggestions = [
            { name: '🎲 Rastgele konuma git', value: 'rastgele' },
            { name: '⏱️ Yarıya git (%50)', value: 'yarı' },
            { name: '📊 Çeyreğe git (%25)', value: 'çeyrek' },
            { name: '⏮️ Başa dön (0:00)', value: 'baş' },
            { name: '⏭️ Sona git (son 30s)', value: 'son' },
            { name: '🎵 Nakarat bölümü (~%33)', value: '33%' },
            { name: '🎸 Solo bölümü (~%66)', value: '66%' }
        ];
        
        const filtered = suggestions.filter(s => 
            s.name.toLowerCase().includes(focusedOption.value.toLowerCase()) ||
            s.value.includes(focusedOption.value.toLowerCase())
        );
        
        return interaction.respond(
            filtered.slice(0, 25).map(s => ({ 
                name: s.name, 
                value: s.value 
            }))
        );
    }
};
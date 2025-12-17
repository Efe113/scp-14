const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ComponentType 
} = require('discord.js');
const { createAudioResource, StreamType } = require('@discordjs/voice');
const { spawn } = require('child_process');
const { checkDJ } = require('../../../utils');
const fs = require('fs');
const path = require('path');

// Yapılandırma
const CONFIG = {
    YTDLP_PATH: path.join(process.cwd(), 'yt-dlp.exe'),
    FILTERS: { // play.js ile aynı filtreler
        'bassboost': 'bass=g=20,dynaudnorm=f=200',
        'nightcore': 'asetrate=48000*1.25,aresample=48000,bass=g=5',
        'vaporwave': 'asetrate=48000*0.8,aresample=48000,atempo=1.1',
        '8d': 'apulsator=hz=0.125',
        'karaoke': 'stereotools=mlev=0.015625',
        'normalizer': 'loudnorm=I=-16:TP=-1.5:LRA=11'
    }
};

module.exports = {
    // 1. KOMUT TANIMI
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Şarkının zaman çizelgesinde ileri/geri sarar.')
        .addStringOption(option => 
            option.setName('zaman')
                .setDescription('Saniye (90) veya Format (1:30)')
                .setRequired(true)),

    // 2. KOMUT YÜRÜTME
    async execute(interaction, client) {
        // A. Güvenlik
        if (!checkDJ(interaction)) return interaction.reply({ content: '⛔ **Yetki Hatası:** DJ rolü gereklidir.', ephemeral: true });
        
        const serverQueue = client.queue.get(interaction.guild.id);
        if (!serverQueue || !serverQueue.playing || !serverQueue.songs[0]) {
            return interaction.reply({ content: '❌ Şu an sarılabilecek bir medya yok.', ephemeral: true });
        }

        const song = serverQueue.songs[0];
        
        // Canlı yayın kontrolü
        if (song.duration === 'LIVE' || song.isLive || song.radio) {
            return interaction.reply({ content: '❌ Canlı yayınlarda zaman atlaması yapılamaz.', ephemeral: true });
        }

        // B. Zaman Hesaplama
        let inputTime = interaction.options.getString('zaman');
        let targetSeconds = parseTime(inputTime);
        let totalSeconds = hmsToSeconds(song.duration);

        if (targetSeconds === null) return interaction.reply({ content: '❌ Geçersiz format. Örn: `90`, `1:30`', ephemeral: true });
        if (targetSeconds >= totalSeconds) targetSeconds = totalSeconds - 1; // Sona gelirse bitmesin diye -1
        if (targetSeconds < 0) targetSeconds = 0;

        await interaction.deferReply();

        // C. Seek Operasyonu
        await performSeek(serverQueue, song, targetSeconds, interaction);
    },
};

// ==========================================
// 🛠️ MOTOR FONKSİYONLARI
// ==========================================

async function performSeek(queue, song, seconds, interactionOrUpdate) {
    try {
        // 1. Durum Güncellemesi
        queue.isSeeking = true; // Play.js'deki 'Idle' event'inin şarkıyı geçmesini engellemek için
        
        // 2. FFmpeg Argümanlarını Hazırla (Play.js ile aynı olmalı)
        const ytArgs = [
            '-o', '-', 
            '-q', 
            '-f', 'bestaudio', 
            '--no-playlist', 
            '--geo-bypass', 
            '--buffer-size', '16K', 
            '--force-ipv4', 
            '--no-check-certificate',
            song.url
        ];

        // Filtreleri Koru
        const filters = [];
        filters.push(CONFIG.FILTERS['normalizer']);
        
        // Eğer play.js'de queue.filterName varsa, filtre metnini bul
        if (queue.filterName && CONFIG.FILTERS[queue.filterName]) {
            filters.push(CONFIG.FILTERS[queue.filterName]); // 'bassboost' gibi key'den değeri al
        } else if (queue.filter) {
            filters.push(queue.filter); // Direkt string ise
        }

        if (filters.length > 0) {
            ytArgs.push('--ppa', `ffmpeg:-af ${filters.join(',')} -ac 2 -ar 48000`);
        }

        // SEEK PARAMETRESİ (En Önemli Kısım)
        // yt-dlp'de --begin kullanmak bazen yavaştır, ffmpeg -ss daha hızlıdır.
        // Ancak yt-dlp üzerinden akış aldığımız için --downloader ffmpeg kullanabiliriz.
        // Basitlik ve stabilite için yt-dlp'nin yerleşik seek'ini kullanıyoruz:
        ytArgs.unshift(`-ss`, `${seconds}`); // Start Time

        // 3. Akışı Başlat
        const ytDlpProcess = spawn(CONFIG.YTDLP_PATH, ytArgs);

        const resource = createAudioResource(ytDlpProcess.stdout, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true 
        });

        resource.volume.setVolume(queue.volume / 100);
        queue.resource = resource;

        // 4. Oynatıcıyı Güncelle
        if (queue.player) {
            queue.player.stop(); // Eskiyi durdur
            queue.player.play(resource); // Yeniyi çal
        }

        // Seek bayrağını kaldır
        setTimeout(() => { queue.isSeeking = false; }, 2000);

        // 5. Görsel Arayüz (Dashboard)
        const total = hmsToSeconds(song.duration);
        const progressBar = createProgressBar(seconds, total);
        const timestamp = new Date(seconds * 1000).toISOString().slice(11, 19).replace(/^00:/, '');

        const embed = new EmbedBuilder()
            .setColor('#e67e22')
            .setTitle('⏩ Zaman Çizelgesi')
            .setDescription(`**${song.title}**\n\n${progressBar}\n\n⏱️ **Konum:** \`${timestamp} / ${song.duration}\``)
            .setFooter({ text: 'İnce ayar için butonları kullanın 👇' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('seek_rw_15').setLabel('-15s').setStyle(ButtonStyle.Secondary).setEmoji('⏪'),
            new ButtonBuilder().setCustomId('seek_rw_5').setLabel('-5s').setStyle(ButtonStyle.Secondary).setEmoji('◀️'),
            new ButtonBuilder().setCustomId('seek_fw_5').setLabel('+5s').setStyle(ButtonStyle.Secondary).setEmoji('▶️'),
            new ButtonBuilder().setCustomId('seek_fw_15').setLabel('+15s').setStyle(ButtonStyle.Secondary).setEmoji('⏩')
        );

        // Mesajı Gönder/Güncelle
        let message;
        if (interactionOrUpdate.editReply && !interactionOrUpdate.replied && !interactionOrUpdate.deferred) {
             // Normal güncelleme
             message = await interactionOrUpdate.update({ embeds: [embed], components: [row] });
        } else if (interactionOrUpdate.followUp) {
             // İlk yanıt
             message = await interactionOrUpdate.followUp({ embeds: [embed], components: [row] });
        } else {
             // Collector güncellemesi (deferUpdate yapılmışsa)
             message = await interactionOrUpdate.editReply({ embeds: [embed], components: [row] });
        }

        // 6. Collector (Canlı Dinleyici)
        // Eğer bu bir 'butona basma' işlemiyse tekrar collector açmayalım, mevcut döngü devam etsin.
        // Ama recursive yapıda her seferinde yeni mesaj atılıyorsa collector da yenilenmeli.
        // En iyisi: Tek bir mesaj üzerinden editleme yapmak.
        
        const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

        collector.on('collect', async i => {
            if (!checkDJ(i)) return i.reply({ content: '⛔ Yetkisiz.', ephemeral: true });
            
            await i.deferUpdate();
            collector.stop(); // Eski collector'ı durdur (hafıza sızıntısı önleme)

            let newSec = seconds;
            switch(i.customId) {
                case 'seek_rw_15': newSec -= 15; break;
                case 'seek_rw_5': newSec -= 5; break;
                case 'seek_fw_5': newSec += 5; break;
                case 'seek_fw_15': newSec += 15; break;
            }
            
            if (newSec < 0) newSec = 0;
            if (newSec >= total) newSec = total - 5;

            performSeek(queue, song, newSec, i);
        });

    } catch (e) {
        console.error(e);
        if(interactionOrUpdate.channel) interactionOrUpdate.channel.send('❌ Seek işlemi sırasında hata oluştu.');
    }
}

// --- YARDIMCILAR ---

function parseTime(input) {
    if (!input) return null;
    if (/^\d+$/.test(input)) return parseInt(input);
    if (input.includes(':')) {
        const p = input.split(':').reverse();
        let s = 0;
        if (p[0]) s += parseInt(p[0]);
        if (p[1]) s += parseInt(p[1]) * 60;
        if (p[2]) s += parseInt(p[2]) * 3600;
        return s;
    }
    return null;
}

function hmsToSeconds(str) {
    if (!str) return 0;
    const p = str.split(':').map(Number);
    let s = 0, m = 1;
    while (p.length > 0) { s += m * p.pop(); m *= 60; }
    return s;
}

function createProgressBar(current, total) {
    const size = 15;
    const progress = Math.round((current / total) * size);
    const empty = size - progress;
    return `\`${'▬'.repeat(progress)}🔘${'▬'.repeat(Math.max(0, empty - 1))}\``;
}
const { spawn } = require('child_process');

// YouTube Linki Playlist mi?
function isPlaylist(url) {
    return url.includes('list=');
}

// Video veya Playlist Bilgisi Çek
async function getVideoInfo(query) {
    return new Promise((resolve, reject) => {
        const isPl = isPlaylist(query);
        
        const args = [
            '--dump-json',
            '--geo-bypass',
            '--skip-download',
            '--flat-playlist', // [KRİTİK] Playlist içindeki videoların detayına inme (Hız için)
            query
        ];

        // Eğer tek video ise playlisti yok say
        if (!isPl) args.push('--no-playlist');

        const ytDlp = spawn('./yt-dlp.exe', args);

        let output = '';
        
        ytDlp.stdout.on('data', (data) => {
            output += data.toString();
        });

        ytDlp.on('close', (code) => {
            if (code === 0) {
                try {
                    // yt-dlp playlist verisini satır satır JSON olarak verir
                    // Bu yüzden çıktıyı satırlara bölüp işlemeliyiz
                    const lines = output.trim().split('\n');
                    const results = [];

                    for (const line of lines) {
                        try {
                            const json = JSON.parse(line);
                            // Playlist başlığı veya video verisi ayrımı
                            if (json._type === 'playlist') continue; 

                            results.push({
                                title: json.title,
                                url: json.url || json.webpage_url || `https://www.youtube.com/watch?v=${json.id}`,
                                thumbnail: json.thumbnail || null, // Flat playlist bazen resim vermez
                                duration: json.duration_string || '??:??',
                                channel: json.uploader
                            });
                        } catch (e) { continue; }
                    }

                    // Sonuçları döndür (Tekse obje, çoksa dizi)
                    if (results.length === 0) reject('İçerik bulunamadı.');
                    resolve(isPl ? results : results[0]);

                } catch (e) {
                    reject('Veri ayrıştırılamadı.');
                }
            } else {
                reject('Video/Playlist bulunamadı.');
            }
        });
    });
}

function checkDJ(interaction) {
    // 1. Kullanıcı Admin mi? (Yönetici yetkisi varsa geç)
    if (interaction.member.permissions.has('Administrator')) return true;

    // 2. Sunucuda 'DJ' adında bir rol var mı ve kullanıcıda var mı?
    const djRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'dj');
    if (djRole && interaction.member.roles.cache.has(djRole.id)) return true;

    // 3. Eğer DJ rolü sunucuda HİÇ YOKSA, herkes kullanabilir (Demokratik Mod)
    if (!djRole) return true;

    return false;
}

// YouTube video istatistiklerini çek
async function getYoutubeVideoStats(url) {
    try {
        const ytArgs = [
            '--dump-json',
            '--no-warnings',
            '--skip-download',
            '--geo-bypass',
            url
        ];
        
        return new Promise((resolve, reject) => {
            const ytDlp = spawn('./yt-dlp.exe', ytArgs);
            let data = '';
            
            ytDlp.stdout.on('data', chunk => data += chunk);
            ytDlp.on('close', () => {
                try {
                    const info = JSON.parse(data);
                    resolve({
                        views: info.view_count || null,
                        likes: info.like_count || null,
                        uploader: info.uploader || null,
                        published: info.upload_date ? 
                            `${info.upload_date.slice(6,8)}/${info.upload_date.slice(4,6)}/${info.upload_date.slice(0,4)}` : null
                    });
                } catch (e) {
                    reject(e);
                }
            });
            
            ytDlp.on('error', reject);
        });
    } catch (e) {
        console.error('YouTube stats hatası:', e);
        return null;
    }
}

module.exports = { getVideoInfo, isPlaylist, checkDJ, getYoutubeVideoStats };
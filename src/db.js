const fs = require('fs');
const path = require('path');

// [YAPILANDIRMA]
const DB_PATH = path.join(__dirname, '../database.json');
const BACKUP_PATH = path.join(__dirname, '../database.bak');

class LocalDatabase {
    constructor() {
        this.data = {
            users: {},      // Kullanıcılar (Playlistler)
            guilds: {},     // Sunucu ayarları
            stats: {        // İstatistikler
                totalPlayed: 0,
                bootTime: Date.now()
            }
        };
        this.init();
    }

    // [1] BAŞLATMA
    init() {
        if (!fs.existsSync(DB_PATH)) {
            console.log('> [DB] Dosya oluşturuluyor...');
            this.save(true);
            return;
        }
        try {
            const raw = fs.readFileSync(DB_PATH, 'utf-8');
            const parsed = JSON.parse(raw);
            
            // Veri yapısı onarımı (Migration)
            if (!parsed.users && !parsed.guilds) {
                console.log('> [DB] Veri yapısı güncelleniyor...');
                this.data = { users: parsed, guilds: {}, stats: { totalPlayed: 0, bootTime: Date.now() } };
                this.save(true);
            } else {
                this.data = parsed;
            }
            // Yedekle
            fs.writeFileSync(BACKUP_PATH, JSON.stringify(this.data, null, 2));
        } catch (e) {
            console.error('> [DB HATA]', e);
            this.restoreBackup();
        }
    }

    restoreBackup() {
        if (fs.existsSync(BACKUP_PATH)) {
            this.data = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf-8'));
            this.save(true);
            console.log('> [DB] Yedekten dönüldü.');
        } else {
            this.save(true); // Sıfırla
        }
    }

    save() {
        try {
            const temp = `${DB_PATH}.tmp`;
            fs.writeFileSync(temp, JSON.stringify(this.data, null, 2));
            fs.renameSync(temp, DB_PATH);
        } catch (e) { console.error('> [DB KAYIT HATA]', e); }
    }

    // --- [PLAYLIST YÖNETİMİ - JSON UYUMLU] ---

    // 1. Yeni Playlist Oluştur
    createPlaylist(userId, name, description = '', isPublic = false) {
        this.ensureUser(userId);
        this.data.users[userId].playlists[name] = {
            desc: description,
            pub: isPublic ? 1 : 0,
            created: Date.now(),
            songs: []
        };
        this.save();
    }

    // 2. Playlist Getir
    getPlaylist(userId, name) {
        const pl = this.data.users?.[userId]?.playlists?.[name];
        if (!pl) return null;
        // Veriyi standart formata çevir
        return {
            name: name,
            ownerId: userId,
            description: pl.desc,
            isPublic: !!pl.pub,
            createdAt: pl.created,
            songs: pl.songs.map(s => ({
                title: s.t, url: s.u, duration: s.d, thumbnail: s.i
            }))
        };
    }

    // 3. Kullanıcının Tüm Listeleri (İsimleri)
    getUserPlaylists(userId) {
        const user = this.data.users[userId];
        if (!user || !user.playlists) return [];
        
        return Object.keys(user.playlists).map(key => ({
            name: key,
            count: user.playlists[key].songs.length,
            isPublic: !!user.playlists[key].pub
        }));
    }

    // 4. Şarkı Ekle
    addSongToPlaylist(userId, name, song) {
        const pl = this.data.users?.[userId]?.playlists?.[name];
        if (!pl) return false;

        // Veri tasarrufu (Minification)
        pl.songs.push({
            t: song.title, 
            u: song.url, 
            d: song.duration, 
            i: song.thumbnail
        });
        this.save();
        return true;
    }

    // 5. Şarkı Çıkar
    removeSongFromPlaylist(userId, name, index) {
        const pl = this.data.users?.[userId]?.playlists?.[name];
        if (!pl || !pl.songs[index]) return false;

        const removed = pl.songs.splice(index, 1);
        this.save();
        return removed[0]; // Silinen şarkıyı döndür
    }

    // 6. Playlist Sil
    deletePlaylist(userId, name) {
        if (!this.data.users?.[userId]?.playlists?.[name]) return false;
        delete this.data.users[userId].playlists[name];
        this.save();
        return true;
    }

    // 7. Eski Yöntem Uyumluluğu (Toplu Kayıt)
    savePlaylist(userId, name, songs) {
        this.ensureUser(userId);
        // Eğer varsa üzerine yazar
        this.createPlaylist(userId, name, 'Otomatik Kayıt', false);
        const pl = this.data.users[userId].playlists[name];
        
        pl.songs = songs.map(s => ({
            t: s.title, u: s.url, d: s.duration, i: s.thumbnail
        }));
        this.save();
    }

    // --- [SUNUCU AYARLARI] ---

    setMusicChannel(guildId, channelId, messageId) {
        this.ensureGuild(guildId);
        this.data.guilds[guildId].musicChannel = { channelId, messageId };
        this.save();
    }

    getMusicChannel(guildId) {
        return this.data.guilds[guildId]?.musicChannel || null;
    }

    setServerVolume(guildId, volume) {
        this.ensureGuild(guildId);
        this.data.guilds[guildId].volume = volume;
        this.save();
    }

    getServerVolume(guildId) {
        return this.data.guilds[guildId]?.volume || 100;
    }

    // --- YARDIMCILAR ---
    ensureUser(userId) {
        if (!this.data.users) this.data.users = {};
        if (!this.data.users[userId]) this.data.users[userId] = { playlists: {} };
        if (!this.data.users[userId].playlists) this.data.users[userId].playlists = {};
    }

    ensureGuild(guildId) {
        if (!this.data.guilds) this.data.guilds = {};
        if (!this.data.guilds[guildId]) this.data.guilds[guildId] = {};
    }
}

const db = new LocalDatabase();
module.exports = db;
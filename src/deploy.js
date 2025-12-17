// [SCP DAĞITIM PROTOKOLÜ - OMEGA V2]
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { argv } = require('node:process');
require('dotenv').config();

// [1] KONFİGÜRASYON KONTROLÜ
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
    console.error('❌ [HATA] .env dosyasında DISCORD_TOKEN veya CLIENT_ID eksik.');
    process.exit(1);
}

// [2] KOMUTLARI HAZIRLA (ALT KLASÖR DESTEKLİ)
const commands = [];
const commandsPath = path.join(__dirname, 'commands');

// Klasör mü yoksa dosya mı kontrol eden yardımcı fonksiyon
const getCommandFiles = (dir) => {
    const files = fs.readdirSync(dir);
    let commandFiles = [];
    
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            // Eğer klasörse, içine gir (Recursion)
            commandFiles = commandFiles.concat(getCommandFiles(filePath));
        } else if (file.endsWith('.js')) {
            // Eğer JS dosyasıysa listeye ekle
            commandFiles.push(filePath);
        }
    }
    return commandFiles;
};

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('      SCP KOMUT DAĞITIM SİSTEMİ         ');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const allCommandFiles = getCommandFiles(commandsPath);
let validCount = 0;
let invalidCount = 0;

for (const filePath of allCommandFiles) {
    const command = require(filePath);

    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
        // Dosya yolundan kategori ismini çıkar (örn: commands/moderation/ban.js -> moderation)
        const category = path.dirname(filePath).split(path.sep).pop(); 
        console.log(`✅ [HAZIR] ${category.toUpperCase()} / ${command.data.name}`);
        validCount++;
    } else {
        console.log(`⚠️ [ATLANDI] ${path.basename(filePath)} (Eksik veri)`);
        invalidCount++;
    }
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`> Toplam: ${validCount} geçerli, ${invalidCount} geçersiz komut yüklendi.`);

// [3] DAĞITIM VE TEMİZLİK MODU SEÇİMİ
const isGlobal = argv.includes('-g') || argv.includes('--global');
const isDelete = argv.includes('-d') || argv.includes('--delete'); // Silme modu

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
    try {
        // --- SİLME MODU (DUPLICATE DÜZELTMEK İÇİN) ---
        if (isDelete) {
            console.log('\n🗑️ [TEMİZLİK] Komutlar siliniyor...');
            
            // Hem Global hem Yerel komutları temizle
            if (guildId) {
                await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
                console.log('   ✅ Yerel (Guild) komutlar temizlendi.');
            }
            await rest.put(Routes.applicationCommands(clientId), { body: [] });
            console.log('   ✅ Global komutlar temizlendi.');
            console.log('\n✨ Temizlik bitti. Şimdi normal yükleme yapabilirsiniz.');
            return;
        }

        // --- YÜKLEME MODU ---
        if (isGlobal) {
            // GLOBAL YÜKLEME
            console.log(`\n⏳ [GLOBAL] ${commands.length} komut tüm sunuculara yükleniyor...`);
            console.log('   (Not: Global güncellemelerin yansıması 1 saati bulabilir.)');

            const data = await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands },
            );

            // Duplicate önlemek için: Global yüklüyorsak, yerel komutları silelim (Opsiyonel ama önerilir)
            if (guildId) {
                console.log('   ℹ️ Çakışmayı önlemek için test sunucusundaki yerel komutlar temizleniyor...');
                await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
            }

            console.log(`\n🎉 [BAŞARILI] ${data.length} komut başarıyla Global olarak kaydedildi.`);
        } else {
            // YEREL YÜKLEME (TEST)
            if (!guildId) {
                throw new Error("Yerel dağıtım için .env dosyasında GUILD_ID bulunamadı.");
            }

            console.log(`\n⏳ [YEREL] ${commands.length} komut Test Sunucusuna (${guildId}) yükleniyor...`);
            
            const data = await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands },
            );

            console.log(`\n🚀 [BAŞARILI] ${data.length} komut test sunucusuna anında yüklendi.`);
        }

    } catch (error) {
        console.error('\n❌ [KRİTİK HATA] İşlem sırasında sorun oluştu:');
        console.error(error);
    }
})();
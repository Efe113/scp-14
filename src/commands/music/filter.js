const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('filter')
        .setDescription('Profesyonel ses efektleri uygular.')
        .addStringOption(option =>
            option.setName('mod')
                .setDescription('Hangi efekti uygulamak istersin?')
                .setRequired(true)
                .addChoices(
                    { name: '🛑 Kapat (Normal)', value: 'off' },
                    // [YENİ] AGRESİF FİLTRELER
                    // Equalizer + Bass + Normalization kombinasyonu
                    { name: '💣 Nükleer Bass (Extreme)', value: 'equalizer=f=40:width_type=h:width=50:g=10,bass=g=15,dynaudnorm=f=200' },
                    { name: '🔊 Bassboost (Güçlü)', value: 'bass=g=10,dynaudnorm=f=200' },
                    // Hızlandırma + Pitch İnceltme
                    { name: '🏎️ Nightcore (Hızlı)', value: 'asetrate=48000*1.25,aresample=48000,atempo=1.05' },
                    // Yavaşlatma + Pitch Kalınlaştırma + Lowpass (Boğukluk)
                    { name: '🌫️ Vaporwave (Lo-Fi)', value: 'aresample=48000,asetrate=48000*0.8,lowpass=f=3000' },
                    // Sesi sağ ve sol kulaklık arasında döndürür
                    { name: '🎧 8D Audio (Dönen Ses)', value: 'apulsator=hz=0.125:amount=1' },
                    // Sesi genişletir (Surround hissi)
                    { name: '🌌 Surround (Sinema)', value: 'surround=level_in=3' },
                    // Eski telefon sesi
                    { name: '📞 Telefon', value: 'highpass=f=300,lowpass=f=3400' },
                    // Vokal Sesi Kaldırma (Karaoke Denemesi)
                    { name: '🎤 Karaoke (Vokal Sil)', value: 'stereotools=mlev=0.015625' }
                )),

    async execute(interaction, client) {
        const serverQueue = client.queue.get(interaction.guild.id);
        
        if (!serverQueue || !serverQueue.playing) {
            return interaction.reply({ content: '❌ Şu an müzik çalmıyor.', ephemeral: true });
        }

        await interaction.deferReply();
        
        const filterCode = interaction.options.getString('mod');
        const filterName = interaction.options.get('mod').name; 

        if (filterCode === 'off') {
            serverQueue.filter = null;
        } else {
            serverQueue.filter = filterCode;
        }

        // Şarkıyı yeniden başlatarak efekti uygula
        const oldLoop = serverQueue.loop;
        serverQueue.loop = 1; 
        serverQueue.player.stop();
        
        setTimeout(() => {
            serverQueue.loop = oldLoop;
        }, 2000);

        await interaction.followUp(`🎛️ Ses İşlemcisi Devrede: **${filterName}**\n*(Efektin duyulması için şarkı yeniden başlatılıyor...)*`);
    },
};
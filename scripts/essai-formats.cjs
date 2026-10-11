#!/usr/bin/env node
/**
 * essai-formats.cjs — Crée chez Meta, EN PAUSE, une publicité par format
 * (vidéo seule, carrousel, plusieurs visuels) avec le code LOCAL du backend.
 *
 * Aucun déploiement ni connexion à l'application : le script appelle
 * directement createFullCampaign pour le compte indiqué. Les médias viennent de
 * scripts/generer-medias-test.cjs et sont déposés dans Supabase Storage comme
 * le ferait /campaigns/upload-media.
 *
 * Usage : node scripts/essai-formats.cjs <nom de Page> [V1|C1|F1 ...]
 *   ex.   node scripts/essai-formats.cjs "Lyon Deals"
 *
 * Relire ensuite chaque campagne : node scripts/relire-campagne.cjs <id>
 */
const path = require('path');
const fs = require('fs');
const depuisBackend = (nom) => require(require.resolve(nom, { paths: [path.resolve(__dirname, '../backend')] }));
depuisBackend('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const { supabase } = require('../backend/src/config/supabase');
const { createFullCampaign } = require('../backend/src/services/facebookAdsService');

const MEDIAS = path.resolve(__dirname, '../tmp/medias-test');
const [pageName, ...choix] = process.argv.slice(2);
if (!pageName) {
    console.error('Usage : node scripts/essai-formats.cjs <nom de Page> [V1|C1|F1 ...]');
    process.exit(1);
}

async function deposer(fichier) {
    const chemin = path.join(MEDIAS, fichier);
    if (!fs.existsSync(chemin)) throw new Error(`${fichier} absent : lancez scripts/generer-medias-test.cjs`);
    const type = fichier.endsWith('.mp4') ? 'video' : 'image';
    const cle = `ad-creatives/essai_${Date.now()}_${fichier}`;
    const { error } = await supabase.storage.from('campaign-media')
        .upload(cle, fs.readFileSync(chemin), { contentType: type === 'video' ? 'video/mp4' : 'image/png', upsert: true });
    if (error) throw new Error(`Dépôt ${fichier} : ${error.message}`);
    const { data: { publicUrl } } = supabase.storage.from('campaign-media').getPublicUrl(cle);
    return { url: publicUrl, type };
}

(async () => {
    const { data: comptes } = await supabase.from('facebook_accounts')
        .select('user_id').eq('is_active', true).eq('fb_page_name', pageName)
        .order('created_at', { ascending: false }).limit(1);
    if (!comptes?.length) throw new Error(`Aucun compte actif pour la Page « ${pageName} »`);
    const userId = comptes[0].user_id;

    const { data: derniere } = await supabase.from('campaigns')
        .select('targeting, creative').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(1);
    const lien = derniere?.[0]?.creative?.link || 'https://example.com';
    const targeting = derniere?.[0]?.targeting || { locations: [{ key: 'CM', type: 'country' }] };

    const base = (nom, creative) => ({
        campaign_name: nom,
        objective: 'OUTCOME_TRAFFIC',
        destination_type: 'WEBSITE',
        optimization_goal: 'LINK_CLICKS',
        daily_budget: 1000,
        start_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        targeting,
        website_url: lien,
        creative: { message: `Essai AdsFacile — ${nom}`, headline: 'Lyon Deals', link: lien, call_to_action: 'LEARN_MORE', ...creative }
    });

    const essais = {
        V1: async () => base('ESSAI-V1 vidéo seule', {
            media_type: 'video', media_url: (await deposer('video-6s-1080x1080.mp4')).url, description: 'Vidéo 6 s'
        }),
        C1: async () => base('ESSAI-C1 carrousel', {
            media_type: 'carousel',
            media_items: [
                { ...(await deposer('image-1080x1080-a.png')), name: 'Carte image A', description: 'Première' },
                { ...(await deposer('image-1080x1080-b.png')), name: 'Carte image B', link: `${lien}#b` },
                { ...(await deposer('video-6s-1080x1080.mp4')), name: 'Carte vidéo' }
            ]
        }),
        F1: async () => base('ESSAI-F1 plusieurs visuels', {
            media_type: 'flexible',
            media_items: [
                await deposer('image-1080x1080-a.png'),
                await deposer('image-1080x1080-c.png'),
                await deposer('image-1440x1800.png'),
                await deposer('video-6s-1080x1920.mp4')
            ],
            bodies: ['Deuxième texte principal'],
            titles: ['Deuxième titre']
        })
    };

    for (const code of (choix.length ? choix : Object.keys(essais))) {
        process.stdout.write(`${code} … `);
        try {
            const r = await createFullCampaign(userId, await essais[code]());
            console.log(`OK  AdsFacile ${r.campaign_id}  Meta ${r.fb_campaign_id}`);
        } catch (e) {
            console.log(`ÉCHEC  ${e.message}`);
            if (e.response?.error) console.log(JSON.stringify(e.response.error));
        }
    }
})().catch((e) => { console.error(e.message); process.exit(1); });

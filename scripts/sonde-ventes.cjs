#!/usr/bin/env node
/**
 * sonde-ventes.cjs — Ce que Meta accepte réellement pour l'objectif Ventes
 *
 * La table de compatibilité du produit ne doit rien à la documentation : chaque
 * ligne vient d'un appel `execution_options: ['validate_only']`, qui valide un
 * ensemble de publicités sans rien créer.
 *
 * La sonde précédente (docs/meta/sonde-trafic-ventes.txt) rendait tout KO pour
 * Ventes : elle envoyait un ensemble sans objet promu et avec un budget mal
 * formé, si bien que les refus portaient sur le payload, pas sur la
 * combinaison. Celle-ci fournit le pixel, la Page et le numéro WhatsApp selon
 * la destination — ce que le produit envoie réellement.
 *
 * Un seul objet est créé chez Meta : une campagne Ventes en PAUSE, support des
 * validations, supprimée à la fin (y compris en cas d'interruption).
 *
 * Usage : node scripts/sonde-ventes.cjs [--out docs/meta/sonde-ventes.txt]
 */

const path = require('path');
const fs = require('fs');
// Les dépendances vivent dans backend/node_modules : la sonde parle à Meta avec
// exactement les mêmes modules que le service qu'elle vérifie.
const depuisBackend = (nom) => require(require.resolve(nom, { paths: [path.resolve(__dirname, '../backend')] }));

const axios = depuisBackend('axios');
depuisBackend('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const { supabase } = require('../backend/src/config/supabase');
const { decryptToken } = require('../backend/src/services/facebookService');
const { GRAPH_URL } = require('../backend/src/config/facebook');

const GOALS = [
    'OFFSITE_CONVERSIONS', 'VALUE', 'LANDING_PAGE_VIEWS', 'LINK_CLICKS',
    'REACH', 'IMPRESSIONS', 'CONVERSATIONS', 'QUALITY_CALL', 'THRUPLAY',
    'POST_ENGAGEMENT', 'APP_INSTALLS'
];

const DESTINATIONS = [
    'WEBSITE', 'UNDEFINED', 'MESSENGER', 'WHATSAPP', 'INSTAGRAM_DIRECT',
    'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP', 'PHONE_CALL', 'APP',
    'ON_AD', 'WEBSITE_AND_APP', 'WEBSITE_AND_STORE_VISIT', 'WEBSITE_AND_PHONE_CALL'
];

const MESSAGERIE = /MESSENGER|WHATSAPP|INSTAGRAM_DIRECT|MESSAGING_/;

const attendre = (ms) => new Promise(r => setTimeout(r, ms));

async function compte() {
    const { data, error } = await supabase
        .from('facebook_accounts')
        .select('fb_account_id, fb_access_token, fb_page_id, whatsapp_phone_number_id')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error || !data) throw new Error(`Aucun compte Facebook actif : ${error?.message || 'table vide'}`);

    return {
        adAccountId: String(data.fb_account_id).startsWith('act_')
            ? data.fb_account_id : `act_${data.fb_account_id}`,
        token: decryptToken(data.fb_access_token),
        pageId: data.fb_page_id,
        whatsappId: data.whatsapp_phone_number_id
    };
}

/** Ensembles de données du compte — répond aussi à « pourquoi la liste est vide ». */
async function pixels({ adAccountId, token }) {
    const essais = [
        ['act/adspixels', `${GRAPH_URL}/${adAccountId}/adspixels`],
        ['act/customconversions', `${GRAPH_URL}/${adAccountId}/customconversions`]
    ];

    const releve = [];
    for (const [nom, url] of essais) {
        try {
            const res = await axios.get(url, {
                params: { fields: 'id,name,is_unavailable', access_token: token }
            });
            releve.push({ source: nom, items: res.data.data || [] });
        } catch (err) {
            releve.push({ source: nom, erreur: err.response?.data?.error?.message || err.message });
        }
    }
    return releve;
}

function objetPromu(destination, ctx, pixelId) {
    if (MESSAGERIE.test(destination)) {
        const promu = { page_id: ctx.pageId };
        if (/WHATSAPP/.test(destination) && ctx.whatsappId) {
            promu.whats_app_business_phone_number_id = String(ctx.whatsappId);
        }
        return promu;
    }
    if (destination === 'PHONE_CALL') return { page_id: ctx.pageId };
    if (pixelId) return { pixel_id: pixelId, custom_event_type: 'PURCHASE' };
    return undefined;
}

async function sonder(ctx, campaignId, pixelId) {
    const lignes = [];

    for (const goal of GOALS) {
        for (const destination of DESTINATIONS) {
            const payload = {
                name: `sonde ${goal} ${destination}`,
                campaign_id: campaignId,
                daily_budget: 500,
                billing_event: 'IMPRESSIONS',
                optimization_goal: goal,
                bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
                destination_type: destination,
                status: 'PAUSED',
                targeting: {
                    geo_locations: { countries: ['CM'] },
                    age_min: 18,
                    age_max: 65,
                    targeting_automation: { advantage_audience: 0 }
                },
                dsa_beneficiary: 'Sonde',
                dsa_payor: 'Sonde',
                execution_options: ['validate_only']
            };

            const promu = objetPromu(destination, ctx, pixelId);
            if (promu) payload.promoted_object = promu;

            try {
                await axios.post(`${GRAPH_URL}/${ctx.adAccountId}/adsets`, payload, {
                    params: { access_token: ctx.token }
                });
                lignes.push(`OK|OUTCOME_SALES|${goal}|${destination}`);
                process.stdout.write('.');
            } catch (err) {
                const e = err.response?.data?.error || {};
                const message = (e.error_user_msg || e.message || err.message)
                    .replace(/\s+/g, ' ').slice(0, 90);
                lignes.push(`KO|OUTCOME_SALES|${goal}|${destination}|${message}`);
                process.stdout.write('x');
            }

            await attendre(120);   // ménager la limite de débit du compte
        }
    }

    return lignes;
}

(async () => {
    const ctx = await compte();
    console.log(`Compte publicitaire : ${ctx.adAccountId}\n`);

    const releve = await pixels(ctx);
    releve.forEach(r => {
        console.log(`— ${r.source} : ${r.erreur ? `ERREUR ${r.erreur}` : `${r.items.length} élément(s)`}`);
        (r.items || []).forEach(p => console.log(`    ${p.id}  ${p.name}${p.is_unavailable ? '  (indisponible)' : ''}`));
    });

    const pixelId = releve.find(r => r.source === 'act/adspixels')?.items?.[0]?.id || null;
    console.log(`\nPixel utilisé pour la sonde : ${pixelId || 'aucun'}\n`);

    let campaignId = null;
    const nettoyer = async () => {
        if (!campaignId) return;
        try {
            await axios.delete(`${GRAPH_URL}/${campaignId}`, { params: { access_token: ctx.token } });
            console.log(`\nCampagne de sonde ${campaignId} supprimée.`);
        } catch (err) {
            console.error(`\n⚠️ Campagne de sonde ${campaignId} NON supprimée : `
                + (err.response?.data?.error?.message || err.message));
        }
        campaignId = null;
    };
    process.on('SIGINT', async () => { await nettoyer(); process.exit(130); });

    try {
        const res = await axios.post(`${GRAPH_URL}/${ctx.adAccountId}/campaigns`, {
            name: 'AdsFacile — sonde Ventes (temporaire)',
            objective: 'OUTCOME_SALES',
            status: 'PAUSED',
            special_ad_categories: [],
            is_adset_budget_sharing_enabled: false
        }, { params: { access_token: ctx.token } });

        campaignId = res.data.id;
        console.log(`Campagne support : ${campaignId}\n`);

        const lignes = await sonder(ctx, campaignId, pixelId);

        const sortie = process.argv.includes('--out')
            ? process.argv[process.argv.indexOf('--out') + 1]
            : 'docs/meta/sonde-ventes.txt';

        fs.writeFileSync(path.resolve(__dirname, '..', sortie), lignes.join('\n') + '\n', 'utf8');
        console.log(`\n\n${lignes.filter(l => l.startsWith('OK')).length} combinaison(s) acceptée(s) sur ${lignes.length}`);
        console.log(`Relevé écrit dans ${sortie}`);
    } finally {
        await nettoyer();
    }
})().catch(err => {
    console.error('\n❌', err.response?.data?.error || err.message);
    process.exit(1);
});

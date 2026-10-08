#!/usr/bin/env node
/**
 * sonde-pixels.cjs — Où vivent les ensembles de données, et ce que Meta accepte
 * pour Ventes vers un site web une fois le pixel fourni.
 *
 * Deux questions, une seule réponse à obtenir de l'API plutôt que de la doc :
 *   1. Pourquoi `act_…/adspixels` rend une liste vide alors que le Gestionnaire
 *      d'évènements en affiche trois ? (rattachement compte ↔ business)
 *   2. Quelles combinaisons Ventes × site web passent avec un vrai pixel ?
 *
 * Usage : node scripts/sonde-pixels.cjs <business_id>
 */

const path = require('path');
const fs = require('fs');
const depuisBackend = (nom) => require(require.resolve(nom, { paths: [path.resolve(__dirname, '../backend')] }));

const axios = depuisBackend('axios');
depuisBackend('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const { supabase } = require('../backend/src/config/supabase');
const { decryptToken } = require('../backend/src/services/facebookService');
const { GRAPH_URL } = require('../backend/src/config/facebook');

const argument = (nom) => {
    const i = process.argv.indexOf(`--${nom}`);
    return i === -1 ? null : process.argv[i + 1];
};

const BUSINESS = argument('business') || '799678649905569';

// Le compte publicitaire relié à AdsFacile n'a aucun ensemble de données : sonder
// Ventes × site web depuis lui est impossible. `--account` permet de sonder depuis
// un compte qui en a, le jeton couvrant les trois comptes de l'utilisateur.
const COMPTE_DEMANDE = argument('account');

const GOALS = ['OFFSITE_CONVERSIONS', 'VALUE', 'LANDING_PAGE_VIEWS', 'LINK_CLICKS', 'REACH', 'IMPRESSIONS'];
const attendre = (ms) => new Promise(r => setTimeout(r, ms));

async function contexte() {
    const { data } = await supabase
        .from('facebook_accounts')
        .select('fb_account_id, fb_access_token, fb_page_id')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    const compte = COMPTE_DEMANDE || data.fb_account_id;

    return {
        adAccountId: `act_${String(compte).replace(/^act_/, '')}`,
        token: decryptToken(data.fb_access_token),
        pageId: data.fb_page_id
    };
}

async function inventaire(ctx) {
    const points = [
        ['compte publicitaire  act_…/adspixels', `${GRAPH_URL}/${ctx.adAccountId}/adspixels`],
        ['business  …/owned_pixels', `${GRAPH_URL}/${BUSINESS}/owned_pixels`],
        ['business  …/client_pixels', `${GRAPH_URL}/${BUSINESS}/client_pixels`],
        ['business  …/adspixels', `${GRAPH_URL}/${BUSINESS}/adspixels`]
    ];

    const trouves = [];
    for (const [libelle, url] of points) {
        try {
            const res = await axios.get(url, {
                params: { fields: 'id,name,is_unavailable', access_token: ctx.token }
            });
            const items = res.data.data || [];
            console.log(`— ${libelle} : ${items.length} élément(s)`);
            items.forEach(p => {
                console.log(`     ${p.id}  ${p.name}`);
                trouves.push(p);
            });
        } catch (err) {
            console.log(`— ${libelle} : ERREUR ${err.response?.data?.error?.message || err.message}`);
        }
    }
    return trouves;
}

(async () => {
    const ctx = await contexte();
    console.log(`Compte : ${ctx.adAccountId} · business : ${BUSINESS}\n`);

    const pixels = await inventaire(ctx);
    if (pixels.length === 0) {
        console.log('\nAucun pixel accessible avec ce jeton : impossible de sonder Ventes × site web.');
        return;
    }

    const pixelId = pixels[0].id;
    console.log(`\nSonde Ventes × site web avec le pixel ${pixelId} (${pixels[0].name})\n`);

    const campagne = await axios.post(`${GRAPH_URL}/${ctx.adAccountId}/campaigns`, {
        name: 'AdsFacile — sonde Ventes site web (temporaire)',
        objective: 'OUTCOME_SALES',
        status: 'PAUSED',
        special_ad_categories: [],
        is_adset_budget_sharing_enabled: false
    }, { params: { access_token: ctx.token } });

    const campaignId = campagne.data.id;
    const lignes = [];

    try {
        for (const goal of GOALS) {
            for (const destination of ['WEBSITE', 'UNDEFINED']) {
                try {
                    await axios.post(`${GRAPH_URL}/${ctx.adAccountId}/adsets`, {
                        name: `sonde ${goal} ${destination}`,
                        campaign_id: campaignId,
                        daily_budget: 500,
                        billing_event: 'IMPRESSIONS',
                        optimization_goal: goal,
                        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
                        destination_type: destination,
                        status: 'PAUSED',
                        promoted_object: { pixel_id: pixelId, custom_event_type: 'PURCHASE' },
                        targeting: {
                            geo_locations: { countries: ['CM'] },
                            age_min: 18, age_max: 65,
                            targeting_automation: { advantage_audience: 0 }
                        },
                        dsa_beneficiary: 'Sonde',
                        dsa_payor: 'Sonde',
                        execution_options: ['validate_only']
                    }, { params: { access_token: ctx.token } });

                    lignes.push(`OK|OUTCOME_SALES|${goal}|${destination}|pixel`);
                    console.log(`OK   ${goal} / ${destination}`);
                } catch (err) {
                    const e = err.response?.data?.error || {};
                    const msg = (e.error_user_msg || e.message || err.message).replace(/\s+/g, ' ').slice(0, 100);
                    lignes.push(`KO|OUTCOME_SALES|${goal}|${destination}|pixel|${msg}`);
                    console.log(`KO   ${goal} / ${destination} — ${msg}`);
                }
                await attendre(150);
            }
        }
    } finally {
        await axios.delete(`${GRAPH_URL}/${campaignId}`, { params: { access_token: ctx.token } });
        console.log(`\nCampagne de sonde ${campaignId} supprimée.`);
    }

    fs.appendFileSync(
        path.resolve(__dirname, '../docs/meta/sonde-ventes.txt'),
        `\n# Avec un pixel du business ${BUSINESS} (${pixelId})\n` + lignes.join('\n') + '\n',
        'utf8'
    );
})().catch(err => {
    console.error('\n❌', err.response?.data?.error || err.message);
    process.exit(1);
});

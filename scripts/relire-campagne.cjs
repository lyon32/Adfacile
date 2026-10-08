#!/usr/bin/env node
/**
 * relire-campagne.cjs — Ce que Meta a réellement reçu pour une campagne AdsFacile
 *
 * Lecture seule chez Meta : uniquement des GET sur l'API Graph. Relit la
 * campagne, l'ensemble de publicités, la création et la publicité, puis compare
 * champ par champ avec ce qui a été saisi.
 *
 * « Saisi » vient de --attendu (le jeu de données utilisé pour le test) ; à
 * défaut, de la ligne `campaigns` enregistrée par AdsFacile.
 *
 * Usage :
 *   node scripts/relire-campagne.cjs <id AdsFacile | --dernier> [--attendu fichier.json] [--json sortie.json]
 */

const path = require('path');
const fs = require('fs');
const depuisBackend = (nom) => require(require.resolve(nom, { paths: [path.resolve(__dirname, '../backend')] }));

const axios = depuisBackend('axios');
depuisBackend('dotenv').config({ path: path.resolve(__dirname, '../backend/.env') });

const { supabase } = require('../backend/src/config/supabase');
const { decryptToken } = require('../backend/src/services/facebookService');
const { GRAPH_URL } = require('../backend/src/config/facebook');
const { fcfaToUsdCents } = require('../backend/src/utils/currency');

const args = process.argv.slice(2);
const option = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : null; };

async function graph(id, fields, token) {
    try {
        const { data } = await axios.get(`${GRAPH_URL}/${id}`, { params: { fields, access_token: token } });
        return data;
    } catch (e) {
        return { __erreur: e.response?.data?.error?.message || e.message };
    }
}

async function campagne() {
    let q = supabase.from('campaigns').select('*');
    q = args[0] === '--dernier' || !args[0]
        ? q.order('created_at', { ascending: false }).limit(1)
        : q.eq('id', args[0]).limit(1);
    const { data, error } = await q;
    if (error || !data?.length) throw new Error(`Campagne introuvable : ${error?.message || args[0]}`);
    return data[0];
}

async function jeton(userId) {
    const { data, error } = await supabase
        .from('facebook_accounts')
        .select('fb_access_token')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error || !data) throw new Error(`Aucun compte Facebook actif pour ${userId}`);
    return decryptToken(data.fb_access_token);
}

const jour = (iso) => (iso ? String(iso).slice(0, 10) : null);
const trie = (a) => [...(a || [])].map(String).sort();
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
    const c = await campagne();
    const token = await jeton(c.user_id);
    const attendu = option('--attendu')
        ? JSON.parse(fs.readFileSync(option('--attendu'), 'utf8'))
        : { campaign_name: c.name, objective: c.objective, daily_budget: c.daily_budget, start_date: c.start_date,
            end_date: c.end_date, targeting: c.targeting, creative: c.creative, destination_type: c.destination_type };

    const [camp, adset, ad] = await Promise.all([
        graph(c.fb_campaign_id, 'name,objective,status,effective_status', token),
        graph(c.fb_adset_id, 'name,status,daily_budget,lifetime_budget,start_time,end_time,targeting,optimization_goal,billing_event,bid_strategy,bid_amount,destination_type,promoted_object', token),
        graph(c.fb_ad_id, 'name,status,creative{id,name,object_story_spec,asset_feed_spec,url_tags,image_url,call_to_action_type,contextual_multi_ads}', token)
    ]);

    const cr = ad.creative || {};
    const ld = cr.object_story_spec?.link_data || {};
    const geo = adset.targeting?.geo_locations || {};
    const locs = attendu.targeting?.locations || [];
    const parType = (t) => trie(locs.filter(l => l.type === t).map(l => (t === 'country' ? (l.country_code || l.key) : l.key)));
    const cta = ld.call_to_action || {};

    const lignes = [];
    const ligne = (champ, saisi, recu, ok = egal(saisi, recu)) => lignes.push({ champ, saisi, recu, statut: ok ? 'OK' : 'ÉCART' });
    const present = (champ, saisi, recu) => { if (saisi !== undefined && saisi !== null && saisi !== '') ligne(champ, saisi, recu); };

    ligne('campagne.nom', attendu.campaign_name, camp.name);
    ligne('campagne.objectif', attendu.objective, camp.objective);
    ligne('campagne.statut', 'PAUSED', camp.status);

    present('ensemble.nom', attendu.adset_name, adset.name);
    if (attendu.budget_type === 'lifetime') {
        ligne('ensemble.budget_total (cents)', fcfaToUsdCents(attendu.lifetime_budget), Number(adset.lifetime_budget));
    } else {
        ligne('ensemble.budget_jour (cents)', fcfaToUsdCents(attendu.daily_budget), Number(adset.daily_budget));
    }
    ligne('ensemble.début', jour(attendu.start_date), jour(adset.start_time));
    present('ensemble.fin', jour(attendu.end_date), jour(adset.end_time));
    present('ensemble.objectif_perf', attendu.optimization_goal, adset.optimization_goal);
    present('ensemble.destination', attendu.destination_type_attendu, adset.destination_type);
    ligne('ensemble.billing_event', 'IMPRESSIONS', adset.billing_event);
    if (attendu.cost_per_result_goal) {
        ligne('ensemble.stratégie enchère', 'COST_CAP', adset.bid_strategy);
        ligne('ensemble.coût cible (cents)', fcfaToUsdCents(attendu.cost_per_result_goal), Number(adset.bid_amount));
    }

    ligne('ciblage.pays', parType('country'), trie(geo.countries));
    ligne('ciblage.villes (key)', parType('city'), trie((geo.cities || []).map(x => x.key)));
    if ((geo.cities || []).length) ligne('ciblage.villes rayon', 'dans 17–80 km', (geo.cities || []).map(x => `${x.radius} ${x.distance_unit}`).join(', '),
        (geo.cities || []).every(x => x.distance_unit === 'kilometer' ? x.radius >= 17 && x.radius <= 80 : x.radius >= 10 && x.radius <= 50));
    ligne('ciblage.régions (key)', parType('region'), trie((geo.regions || []).map(x => x.key)));
    ligne('ciblage.geo_markets (key)', parType('geo_market'), trie((geo.geo_markets || []).map(x => x.key)));
    const autres = Object.keys(geo).filter(k => !['countries', 'cities', 'regions', 'geo_markets', 'location_types'].includes(k));
    ligne('ciblage.autres clés geo', [], autres);
    ligne('ciblage.âge min', attendu.targeting?.age_min ?? 18, adset.targeting?.age_min);
    ligne('ciblage.âge max', attendu.targeting?.age_max ?? 65, adset.targeting?.age_max);
    const sexes = { male: 1, female: 2 };
    const g = trie((attendu.targeting?.genders || []).map(x => sexes[x] ?? x));
    ligne('ciblage.sexe', g.length === 2 ? [] : g, trie(adset.targeting?.genders).length === 2 ? [] : trie(adset.targeting?.genders));
    const interetsRecus = trie((adset.targeting?.flexible_spec || []).flatMap(f => (f.interests || []).map(i => i.id)));
    ligne('ciblage.centres d\'intérêt (id)', trie((attendu.targeting?.interests || []).map(i => i.id)), interetsRecus);

    const crt = attendu.creative || {};
    present('création.texte', crt.message, ld.message);
    present('création.titre', crt.headline, ld.name);
    present('création.description', crt.description, ld.description);
    present('création.lien', crt.link || attendu.website_url, ld.link);
    present('création.lien affiché', crt.display_link, ld.caption);
    present('création.bouton', crt.call_to_action, cta.type);
    if (attendu.cta_lien_attendu) ligne('création.bouton lien', attendu.cta_lien_attendu, cta.value?.link);
    present('création.paramètres URL', crt.url_tags, cr.url_tags);
    present('création.message accueil', crt.welcome_message, ld.page_welcome_message);
    if (attendu.instagram_attendu) ligne('création.compte Instagram', attendu.instagram_attendu, cr.object_story_spec?.instagram_user_id);
    if (attendu.phone_number) ligne('création.bouton Appeler', 'CALL_NOW', cta.type);
    if (crt.media_url) ligne('création.image', 'présente', ld.image_hash || cr.image_url ? 'présente' : 'absente');
    if (attendu.multi_advertiser_ads !== undefined) {
        ligne('création.multi-annonceurs', attendu.multi_advertiser_ads === false ? 'OPT_OUT' : 'OPT_IN', cr.contextual_multi_ads?.enroll_status);
    }
    present('publicité.nom', attendu.ad_name, ad.name);
    ligne('publicité.statut', 'PAUSED', ad.status);

    const erreurs = [camp, adset, ad].filter(o => o.__erreur).map(o => o.__erreur);

    console.log(`\nCampagne AdsFacile ${c.id} — Meta ${c.fb_campaign_id} / ${c.fb_adset_id} / ${c.fb_ad_id}`);
    if (erreurs.length) console.log('Erreurs Graph :', erreurs);
    console.table(lignes.map(l => ({ ...l, saisi: JSON.stringify(l.saisi), recu: JSON.stringify(l.recu) })));
    const ecarts = lignes.filter(l => l.statut !== 'OK').length;
    console.log(`${lignes.length - ecarts}/${lignes.length} champs conformes, ${ecarts} écart(s).`);

    if (option('--json')) {
        fs.writeFileSync(option('--json'), JSON.stringify({ campagne: c.id, lignes, brut: { camp, adset, ad }, erreurs }, null, 2));
    }
}

// Sortie explicite : le client supabase garde des poignées ouvertes qui
// font planter Node sous Windows à la fermeture naturelle.
main().then(() => process.exit(0)).catch(e => { console.error('❌', e.message); process.exit(1); });

#!/usr/bin/env node
/**
 * audit-ventes.cjs — Détecteur d'incohérences pour l'objectif Ventes
 *
 * Compare ce qu'AdsFacile envoie réellement à Meta pour OUTCOME_SALES avec ce
 * que le Gestionnaire de publicités propose pour une campagne de Ventes.
 * Le relevé de référence est dans docs/meta/reference-ventes.json ; il vient de
 * la lecture des trois écrans « edit/standalone » du brouillon de Ventes du
 * compte act_1086412686842710 (campagne / ensemble / publicité).
 *
 * Trois familles de contrôles :
 *   1. Simulation — rejoue validateCombination() sur toutes les destinations de
 *      Ventes avec l'objet promu que le code sait construire, et signale les
 *      chemins que le wizard propose alors qu'ils échouent à coup sûr.
 *   2. Sources de vérité — compare les tables d'objectifs dupliquées.
 *   3. Couverture — cherche dans le code les champs que Meta expose sur Ventes.
 *
 * Hors périmètre, à la demande : « Lieu de conversion » et « Objectif de
 * performance », déjà couverts par le wizard.
 *
 * Usage :  node scripts/audit-ventes.cjs [--json]
 * Sortie :  code 1 si au moins une incohérence bloquante est détectée.
 */

const fs = require('fs');
const path = require('path');

const RACINE = path.resolve(__dirname, '..');
const OBJECTIF = 'OUTCOME_SALES';

const objectifs = require(path.join(RACINE, 'backend/src/services/campaignObjectives'));
const reference = JSON.parse(
    fs.readFileSync(path.join(RACINE, 'docs/meta/reference-ventes.json'), 'utf8')
);

const SERVICE = path.join(RACINE, 'backend/src/services/facebookAdsService.js');
const WIZARD = path.join(RACINE, 'src/pages/CreateCampaignPage.jsx');
const FORMULAIRE = path.join(RACINE, 'src/components/campaigns/AdSetForm.jsx');

/**
 * Lit un fichier en retirant ses commentaires : un champ seulement *mentionné*
 * dans un commentaire (« pixel_id optionnel », « viendra par /advideos ») n'est
 * pas un champ transmis à Meta, et le compter comme couvert masquerait
 * précisément les manques que cet audit cherche.
 */
const lire = (fichier) => {
    if (!fs.existsSync(fichier)) return '';
    return fs.readFileSync(fichier, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
};

const GRAVITES = ['bloquante', 'haute', 'moyenne', 'basse'];
const constats = [];

const signaler = (gravite, niveau, titre, detail, indice) => {
    constats.push({ gravite, niveau, titre, detail, indice });
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Simulation : quelles combinaisons de Ventes le wizard propose-t-il en vain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reproduit buildPromotedObject() du service : pour une destination de
 * messagerie, il rend { page_id } ; pour WEBSITE, il ne rend rien. Aucun appel
 * du service n'est fait ici — il ouvrirait une connexion Supabase.
 */
function objetPromuConstruit(destination) {
    const messagerie = /MESSENGER|WHATSAPP|INSTAGRAM_DIRECT|MESSAGING_/.test(destination);
    if (messagerie || destination === 'INSTAGRAM_PROFILE') {
        return { page_id: 'page-simulee' };
    }

    // Le pixel n'est simulé que si le wizard le collecte réellement et si le
    // service sait le transmettre. Le supposer présent masquerait le défaut que
    // cet audit a justement mis au jour.
    const collecte = /pixel_id/.test(lire(WIZARD)) && /pixel_id/.test(lire(FORMULAIRE));
    const transmis = /promoted_object|pixel_id:\s*String/.test(lire(SERVICE));

    return collecte && transmis
        ? { pixel_id: 'pixel-simule', custom_event_type: 'PURCHASE' }
        : {};
}

function simulerCombinaisons() {
    const destinations = objectifs.getDestinations(OBJECTIF);

    destinations.forEach(destination => {
        objectifs.getGoals(OBJECTIF, destination).forEach(goal => {
            const verdict = objectifs.validateCombination({
                objective: OBJECTIF,
                goal,
                destination,
                promoted_object: objetPromuConstruit(destination)
            });

            if (!verdict.valid) {
                signaler(
                    'bloquante',
                    'adset',
                    `Ventes → ${destination} / ${goal} : proposé par le wizard, refusé à la création`,
                    verdict.errors.join(' '),
                    'Le référentiel exige un objet promu que buildPromotedObject() ne sait pas '
                    + 'produire pour cette destination, et qu\'aucune étape du wizard ne collecte.'
                );
            }
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Sources de vérité concurrentes
// ─────────────────────────────────────────────────────────────────────────────

function comparerSourcesDeVerite() {
    const service = lire(SERVICE);

    // getOptimizationGoal() garde sa propre table objectif → optimisation.
    const bloc = service.match(/function getOptimizationGoal[\s\S]*?\n}/);
    if (!bloc) return;

    const ligne = bloc[0].match(new RegExp(`'${OBJECTIF}':\\s*'([A-Z_]+)'`));
    if (!ligne) return;

    const secours = ligne[1];
    const referentiel = objectifs.OBJECTIVES[OBJECTIF].default_goal;

    if (secours !== referentiel) {
        signaler(
            'haute',
            'adset',
            `Deux défauts contradictoires pour Ventes : « ${referentiel} » et « ${secours} »`,
            `campaignObjectives.default_goal vaut ${referentiel}, la table de secours de `
            + `getOptimizationGoal() vaut ${secours}. resolveDestination() retombe sur la seconde `
            + 'quand la première ne rend rien.',
            'backend/src/services/facebookAdsService.js — getOptimizationGoal()'
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Couverture des champs relevés dans le Gestionnaire de publicités
// ─────────────────────────────────────────────────────────────────────────────

function verifierCouverture() {
    const sources = {
        'backend/src/services/facebookAdsService.js': lire(SERVICE),
        'src/pages/CreateCampaignPage.jsx': lire(WIZARD),
        'src/components/campaigns/AdSetForm.jsx': lire(FORMULAIRE)
    };
    const tout = Object.values(sources).join('\n');

    ['campaign', 'adset', 'ad'].forEach(niveau => {
        (reference[niveau] || []).forEach(champ => {
            const { motif, attendu_absent, constat } = champ.sonde || {};
            if (!motif) return;

            const present = new RegExp(motif).test(tout);
            const manquant = attendu_absent ? present : !present;
            if (!manquant) return;

            signaler(
                champ.gravite,
                niveau,
                `${champ.libelle_meta}`,
                constat || `Aucune trace de « ${champ.champ_api} » dans le code. Attendu : ${champ.attendu}`,
                `Champ Meta : ${champ.champ_api} — statut dans le Gestionnaire : ${champ.statut_meta}`
            );
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Rapport
// ─────────────────────────────────────────────────────────────────────────────

function rapporter() {
    const ordre = (c) => GRAVITES.indexOf(c.gravite);
    constats.sort((a, b) => ordre(a) - ordre(b));

    if (process.argv.includes('--json')) {
        console.log(JSON.stringify({ objectif: OBJECTIF, source: reference._source, constats }, null, 2));
        return;
    }

    const NIVEAUX = { campaign: 'CAMPAGNE', adset: 'ENSEMBLE DE PUBLICITÉS', ad: 'PUBLICITÉ' };
    const MARQUES = { bloquante: '⛔', haute: '🔴', moyenne: '🟠', basse: '🟡' };

    console.log('\n═══ Audit Ventes — AdsFacile vs Gestionnaire de publicités ═══');
    console.log(`Relevé de référence : ${reference._source.releve} · compte ${reference._source.compte}`);
    console.log(`Hors périmètre : ${reference._source.hors_perimetre.join(' · ')}\n`);


    Object.keys(NIVEAUX).forEach(niveau => {
        const lot = constats.filter(c => c.niveau === niveau);
        if (lot.length === 0) return;

        console.log(`── ${NIVEAUX[niveau]} ────────────────────────────────`);
        lot.forEach(c => {
            console.log(`${MARQUES[c.gravite]} [${c.gravite}] ${c.titre}`);
            console.log(`   ${c.detail}`);
            if (c.indice) console.log(`   ↳ ${c.indice}`);
            console.log('');
        });
    });

    const parGravite = GRAVITES
        .map(g => `${g} : ${constats.filter(c => c.gravite === g).length}`)
        .join(' · ');
    console.log(`── Total : ${constats.length} incohérences (${parGravite})\n`);
}

simulerCombinaisons();
comparerSourcesDeVerite();
verifierCouverture();
rapporter();

process.exit(constats.some(c => c.gravite === 'bloquante') ? 1 : 0);

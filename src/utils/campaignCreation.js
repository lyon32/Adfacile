/**
 * Suivi côté écran d'une création de campagne longue.
 *
 * Le serveur répond tout de suite avec un identifiant (voir
 * backend/src/services/campaignJobs.js) ; on interroge ensuite son avancement.
 * Cela remplace une seule requête de plusieurs minutes, qui échouait sur
 * l'hébergement et affichait une erreur alors que la campagne existait.
 */

const ETAPES = {
    campagne: 'Création de la campagne…',
    ensemble: 'Création de l’ensemble de publicités…',
    publicite: 'Création de la publicité…',
    enregistrement: 'Enregistrement…'
};

/** Phrase lisible pour l'étape en cours. */
export function libelleEtape(step) {
    if (!step?.name) return 'Création en cours…';
    const rang = step.total > 1 ? ` (${step.current} sur ${step.total})` : '';
    if (step.name === 'video') return `Traitement de la vidéo par Facebook${rang}…`;
    if (step.name === 'medias') return `Envoi des visuels${rang}…`;
    return ETAPES[step.name] || 'Création en cours…';
}

/** La création a été tentée et a échoué : le message vient du serveur. */
export class CreationEchouee extends Error {
    constructor(erreur = {}) {
        super(erreur.message || 'Erreur création campagne');
        this.name = 'CreationEchouee';
        this.code = erreur.error;
        this.details = erreur.details;
        this.upgradeUrl = erreur.upgrade_url;
    }
}

/**
 * Détails à montrer sous le message d'erreur : rien quand ils ne font que le
 * répéter (le serveur renvoie le message lui-même comme unique détail).
 */
export function detailsUtiles(message, details) {
    if (!Array.isArray(details)) return null;
    const autres = details.filter((d) => d && d !== message);
    return autres.length > 0 ? autres : null;
}

const attendre = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Interroge l'avancement jusqu'à la fin.
 *
 * @param {object}   o
 * @param {Function} o.lireJob            () => Promise<{status, step, result, error}>
 * @param {Function} [o.onStep]           reçoit l'étape à chaque changement
 * @param {number}   [o.intervalleMs]     délai entre deux lectures
 * @param {number}   [o.dureeMaxMs]       au-delà, on arrête d'attendre
 * @param {number}   [o.maxErreursReseau] erreurs consécutives tolérées
 * @param {Function} [o.pause]            injectable pour les tests
 * @returns {Promise<object>} le résultat de la création
 */
export async function suivreCreation({
    lireJob,
    onStep = () => {},
    intervalleMs = 2000,
    dureeMaxMs = 15 * 60 * 1000,
    maxErreursReseau = 5,
    pause = attendre
}) {
    let ecoule = 0;
    let erreursReseau = 0;
    let derniereEtape = null;

    for (;;) {
        let job = null;
        try {
            job = await lireJob();
            erreursReseau = 0;
        } catch (err) {
            if (err.response?.status === 404) {
                throw new Error('Création introuvable. Elle a peut-être déjà abouti : vérifiez la liste de vos campagnes.');
            }
            erreursReseau += 1;
            if (erreursReseau >= maxErreursReseau) {
                throw new Error('Connexion perdue pendant la création. Vérifiez la liste de vos campagnes avant de réessayer.');
            }
        }

        if (job) {
            if (job.status === 'done') return job.result;
            if (job.status === 'failed') throw new CreationEchouee(job.error);

            const etape = JSON.stringify(job.step);
            if (job.step && etape !== derniereEtape) {
                derniereEtape = etape;
                onStep(job.step);
            }
        }

        if (ecoule >= dureeMaxMs) {
            throw new Error('La création prend trop de temps. Vérifiez la liste de vos campagnes avant de réessayer.');
        }
        await pause(intervalleMs);
        ecoule += intervalleMs;
    }
}

// ───────────────────────────────────────────────────────────────────────
// Reprise après rechargement de la page : on garde la clé et l'identifiant
// de la création en cours. Le stockage peut être indisponible (navigation
// privée, données bloquées) : tout est alors silencieusement ignoré.
// ───────────────────────────────────────────────────────────────────────

const CLE_STOCKAGE = 'adsfacile:creation-en-cours';

export const stockageCreation = {
    lire() {
        try {
            return JSON.parse(sessionStorage.getItem(CLE_STOCKAGE) || 'null');
        } catch {
            return null;
        }
    },
    ecrire(valeur) {
        try {
            sessionStorage.setItem(CLE_STOCKAGE, JSON.stringify(valeur));
        } catch { /* sans effet */ }
    },
    effacer() {
        try {
            sessionStorage.removeItem(CLE_STOCKAGE);
        } catch { /* sans effet */ }
    }
};

/** Clé d'idempotence : une par soumission volontaire. */
export function nouvelleCle() {
    return globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

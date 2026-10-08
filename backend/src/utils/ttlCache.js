/**
 * Cache mémoire à durée de vie
 * AdsFacile Backend
 *
 * Réduit les appels à Meta pour les données qui changent lentement. Relevé
 * MCP Meta du 8 oct. 2026 : plafond de 240 appels/heure pour l'app, alors que
 * la page Analytics faisait jusqu'à 7 appels Graph par campagne à chaque
 * ouverture.
 *
 * - Les demandes simultanées pour une même clé partagent un seul appel.
 * - Un échec n'est jamais mis en cache : la demande suivante réessaie.
 * - Le nombre d'entrées est borné ; la plus ancienne sort en premier.
 *
 * Mémoire du processus : vidé au redémarrage, non partagé entre instances.
 */

function createTtlCache({ maxEntries = 500, now = Date.now } = {}) {
    const entrees = new Map();   // clé → { valeur, expire }
    const enCours = new Map();   // clé → Promise

    const remember = (cle, ttlMs, source) => {
        const entree = entrees.get(cle);
        if (entree && entree.expire > now()) return Promise.resolve(entree.valeur);
        if (enCours.has(cle)) return enCours.get(cle);

        let depart;
        try {
            depart = Promise.resolve(source());
        } catch (err) {
            depart = Promise.reject(err);
        }

        const promesse = depart
            .then((valeur) => {
                entrees.delete(cle);   // réinsérée en fin : ordre = ancienneté
                entrees.set(cle, { valeur, expire: now() + ttlMs });
                while (entrees.size > maxEntries) {
                    entrees.delete(entrees.keys().next().value);
                }
                return valeur;
            })
            .finally(() => enCours.delete(cle));

        enCours.set(cle, promesse);
        return promesse;
    };

    return {
        remember,
        clear: () => { entrees.clear(); enCours.clear(); },
        size: () => entrees.size
    };
}

module.exports = { createTtlCache };

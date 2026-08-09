/**
 * Dates exprimées dans le fuseau du compte publicitaire.
 *
 * Meta interprète start_time et end_time dans le fuseau du compte, pas en UTC.
 * Envoyer « 2026-08-15 » tel quel produit 2026-08-15T00:00:00Z, que Meta affiche
 * ensuite comme le 14 août à 17 h pour un compte en America/Los_Angeles : la
 * campagne s'arrête un jour trop tôt, sans que rien ne le signale.
 *
 * On convertit donc une date du calendrier en un instant précis du fuseau du
 * compte : début de journée pour un démarrage, fin de journée pour une fin, afin
 * que la journée choisie soit diffusée en entier.
 */

/**
 * Décalage, en minutes, du fuseau à un instant donné.
 * Passe par Intl pour suivre l'heure d'été, qui change en cours d'année.
 */
function decalageMinutes(instant, timeZone) {
    const format = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });

    const p = Object.fromEntries(
        format.formatToParts(instant).map(({ type, value }) => [type, value])
    );

    const commeUtc = Date.UTC(
        Number(p.year), Number(p.month) - 1, Number(p.day),
        Number(p.hour) % 24, Number(p.minute), Number(p.second)
    );

    return (commeUtc - instant.getTime()) / 60000;
}

/**
 * Convertit une heure murale du fuseau en instant réel.
 *
 * Deux passes : la première estime le décalage, la seconde le corrige si
 * l'estimation tombait du mauvais côté d'un changement d'heure.
 */
function heureMuraleVersInstant({ annee, mois, jour, heure, minute, seconde }, timeZone) {
    const naif = Date.UTC(annee, mois - 1, jour, heure, minute, seconde);

    let instant = new Date(naif - decalageMinutes(new Date(naif), timeZone) * 60000);
    instant = new Date(naif - decalageMinutes(instant, timeZone) * 60000);

    return instant;
}

/** Découpe une date en composantes, qu'elle vienne d'un Date ou d'une chaîne. */
function composantes(valeur) {
    if (valeur instanceof Date) {
        return {
            annee: valeur.getUTCFullYear(),
            mois: valeur.getUTCMonth() + 1,
            jour: valeur.getUTCDate()
        };
    }

    const correspondance = String(valeur).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!correspondance) return null;

    return {
        annee: Number(correspondance[1]),
        mois: Number(correspondance[2]),
        jour: Number(correspondance[3])
    };
}

/** Formate un instant en ISO-8601 avec le décalage du fuseau, format attendu par Meta. */
function versIsoAvecDecalage(instant, timeZone) {
    const decalage = decalageMinutes(instant, timeZone);
    const signe = decalage >= 0 ? '+' : '-';
    const absolu = Math.abs(decalage);
    const hh = String(Math.floor(absolu / 60)).padStart(2, '0');
    const mm = String(absolu % 60).padStart(2, '0');

    const local = new Date(instant.getTime() + decalage * 60000);
    return local.toISOString().replace(/\.\d{3}Z$/, '') + signe + hh + mm;
}

/**
 * Début de la journée choisie, dans le fuseau du compte.
 * Une date déjà passée est ramenée à maintenant : Meta refuse un démarrage
 * antérieur à l'instant présent.
 */
function debutDeJournee(date, timeZone, maintenant = new Date()) {
    const c = composantes(date);
    if (!c) return maintenant.toISOString();

    const instant = heureMuraleVersInstant(
        { ...c, heure: 0, minute: 0, seconde: 0 },
        timeZone
    );

    return instant <= maintenant
        ? maintenant.toISOString()
        : versIsoAvecDecalage(instant, timeZone);
}

/**
 * Fin de la journée choisie, dans le fuseau du compte.
 * 23:59:59 et non minuit, pour que la journée sélectionnée soit diffusée
 * entièrement plutôt que de s'arrêter à son premier instant.
 */
function finDeJournee(date, timeZone) {
    const c = composantes(date);
    if (!c) return null;

    const instant = heureMuraleVersInstant(
        { ...c, heure: 23, minute: 59, seconde: 59 },
        timeZone
    );

    return versIsoAvecDecalage(instant, timeZone);
}

module.exports = {
    decalageMinutes,
    debutDeJournee,
    finDeJournee,
    versIsoAvecDecalage
};

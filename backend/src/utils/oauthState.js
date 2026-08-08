/**
 * State OAuth Facebook — signature, expiration et usage unique
 * AdsFacile Backend
 *
 * Le paramètre `state` transporte l'identifiant de l'utilisateur AdsFacile à
 * travers la redirection Facebook. Le callback est une navigation initiée par
 * Facebook : le JWT vit dans localStorage et n'accompagne donc pas la requête,
 * ce qui interdit d'identifier l'appelant autrement.
 *
 * Avant ce module, le state était un simple base64url de { csrf, userId } : la
 * valeur `csrf` n'était jamais revérifiée et le `userId` était accepté tel quel.
 * Quiconque savait fabriquer ce payload pouvait rattacher son propre compte
 * Facebook au compte AdsFacile d'un autre utilisateur.
 *
 * Trois protections sont désormais combinées :
 *   1. signature HMAC-SHA256 — le payload ne peut pas être forgé ;
 *   2. expiration courte — un state intercepté ne reste pas exploitable ;
 *   3. usage unique — un state valide ne peut pas être rejoué.
 */

const crypto = require('crypto');

/** Durée de validité d'un state, en millisecondes. */
const DUREE_VALIDITE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Nonces déjà consommés, avec leur date d'expiration.
 * Limite connue : ce registre vit dans le processus. Avec plusieurs instances
 * backend, ou après un redémarrage, le rejeu redevient possible pendant la
 * fenêtre de validité. La signature et l'expiration, elles, restent efficaces.
 * Un stockage partagé (table dédiée ou Redis) lèverait cette limite.
 */
const noncesConsommes = new Map();

/** Purge les nonces expirés pour éviter que le registre ne grossisse sans fin. */
const purgerNonces = (maintenant = Date.now()) => {
    for (const [nonce, expiration] of noncesConsommes) {
        if (expiration <= maintenant) noncesConsommes.delete(nonce);
    }
};

const getCle = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET est requis pour signer le state OAuth');
    return secret;
};

const signer = (payloadEncode) =>
    crypto.createHmac('sha256', getCle()).update(payloadEncode).digest('base64url');

/**
 * Construit un state signé pour un utilisateur.
 * @param {string} userId
 * @returns {string} `<payload base64url>.<signature base64url>`
 */
const createOAuthState = (userId) => {
    if (!userId) throw new Error('userId est requis pour créer un state OAuth');

    const payload = {
        userId,
        nonce: crypto.randomBytes(16).toString('hex'),
        exp: Date.now() + DUREE_VALIDITE_MS
    };

    const payloadEncode = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${payloadEncode}.${signer(payloadEncode)}`;
};

/**
 * Vérifie un state reçu au callback et le consomme.
 * @param {string} state
 * @returns {{ valid: boolean, userId: string|null, reason: string|null }}
 */
const verifyOAuthState = (state) => {
    const refus = (reason) => ({ valid: false, userId: null, reason });

    if (typeof state !== 'string' || !state.includes('.')) {
        return refus('format invalide');
    }

    const [payloadEncode, signature] = state.split('.');
    if (!payloadEncode || !signature) return refus('format invalide');

    // Comparaison à temps constant : une comparaison naïve laisserait fuiter
    // la signature attendue octet par octet.
    const attendue = Buffer.from(signer(payloadEncode));
    const fournie = Buffer.from(signature);
    if (attendue.length !== fournie.length || !crypto.timingSafeEqual(attendue, fournie)) {
        return refus('signature invalide');
    }

    let payload;
    try {
        payload = JSON.parse(Buffer.from(payloadEncode, 'base64url').toString());
    } catch {
        return refus('payload illisible');
    }

    if (!payload.userId || !payload.nonce || !payload.exp) {
        return refus('payload incomplet');
    }

    const maintenant = Date.now();
    if (payload.exp <= maintenant) return refus('state expiré');

    purgerNonces(maintenant);
    if (noncesConsommes.has(payload.nonce)) return refus('state déjà utilisé');
    noncesConsommes.set(payload.nonce, payload.exp);

    return { valid: true, userId: payload.userId, reason: null };
};

/** Réinitialise le registre des nonces. Réservé aux tests. */
const _resetNonces = () => noncesConsommes.clear();

module.exports = {
    createOAuthState,
    verifyOAuthState,
    DUREE_VALIDITE_MS,
    _resetNonces
};

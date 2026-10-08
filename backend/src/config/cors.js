/**
 * En-têtes que le navigateur peut envoyer à l'API.
 *
 * `Idempotency-Key` accompagne la création de campagne : sans lui dans cette
 * liste, la vérification CORS préalable refuse la requête et l'écran affiche
 * « Network Error » avant même que le serveur la voie.
 */
const ALLOWED_HEADERS = ['Content-Type', 'Authorization', 'Idempotency-Key'];

module.exports = { ALLOWED_HEADERS };

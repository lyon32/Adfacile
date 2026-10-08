/**
 * Configuration Facebook centralisée
 * AdsFacile Backend
 *
 * Version de la Graph API : surchargeable par FACEBOOK_GRAPH_VERSION afin de
 * pouvoir suivre les montées de version de Meta sans redéployer le code.
 *
 * Meta retire une version environ 2 ans après sa sortie. Le code ciblait v19.0,
 * expirée le 21 mai 2026 — d'où des appels Graph voués à l'échec.
 * v26.0 : version la plus récente au 8 oct. 2026 (relevé MCP Meta). Avant elle,
 * quatre fichiers appelaient encore v21.0 en dur, retirée le 21 janv. 2027.
 * Vérifier avant chaque montée :
 * https://developers.facebook.com/docs/graph-api/changelog
 */

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v26.0';

const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const OAUTH_DIALOG_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;

/** Chemin attendu du callback OAuth, monté dans routes/facebook.js */
const CALLBACK_PATH = '/api/facebook/callback';

/**
 * Vérifie la configuration OAuth Facebook.
 *
 * Un FACEBOOK_REDIRECT_URI absent produit `redirect_uri=undefined` dans l'URL
 * d'autorisation, et Meta répond « Impossible de charger cette URL » sans rien
 * qui permette de remonter à la cause. On échoue donc tôt, avec un message
 * actionnable.
 *
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
const validateFacebookConfig = () => {
    const errors = [];
    const warnings = [];

    const required = ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_REDIRECT_URI'];
    for (const name of required) {
        if (!process.env[name]) {
            errors.push(`${name} est absent du fichier .env`);
        }
    }

    const redirectUri = process.env.FACEBOOK_REDIRECT_URI;
    if (redirectUri) {
        let parsed;
        try {
            parsed = new URL(redirectUri);
        } catch {
            errors.push(
                `FACEBOOK_REDIRECT_URI n'est pas une URL absolue valide : « ${redirectUri} ». ` +
                `Attendu : https://<domaine>${CALLBACK_PATH}`
            );
        }

        if (parsed) {
            if (parsed.pathname !== CALLBACK_PATH) {
                errors.push(
                    `FACEBOOK_REDIRECT_URI doit se terminer par ${CALLBACK_PATH} ` +
                    `(actuellement « ${parsed.pathname} »), sinon Meta renvoie le code sur une route inexistante.`
                );
            }

            const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
            if (parsed.protocol === 'http:' && !isLocalhost) {
                warnings.push(
                    `FACEBOOK_REDIRECT_URI utilise http:// sur un domaine public. ` +
                    `Meta exige https:// et rejettera cette URI. Utilisez un tunnel HTTPS en développement.`
                );
            }
        }
    }

    return { valid: errors.length === 0, errors, warnings };
};

module.exports = {
    GRAPH_VERSION,
    GRAPH_URL,
    OAUTH_DIALOG_URL,
    CALLBACK_PATH,
    validateFacebookConfig
};

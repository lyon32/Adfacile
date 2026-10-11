/**
 * Traduction des erreurs de la Marketing API en messages actionnables.
 *
 * Les messages de Meta sont en anglais, techniques, et décrivent le symptôme
 * plutôt que le geste à faire. Cette table dit à l'utilisateur quoi corriger
 * dans AdsFacile — et sert de mémoire : chaque erreur rencontrée en production
 * doit finir ici plutôt que d'être relayée telle quelle.
 */

const FACEBOOK_ERRORS = {
    // Publicité non-Messenger dans un ensemble de publicités Messenger.
    // Survient quand destination_type vise une conversation mais que la
    // création porte un bouton de site web (LEARN_MORE) au lieu d'un bouton
    // de messagerie. Doit être attrapé en amont par messagingDestinations.
    1815675: {
        title: 'Publicité incompatible avec la destination choisie',
        message: 'Votre publicité envoie vers une conversation (Messenger, Instagram ou WhatsApp), '
            + 'mais son bouton renvoie vers un site web. Choisissez une destination de messagerie '
            + 'ou passez la publicité en destination « Site Web ».',
        fix: 'destination'
    },

    // Capacité d'application manquante. Rencontrée sur /adimages avec le
    // paramètre url : l'envoi par URL distante est réservé à certaines apps,
    // l'envoi des octets en multipart fonctionne toujours.
    3: {
        title: 'Opération non autorisée pour cette application',
        message: 'Facebook a refusé cette opération pour l\'application AdsFacile. '
            + 'Si le problème concerne votre visuel, réessayez ; sinon contactez le support.',
        fix: 'retry'
    },

    // Jeton expiré ou permissions révoquées.
    190: {
        title: 'Connexion Facebook expirée',
        message: 'Votre connexion Facebook a expiré. Reconnectez votre compte dans les paramètres.',
        fix: 'reconnect'
    },

    // Permission manquante sur le compte publicitaire.
    200: {
        title: 'Autorisation insuffisante',
        message: 'AdsFacile n\'a pas les autorisations nécessaires sur votre compte publicitaire. '
            + 'Reconnectez votre compte en acceptant toutes les autorisations demandées.',
        fix: 'reconnect'
    },

    // Limite de fréquence atteinte.
    17: {
        title: 'Trop de requêtes',
        message: 'Facebook limite temporairement le nombre d\'opérations. Réessayez dans quelques minutes.',
        fix: 'retry'
    },

    // Compte publicitaire désactivé ou moyen de paiement invalide.
    2635: {
        title: 'Compte publicitaire indisponible',
        message: 'Votre compte publicitaire Facebook est désactivé ou son moyen de paiement est invalide. '
            + 'Vérifiez-le dans le Gestionnaire de publicités Meta.',
        fix: 'billing'
    }
};

/** Sous-codes plus précis que le code principal. */
const FACEBOOK_ERROR_SUBCODES = {
    1815675: FACEBOOK_ERRORS[1815675],
    // Objectif de performance refusé pour l'objectif de campagne. Relevé sur
    // Ventes vers un site web sans ensemble de données (pixel) : Meta refuse
    // alors toute optimisation, même « maximum de visites ».
    2490408: {
        title: 'Objectif de performance refusé par Facebook',
        message: 'Facebook refuse cet objectif de performance pour cette campagne. Pour Ventes vers un site web, '
            + 'il faut un ensemble de données (pixel) rattaché à votre compte publicitaire. '
            + 'Créez-en un dans le Gestionnaire d’évènements, ou choisissez « Applications de messagerie » '
            + 'comme lieu de conversion.',
        fix: 'destination'
    },
    // Jeton invalidé par un changement de mot de passe.
    460: FACEBOOK_ERRORS[190],
    // Session expirée.
    463: FACEBOOK_ERRORS[190]
};

/**
 * Traduit une erreur Facebook en message affichable.
 * Le sous-code est consulté en premier : il est plus précis que le code.
 *
 * @param {Object} fbError  objet `error` renvoyé par la Graph API
 * @returns {{title: string, message: string, fix: string|null, code: *, subcode: *}}
 */
function translateFacebookError(fbError = {}) {
    const known = FACEBOOK_ERROR_SUBCODES[fbError.error_subcode]
        || FACEBOOK_ERRORS[fbError.code];

    if (known) {
        return {
            title: known.title,
            message: known.message,
            fix: known.fix,
            code: fbError.code,
            subcode: fbError.error_subcode
        };
    }

    // Erreur inconnue : le message destiné à l'utilisateur que Meta fournit
    // parfois vaut mieux que le message technique.
    return {
        title: fbError.error_user_title || 'Erreur Facebook',
        message: fbError.error_user_msg || fbError.message || 'Erreur inattendue côté Facebook.',
        fix: null,
        code: fbError.code,
        subcode: fbError.error_subcode
    };
}

module.exports = {
    FACEBOOK_ERRORS,
    FACEBOOK_ERROR_SUBCODES,
    translateFacebookError
};

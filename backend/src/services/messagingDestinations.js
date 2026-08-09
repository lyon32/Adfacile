/**
 * Destinations de messagerie — Messenger, Instagram Direct, WhatsApp
 *
 * Meta traite « une publicité qui ouvre une conversation » comme un produit à
 * part entière : l'ensemble de publicités, l'objectif d'optimisation et le
 * bouton d'appel à l'action doivent être cohérents entre eux, sinon la
 * publicité est refusée à la relecture avec l'erreur #1815675 (« Publicité
 * non-Messenger dans un ensemble de publicités Messenger »).
 *
 * Ce module est la source unique de cette cohérence : il traduit les cases
 * cochées par l'utilisateur en le triplet exigé par Meta, et refuse en amont
 * les combinaisons que Meta rejetterait.
 *
 * Référence : Marketing API › Messaging Ads › Click to Multidestination.
 */

/** Applications de messagerie proposées, dans l'ordre d'affichage. */
const MESSAGING_APPS = ['messenger', 'instagram', 'whatsapp'];

/**
 * destination_type attendu par Meta pour chaque combinaison.
 * La clé est la liste des applications triée alphabétiquement.
 */
const DESTINATION_TYPE_BY_COMBO = {
    'messenger': 'MESSENGER',
    'whatsapp': 'WHATSAPP',
    'instagram': 'INSTAGRAM_DIRECT',
    'instagram+messenger': 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER',
    'messenger+whatsapp': 'MESSAGING_MESSENGER_WHATSAPP',
    'instagram+whatsapp': 'MESSAGING_INSTAGRAM_DIRECT_WHATSAPP',
    'instagram+messenger+whatsapp': 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP'
};

/**
 * Bouton d'appel à l'action et lien associés à chaque application.
 * Le lien n'est pas une destination réelle : Meta l'exige pour la forme et
 * redirige en fait vers la conversation indiquée par app_destination.
 */
const CALL_TO_ACTION_BY_APP = {
    messenger: {
        type: 'MESSAGE_PAGE',
        app_destination: 'MESSENGER',
        link: 'https://fb.com/messenger_doc/'
    },
    whatsapp: {
        type: 'WHATSAPP_MESSAGE',
        app_destination: 'WHATSAPP',
        link: 'https://api.whatsapp.com/send'
    },
    instagram: {
        type: 'INSTAGRAM_MESSAGE',
        app_destination: 'INSTAGRAM_DIRECT',
        link: 'https://www.instagram.com'
    }
};

/**
 * Quand plusieurs applications sont cochées, une seule peut porter le bouton.
 * Messenger d'abord : c'est la seule destination toujours disponible dès qu'une
 * Page existe, donc celle qui ne dépend d'aucun rattachement supplémentaire.
 */
const CALL_TO_ACTION_PRIORITY = ['messenger', 'whatsapp', 'instagram'];

/** Ce qu'il faut avoir relié à la Page pour chaque application. */
const CONNECTION_REQUIREMENT = {
    instagram: {
        field: 'instagram_connected',
        message: 'Aucun compte Instagram professionnel n\'est relié à votre Page Facebook.'
    },
    whatsapp: {
        field: 'whatsapp_connected',
        message: 'Aucun numéro WhatsApp Business n\'est relié à votre Page Facebook.'
    }
};

/** Tous les destination_type qui désignent une conversation. */
const MESSAGING_DESTINATION_TYPES = new Set(Object.values(DESTINATION_TYPE_BY_COMBO));

/**
 * Réduit un numéro WhatsApp à ses chiffres, indicatif pays compris.
 *
 * Meta stocke le numéro sans « + » ni séparateurs : « +237 6 50 19 81 96 »
 * devient « 237650198196 ». Normaliser ici évite qu'un même numéro saisi avec
 * des espaces soit refusé.
 */
function normalizeWhatsAppNumber(numero) {
    if (!numero) return null;
    const chiffres = String(numero).replace(/\D/g, '');
    return chiffres.length >= 8 ? chiffres : null;
}

/**
 * Indique si un destination_type envoie l'utilisateur dans une conversation.
 * Ces ensembles de publicités n'acceptent que des créations de messagerie.
 */
function isMessagingDestination(destinationType) {
    return MESSAGING_DESTINATION_TYPES.has(destinationType);
}

/**
 * Normalise la liste d'applications : minuscules, dédoublonnée, triée.
 * Accepte les alias employés ailleurs dans l'application.
 */
function normalizeApps(apps) {
    const ALIASES = {
        messenger: 'messenger',
        MESSENGER: 'messenger',
        instagram: 'instagram',
        instagram_direct: 'instagram',
        INSTAGRAM_DIRECT: 'instagram',
        // INSTAGRAM_PROFILE est volontairement absent : il désigne une visite
        // de profil, pas une conversation en message privé.
        whatsapp: 'whatsapp',
        WHATSAPP: 'whatsapp'
    };

    const normalized = (apps || [])
        .map(app => ALIASES[app] || ALIASES[String(app).toLowerCase()])
        .filter(Boolean);

    return [...new Set(normalized)].sort();
}

/**
 * Vérifie que chaque application cochée est réellement utilisable.
 *
 * @param {string[]} apps        applications cochées
 * @param {Object}   fbAccount   ligne facebook_accounts de l'utilisateur
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateMessagingApps(apps, fbAccount = {}, options = {}) {
    const errors = [];
    const selected = normalizeApps(apps);

    if (selected.length === 0) {
        errors.push('Choisissez au moins une application de messagerie.');
        return { valid: false, errors };
    }

    const unknown = selected.filter(app => !MESSAGING_APPS.includes(app));
    if (unknown.length > 0) {
        errors.push(`Application de messagerie inconnue : ${unknown.join(', ')}.`);
    }

    if (!fbAccount.fb_page_id) {
        errors.push('Une Page Facebook est requise pour les publicités qui ouvrent une conversation.');
    }

    selected.forEach(app => {
        const requirement = CONNECTION_REQUIREMENT[app];
        if (requirement && !fbAccount[requirement.field]) {
            errors.push(requirement.message);
        }
    });

    // Le numéro doit accompagner la destination WhatsApp. Sans lui, Meta crée
    // bien l'ensemble de publicités mais la publicité reste sans numéro à
    // promouvoir : le sélecteur du gestionnaire de publicités s'affiche vide et
    // la publicité ne peut pas être diffusée.
    if (selected.includes('whatsapp')) {
        const numero = normalizeWhatsAppNumber(
            options.whatsapp_phone_number || fbAccount.whatsapp_number
        );
        // L'identifiant suffit : Meta en déduit le numéro.
        const identifiant = String(
            options.whatsapp_phone_number_id || fbAccount.whatsapp_phone_number_id || ''
        ).trim();

        if (!numero && !/^\d+$/.test(identifiant)) {
            errors.push('Indiquez le numéro WhatsApp Business à afficher dans la publicité.');
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Traduit les cases cochées en configuration Meta cohérente.
 *
 * Retourne le triplet que Meta impose de garder aligné :
 *   - destination_type   sur l'ensemble de publicités
 *   - optimization_goal  toujours CONVERSATIONS
 *   - call_to_action     bouton de messagerie porté par la création
 *
 * @param {string[]} apps  applications cochées
 * @throws {Error} si la combinaison n'existe pas chez Meta
 */
function buildMessagingDestination(apps) {
    const selected = normalizeApps(apps);

    if (selected.length === 0) {
        throw new Error('Choisissez au moins une application de messagerie.');
    }

    const destinationType = DESTINATION_TYPE_BY_COMBO[selected.join('+')];
    if (!destinationType) {
        throw new Error(
            `Combinaison de destinations non prise en charge par Facebook : ${selected.join(', ')}.`
        );
    }

    const primary = CALL_TO_ACTION_PRIORITY.find(app => selected.includes(app));
    const cta = CALL_TO_ACTION_BY_APP[primary];

    // Au-delà d'une application, Meta doit pouvoir choisir la destination pour
    // chaque personne : c'est le rôle de asset_feed_spec, qui liste un bouton
    // par application. Sans lui, la publicité est refusée (sous-code 2446493,
    // « le contenu publicitaire doit inclure la spécification degrees_of_freedom
    // pour les publicités multi-destination » — DOF y désigne ce champ, pas
    // degrees_of_freedom_spec, qui ne résout rien ici).
    const multiDestination = selected.length > 1;

    return {
        apps: selected,
        destination_type: destinationType,
        is_multi_destination: multiDestination,
        asset_feed_spec: multiDestination ? {
            optimization_type: 'DOF_MESSAGING_DESTINATION',
            call_to_actions: CALL_TO_ACTION_PRIORITY
                .filter(app => selected.includes(app))
                .map(app => {
                    const c = CALL_TO_ACTION_BY_APP[app];
                    return {
                        type: c.type,
                        value: { app_destination: c.app_destination, link: c.link }
                    };
                })
        } : null,
        // Meta n'accepte que CONVERSATIONS pour ces ensembles de publicités.
        // LANDING_PAGE_VIEWS ou LINK_CLICKS y sont refusés.
        optimization_goal: 'CONVERSATIONS',
        link: cta.link,
        call_to_action: {
            type: cta.type,
            value: { app_destination: cta.app_destination }
        }
    };
}

module.exports = {
    normalizeWhatsAppNumber,
    MESSAGING_APPS,
    DESTINATION_TYPE_BY_COMBO,
    CALL_TO_ACTION_BY_APP,
    CONNECTION_REQUIREMENT,
    isMessagingDestination,
    normalizeApps,
    validateMessagingApps,
    buildMessagingDestination
};

/**
 * Objectifs de campagne — ce que Meta accepte réellement
 *
 * Table de compatibilité entre l'objectif de campagne, l'objectif de
 * performance et le lieu de conversion. Chaque ligne a été **vérifiée contre
 * l'API** en `execution_options: ['validate_only']`, qui valide un ensemble de
 * publicités sans rien créer. Relevés bruts : `docs/meta/sonde-*.txt`.
 *
 * Cette vérification n'est pas un excès de prudence : la documentation de Meta
 * s'est trompée à trois reprises sur ce périmètre.
 *   · la table ODAX omet `CONVERSATIONS` pour OUTCOME_TRAFFIC, qui fonctionne ;
 *   · elle donne `degrees_of_freedom_spec` pour optionnel, l'API le refuse ;
 *   · elle présente `ON_AD` comme la destination des Prospects, alors que Meta
 *     la refuse tant que les conditions de service ne sont pas acceptées.
 *
 * Toute ligne ajoutée ici doit l'être après une sonde, jamais d'après la
 * documentation seule.
 */

/** Objectifs de performance acceptés, par objectif et par destination. */
const OBJECTIVES = {
    OUTCOME_TRAFFIC: {
        label: 'Trafic',
        description: 'Amener des personnes vers votre site, vos messages ou votre profil.',
        default_goal: 'LINK_CLICKS',
        goals: {
            // INSTAGRAM_PROFILE et FACEBOOK_PAGE ont été sondés séparément : ils
            // manquaient au relevé initial, si bien que la destination
            // « Instagram ou Facebook » ne proposait aucun objectif de
            // performance et bloquait l'étape 2.
            LINK_CLICKS: ['WEBSITE', 'UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP', 'PHONE_CALL', 'ON_AD', 'INSTAGRAM_PROFILE', 'FACEBOOK_PAGE'],
            LANDING_PAGE_VIEWS: ['WEBSITE', 'UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP', 'PHONE_CALL', 'ON_AD', 'INSTAGRAM_PROFILE', 'FACEBOOK_PAGE'],
            REACH: ['WEBSITE', 'UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP', 'PHONE_CALL', 'ON_AD', 'INSTAGRAM_PROFILE', 'FACEBOOK_PAGE'],
            IMPRESSIONS: ['WEBSITE', 'UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP', 'PHONE_CALL', 'ON_AD', 'INSTAGRAM_PROFILE', 'FACEBOOK_PAGE'],
            POST_ENGAGEMENT: ['WEBSITE', 'UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP', 'PHONE_CALL', 'ON_AD'],
            THRUPLAY: ['WEBSITE', 'UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP', 'PHONE_CALL', 'ON_AD'],
            QUALITY_CALL: ['WEBSITE', 'UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP', 'PHONE_CALL', 'ON_AD'],
            // Absent de la table ODAX officielle, accepté par l'API — et
            // uniquement sur une destination de messagerie.
            CONVERSATIONS: ['UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP']
        }
    },

    OUTCOME_AWARENESS: {
        label: 'Notoriété',
        description: 'Faire connaître votre entreprise au plus grand nombre.',
        default_goal: 'REACH',
        goals: {
            REACH: ['WEBSITE', 'UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP'],
            IMPRESSIONS: ['WEBSITE', 'UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP'],
            AD_RECALL_LIFT: ['WEBSITE', 'UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP'],
            THRUPLAY: ['WEBSITE', 'UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP']
        }
    },

    OUTCOME_ENGAGEMENT: {
        label: 'Interactions',
        description: 'Susciter des réactions, des messages ou des vues sur vos publications.',
        default_goal: 'POST_ENGAGEMENT',
        goals: {
            POST_ENGAGEMENT: ['UNDEFINED', 'ON_POST'],
            REACH: ['UNDEFINED', 'ON_POST'],
            IMPRESSIONS: ['UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP'],
            LINK_CLICKS: ['UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP'],
            CONVERSATIONS: ['UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP'],
            LANDING_PAGE_VIEWS: ['UNDEFINED'],
            THRUPLAY: ['UNDEFINED']
        }
    },

    OUTCOME_LEADS: {
        label: 'Prospects',
        description: 'Recueillir les coordonnées de personnes intéressées.',
        default_goal: 'LEAD_GENERATION',
        goals: {
            LEAD_GENERATION: ['WEBSITE', 'UNDEFINED', 'MESSENGER', 'INSTAGRAM_DIRECT'],
            LINK_CLICKS: ['WEBSITE', 'UNDEFINED', 'INSTAGRAM_DIRECT'],
            IMPRESSIONS: ['WEBSITE', 'UNDEFINED', 'INSTAGRAM_DIRECT'],
            REACH: ['WEBSITE', 'UNDEFINED', 'INSTAGRAM_DIRECT'],
            LANDING_PAGE_VIEWS: ['WEBSITE', 'UNDEFINED', 'INSTAGRAM_DIRECT'],
            CONVERSATIONS: ['WHATSAPP', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP']
        }
    },

    OUTCOME_SALES: {
        label: 'Ventes',
        description: 'Trouver des personnes susceptibles d\'acheter.',
        default_goal: 'CONVERSATIONS',
        goals: {
            // Ventes par messagerie : ne demande aucun pixel, seulement la Page.
            CONVERSATIONS: ['MESSENGER', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP', 'WHATSAPP'],
            // Ventes vers un site web : exige un pixel et un événement.
            OFFSITE_CONVERSIONS: ['WEBSITE', 'UNDEFINED']
        }
    },

    OUTCOME_APP_PROMOTION: {
        label: 'Promotion de l\'application',
        description: 'Faire installer ou utiliser votre application mobile.',
        default_goal: 'APP_INSTALLS',
        // Aucune combinaison n'a pu être validée : le compte de test n'a aucune
        // application mobile déclarée, et Meta répond « Application
        // incorrectement configurée » quelle que soit la combinaison.
        // Tant que la sonde n'aura pas confirmé de ligne, l'objectif reste
        // indisponible plutôt que d'échouer à la création.
        unavailable_reason:
            'Cet objectif requiert une application mobile déclarée dans votre compte Meta.',
        goals: {}
    }
};

/**
 * Objet promu exigé, selon la destination et l'objectif de performance.
 * Déduit des refus de la sonde, qui nomment précisément le champ manquant.
 */
const PROMOTED_OBJECT_RULES = [
    {
        when: ({ goal }) => goal === 'OFFSITE_CONVERSIONS',
        requires: ['pixel_id', 'custom_event_type'],
        message: 'Choisissez un pixel et l\'événement de conversion à optimiser.'
    },
    {
        when: ({ destination }) => destination === 'APP',
        requires: ['application_id'],
        message: 'Choisissez l\'application à promouvoir.'
    },
    {
        when: ({ objective }) => objective === 'OUTCOME_LEADS',
        requires: ['page_id'],
        message: 'Une Page Facebook est requise pour collecter des prospects.'
    },
    {
        when: ({ destination }) => destination === 'WHATSAPP',
        requires: ['page_id'],
        message: 'Une Page Facebook est requise pour une destination WhatsApp.'
    }
];

/**
 * Événement de facturation valide pour un objectif de performance donné.
 *
 * `IMPRESSIONS` convient à tous les objectifs relevés par la sonde ; la
 * fonction existe pour que le choix cesse d'être une constante silencieuse et
 * puisse évoluer sans chercher la valeur dans le corps du service.
 */
function getBillingEvent() {
    return 'IMPRESSIONS';
}

/** Liste des objectifs, pour l'interface. */
function listObjectives() {
    return Object.entries(OBJECTIVES).map(([value, o]) => ({
        value,
        label: o.label,
        description: o.description,
        available: Object.keys(o.goals).length > 0,
        unavailable_reason: o.unavailable_reason || null,
        default_goal: o.default_goal,
        goals: Object.keys(o.goals)
    }));
}

/** Vrai si l'objectif existe dans le référentiel. */
function isKnownObjective(objective) {
    return Object.prototype.hasOwnProperty.call(OBJECTIVES, objective);
}

/** Objectifs de performance acceptés, éventuellement filtrés par destination. */
function getGoals(objective, destination = null) {
    const entry = OBJECTIVES[objective];
    if (!entry) return [];

    const goals = Object.keys(entry.goals);
    if (!destination) return goals;

    return goals.filter(g => entry.goals[g].includes(destination));
}

/** Destinations acceptées pour un objectif, tous objectifs de performance confondus. */
function getDestinations(objective) {
    const entry = OBJECTIVES[objective];
    if (!entry) return [];

    return [...new Set(Object.values(entry.goals).flat())];
}

/** Objectif de performance par défaut, valide pour la destination si fournie. */
function getDefaultGoal(objective, destination = null) {
    const entry = OBJECTIVES[objective];
    if (!entry) return null;

    const acceptables = getGoals(objective, destination);
    if (acceptables.length === 0) return null;

    return acceptables.includes(entry.default_goal) ? entry.default_goal : acceptables[0];
}

/**
 * Vérifie la cohérence objectif ↔ performance ↔ destination ↔ objet promu.
 *
 * Rendre ce verdict avant tout appel réseau évite de créer une campagne que
 * Meta rejettera ensuite au niveau de l'ensemble de publicités — ce qui
 * laissait auparavant des objets orphelins.
 *
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateCombination({ objective, goal, destination, promoted_object = {} } = {}) {
    const errors = [];

    if (!isKnownObjective(objective)) {
        return { valid: false, errors: [`Objectif de campagne inconnu : ${objective}.`] };
    }

    const entry = OBJECTIVES[objective];

    if (Object.keys(entry.goals).length === 0) {
        return { valid: false, errors: [entry.unavailable_reason] };
    }

    if (!goal || !entry.goals[goal]) {
        errors.push(
            `L'objectif de performance « ${goal} » n'est pas disponible pour ${entry.label}.`
        );
        return { valid: false, errors };
    }

    if (destination && !entry.goals[goal].includes(destination)) {
        errors.push(
            `La destination « ${destination} » n'est pas prise en charge pour ${entry.label} `
            + `avec cet objectif de performance.`
        );
    }

    PROMOTED_OBJECT_RULES
        .filter(rule => rule.when({ objective, goal, destination }))
        .forEach(rule => {
            const manquants = rule.requires.filter(champ => !promoted_object[champ]);
            if (manquants.length > 0) errors.push(rule.message);
        });

    return { valid: errors.length === 0, errors };
}

module.exports = {
    OBJECTIVES,
    listObjectives,
    isKnownObjective,
    getGoals,
    getDestinations,
    getDefaultGoal,
    getBillingEvent,
    validateCombination
};

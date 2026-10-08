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
        default_goal: 'OFFSITE_CONVERSIONS',

        // Table relevée le 11 août 2026 par `node scripts/sonde-ventes.cjs`
        // (docs/meta/sonde-ventes.txt) : 132 combinaisons soumises en
        // validate_only, 20 acceptées. La sonde précédente rendait tout KO —
        // elle omettait l'objet promu, si bien que les refus portaient sur le
        // payload et non sur la combinaison.
        //
        // Les lignes WEBSITE n'ont pas pu être sondées : le compte publicitaire
        // n'a aucun ensemble de données rattaché (act_…/adspixels rend une
        // liste vide), et Meta refuse alors toute destination site web quelle
        // que soit l'optimisation. Elles viennent de la liste qu'affiche le
        // Gestionnaire de publicités pour Ventes × Site Web. Relancer la sonde
        // dès qu'un pixel est rattaché au compte pour les confirmer.
        goals: {
            // Site web — exigent un pixel et un évènement (voir les règles
            // d'objet promu plus bas).
            OFFSITE_CONVERSIONS: ['WEBSITE'],
            VALUE: ['WEBSITE'],

            // Messagerie — sondées, aucun pixel requis, seulement la Page.
            CONVERSATIONS: ['UNDEFINED', 'MESSENGER', 'WHATSAPP', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP'],

            // Optimisations « autres » : elles n'exigent pas de pixel, et
            // c'est la porte de sortie que Meta lui-même propose quand
            // l'ensemble de données manque (« passez à une autre optimisation,
            // telle que vues de page de destination »).
            LANDING_PAGE_VIEWS: ['WEBSITE', 'UNDEFINED'],
            LINK_CLICKS: ['WEBSITE', 'UNDEFINED', 'MESSENGER', 'WHATSAPP', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP'],
            REACH: ['WEBSITE', 'UNDEFINED', 'MESSENGER', 'WHATSAPP', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP'],
            IMPRESSIONS: ['WEBSITE', 'UNDEFINED', 'MESSENGER', 'WHATSAPP', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP'],
            POST_ENGAGEMENT: ['UNDEFINED'],

            // Appels : seule QUALITY_CALL passe sur PHONE_CALL — sondé.
            QUALITY_CALL: ['PHONE_CALL']
        }

        // Refusées par la sonde, donc absentes : APP et ON_AD pour tous les
        // objectifs de performance. Les destinations combinées du Gestionnaire
        // (« Site Web et application », « Site Web et en magasin »…) n'existent
        // pas au niveau de l'API : elle répond « destination_type must be one
        // of the following values: WEBSITE, APP, MESSENGER, … ».
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
 * Lieux de conversion présentables, et les destinations Meta qu'ils recouvrent.
 *
 * Le formulaire affichait six cartes figées, identiques pour les six objectifs,
 * en grisant celles qui ne s'appliquent pas. Ventes proposait donc « Instagram
 * ou Facebook », que Meta n'offre pas sur cet objectif, et le tout portait le
 * sous-titre « Choisissez où vous voulez générer du trafic » — jusque dans une
 * campagne de Ventes. Chaque objectif sert désormais sa propre liste, déduite
 * de la table sondée ci-dessus : rien à griser, rien à inventer.
 *
 * `covers` : les `destination_type` de Meta qu'une carte représente. Les
 * applications de messagerie n'en font qu'une, parce que c'est la combinaison
 * de cases cochées qui décide du type réellement envoyé.
 */
const DESTINATION_CATALOG = [
    {
        value: 'WEBSITE',
        covers: ['WEBSITE'],
        label: 'Site Web',
        icon: '🌐'
    },
    {
        value: 'MESSENGER',
        covers: ['MESSENGER', 'WHATSAPP', 'INSTAGRAM_DIRECT', 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP'],
        label: 'Applications de messagerie',
        icon: '💬'
    },
    {
        value: 'INSTAGRAM_PROFILE',
        covers: ['INSTAGRAM_PROFILE', 'FACEBOOK_PAGE'],
        label: 'Instagram ou Facebook',
        icon: '📷'
    },
    {
        value: 'PHONE_CALL',
        covers: ['PHONE_CALL'],
        label: 'Appels',
        icon: '📞'
    },
    {
        value: 'ON_POST',
        covers: ['ON_POST', 'ON_AD'],
        label: 'Votre publication',
        icon: '📣'
    },
    {
        value: 'APP',
        covers: ['APP'],
        label: 'Application',
        icon: '📲'
    }
];

/**
 * Description de la carte selon l'objectif : « Envoyez le trafic vers votre
 * site » n'a aucun sens dans une campagne de Ventes, où l'on envoie des
 * acheteurs. Un défaut couvre les objectifs non nommés.
 */
const DESTINATION_DESCRIPTIONS = {
    WEBSITE: {
        OUTCOME_SALES: 'Vos clients achètent sur votre site',
        OUTCOME_LEADS: 'Vos prospects laissent leurs coordonnées sur votre site',
        defaut: 'Envoyez les visiteurs vers votre site Web'
    },
    MESSENGER: {
        OUTCOME_SALES: 'Vos clients commandent par message, sur Messenger, Instagram ou WhatsApp',
        defaut: 'Ouvrez une conversation sur Messenger, Instagram ou WhatsApp'
    },
    INSTAGRAM_PROFILE: {
        defaut: 'Envoyez les visiteurs vers un profil Instagram ou une Page Facebook'
    },
    PHONE_CALL: {
        OUTCOME_SALES: 'Vos clients vous appellent pour commander',
        defaut: 'Incitez les personnes à appeler votre entreprise'
    },
    ON_POST: {
        defaut: 'Faites réagir et commenter votre publication'
    },
    APP: {
        defaut: 'Envoyez les visiteurs vers votre application'
    }
};

/**
 * Valeur de destination à envoyer à Meta pour une carte de l'interface.
 *
 * Une carte couvre plusieurs valeurs API (« Votre publication » couvre ON_POST
 * et ON_AD) et c'est l'objectif qui décide laquelle Meta accepte. Relevé du
 * 8 oct. 2026 : Trafic recevait ON_POST, refusé par validateCombination alors
 * que la carte était proposée — seul ON_AD y figure dans la table sondée.
 *
 * @returns {string} la valeur acceptée par l'objectif, sinon `value` inchangé
 */
function toApiDestination(objective, value) {
    const entry = OBJECTIVES[objective];
    if (!entry || !value) return value;

    const acceptees = new Set(Object.values(entry.goals).flat());
    if (acceptees.has(value)) return value;

    const carte = DESTINATION_CATALOG.find(c => c.value === value);
    return carte?.covers.find(v => acceptees.has(v)) || value;
}

/**
 * Lieux de conversion proposables pour un objectif — et eux seuls.
 *
 * @returns {Array<{value, label, description, icon}>}
 */
function listDestinations(objective) {
    const entry = OBJECTIVES[objective];
    if (!entry) return [];

    const acceptees = new Set(Object.values(entry.goals).flat());

    return DESTINATION_CATALOG
        .filter(carte => carte.covers.some(d => acceptees.has(d)))
        .map(carte => ({
            value: carte.value,
            label: carte.label,
            icon: carte.icon,
            description: DESTINATION_DESCRIPTIONS[carte.value][objective]
                || DESTINATION_DESCRIPTIONS[carte.value].defaut
        }));
}

/**
 * Objet promu exigé, selon la destination et l'objectif de performance.
 * Déduit des refus de la sonde, qui nomment précisément le champ manquant.
 */
const PROMOTED_OBJECT_RULES = [
    {
        // VALUE optimise sur la valeur des achats : même exigence que
        // OFFSITE_CONVERSIONS, l'ensemble de données est ce qui rapporte le
        // montant de chaque vente.
        when: ({ goal }) => goal === 'OFFSITE_CONVERSIONS' || goal === 'VALUE',
        requires: ['pixel_id', 'custom_event_type'],
        message: 'Pour optimiser les achats sur un site, Facebook exige un ensemble de données (pixel). '
            + 'Créez-en un dans le Gestionnaire d’évènements et rattachez-le à votre compte publicitaire, '
            + 'ou choisissez « Applications de messagerie » comme lieu de conversion.'
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
        goals: Object.keys(o.goals),
        // Meta refuse d'optimiser des conversions sans ensemble de données
        // (pixel) : l'écran le signale dès le choix de l'objectif, comme le
        // font les autres outils (« Configuration de conversion requise »).
        needs_dataset: ['OFFSITE_CONVERSIONS', 'VALUE'].includes(o.default_goal)
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
    listDestinations,
    toApiDestination,
    validateCombination
};

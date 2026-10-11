const {
    listObjectives,
    isKnownObjective,
    getGoals,
    getDestinations,
    getDefaultGoal,
    getBillingEvent,
    validateCombination,
    listDestinations,
    toApiDestination
} = require('./campaignObjectives');

const PAGE = { page_id: '799671609906273' };

describe('référentiel — conformité aux relevés de sonde', () => {
    it('couvre les six objectifs de Meta', () => {
        expect(listObjectives().map(o => o.value).sort()).toEqual([
            'OUTCOME_APP_PROMOTION', 'OUTCOME_AWARENESS', 'OUTCOME_ENGAGEMENT',
            'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC'
        ]);
    });

    it('emploie les libellés de Meta, en un mot français', () => {
        const libelles = Object.fromEntries(listObjectives().map(o => [o.value, o.label]));
        expect(libelles.OUTCOME_AWARENESS).toBe('Notoriété');
        expect(libelles.OUTCOME_ENGAGEMENT).toBe('Interactions');
        expect(libelles.OUTCOME_TRAFFIC).toBe('Trafic');
        // Meta dit « Interactions », pas « Engagement ».
        expect(libelles.OUTCOME_ENGAGEMENT).not.toMatch(/Engagement/);
    });

    it('accepte CONVERSATIONS en Trafic, que la table ODAX omet', () => {
        expect(getGoals('OUTCOME_TRAFFIC')).toContain('CONVERSATIONS');
    });

    it('refuse CONVERSATIONS en Trafic vers un site web', () => {
        // Sonde : accepté en messagerie uniquement.
        expect(getGoals('OUTCOME_TRAFFIC', 'WEBSITE')).not.toContain('CONVERSATIONS');
        expect(getGoals('OUTCOME_TRAFFIC', 'MESSENGER')).toContain('CONVERSATIONS');
    });

    it('limite Notoriété aux quatre objectifs relevés', () => {
        expect(getGoals('OUTCOME_AWARENESS').sort())
            .toEqual(['AD_RECALL_LIFT', 'IMPRESSIONS', 'REACH', 'THRUPLAY']);
    });

    it('exclut LANDING_PAGE_VIEWS de Notoriété — le piège du changement d\'objectif', () => {
        // Venir de Trafic laissait LANDING_PAGE_VIEWS en mémoire et faisait
        // échouer toute campagne Notoriété.
        expect(getGoals('OUTCOME_AWARENESS')).not.toContain('LANDING_PAGE_VIEWS');
        expect(getGoals('OUTCOME_AWARENESS')).not.toContain('LINK_CLICKS');
    });

    it('reconnaît la destination ON_POST pour les Interactions', () => {
        expect(getGoals('OUTCOME_ENGAGEMENT', 'ON_POST').sort())
            .toEqual(['POST_ENGAGEMENT', 'REACH']);
    });

    it('offre à Ventes tous les objectifs relevés par la sonde', () => {
        // docs/meta/sonde-ventes.txt, 11 août 2026. Ventes ne proposait que
        // deux optimisations alors que Meta en accepte six sur la messagerie
        // et en affiche autant sur le site web.
        expect(getGoals('OUTCOME_SALES', 'MESSENGER').sort())
            .toEqual(['CONVERSATIONS', 'IMPRESSIONS', 'LINK_CLICKS', 'REACH']);

        expect(getGoals('OUTCOME_SALES', 'WEBSITE'))
            .toEqual([
                'OFFSITE_CONVERSIONS', 'VALUE', 'LANDING_PAGE_VIEWS',
                'LINK_CLICKS', 'REACH', 'IMPRESSIONS'
            ]);

        // Sondé : seule QUALITY_CALL passe sur une destination Appels.
        expect(getGoals('OUTCOME_SALES', 'PHONE_CALL')).toEqual(['QUALITY_CALL']);

        // Sondé KO pour tous les objectifs de performance.
        expect(getDestinations('OUTCOME_SALES')).not.toContain('APP');
        expect(getDestinations('OUTCOME_SALES')).not.toContain('ON_AD');
    });

    it('ne propose à Ventes que les lieux de conversion de cet objectif', () => {
        // Le formulaire affichait six cartes identiques pour tous les
        // objectifs : Ventes proposait « Instagram ou Facebook », que Meta
        // n'offre pas ici.
        const ventes = listDestinations('OUTCOME_SALES').map(d => d.value);
        expect(ventes).toEqual(['WEBSITE', 'MESSENGER', 'PHONE_CALL']);
        expect(ventes).not.toContain('INSTAGRAM_PROFILE');

        // Trafic garde les siens : les deux listes ne sont plus la même.
        expect(listDestinations('OUTCOME_TRAFFIC').map(d => d.value))
            .toContain('INSTAGRAM_PROFILE');
    });

    it('décrit les lieux de conversion dans les termes de l\'objectif', () => {
        // « Envoyez le trafic vers votre site Web » s'affichait jusque dans
        // une campagne de Ventes.
        const siteVentes = listDestinations('OUTCOME_SALES').find(d => d.value === 'WEBSITE');
        expect(siteVentes.description).toMatch(/achètent/i);
        expect(siteVentes.description).not.toMatch(/trafic/i);
    });

    it('exige un ensemble de données pour la valeur des conversions', () => {
        // VALUE optimise sur le montant des achats : sans pixel, Meta refuse.
        const sans = validateCombination({
            objective: 'OUTCOME_SALES', goal: 'VALUE', destination: 'WEBSITE'
        });
        expect(sans.valid).toBe(false);
        expect(sans.errors.join(' ')).toMatch(/pixel/i);
    });

    it('permet les Prospects par messagerie', () => {
        expect(getGoals('OUTCOME_LEADS', 'WHATSAPP')).toEqual(['CONVERSATIONS']);
        expect(getGoals('OUTCOME_LEADS', 'MESSENGER')).toContain('LEAD_GENERATION');
    });

    it('n\'expose pas ON_AD pour les Prospects', () => {
        // Refusé par Meta tant que les conditions de service du formulaire ne
        // sont pas acceptées sur la Page.
        expect(getDestinations('OUTCOME_LEADS')).not.toContain('ON_AD');
    });
});

describe('objectif indisponible', () => {
    it('déclare Promotion de l\'application indisponible, avec la raison', () => {
        const app = listObjectives().find(o => o.value === 'OUTCOME_APP_PROMOTION');
        expect(app.available).toBe(false);
        expect(app.unavailable_reason).toMatch(/application mobile/i);
    });

    it('refuse la combinaison en expliquant le prérequis', () => {
        const r = validateCombination({
            objective: 'OUTCOME_APP_PROMOTION', goal: 'APP_INSTALLS', destination: 'APP'
        });
        expect(r.valid).toBe(false);
        expect(r.errors[0]).toMatch(/application mobile/i);
    });

    it('marque les autres objectifs comme disponibles', () => {
        const dispo = listObjectives().filter(o => o.available).map(o => o.value);
        expect(dispo).toHaveLength(5);
    });
});

describe('validateCombination', () => {
    it('accepte une combinaison relevée par la sonde', () => {
        expect(validateCombination({
            objective: 'OUTCOME_TRAFFIC', goal: 'LINK_CLICKS', destination: 'WEBSITE'
        }).valid).toBe(true);
    });

    it('refuse un objectif inconnu au lieu de retomber sur LINK_CLICKS', () => {
        const r = validateCombination({ objective: 'FOO', goal: 'LINK_CLICKS' });
        expect(r.valid).toBe(false);
        expect(r.errors[0]).toMatch(/inconnu/i);
    });

    it('refuse un objectif de performance incompatible', () => {
        // Le scénario réel : Trafic écrit LANDING_PAGE_VIEWS, l'utilisateur
        // revient en arrière et choisit Notoriété.
        const r = validateCombination({
            objective: 'OUTCOME_AWARENESS', goal: 'LANDING_PAGE_VIEWS', destination: 'WEBSITE'
        });
        expect(r.valid).toBe(false);
        expect(r.errors[0]).toMatch(/n'est pas disponible/i);
    });

    it('refuse une destination incompatible', () => {
        const r = validateCombination({
            objective: 'OUTCOME_TRAFFIC', goal: 'CONVERSATIONS', destination: 'WEBSITE'
        });
        expect(r.valid).toBe(false);
        expect(r.errors.join(' ')).toMatch(/destination/i);
    });

    describe('objet promu', () => {
        it('exige un pixel et un événement pour les conversions site web', () => {
            const sans = validateCombination({
                objective: 'OUTCOME_SALES', goal: 'OFFSITE_CONVERSIONS', destination: 'WEBSITE'
            });
            expect(sans.valid).toBe(false);
            expect(sans.errors.join(' ')).toMatch(/pixel/i);

            const avec = validateCombination({
                objective: 'OUTCOME_SALES', goal: 'OFFSITE_CONVERSIONS', destination: 'WEBSITE',
                promoted_object: { pixel_id: '123', custom_event_type: 'PURCHASE' }
            });
            expect(avec.valid).toBe(true);
        });

        it('n\'exige aucun pixel pour les ventes par messagerie', () => {
            expect(validateCombination({
                objective: 'OUTCOME_SALES', goal: 'CONVERSATIONS', destination: 'MESSENGER'
            }).valid).toBe(true);
        });

        it('exige la Page pour une destination WhatsApp', () => {
            const sans = validateCombination({
                objective: 'OUTCOME_TRAFFIC', goal: 'LINK_CLICKS', destination: 'WHATSAPP'
            });
            expect(sans.errors.join(' ')).toMatch(/Page/);
        });

        it('exige la Page pour les Prospects', () => {
            const sans = validateCombination({
                objective: 'OUTCOME_LEADS', goal: 'LEAD_GENERATION', destination: 'MESSENGER'
            });
            expect(sans.valid).toBe(false);

            const avec = validateCombination({
                objective: 'OUTCOME_LEADS', goal: 'LEAD_GENERATION', destination: 'MESSENGER',
                promoted_object: PAGE
            });
            expect(avec.valid).toBe(true);
        });
    });
});

describe('getDefaultGoal', () => {
    it('propose un objectif de performance valide pour la destination', () => {
        expect(getDefaultGoal('OUTCOME_TRAFFIC', 'WEBSITE')).toBe('LINK_CLICKS');
        // CONVERSATIONS est le seul accepté pour Ventes en messagerie.
        expect(getDefaultGoal('OUTCOME_SALES', 'MESSENGER')).toBe('CONVERSATIONS');
        expect(getDefaultGoal('OUTCOME_SALES', 'WEBSITE')).toBe('OFFSITE_CONVERSIONS');
    });

    it('ne propose jamais un objectif que la destination refuse', () => {
        listObjectives().filter(o => o.available).forEach(o => {
            getDestinations(o.value).forEach(dest => {
                const defaut = getDefaultGoal(o.value, dest);
                expect(getGoals(o.value, dest)).toContain(defaut);
            });
        });
    });

    it('renvoie null pour un objectif inconnu ou indisponible', () => {
        expect(getDefaultGoal('FOO')).toBeNull();
        expect(getDefaultGoal('OUTCOME_APP_PROMOTION')).toBeNull();
    });
});

describe('getBillingEvent', () => {
    it('renvoie un événement valide, plus une constante enfouie dans le service', () => {
        expect(getBillingEvent()).toBe('IMPRESSIONS');
    });
});

describe('isKnownObjective', () => {
    it('distingue les objectifs du référentiel des autres', () => {
        expect(isKnownObjective('OUTCOME_TRAFFIC')).toBe(true);
        expect(isKnownObjective('LINK_CLICKS')).toBe(false);
        expect(isKnownObjective(undefined)).toBe(false);
    });
});

describe('toApiDestination', () => {
    // Relevé réel (8 oct. 2026, test T5) : la carte « Votre publication »
    // envoie ON_POST ; Trafic n'accepte que ON_AD. La création était refusée
    // par AdsFacile lui-même alors que la carte était proposée à l'écran.
    it('traduit la carte « Votre publication » en ON_AD pour Trafic', () => {
        expect(toApiDestination('OUTCOME_TRAFFIC', 'ON_POST')).toBe('ON_AD');
    });

    it("garde ON_POST là où l'objectif l'accepte (Interactions)", () => {
        expect(toApiDestination('OUTCOME_ENGAGEMENT', 'ON_POST')).toBe('ON_POST');
    });

    it('laisse intactes les valeurs déjà acceptées ou inconnues', () => {
        expect(toApiDestination('OUTCOME_TRAFFIC', 'WEBSITE')).toBe('WEBSITE');
        expect(toApiDestination('OUTCOME_TRAFFIC', 'INCONNU')).toBe('INCONNU');
        expect(toApiDestination('OUTCOME_TRAFFIC', undefined)).toBeUndefined();
    });
});

describe('pixel manquant : message d\'erreur actionnable', () => {
    const { validateCombination } = require('./campaignObjectives');

    it('explique quoi faire quand l\'optimisation sur les achats n\'a pas de pixel', () => {
        const res = validateCombination({
            objective: 'OUTCOME_SALES',
            goal: 'OFFSITE_CONVERSIONS',
            destination: 'WEBSITE',
            promoted_object: {}
        });
        const texte = JSON.stringify(res);
        expect(texte).toMatch(/ensemble de données/);
        expect(texte).toMatch(/Gestionnaire d/);
        expect(texte).toMatch(/messagerie/);
    });
});

describe('listObjectives — configuration de conversion requise', () => {
    const { listObjectives } = require('./campaignObjectives');

    it('signale que Ventes exige un ensemble de données, pas Trafic', () => {
        const liste = listObjectives();
        const trouver = (v) => liste.find(o => o.value === v);
        expect(trouver('OUTCOME_SALES').needs_dataset).toBe(true);
        expect(trouver('OUTCOME_TRAFFIC').needs_dataset).toBe(false);
        expect(trouver('OUTCOME_AWARENESS').needs_dataset).toBe(false);
    });
});

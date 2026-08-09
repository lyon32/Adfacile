const {
    isMessagingDestination,
    normalizeApps,
    validateMessagingApps,
    buildMessagingDestination
} = require('./messagingDestinations');

// Une Page avec Instagram et WhatsApp reliés : tout est permis.
const PAGE_COMPLETE = {
    fb_page_id: '799671609906273',
    instagram_connected: true,
    whatsapp_connected: true
};

describe('buildMessagingDestination — destination_type par combinaison', () => {
    // Ces sept valeurs sont imposées par Meta ; s'en écarter fait échouer la
    // création de l'ensemble de publicités.
    const cas = [
        [['messenger'], 'MESSENGER'],
        [['whatsapp'], 'WHATSAPP'],
        [['instagram'], 'INSTAGRAM_DIRECT'],
        [['messenger', 'instagram'], 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER'],
        [['messenger', 'whatsapp'], 'MESSAGING_MESSENGER_WHATSAPP'],
        [['instagram', 'whatsapp'], 'MESSAGING_INSTAGRAM_DIRECT_WHATSAPP'],
        [['messenger', 'instagram', 'whatsapp'], 'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP']
    ];

    test.each(cas)('%j → %s', (apps, expected) => {
        expect(buildMessagingDestination(apps).destination_type).toBe(expected);
    });

    it('ignore l\'ordre dans lequel l\'utilisateur coche les cases', () => {
        const a = buildMessagingDestination(['whatsapp', 'messenger']);
        const b = buildMessagingDestination(['messenger', 'whatsapp']);
        expect(a.destination_type).toBe(b.destination_type);
    });

    it('ignore les doublons', () => {
        expect(buildMessagingDestination(['messenger', 'messenger']).destination_type)
            .toBe('MESSENGER');
    });
});

describe('buildMessagingDestination — cohérence exigée par Meta', () => {
    it('optimise toujours pour CONVERSATIONS', () => {
        // C'est la première moitié du bug d'origine : l'ensemble partait en
        // LANDING_PAGE_VIEWS, incompatible avec une destination de messagerie.
        ['messenger', 'whatsapp', 'instagram'].forEach(app => {
            expect(buildMessagingDestination([app]).optimization_goal).toBe('CONVERSATIONS');
        });
        expect(buildMessagingDestination(['messenger', 'whatsapp', 'instagram']).optimization_goal)
            .toBe('CONVERSATIONS');
    });

    it('produit un bouton de messagerie, jamais LEARN_MORE', () => {
        // Seconde moitié du bug d'origine, à l'origine de l'erreur #1815675 :
        // une création de type lien classique dans un ensemble Messenger.
        const cta = buildMessagingDestination(['messenger']).call_to_action;
        expect(cta.type).toBe('MESSAGE_PAGE');
        expect(cta.value.app_destination).toBe('MESSENGER');
        expect(cta.type).not.toBe('LEARN_MORE');
    });

    it('associe à chaque application son bouton et son lien', () => {
        expect(buildMessagingDestination(['whatsapp'])).toMatchObject({
            link: 'https://api.whatsapp.com/send',
            call_to_action: { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } }
        });
        expect(buildMessagingDestination(['instagram'])).toMatchObject({
            link: 'https://www.instagram.com',
            call_to_action: { type: 'INSTAGRAM_MESSAGE', value: { app_destination: 'INSTAGRAM_DIRECT' } }
        });
    });

    it('ne porte qu\'un seul bouton quand plusieurs destinations sont cochées', () => {
        const result = buildMessagingDestination(['instagram', 'whatsapp', 'messenger']);
        expect(result.call_to_action.type).toBe('MESSAGE_PAGE');
        expect(Array.isArray(result.call_to_action)).toBe(false);
    });

    it('refuse une sélection vide', () => {
        expect(() => buildMessagingDestination([])).toThrow(/au moins une application/i);
    });

    it('n\'ajoute pas asset_feed_spec pour une destination unique', () => {
        const result = buildMessagingDestination(['messenger']);
        expect(result.is_multi_destination).toBe(false);
        expect(result.asset_feed_spec).toBeNull();
    });

    it('décrit un bouton par application au-delà d\'une destination', () => {
        // Sans asset_feed_spec, Meta refuse la publicité multi-destination
        // (sous-code 2446493) : c'est ce champ qui lui permet de choisir la
        // messagerie la plus adaptée à chaque personne.
        const result = buildMessagingDestination(['messenger', 'instagram', 'whatsapp']);

        expect(result.is_multi_destination).toBe(true);
        expect(result.asset_feed_spec.optimization_type).toBe('DOF_MESSAGING_DESTINATION');
        expect(result.asset_feed_spec.call_to_actions).toEqual([
            { type: 'MESSAGE_PAGE', value: { app_destination: 'MESSENGER', link: 'https://fb.com/messenger_doc/' } },
            { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP', link: 'https://api.whatsapp.com/send' } },
            { type: 'INSTAGRAM_MESSAGE', value: { app_destination: 'INSTAGRAM_DIRECT', link: 'https://www.instagram.com' } }
        ]);
    });

    it('ne liste que les applications cochées', () => {
        const result = buildMessagingDestination(['messenger', 'whatsapp']);
        expect(result.asset_feed_spec.call_to_actions.map(c => c.type))
            .toEqual(['MESSAGE_PAGE', 'WHATSAPP_MESSAGE']);
    });
});

describe('isMessagingDestination', () => {
    it('reconnaît les destinations simples et combinées', () => {
        [
            'MESSENGER',
            'WHATSAPP',
            'INSTAGRAM_DIRECT',
            'MESSAGING_MESSENGER_WHATSAPP',
            'MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP'
        ].forEach(type => expect(isMessagingDestination(type)).toBe(true));
    });

    it('ne confond pas avec une destination site web', () => {
        ['WEBSITE', 'UNDEFINED', undefined, null].forEach(type => {
            expect(isMessagingDestination(type)).toBe(false);
        });
    });
});

describe('normalizeApps', () => {
    it('accepte les alias employés ailleurs dans l\'application', () => {
        expect(normalizeApps(['MESSENGER', 'WHATSAPP'])).toEqual(['messenger', 'whatsapp']);
        expect(normalizeApps(['INSTAGRAM_DIRECT'])).toEqual(['instagram']);
    });

    it('ne confond pas la visite de profil Instagram avec la messagerie', () => {
        // INSTAGRAM_PROFILE envoie vers un profil, pas vers une conversation :
        // le traiter comme Instagram Direct produirait un ensemble de
        // publicités de messagerie sans que l'utilisateur l'ait demandé.
        expect(normalizeApps(['INSTAGRAM_PROFILE'])).toEqual([]);
    });

    it('écarte les valeurs inconnues sans planter', () => {
        expect(normalizeApps(['messenger', 'telegram', null, ''])).toEqual(['messenger']);
    });
});

describe('validateMessagingApps — contraintes de rattachement', () => {
    it('accepte Messenger dès qu\'une Page existe', () => {
        const result = validateMessagingApps(['messenger'], {
            fb_page_id: '1', instagram_connected: false, whatsapp_connected: false
        });
        expect(result.valid).toBe(true);
    });

    it('refuse WhatsApp sans numéro WhatsApp Business relié', () => {
        const result = validateMessagingApps(['whatsapp'], {
            fb_page_id: '1', whatsapp_connected: false
        });
        expect(result.valid).toBe(false);
        expect(result.errors.join(' ')).toMatch(/WhatsApp Business/);
    });

    it('refuse Instagram sans compte professionnel relié', () => {
        const result = validateMessagingApps(['instagram'], {
            fb_page_id: '1', instagram_connected: false
        });
        expect(result.valid).toBe(false);
        expect(result.errors.join(' ')).toMatch(/Instagram/);
    });

    it('signale chaque application manquante séparément', () => {
        const result = validateMessagingApps(['instagram', 'whatsapp'], { fb_page_id: '1' });
        expect(result.errors).toHaveLength(2);
    });

    it('accepte les trois destinations quand tout est relié', () => {
        expect(validateMessagingApps(['messenger', 'instagram', 'whatsapp'], PAGE_COMPLETE).valid)
            .toBe(true);
    });

    it('refuse une sélection vide', () => {
        expect(validateMessagingApps([], PAGE_COMPLETE).valid).toBe(false);
    });
});

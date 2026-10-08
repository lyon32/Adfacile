const { translateFacebookError } = require('./facebookErrors');

describe('translateFacebookError', () => {
    it('traduit l\'erreur #1815675 rencontrée en production', () => {
        // Erreur réelle : « Publicité non-Messenger dans l'ensemble de
        // publicités Messenger ». Meta la renvoie en sous-code.
        const result = translateFacebookError({
            message: 'Non-Messenger ad in Messenger ad set',
            code: 1487390,
            error_subcode: 1815675
        });

        expect(result.title).toMatch(/incompatible/i);
        expect(result.message).toMatch(/Messenger/);
        expect(result.fix).toBe('destination');
        expect(result.message).not.toMatch(/Non-Messenger ad in Messenger ad set/);
    });

    it('privilégie le sous-code, plus précis que le code', () => {
        const result = translateFacebookError({ code: 190, error_subcode: 463 });
        expect(result.message).toMatch(/expir/i);
        expect(result.fix).toBe('reconnect');
    });

    it('invite à se reconnecter sur un jeton expiré', () => {
        expect(translateFacebookError({ code: 190 }).fix).toBe('reconnect');
    });

    it('renvoie vers la facturation sur un compte désactivé', () => {
        expect(translateFacebookError({ code: 2635 }).fix).toBe('billing');
    });

    it('conserve le code et le sous-code pour le diagnostic', () => {
        const result = translateFacebookError({ code: 17, error_subcode: 99 });
        expect(result.code).toBe(17);
        expect(result.subcode).toBe(99);
    });

    describe('erreur inconnue', () => {
        it('préfère le message que Meta destine à l\'utilisateur', () => {
            const result = translateFacebookError({
                code: 999999,
                message: 'Internal technical detail',
                error_user_title: 'Budget trop faible',
                error_user_msg: 'Augmentez votre budget quotidien.'
            });
            expect(result.title).toBe('Budget trop faible');
            expect(result.message).toBe('Augmentez votre budget quotidien.');
        });

        it('retombe sur le message technique en dernier recours', () => {
            expect(translateFacebookError({ code: 999999, message: 'Something broke' }).message)
                .toBe('Something broke');
        });

        it('ne plante pas sur une erreur vide', () => {
            expect(() => translateFacebookError()).not.toThrow();
            expect(translateFacebookError({}).message).toBeTruthy();
        });
    });

describe('objectif de performance refusé (Ventes sans pixel)', () => {
    it('explique le pixel manquant au lieu du message générique de Meta', () => {
        const r = translateFacebookError({
            code: 100,
            error_subcode: 2490408,
            message: 'Invalid parameter',
            error_user_msg: 'Vous ne pouvez pas utiliser l’objectif de performance sélectionné.'
        });
        expect(r.message).toMatch(/ensemble de données/);
        expect(r.message).toMatch(/messagerie/);
        expect(r.fix).toBe('destination');
    });
});
});

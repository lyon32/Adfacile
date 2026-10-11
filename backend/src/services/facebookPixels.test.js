/**
 * Ensembles de données (pixels) : ceux déjà rattachés au compte publicitaire,
 * et ceux que l'entreprise possède sans les avoir partagés avec ce compte.
 *
 * Relevé sur un compte réel : act_…/adspixels était vide alors que l'entreprise
 * propriétaire du compte possédait un ensemble de données. Sans le montrer,
 * l'utilisateur ne savait pas qu'il suffisait de le partager.
 */

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('axios');

const axios = require('axios');
const { getAdAccountPixels, getBusinessPixels, getPixelsOverview } = require('./facebookService');

const reponse = (data) => Promise.resolve({ data });
const refus = (message) => Promise.reject({ response: { data: { error: { message } } }, message });

beforeEach(() => jest.resetAllMocks());

describe('getBusinessPixels', () => {
    it('liste les ensembles de l\'entreprise avec leur nom', async () => {
        axios.get.mockReturnValue(reponse({
            data: [{ id: '1', name: 'Mon pixel' }, { id: '2', name: 'Boutique' }]
        }));

        const pixels = await getBusinessPixels('B1', 'jeton');

        expect(pixels).toEqual([
            { id: '1', name: 'Mon pixel', last_fired_time: null },
            { id: '2', name: 'Boutique', last_fired_time: null }
        ]);
        expect(axios.get.mock.calls[0][0]).toMatch(/B1\/owned_pixels$/);
    });

    it('renvoie une liste vide sans entreprise, sans appeler Meta', async () => {
        expect(await getBusinessPixels(null, 'jeton')).toEqual([]);
        expect(axios.get).not.toHaveBeenCalled();
    });

    it('renvoie une liste vide si le jeton n\'a pas la permission, sans lever', async () => {
        axios.get.mockImplementation(() => refus('(#200) Requires business_management permission'));
        expect(await getBusinessPixels('B1', 'jeton')).toEqual([]);
    });
});

describe('getPixelsOverview', () => {
    it('sépare rattachés et non rattachés, sans doublon', async () => {
        axios.get.mockImplementation((url) => {
            if (url.endsWith('/adspixels')) return reponse({ data: [{ id: '1', name: 'Rattaché' }] });
            if (url.endsWith('/owned_pixels')) {
                return reponse({ data: [{ id: '1', name: 'Rattaché' }, { id: '2', name: 'Seul dans l\'entreprise' }] });
            }
            return reponse({ business: { id: 'B1' } });
        });

        const vue = await getPixelsOverview('act_9', 'jeton');

        expect(vue.attached.map(p => p.id)).toEqual(['1']);
        expect(vue.business_unattached).toEqual([
            { id: '2', name: 'Seul dans l\'entreprise', last_fired_time: null }
        ]);
    });

    it('lit l\'entreprise du compte quand elle n\'est pas fournie', async () => {
        axios.get.mockImplementation((url, opts) => {
            if (url.endsWith('/adspixels')) return reponse({ data: [] });
            if (url.endsWith('/owned_pixels')) return reponse({ data: [{ id: '2', name: 'X' }] });
            expect(opts.params.fields).toMatch(/business/);
            return reponse({ business: { id: 'B1' } });
        });

        const vue = await getPixelsOverview('9', 'jeton');
        expect(vue.business_unattached).toHaveLength(1);
    });

    it('renvoie les rattachés même si la lecture de l\'entreprise échoue', async () => {
        axios.get.mockImplementation((url) => {
            if (url.endsWith('/adspixels')) return reponse({ data: [{ id: '1', name: 'P' }] });
            return refus('permission');
        });

        const vue = await getPixelsOverview('act_9', 'jeton');
        expect(vue.attached).toHaveLength(1);
        expect(vue.business_unattached).toEqual([]);
    });

    it('échoue si le compte lui-même est illisible (comportement existant)', async () => {
        axios.get.mockImplementation(() => refus('compte refusé'));
        await expect(getPixelsOverview('act_9', 'jeton')).rejects.toThrow(/ensembles de données/);
    });
});

describe('getAdAccountPixels (inchangé)', () => {
    it('écarte les ensembles indisponibles', async () => {
        axios.get.mockReturnValue(reponse({ data: [{ id: '1', name: 'A' }, { id: '2', name: 'B', is_unavailable: true }] }));
        expect((await getAdAccountPixels('act_1', 't')).map(p => p.id)).toEqual(['1']);
    });
});

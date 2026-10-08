/**
 * Cache mémoire à durée de vie
 *
 * Sert aux statistiques Meta : la page Analytics faisait jusqu'à 7 appels
 * Graph par campagne à chaque ouverture, sur un plafond de 240 appels/heure
 * pour l'app (relevé MCP Meta du 8 oct. 2026).
 */

const { createTtlCache } = require('./ttlCache');

describe('createTtlCache.remember', () => {
    it('ne rappelle pas la source tant que l\'entrée est valide', async () => {
        let maintenant = 0;
        const cache = createTtlCache({ now: () => maintenant });
        const source = jest.fn().mockResolvedValue('stats');

        await cache.remember('k', 1000, source);
        maintenant = 999;
        await expect(cache.remember('k', 1000, source)).resolves.toBe('stats');

        expect(source).toHaveBeenCalledTimes(1);
    });

    it('rappelle la source une fois la durée écoulée', async () => {
        let maintenant = 0;
        const cache = createTtlCache({ now: () => maintenant });
        const source = jest.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');

        await cache.remember('k', 1000, source);
        maintenant = 1000;
        await expect(cache.remember('k', 1000, source)).resolves.toBe('v2');
    });

    it('regroupe les demandes simultanées en un seul appel', async () => {
        const cache = createTtlCache();
        let resoudre;
        const source = jest.fn(() => new Promise(r => { resoudre = r; }));

        const a = cache.remember('k', 1000, source);
        const b = cache.remember('k', 1000, source);
        resoudre('stats');

        await expect(Promise.all([a, b])).resolves.toEqual(['stats', 'stats']);
        expect(source).toHaveBeenCalledTimes(1);
    });

    it('ne garde jamais un échec : la demande suivante réessaie', async () => {
        const cache = createTtlCache();
        const source = jest.fn()
            .mockRejectedValueOnce(new Error('Meta indisponible'))
            .mockResolvedValueOnce('stats');

        await expect(cache.remember('k', 1000, source)).rejects.toThrow('Meta indisponible');
        await expect(cache.remember('k', 1000, source)).resolves.toBe('stats');
    });

    it('borne le nombre d\'entrées en écartant la plus ancienne', async () => {
        const cache = createTtlCache({ maxEntries: 2 });
        await cache.remember('a', 1000, async () => 1);
        await cache.remember('b', 1000, async () => 2);
        await cache.remember('c', 1000, async () => 3);

        expect(cache.size()).toBe(2);
        const source = jest.fn().mockResolvedValue('nouveau');
        await cache.remember('a', 1000, source);
        expect(source).toHaveBeenCalledTimes(1);
    });
});

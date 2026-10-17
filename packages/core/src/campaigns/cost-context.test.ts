// Lecture des données du coût (pays du propriétaire, taux de change) : rien n'est inventé quand la donnée manque (TR-PAY-12).
// TVA retirée pour le moment (décision du 17/10/2026) : plus aucune lecture de `vat_rates` ni de `ad_accounts`.
import { describe, expect, it } from 'vitest';
import { FakeClient } from '../fake-client.test-helper';
import type { MemberCtx } from '../context';
import { loadCostContext } from './cost-context';

const NOW = new Date('2026-10-12T09:00:00Z');
function ctxWith(client: FakeClient): MemberCtx {
  return {
    requestId: 'req_TEST',
    user: { id: 'u1', email: 'a@example.com', locale: 'fr', timezone: 'Africa/Douala' },
    db: client.asDb(),
    svc: client.asService(),
    now: () => NOW,
    workspace: { id: 'w1', role: 'owner', access: 'active' },
  };
}
const ok = (data: unknown) => ({ data, error: null });

describe('loadCostContext', () => {
  it('pays du propriétaire de l’espace, taux de change lu en base', async () => {
    const client = new FakeClient().reply(
      ok({ owner_id: 'o1' }), // workspaces
      ok({ country_code: 'CM' }), // profiles
      ok({ currency: 'XAF' }), // countries
      ok([{ rate: 600, source: 'manual', fetched_at: '2026-10-12T08:00:00Z' }]), // exchange_rates
    );
    const result = await loadCostContext(ctxWith(client));
    expect(result.fx).toEqual({
      rate: 600,
      quote: 'XAF',
      source: 'manual',
      fetchedAt: '2026-10-12T08:00:00.000Z',
    });
    const owner = client.calls.find((c) => c.target === 'workspaces');
    expect(owner?.ops).toContainEqual(['eq', 'id', 'w1']);
  });

  it('ne lit plus ni la TVA ni le compte publicitaire', async () => {
    const client = new FakeClient().reply(
      ok({ owner_id: 'o1' }),
      ok({ country_code: 'CI' }),
      ok({ currency: 'XOF' }),
      ok([{ rate: 601.5, source: 'saspay', fetched_at: '2026-10-12T08:00:00Z' }]),
    );
    const result = await loadCostContext(ctxWith(client));
    expect(result.fx?.quote).toBe('XOF');
    expect(client.calls.some((c) => c.target === 'vat_rates')).toBe(false);
    expect(client.calls.some((c) => c.target === 'ad_accounts')).toBe(false);
  });

  it('aucun taux de change en base : fx null, jamais une valeur par défaut', async () => {
    const client = new FakeClient().reply(
      ok({ owner_id: 'o1' }),
      ok({ country_code: 'CM' }),
      ok({ currency: 'XAF' }),
      ok([]),
    );
    const result = await loadCostContext(ctxWith(client));
    expect(result.fx).toBeNull();
  });

  it('pays inconnu de la table des pays : pas de change', async () => {
    const client = new FakeClient().reply(
      ok({ owner_id: 'o1' }),
      ok({ country_code: 'NG' }),
      ok(null),
    );
    const result = await loadCostContext(ctxWith(client));
    expect(result.fx).toBeNull();
    expect(client.calls.some((c) => c.target === 'exchange_rates')).toBe(false);
  });

  it('pays non CFA (Nigeria) : la monnaie du pays et son taux, source exchangerate-api', async () => {
    const client = new FakeClient().reply(
      ok({ owner_id: 'o1' }),
      ok({ country_code: 'NG' }),
      ok({ currency: 'NGN' }),
      ok([{ rate: 1500.1234, source: 'exchangerate-api', fetched_at: '2026-10-12T08:00:00Z' }]),
    );
    const result = await loadCostContext(ctxWith(client));
    expect(result.fx).toEqual({
      rate: 1500.1234,
      quote: 'NGN',
      source: 'exchangerate-api',
      fetchedAt: '2026-10-12T08:00:00.000Z',
    });
    const fxCall = client.calls.find((c) => c.target === 'exchange_rates');
    expect(fxCall?.ops).toContainEqual(['eq', 'quote', 'NGN']);
  });

  it('monnaie du pays absente de la table des unités mineures : pas de change, rien n’est supposé', async () => {
    const client = new FakeClient().reply(
      ok({ owner_id: 'o1' }),
      ok({ country_code: 'ZZ' }),
      ok({ currency: 'EUR' }),
    );
    const result = await loadCostContext(ctxWith(client));
    expect(result.fx).toBeNull();
    expect(client.calls.some((c) => c.target === 'exchange_rates')).toBe(false);
  });

  it('pays introuvable : fx null', async () => {
    const client = new FakeClient().reply(ok({ owner_id: 'o1' }), ok({ country_code: null }));
    const result = await loadCostContext(ctxWith(client));
    expect(result).toEqual({ fx: null });
  });

  it('une erreur de base devient internal_error', async () => {
    const client = new FakeClient().reply({ data: null, error: { message: 'boom' } });
    await expect(loadCostContext(ctxWith(client))).rejects.toMatchObject({
      code: 'internal_error',
    });
  });
});

// Lecture des données du coût (TVA du pays, taux de change) : rien n'est inventé quand la donnée manque (TR-PAY-12).
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
  it('pays du compte publicitaire actif, TVA et change lus en base', async () => {
    const client = new FakeClient().reply(
      ok({ vat_country: 'CM' }), // ad_accounts
      ok({ currency: 'XAF' }), // countries
      ok([{ rate: 0.1925 }]), // vat_rates
      ok([{ rate: 600, source: 'manual', fetched_at: '2026-10-12T08:00:00Z' }]), // exchange_rates
    );
    const result = await loadCostContext(ctxWith(client));
    expect(result.vat).toEqual({ country: 'CM', rate: 0.1925 });
    expect(result.fx).toEqual({
      rate: 600,
      quote: 'XAF',
      source: 'manual',
      fetchedAt: '2026-10-12T08:00:00.000Z',
    });
    const vatCall = client.calls.find((c) => c.target === 'vat_rates');
    expect(vatCall?.ops).toContainEqual(['eq', 'country_code', 'CM']);
    expect(vatCall?.ops).toContainEqual(['lte', 'valid_from', '2026-10-12']);
  });

  it('sans pays sur le compte publicitaire : pays du propriétaire', async () => {
    const client = new FakeClient().reply(
      ok({ vat_country: null }), // ad_accounts
      ok({ owner_id: 'o1' }), // workspaces
      ok({ country_code: 'CI' }), // profiles
      ok({ currency: 'XOF' }), // countries
      ok([{ rate: 0.18 }]),
      ok([{ rate: 601.5, source: 'saspay', fetched_at: '2026-10-12T08:00:00Z' }]),
    );
    const result = await loadCostContext(ctxWith(client));
    expect(result.vat.country).toBe('CI');
    expect(result.fx?.quote).toBe('XOF');
    const owner = client.calls.find((c) => c.target === 'workspaces');
    expect(owner?.ops).toContainEqual(['eq', 'id', 'w1']);
  });

  it('aucune TVA en base : taux null, jamais une valeur par défaut', async () => {
    const client = new FakeClient().reply(
      ok({ vat_country: 'CM' }),
      ok({ currency: 'XAF' }),
      ok([]), // vat_rates vide
      ok([{ rate: 600, source: 'manual', fetched_at: '2026-10-12T08:00:00Z' }]),
    );
    const result = await loadCostContext(ctxWith(client));
    expect(result.vat).toEqual({ country: 'CM', rate: null });
  });

  it('aucun taux de change en base : fx null', async () => {
    const client = new FakeClient().reply(
      ok({ vat_country: 'CM' }),
      ok({ currency: 'XAF' }),
      ok([{ rate: 0.1925 }]),
      ok([]),
    );
    const result = await loadCostContext(ctxWith(client));
    expect(result.fx).toBeNull();
  });

  it('pays inconnu de la table des pays (monnaie non FCFA) : pas de change, pas de TVA lue', async () => {
    const client = new FakeClient().reply(ok({ vat_country: 'NG' }), ok(null));
    const result = await loadCostContext(ctxWith(client));
    expect(result.fx).toBeNull();
    expect(result.vat).toEqual({ country: 'NG', rate: null });
    expect(client.calls.some((c) => c.target === 'exchange_rates')).toBe(false);
  });

  it('pays introuvable partout : tout est null', async () => {
    const client = new FakeClient().reply(
      ok(null), // pas de compte publicitaire actif
      ok({ owner_id: 'o1' }),
      ok({ country_code: null }),
    );
    const result = await loadCostContext(ctxWith(client));
    expect(result).toEqual({ vat: { country: null, rate: null }, fx: null });
  });

  it('une erreur de base devient internal_error', async () => {
    const client = new FakeClient().reply({ data: null, error: { message: 'boom' } });
    await expect(loadCostContext(ctxWith(client))).rejects.toMatchObject({
      code: 'internal_error',
    });
  });
});

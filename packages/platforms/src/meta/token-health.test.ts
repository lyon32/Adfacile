import { describe, expect, it } from 'vitest';
import { failure, FakeGraph } from './fake-graph.test-helper';
import { TokenHealth } from './token-health';

// Tests portés de backend/src/services/facebookTokenHealth.test.js (TR-PLA-02, TR-PLA-03).
// Relevé réel (7 oct. 2026) : Meta avait invalidé le jeton (code 190, sous-code 460) alors que l'écran
// affichait « connecté ». Ces tests verrouillent la détection.
function sante(
  handler: ConstructorParameters<typeof FakeGraph>[0],
  start = new Date('2026-10-10T10:00:00Z'),
) {
  const graph = new FakeGraph(handler);
  let now = start;
  const health = new TokenHealth({
    graph: graph.client(),
    appId: 'app',
    appSecret: 'secret',
    now: () => now,
  });
  return {
    graph,
    health,
    advance: (ms: number): void => {
      now = new Date(now.getTime() + ms);
    },
  };
}

describe('TokenHealth.check', () => {
  it('jeton invalide chez Meta → valid:false, raison revoked, sous-code conservé', async () => {
    const { health } = sante(() => ({
      data: { is_valid: false, error: { code: 190, subcode: 460 } },
    }));
    expect(await health.check('c1', 'jeton')).toMatchObject({
      valid: false,
      reason: 'revoked',
      subcode: 460,
    });
  });

  it("jeton valide → renvoie la date de fin d'accès aux données", async () => {
    const { health } = sante(() => ({
      data: { is_valid: true, data_access_expires_at: 1794213779 },
    }));
    const r = await health.check('c1', 'jeton');
    expect(r.valid).toBe(true);
    expect(r.dataAccessExpiresAt).toBe(new Date(1794213779 * 1000).toISOString());
  });

  it('met en cache : un seul appel à Meta pour deux vérifications rapprochées', async () => {
    const { graph, health } = sante(() => ({ data: { is_valid: true } }));
    await health.check('c1', 'jeton');
    await health.check('c1', 'jeton');
    expect(graph.calls).toHaveLength(1);
  });

  it('redemande à Meta quand le cache a expiré (5 minutes)', async () => {
    const { graph, health, advance } = sante(() => ({ data: { is_valid: true } }));
    await health.check('c1', 'jeton');
    advance(5 * 60 * 1000 + 1);
    await health.check('c1', 'jeton');
    expect(graph.calls).toHaveLength(2);
  });

  it('Meta injoignable → état inconnu (valid:null), jamais « révoqué » à tort, et rien en cache', async () => {
    let calls = 0;
    const { health } = sante(() => {
      calls += 1;
      return calls === 1 ? failure({ message: 'ETIMEDOUT' }, 500) : { data: { is_valid: true } };
    });
    expect((await health.check('c1', 'jeton')).valid).toBeNull();
    expect((await health.check('c1', 'jeton')).valid).toBe(true);
  });

  it('envoie le jeton à vérifier et les identifiants de l’application, pas le jeton comme accès', async () => {
    const { graph, health } = sante(() => ({ data: { is_valid: true } }));
    await health.check('c1', 'jeton-a-verifier');
    expect(graph.calls[0]).toMatchObject({
      path: 'debug_token',
      params: { input_token: 'jeton-a-verifier', access_token: 'app|secret' },
    });
  });

  it("markRevoked force l'état révoqué sans rappeler Meta", async () => {
    const { graph, health } = sante(() => ({ data: { is_valid: true } }));
    health.markRevoked('c1', 460);
    expect(await health.check('c1', 'jeton')).toMatchObject({ valid: false, reason: 'revoked' });
    expect(graph.calls).toHaveLength(0);
  });

  it('forget efface l’état après une reconnexion', async () => {
    const { graph, health } = sante(() => ({ data: { is_valid: true } }));
    health.markRevoked('c1');
    health.forget('c1');
    expect((await health.check('c1', 'jeton')).valid).toBe(true);
    expect(graph.calls).toHaveLength(1);
  });
});

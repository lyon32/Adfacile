// Matériel commun aux tests unitaires de `core/meta` : contexte d'un membre, dépendances avec la
// fausse Meta, réponses programmées du faux client Supabase.
import { encryptToken, FakeMetaConnector } from '@pubeka/platforms';
import type { MemberCtx, MemberRole, WorkspaceAccess } from '../context';
import type { FakeClient, FakeResponse } from '../fake-client.test-helper';
import type { MetaDeps } from './deps';
import type { StateCodec } from './oauth-state';

export const OWNER_ID = '11111111-1111-4111-8111-111111111111';
export const WS = '44444444-4444-4444-8444-444444444444';
export const CONN = '66666666-6666-4666-8666-666666666666';
export const NOW = new Date('2026-10-14T10:00:00Z');
export const KEY = { id: 'k1', bytes: new Uint8Array(32).fill(3) };
export const NONCE = 'nonce-de-test-0123456789';

export const ok = (data: unknown): FakeResponse => ({ data, error: null });
export const PLANS = ok([
  { code: 'starter', max_members: 1, max_pages: 1, campaigns_per_period: 2 },
  { code: 'pro', max_members: 2, max_pages: 3, campaigns_per_period: 5 },
]);

/** Codec de test : JSON en clair, sans signature (la signature est testée côté web). */
export const codec: StateCodec = {
  seal: (payload) => JSON.stringify(payload),
  open: (token) => {
    try {
      return JSON.parse(token) as unknown;
    } catch {
      return null;
    }
  },
};

export function metaDeps(connector: MetaDeps['connector'] = new FakeMetaConnector()): MetaDeps {
  return {
    connector,
    redirectUri: 'https://app.test/api/v1/meta/callback',
    keys: { [KEY.id]: KEY.bytes },
    activeKey: KEY,
    state: codec,
    newNonce: () => NONCE,
  };
}

export function memberCtx(
  db: FakeClient,
  svc: FakeClient,
  role: MemberRole = 'owner',
  access: WorkspaceAccess = 'active',
): MemberCtx {
  return {
    requestId: 'req_TEST',
    user: { id: OWNER_ID, email: 'awa@example.com', locale: 'fr', timezone: 'Africa/Douala' },
    db: db.asDb(),
    svc: svc.asService(),
    now: () => NOW,
    workspace: { id: WS, role, access },
  };
}

/** Jeton scellé tel que la base le renvoie (`get_meta_token`). */
export function sealedRow(plain = 'fake-token-abc'): FakeResponse {
  return ok([{ sealed: encryptToken(plain, KEY), key_id: KEY.id }]);
}

/** Les trois lectures de la formule : abonnement, formules, début de période. */
export const STARTER_PLAN: FakeResponse[] = [ok([]), PLANS, ok(null)];

export function connectionRow(over: Record<string, unknown> = {}): FakeResponse {
  return ok({
    id: CONN,
    token_type: 'user',
    status: 'ok',
    expires_at: '2026-12-01T00:00:00.000Z',
    business_id: null,
    last_health_check: null,
    ...over,
  });
}

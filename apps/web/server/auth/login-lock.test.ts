import type { ServiceClient } from '@pubeka/db';
import { describe, expect, it } from 'vitest';
import { dbLockStore, loginKey } from './login-lock';

describe('loginKey', () => {
  it('ne dépend ni de la casse ni des espaces de l’e-mail', () => {
    expect(loginKey(' Awa@Test.CM ', '1.2.3.4')).toBe(loginKey('awa@test.cm', '1.2.3.4'));
  });

  it('change avec l’adresse IP (EC-AUTH-04) et ne contient pas l’e-mail', () => {
    const key = loginKey('awa@test.cm', '1.2.3.4');
    expect(key).not.toBe(loginKey('awa@test.cm', '5.6.7.8'));
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });
});

type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

function fakeService(rpc: Rpc): ServiceClient {
  return { rpc } as unknown as ServiceClient;
}

describe('dbLockStore (fonctions de la migration 0004)', () => {
  it('appelle les trois fonctions avec la clé et lit leur réponse', async () => {
    const calls: string[] = [];
    const store = dbLockStore(
      fakeService((name, args) => {
        calls.push(`${name}:${String(args.p_key)}`);
        return Promise.resolve({
          data:
            name === 'clear_login_failures'
              ? null
              : [{ locked: true, failures: 5, retry_after_s: 42 }],
          error: null,
        });
      }),
    );
    expect(await store.status('k')).toEqual({ locked: true, retryAfterS: 42 });
    expect(await store.recordFailure('k')).toEqual({ locked: true, retryAfterS: 42 });
    await store.clear('k');
    expect(calls).toEqual([
      'login_lock_status:k',
      'record_login_failure:k',
      'clear_login_failures:k',
    ]);
  });

  it('lève une erreur si la base ne répond pas (la connexion échoue fermée)', async () => {
    const store = dbLockStore(
      fakeService(() => Promise.resolve({ data: null, error: { message: 'panne' } })),
    );
    await expect(store.status('k')).rejects.toThrow(/indisponible/);
    await expect(store.clear('k')).rejects.toThrow(/indisponible/);
    const empty = dbLockStore(fakeService(() => Promise.resolve({ data: [], error: null })));
    await expect(empty.recordFailure('k')).rejects.toThrow(/vide/);
  });
});

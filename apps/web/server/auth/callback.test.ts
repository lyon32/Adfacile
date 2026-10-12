import { beforeEach, describe, expect, it } from 'vitest';
import { handleAuthCallback } from './callback';
import { safeNext } from './safe-next';
import { FakeAuthGateway } from './testing/fake-auth';

let gateway: FakeAuthGateway;
beforeEach(() => {
  gateway = new FakeAuthGateway();
});

const run = (query: string): Promise<string> =>
  handleAuthCallback(gateway, new URLSearchParams(query));

/** Suit l'adresse du faux fournisseur et renvoie le code qu'il remet au retour. */
async function codeFrom(provider: 'google' | 'apple'): Promise<string> {
  const url = await gateway.oauthUrl(provider, 'http://app.localhost:5173/auth/callback');
  return new URL(url ?? 'http://x').searchParams.get('code') ?? '';
}

describe('Google et Apple (faux fournisseurs)', () => {
  it.each(['google', 'apple'] as const)(
    '%s : le retour ouvre la session puis va au tableau de bord',
    async (p) => {
      const code = await codeFrom(p);
      expect(await run(`code=${code}`)).toBe('/');
      expect(gateway.session).toBe(`${p}-user@example.test`);
    },
  );

  it('un code déjà utilisé est refusé (lien expiré)', async () => {
    const code = await codeFrom('google');
    await run(`code=${code}`);
    expect(await run(`code=${code}`)).toBe('/connexion?erreur=lien_expire');
  });

  it('accès refusé chez le fournisseur : retour à la connexion avec un message', async () => {
    expect(await run('error=access_denied&error_description=refus')).toBe(
      '/connexion?erreur=connexion_impossible',
    );
  });

  it('fournisseur sans identifiants : pas d’adresse de départ', async () => {
    gateway.configuredProviders.clear();
    expect(await gateway.oauthUrl('apple', 'http://app.localhost:5173/auth/callback')).toBeNull();
  });
});

describe('liens par e-mail', () => {
  it('lien expiré (error_code=otp_expired) : « Ce lien a expiré »', async () => {
    expect(await run('error=access_denied&error_code=otp_expired')).toBe(
      '/connexion?erreur=lien_expire',
    );
  });

  it('confirmation par token_hash, puis retour au chemin demandé', async () => {
    gateway.emailTokens.set('h1', { type: 'recovery', expired: false });
    expect(await run('token_hash=h1&type=recovery&next=/mot-de-passe-oublie/nouveau')).toBe(
      '/mot-de-passe-oublie/nouveau',
    );
  });

  it('EC-AUTH-06 : un lien de réinitialisation utilisé deux fois est refusé', async () => {
    gateway.emailTokens.set('h2', { type: 'recovery', expired: false });
    await run('token_hash=h2&type=recovery');
    expect(await run('token_hash=h2&type=recovery')).toBe('/connexion?erreur=lien_expire');
  });

  it('type inconnu ou paramètres absents : connexion impossible', async () => {
    expect(await run('token_hash=h3&type=pirate')).toBe('/connexion?erreur=connexion_impossible');
    expect(await run('')).toBe('/connexion?erreur=connexion_impossible');
  });

  it('autre erreur de Supabase : connexion impossible', async () => {
    const broken = Object.assign(Object.create(gateway) as FakeAuthGateway, {
      exchangeCode: () => Promise.resolve({ code: 'unexpected_failure', status: 500 }),
    });
    expect(await handleAuthCallback(broken, new URLSearchParams('code=x'))).toBe(
      '/connexion?erreur=connexion_impossible',
    );
  });
});

describe('safeNext : pas de redirection ouverte', () => {
  it.each([
    ['/campagnes/nouvelle?etape=questions', '/campagnes/nouvelle?etape=questions'],
    ['https://pirate.test', '/'],
    ['//pirate.test', '/'],
    ['/\\pirate.test', '/'],
    [null, '/'],
    [undefined, '/'],
  ])('%s → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

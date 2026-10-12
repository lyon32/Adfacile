import { beforeEach, describe, expect, it } from 'vitest';
import {
  FORGOT_MIN_DURATION_MS,
  outcomeOf,
  requestPasswordReset,
  resendConfirmation,
  sendMagicLink,
  setNewPassword,
  signIn,
  signOut,
  signUp,
  type AuthDeps,
} from './actions';
import { FakeAuthGateway, FakeLockStore, VALID_CAPTCHA } from './testing/fake-auth';

const CALLBACK = 'http://app.localhost:5173/auth/callback';
let gateway: FakeAuthGateway;
let clock: { nowMs: number };
let deps: AuthDeps;
let slept: number[];

beforeEach(() => {
  gateway = new FakeAuthGateway();
  clock = { nowMs: Date.UTC(2026, 9, 12, 10) };
  slept = [];
  deps = {
    gateway,
    locks: new FakeLockStore(clock),
    callbackUrl: CALLBACK,
    nowMs: () => clock.nowMs,
    sleep: (ms) => {
      slept.push(ms);
      clock.nowMs += ms;
      return Promise.resolve();
    },
  };
  gateway.addUser('awa@test.cm', 'bon-mot-de-passe');
});

const attempt = (password: string, ip = '41.202.0.1', email = 'awa@test.cm') =>
  signIn(deps, { email, password, captchaToken: VALID_CAPTCHA, ip });

describe('connexion par e-mail', () => {
  it('connecte avec le bon mot de passe', async () => {
    expect(await attempt('bon-mot-de-passe')).toEqual({ outcome: 'ok' });
    expect(gateway.session).toBe('awa@test.cm');
  });

  it('refuse un mauvais mot de passe avec un message générique', async () => {
    expect(await attempt('faux')).toEqual({ outcome: 'invalid_credentials' });
  });

  it('refuse sans CAPTCHA valide, sans compter un échec (SECURITE-BACKEND §3)', async () => {
    const res = await signIn(deps, {
      email: 'awa@test.cm',
      password: 'faux',
      captchaToken: 'jeton-invalide',
      ip: '1.1.1.1',
    });
    expect(res.outcome).toBe('captcha_failed');
  });

  it('signale un e-mail non confirmé', async () => {
    gateway.addUser('neo@test.cm', 'mot-de-passe-1', false);
    expect((await attempt('mot-de-passe-1', '1.1.1.1', 'neo@test.cm')).outcome).toBe(
      'email_not_confirmed',
    );
  });
});

describe('EC-AUTH-04 / TR-SEC-14 : blocage après 5 échecs pour un couple e-mail + IP', () => {
  it('bloque au 5ᵉ échec, pour 15 minutes', async () => {
    for (let i = 0; i < 4; i++) expect((await attempt('faux')).outcome).toBe('invalid_credentials');
    expect(await attempt('faux')).toEqual({ outcome: 'locked', retryAfterS: 900 });
  });

  it('refuse la 6ᵉ tentative, même avec le bon mot de passe, sans l’essayer', async () => {
    for (let i = 0; i < 5; i++) await attempt('faux');
    const before = gateway.calls.length;
    clock.nowMs += 14 * 60_000;
    expect(await attempt('bon-mot-de-passe')).toEqual({ outcome: 'locked', retryAfterS: 60 });
    expect(gateway.calls.length).toBe(before);
  });

  it('accepte de nouveau 15 minutes après le 5ᵉ échec (horloge simulée)', async () => {
    for (let i = 0; i < 5; i++) await attempt('faux');
    clock.nowMs += 15 * 60_000;
    expect((await attempt('bon-mot-de-passe')).outcome).toBe('ok');
  });

  it('ne bloque pas le même e-mail depuis une autre adresse IP', async () => {
    for (let i = 0; i < 5; i++) await attempt('faux', '41.202.0.1');
    expect((await attempt('bon-mot-de-passe', '102.244.0.9')).outcome).toBe('ok');
  });

  it('répond pareil pour un e-mail inconnu (pas de découverte des comptes)', async () => {
    const res = [];
    for (let i = 0; i < 5; i++)
      res.push((await attempt('x', '1.1.1.1', 'inconnu@test.cm')).outcome);
    expect(res).toEqual([
      'invalid_credentials',
      'invalid_credentials',
      'invalid_credentials',
      'invalid_credentials',
      'locked',
    ]);
  });

  it('une connexion réussie remet le compteur à zéro (« 5 échecs d’affilée »)', async () => {
    for (let i = 0; i < 4; i++) await attempt('faux');
    await attempt('bon-mot-de-passe');
    for (let i = 0; i < 4; i++) expect((await attempt('faux')).outcome).toBe('invalid_credentials');
  });
});

describe('inscription (APPFLOW §4.1)', () => {
  const input = { password: 'motdepasse8', captchaToken: VALID_CAPTCHA, locale: 'fr' as const };

  it('crée le compte et envoie le lien de confirmation vers auth/callback', async () => {
    expect(await signUp(deps, { ...input, email: 'kofi@test.ci' })).toEqual({ outcome: 'ok' });
    expect(gateway.sentEmails[0]?.redirectTo).toBe(`${CALLBACK}?next=%2F`);
  });

  it('signale un e-mail déjà utilisé', async () => {
    expect((await signUp(deps, { ...input, email: 'awa@test.cm' })).outcome).toBe('email_taken');
  });

  it('refuse un mot de passe trop faible', async () => {
    expect((await signUp(deps, { ...input, password: 'court', email: 'a@b.cm' })).outcome).toBe(
      'weak_password',
    );
  });

  it('renvoie le lien de confirmation', async () => {
    expect(
      await resendConfirmation(deps, { email: 'awa@test.cm', captchaToken: VALID_CAPTCHA }),
    ).toEqual({
      outcome: 'ok',
    });
    expect(
      (await resendConfirmation(deps, { email: 'awa@test.cm', captchaToken: 'x' })).outcome,
    ).toBe('captcha_failed');
  });
});

describe('lien magique', () => {
  it('même réponse pour un e-mail connu ou inconnu', async () => {
    const known = await sendMagicLink(deps, { email: 'awa@test.cm', captchaToken: VALID_CAPTCHA });
    const unknown = await sendMagicLink(deps, { email: 'x@test.cm', captchaToken: VALID_CAPTCHA });
    expect(known).toEqual(unknown);
    expect(gateway.sentEmails).toHaveLength(1);
  });

  it('signale un CAPTCHA refusé', async () => {
    expect((await sendMagicLink(deps, { email: 'awa@test.cm', captchaToken: 'x' })).outcome).toBe(
      'captcha_failed',
    );
  });
});

describe('EC-AUTH-05 : mot de passe oublié', () => {
  it('même réponse et même délai minimal pour un e-mail inconnu', async () => {
    const known = await requestPasswordReset(deps, {
      email: 'awa@test.cm',
      captchaToken: VALID_CAPTCHA,
    });
    const unknown = await requestPasswordReset(deps, {
      email: 'x@test.cm',
      captchaToken: VALID_CAPTCHA,
    });
    expect(known).toEqual({ outcome: 'ok' });
    expect(unknown).toEqual(known);
    expect(slept).toEqual([FORGOT_MIN_DURATION_MS, FORGOT_MIN_DURATION_MS]);
    expect(gateway.sentEmails[0]?.redirectTo).toBe(
      `${CALLBACK}?next=%2Fmot-de-passe-oublie%2Fnouveau`,
    );
  });

  it('n’attend pas plus quand Supabase a déjà pris le délai', async () => {
    const slow: AuthDeps = {
      ...deps,
      gateway: Object.assign(Object.create(gateway) as FakeAuthGateway, {
        resetPasswordForEmail: () => {
          clock.nowMs += 2000;
          return Promise.resolve(null);
        },
      }),
    };
    await requestPasswordReset(slow, { email: 'awa@test.cm', captchaToken: VALID_CAPTCHA });
    expect(slept).toEqual([]);
  });

  it('seul un CAPTCHA refusé change la réponse', async () => {
    expect(
      (await requestPasswordReset(deps, { email: 'awa@test.cm', captchaToken: 'x' })).outcome,
    ).toBe('captcha_failed');
  });
});

describe('EC-AUTH-06 : nouveau mot de passe', () => {
  it('ferme toutes les autres sessions après une réinitialisation réussie', async () => {
    gateway.session = 'awa@test.cm';
    expect(await setNewPassword(deps, { password: 'nouveau-secret' })).toEqual({ outcome: 'ok' });
    expect(gateway.calls).toContain('signOut:others');
    expect(gateway.otherSessions).toBe(0);
    expect(gateway.session).toBe('awa@test.cm');
  });

  it('refuse sans session de réinitialisation (lien déjà utilisé ou expiré)', async () => {
    expect(await setNewPassword(deps, { password: 'nouveau-secret' })).toEqual({
      outcome: 'link_expired',
    });
  });

  it('refuse un mot de passe faible', async () => {
    const weak: AuthDeps = {
      ...deps,
      gateway: Object.assign(Object.create(gateway) as FakeAuthGateway, {
        updatePassword: () => Promise.resolve({ code: 'weak_password', status: 422 }),
      }),
    };
    expect((await setNewPassword(weak, { password: 'abcdefgh' })).outcome).toBe('weak_password');
  });
});

describe('déconnexion', () => {
  it('ferme seulement la session de cet appareil', async () => {
    gateway.session = 'awa@test.cm';
    await signOut(deps);
    expect(gateway.calls).toEqual(['signOut:local']);
    expect(gateway.session).toBeNull();
  });
});

describe('outcomeOf', () => {
  it.each([
    ['user_already_exists', 'email_taken'],
    ['email_exists', 'email_taken'],
    ['over_request_rate_limit', 'rate_limited'],
    ['over_email_send_rate_limit', 'rate_limited'],
    ['otp_expired', 'link_expired'],
    ['flow_state_expired', 'link_expired'],
    ['bad_code_verifier', 'link_expired'],
    ['unexpected_failure', 'unavailable'],
  ])('%s → %s', (code, outcome) => {
    expect(outcomeOf({ code, status: 400 })).toBe(outcome);
  });

  it('un 429 sans code vaut « trop de demandes »', () => {
    expect(outcomeOf({ code: undefined, status: 429 })).toBe('rate_limited');
  });
});

// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from './forgot-password-form';
import { NewPasswordForm } from './new-password-form';
import { postAuth } from './post-auth';
import { SignInForm } from './sign-in-form';
import { SignUpForm } from './sign-up-form';

// Sans clé de site, le CAPTCHA n'est pas chargé (pas de réseau en test).
const NO_CAPTCHA = undefined;
let replies: Response[];
const fetchMock = vi.fn(() => Promise.resolve(replies.shift() ?? Response.json({ outcome: 'ok' })));
const assign = vi.fn();

beforeEach(() => {
  replies = [];
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { origin: 'http://app.localhost:5173', pathname: '/', search: '', assign },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockClear();
  assign.mockClear();
});

const type = (label: string, value: string): void => {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
};
/** Laisse les promesses en cours (faux fetch) se terminer, sans avancer les minuteries. */
const flush = async (): Promise<void> => {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
};
const bodyOf = (i: number): unknown =>
  JSON.parse((fetchMock.mock.calls[i] as unknown as [string, { body: string }])[1].body);

describe('connexion', () => {
  const props = {
    locale: 'fr' as const,
    captchaSiteKey: NO_CAPTCHA,
    next: '/campagnes',
    initialOutcome: null,
    idleNotice: false,
  };

  it('envoie e-mail et mot de passe puis revient à l’écran d’origine (EC-AUTH-01)', async () => {
    render(<SignInForm {...props} />);
    type('E-mail', 'awa@test.cm');
    type('Mot de passe', 'secret');
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/campagnes');
    });
    expect(bodyOf(0)).toEqual({ email: 'awa@test.cm', password: 'secret', captcha_token: '' });
  });

  it('affiche le blocage après 5 échecs', async () => {
    replies = [Response.json({ outcome: 'locked', retry_after_s: 900 }, { status: 429 })];
    render(<SignInForm {...props} />);
    type('E-mail', 'awa@test.cm');
    type('Mot de passe', 'faux');
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Trop d’essais. Réessaie dans 15 minutes ou réinitialise ton mot de passe. ',
    );
  });

  it('lien magique : message neutre', async () => {
    render(<SignInForm {...props} />);
    type('E-mail', 'awa@test.cm');
    fireEvent.click(
      screen.getByRole('button', { name: 'Recevoir un lien de connexion par e-mail' }),
    );
    expect(await screen.findByRole('status')).toHaveProperty(
      'textContent',
      'Si un compte existe avec cet e-mail, un lien de connexion vient d’y être envoyé.',
    );
  });

  it('lien expiré et déconnexion pour inactivité sont expliqués', () => {
    render(<SignInForm {...props} initialOutcome="link_expired" idleNotice />);
    expect(screen.getByRole('alert').textContent).toContain('Ce lien a expiré.');
    expect(screen.getByRole('link', { name: 'Recevoir un nouveau lien' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('10 minutes');
  });

  it('Google et Apple : liens vers le départ OAuth', () => {
    render(<SignInForm {...props} />);
    expect(screen.getByRole('link', { name: 'Continuer avec Google' }).getAttribute('href')).toBe(
      '/auth/oauth/google',
    );
    expect(screen.getByRole('link', { name: 'Continuer avec Apple' }).getAttribute('href')).toBe(
      '/auth/oauth/apple',
    );
  });
});

describe('inscription', () => {
  it('bouton désactivé tant que les conditions ne sont pas acceptées', () => {
    render(<SignUpForm locale="fr" captchaSiteKey={NO_CAPTCHA} />);
    const submit = screen.getByRole('button', { name: 'Créer mon compte' });
    expect(submit).toHaveProperty('disabled', true);
    expect(screen.getByText('Accepte les conditions pour continuer.')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(submit).toHaveProperty('disabled', false);
  });

  it('mot de passe trop court signalé', () => {
    render(<SignUpForm locale="fr" captchaSiteKey={NO_CAPTCHA} />);
    type('Mot de passe', 'court');
    expect(screen.getByText('8 caractères minimum.')).toBeTruthy();
  });

  it('e-mail déjà utilisé : lien « Se connecter »', async () => {
    replies = [Response.json({ outcome: 'email_taken' }, { status: 409 })];
    render(<SignUpForm locale="fr" captchaSiteKey={NO_CAPTCHA} />);
    type('E-mail', 'awa@test.cm');
    type('Mot de passe', 'motdepasse8');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Un compte existe déjà');
  });

  it('« Vérifie ta boîte mail » puis [Renvoyer le lien] actif après 60 s', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    render(<SignUpForm locale="en" captchaSiteKey={NO_CAPTCHA} />);
    type('Email', 'kofi@test.ci');
    type('Password', 'motdepasse8');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Create my account' }));
    await flush();
    expect(screen.getByText('Check your inbox')).toBeTruthy();
    expect(bodyOf(0)).toMatchObject({ accept_terms: true, locale: 'en' });
    const resend = screen.getByRole('button', { name: 'Resend the link in 60 s' });
    expect(resend).toHaveProperty('disabled', true);
    for (let i = 0; i < 60; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }
    const ready = screen.getByRole('button', { name: 'Resend the link' });
    expect(ready).toHaveProperty('disabled', false);
    fireEvent.click(ready);
    await flush();
    expect(screen.getByText('Link sent again.')).toBeTruthy();
  });
});

describe('mot de passe oublié et nouveau mot de passe', () => {
  it('message neutre après envoi (EC-AUTH-05)', async () => {
    render(<ForgotPasswordForm locale="fr" captchaSiteKey={NO_CAPTCHA} />);
    type('E-mail', 'inconnu@test.cm');
    fireEvent.click(screen.getByRole('button', { name: 'Recevoir le lien' }));
    expect((await screen.findByRole('status')).textContent).toContain('Si un compte existe');
  });

  it('nouveau mot de passe : connexion automatique vers le tableau de bord', async () => {
    render(<NewPasswordForm locale="fr" />);
    type('Mot de passe', 'nouveau-secret');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et me connecter' }));
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('http://app.localhost:5173/');
    });
  });

  it('nouveau mot de passe refusé : lien expiré', async () => {
    replies = [Response.json({ outcome: 'link_expired' }, { status: 410 })];
    render(<NewPasswordForm locale="fr" />);
    type('Mot de passe', 'nouveau-secret');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et me connecter' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Ce lien a expiré.');
  });
});

describe('postAuth', () => {
  it('réponse illisible ou réseau coupé : « indisponible » ; 429 sans corps : « trop de demandes »', async () => {
    replies = [new Response('oups', { status: 500 }), new Response('{}', { status: 429 })];
    expect(await postAuth('/auth/x', {})).toBe('unavailable');
    expect(await postAuth('/auth/x', {})).toBe('rate_limited');
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error('hors ligne')));
    expect(await postAuth('/auth/x', {})).toBe('unavailable');
  });
});

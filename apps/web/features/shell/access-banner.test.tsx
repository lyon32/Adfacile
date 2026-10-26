// @vitest-environment happy-dom
// S19 / TR-PAY-07 (décision du 26/10/2026) : bandeaux de grâce (compte à rebours, promesse de pause), de lecture seule et de suspension
// décidées par l'administration, et écran VERROUILLÉ (essai terminé, abonnement terminé), en FR et en EN.
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { messagesFor, type Locale } from '@pubeka/i18n';
import { AccessBanner, formatDeadline, noticeOf } from './access-banner';
import { LockedScreen } from './locked-screen';
import { SessionProvider, type SessionValue } from './session-context';

function renderWith(
  node: React.ReactNode,
  workspace: NonNullable<SessionValue['workspace']> | null,
  locale: Locale = 'fr',
  timezone = 'Africa/Douala',
) {
  const value: SessionValue = {
    userId: 'u1',
    email: 'awa@exemple.test',
    firstName: 'Awa',
    lastName: null,
    locale,
    theme: 'light',
    timezone,
    serverNow: '2026-11-11T09:00:00.000Z',
    workspace,
  };
  return render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
      <SessionProvider value={value}>{node}</SessionProvider>
    </NextIntlClientProvider>,
  );
}
const renderBanner = (
  workspace: NonNullable<SessionValue['workspace']> | null,
  locale: Locale = 'fr',
  timezone?: string,
) => renderWith(<AccessBanner />, workspace, locale, timezone);
const renderLocked = (
  workspace: NonNullable<SessionValue['workspace']> | null,
  locale: Locale = 'fr',
) => renderWith(<LockedScreen />, workspace, locale);

const ws = (over: Partial<NonNullable<SessionValue['workspace']>>) => ({
  id: 'w1',
  name: 'Awa',
  role: 'owner' as const,
  plan: 'pro' as const,
  status: 'active' as const,
  ...over,
});

afterEach(cleanup);

/** Bouton d'une page à venir : focalisable (pas `disabled`), `aria-disabled`, et le texte « bientôt disponible » est AFFICHÉ et relié. */
function expectSoon(button: HTMLElement, label: string) {
  expect(button.hasAttribute('disabled')).toBe(false);
  expect(button.getAttribute('aria-disabled')).toBe('true');
  const note = document.getElementById(button.getAttribute('aria-describedby') ?? '');
  expect(note?.textContent).toBe(label);
  button.focus();
  expect(document.activeElement).toBe(button);
}

describe('AccessBanner', () => {
  it('TR-PAY-07 : espace actif, verrouillé ou absent : aucun bandeau (le verrouillé a son écran)', () => {
    expect(renderBanner(ws({})).container.textContent).toBe('');
    cleanup();
    expect(renderBanner(ws({ status: 'locked' })).container.textContent).toBe('');
    cleanup();
    expect(renderBanner(null).container.textContent).toBe('');
  });

  it('TR-PAY-07 : grâce : date limite, compte à rebours en jours, promesse de pause, bouton Payer grisé avec infobulle', () => {
    renderBanner(ws({ status: 'grace', graceUntil: '2026-11-13T09:00:00.000Z' }));
    expect(screen.getByRole('heading').textContent).toBe('Renouvelle avant le 13 novembre');
    const text = document.body.textContent;
    expect(text).toContain('Il te reste 2 jours.');
    expect(text).toContain(
      'Passé le 13 novembre, tu n’auras plus accès à rien et toutes tes publicités seront mises en pause automatiquement.',
    );
    expect(text).toContain('acheter des crédits et les mettre en pause');
    expect(text).toContain('Reprendre mes pubs');
    const pay = screen.getByRole('button', { name: 'Payer' });
    expectSoon(pay, 'Bientôt disponible');
  });

  it('TR-PAY-07 : grâce, dernier jour : « 1 jour », au singulier', () => {
    renderBanner(ws({ status: 'grace', graceUntil: '2026-11-11T20:00:00.000Z' }));
    expect(document.body.textContent).toContain('Il te reste 1 jour.');
  });

  it('TR-PAY-07 : grâce en anglais : aucun texte français, même promesse', () => {
    renderBanner(ws({ status: 'grace', graceUntil: '2026-11-13T09:00:00.000Z' }), 'en');
    expect(screen.getByRole('heading').textContent).toBe('Renew before November 13');
    expect(document.body.textContent).toContain('2 days left.');
    expect(document.body.textContent).toContain(
      'After November 13, you will lose access to everything and all your ads will be paused automatically.',
    );
    expectSoon(screen.getByRole('button', { name: 'Pay' }), 'Coming soon');
  });

  it('TR-PAY-07 : lecture seule décidée par l’administration : message dédié, bouton « support » grisé, même pour un éditeur', () => {
    renderBanner(ws({ status: 'read_only', statusCause: 'admin', role: 'editor' }));
    expect(screen.getByRole('heading').textContent).toBe('Ton espace est en lecture seule');
    expect(document.body.textContent).toContain(
      'L’équipe Pubeka a mis cet espace en lecture seule',
    );
    const support = screen.getByRole('button', { name: 'Écrire au support' });
    expectSoon(support, 'Bientôt disponible');
  });

  it('TR-PAY-07 : suspension : message dédié, support grisé', () => {
    renderBanner(ws({ status: 'suspended' }));
    expect(screen.getByRole('heading').textContent).toBe('Ton espace est suspendu');
    expect(screen.getByRole('button', { name: 'Écrire au support' })).toBeTruthy();
  });

  it('TR-PAY-07 : un éditeur lit le bandeau de grâce sans bouton de paiement, avec « Demande au propriétaire »', () => {
    renderBanner(ws({ status: 'grace', role: 'editor', graceUntil: '2026-11-13T09:00:00.000Z' }));
    expect(screen.getByRole('heading')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body.textContent).toContain(
      'Demande au propriétaire de renouveler l’abonnement.',
    );
  });

  it('TR-PAY-07 : anglais : lecture seule de l’administration traduite', () => {
    renderBanner(ws({ status: 'read_only', statusCause: 'admin' }), 'en');
    expect(screen.getByRole('heading').textContent).toBe('Your workspace is read-only');
  });

  it('TR-PAY-07 : noticeOf : chaque état', () => {
    expect(noticeOf('active')).toBeNull();
    expect(noticeOf('locked')).toBeNull();
    expect(noticeOf('grace')).toBe('grace');
    expect(noticeOf('suspended')).toBe('suspended');
    expect(noticeOf('read_only')).toBe('admin_read_only');
    expect(noticeOf('inconnu')).toBeNull();
  });

  it('TR-PAY-07 : un fuseau invalide ne fait pas planter l’écran : repli sur UTC ; une date invalide donne un texte vide', () => {
    expect(formatDeadline('2026-11-13T23:30:00.000Z', 'fr', 'Pas/UnFuseau')).toBe('13 novembre');
    expect(formatDeadline('2026-11-13T23:30:00.000Z', 'fr', undefined)).toBe('13 novembre');
    expect(formatDeadline('2026-11-13T23:30:00.000Z', 'fr', 'Africa/Douala')).toBe('14 novembre');
    expect(formatDeadline('pas une date', 'fr', 'UTC')).toBe('');
  });

  it('TR-PAY-07 : le bandeau s’affiche même avec un fuseau invalide dans la session', () => {
    renderBanner(
      ws({ status: 'grace', graceUntil: '2026-11-13T09:00:00.000Z' }),
      'fr',
      'Pas/UnFuseau',
    );
    expect(screen.getByRole('heading').textContent).toBe('Renouvelle avant le 13 novembre');
  });
});

describe('LockedScreen : un seul écran, la cause exacte, le bouton grisé', () => {
  it('TR-PAY-07 : essai terminé : « Choisis une formule »', () => {
    renderLocked(ws({ status: 'locked', statusCause: 'trial_ended' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ton essai est terminé');
    const cta = screen.getByRole('button', { name: 'Choisir une formule' });
    expectSoon(cta, 'Bientôt disponible');
    expect(document.body.textContent).toContain('ne sont plus gérées depuis Pubeka');
    expect(document.body.textContent).toContain('Gestionnaire de publicités de Meta');
    expect(document.body.textContent).toContain('Reprendre mes pubs');
    expect(document.body.textContent).not.toContain('continuent chez Meta');
  });

  it('TR-PAY-07 : abonnement terminé (grâce écoulée), ou cause absente : « Renouveler », jamais « essai »', () => {
    renderLocked(ws({ status: 'locked', statusCause: 'subscription_ended' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Ton abonnement est terminé',
    );
    expect(screen.getByRole('button', { name: 'Renouveler' })).toBeTruthy();
    cleanup();
    renderLocked(ws({ status: 'locked' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Ton abonnement est terminé',
    );
  });

  it('TR-PAY-07 : un membre qui n’est pas propriétaire lit le message sans bouton', () => {
    renderLocked(ws({ status: 'locked', statusCause: 'trial_ended', role: 'editor' }));
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.body.textContent).toContain(
      'Demande au propriétaire de l’espace de renouveler',
    );
  });

  it('TR-PAY-07 : anglais', () => {
    renderLocked(ws({ status: 'locked', statusCause: 'trial_ended' }), 'en');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your trial has ended');
    expect(screen.getByRole('button', { name: 'Choose a plan' })).toBeTruthy();
  });
});

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

describe('AccessBanner', () => {
  it('espace actif, verrouillé ou absent : aucun bandeau (le verrouillé a son écran)', () => {
    expect(renderBanner(ws({})).container.textContent).toBe('');
    cleanup();
    expect(renderBanner(ws({ status: 'locked' })).container.textContent).toBe('');
    cleanup();
    expect(renderBanner(null).container.textContent).toBe('');
  });

  it('grâce : date limite, compte à rebours en jours, promesse de pause, bouton Payer grisé avec infobulle', () => {
    renderBanner(ws({ status: 'grace', graceUntil: '2026-11-13T09:00:00.000Z' }));
    expect(screen.getByRole('heading').textContent).toBe('Renouvelle avant le 13 novembre');
    const text = document.body.textContent;
    expect(text).toContain('Il te reste 2 jours.');
    expect(text).toContain(
      'Passé le 13 novembre, tu n’auras plus accès à rien et toutes tes publicités seront mises en pause.',
    );
    expect(text).toContain('acheter des crédits et les mettre en pause');
    const pay = screen.getByRole('button', { name: 'Payer' });
    expect((pay as HTMLButtonElement).disabled).toBe(true);
    expect(pay.getAttribute('title')).toBe('Bientôt disponible');
  });

  it('grâce, dernier jour : « 1 jour », au singulier', () => {
    renderBanner(ws({ status: 'grace', graceUntil: '2026-11-11T20:00:00.000Z' }));
    expect(document.body.textContent).toContain('Il te reste 1 jour.');
  });

  it('grâce en anglais : aucun texte français, même promesse', () => {
    renderBanner(ws({ status: 'grace', graceUntil: '2026-11-13T09:00:00.000Z' }), 'en');
    expect(screen.getByRole('heading').textContent).toBe('Renew before November 13');
    expect(document.body.textContent).toContain('2 days left.');
    expect(document.body.textContent).toContain(
      'After November 13, you will lose access to everything and all your ads will be paused.',
    );
    expect(screen.getByRole('button', { name: 'Pay' }).disabled).toBe(true);
  });

  it('lecture seule décidée par l’administration : message dédié, bouton « support » grisé, même pour un éditeur', () => {
    renderBanner(ws({ status: 'read_only', statusCause: 'admin', role: 'editor' }));
    expect(screen.getByRole('heading').textContent).toBe('Ton espace est en lecture seule');
    expect(document.body.textContent).toContain(
      'L’équipe Pubeka a mis cet espace en lecture seule',
    );
    const support = screen.getByRole('button', { name: 'Écrire au support' });
    expect((support as HTMLButtonElement).disabled).toBe(true);
    expect(support.getAttribute('title')).toBe('Bientôt disponible');
  });

  it('suspension : message dédié, support grisé', () => {
    renderBanner(ws({ status: 'suspended' }));
    expect(screen.getByRole('heading').textContent).toBe('Ton espace est suspendu');
    expect(screen.getByRole('button', { name: 'Écrire au support' })).toBeTruthy();
  });

  it('un éditeur lit le bandeau de grâce sans bouton de paiement', () => {
    renderBanner(ws({ status: 'grace', role: 'editor', graceUntil: '2026-11-13T09:00:00.000Z' }));
    expect(screen.getByRole('heading')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('anglais : lecture seule de l’administration traduite', () => {
    renderBanner(ws({ status: 'read_only', statusCause: 'admin' }), 'en');
    expect(screen.getByRole('heading').textContent).toBe('Your workspace is read-only');
  });

  it('noticeOf : chaque état', () => {
    expect(noticeOf('active')).toBeNull();
    expect(noticeOf('locked')).toBeNull();
    expect(noticeOf('grace')).toBe('grace');
    expect(noticeOf('suspended')).toBe('suspended');
    expect(noticeOf('read_only')).toBe('admin_read_only');
    expect(noticeOf('inconnu')).toBeNull();
  });

  it('un fuseau invalide ne fait pas planter l’écran : repli sur UTC ; une date invalide donne un texte vide', () => {
    expect(formatDeadline('2026-11-13T23:30:00.000Z', 'fr', 'Pas/UnFuseau')).toBe('13 novembre');
    expect(formatDeadline('2026-11-13T23:30:00.000Z', 'fr', undefined)).toBe('13 novembre');
    expect(formatDeadline('2026-11-13T23:30:00.000Z', 'fr', 'Africa/Douala')).toBe('14 novembre');
    expect(formatDeadline('pas une date', 'fr', 'UTC')).toBe('');
  });

  it('le bandeau s’affiche même avec un fuseau invalide dans la session', () => {
    renderBanner(
      ws({ status: 'grace', graceUntil: '2026-11-13T09:00:00.000Z' }),
      'fr',
      'Pas/UnFuseau',
    );
    expect(screen.getByRole('heading').textContent).toBe('Renouvelle avant le 13 novembre');
  });
});

describe('LockedScreen : un seul écran, la cause exacte, le bouton grisé', () => {
  it('essai terminé : « Choisis une formule »', () => {
    renderLocked(ws({ status: 'locked', statusCause: 'trial_ended' }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Ton essai est terminé');
    const cta = screen.getByRole('button', { name: 'Choisir une formule' });
    expect((cta as HTMLButtonElement).disabled).toBe(true);
    expect(cta.getAttribute('title')).toBe('Bientôt disponible');
    expect(document.body.textContent).toContain('continuent chez Meta');
  });

  it('abonnement terminé (grâce écoulée), ou cause absente : « Renouveler », jamais « essai »', () => {
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

  it('un membre qui n’est pas propriétaire lit le message sans bouton', () => {
    renderLocked(ws({ status: 'locked', statusCause: 'trial_ended', role: 'editor' }));
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('anglais', () => {
    renderLocked(ws({ status: 'locked', statusCause: 'trial_ended' }), 'en');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your trial has ended');
    expect(screen.getByRole('button', { name: 'Choose a plan' })).toBeTruthy();
  });
});

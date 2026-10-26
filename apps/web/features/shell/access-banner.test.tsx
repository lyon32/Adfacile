// @vitest-environment happy-dom
// S19 / TR-PAY-07 : bandeaux de grâce, de lecture seule (abonnement ou essai terminé) et de suspension, en FR et en EN.
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { messagesFor, type Locale } from '@pubeka/i18n';
import { AccessBanner, formatDeadline, noticeOf } from './access-banner';
import { SessionProvider, type SessionValue } from './session-context';

function renderBanner(
  workspace: NonNullable<SessionValue['workspace']> | null,
  locale: Locale = 'fr',
) {
  const value: SessionValue = {
    userId: 'u1',
    email: 'awa@exemple.test',
    firstName: 'Awa',
    lastName: null,
    locale,
    theme: 'light',
    timezone: 'Africa/Douala',
    serverNow: '2026-11-11T09:00:00.000Z',
    workspace,
  };
  return render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
      <SessionProvider value={value}>
        <AccessBanner />
      </SessionProvider>
    </NextIntlClientProvider>,
  );
}

const ws = (over: Partial<NonNullable<SessionValue['workspace']>>) => ({
  id: 'w1',
  name: 'Awa',
  role: 'owner' as const,
  plan: 'pro' as const,
  status: 'active' as const,
  ...over,
});

afterEach(cleanup);

describe('AccessBanner : un message par cause (le serveur la fournit)', () => {
  it('lecture seule sans abonnement ou sans cause : « Ton abonnement est terminé », jamais « Ton essai est terminé »', () => {
    renderBanner(ws({ status: 'read_only', plan: 'trial', statusCause: 'subscription_ended' }));
    expect(screen.getByRole('heading').textContent).toBe('Ton abonnement est terminé');
    cleanup();
    renderBanner(ws({ status: 'read_only', plan: 'trial' }));
    expect(screen.getByRole('heading').textContent).toBe('Ton abonnement est terminé');
  });

  it('lecture seule décidée par l’administration : message dédié et bouton vers le support, même pour un éditeur', () => {
    renderBanner(ws({ status: 'read_only', plan: 'trial', statusCause: 'admin', role: 'editor' }));
    expect(screen.getByRole('heading').textContent).toBe('Ton espace est en lecture seule');
    expect(document.body.textContent).toContain(
      'L’équipe Pubeka a mis cet espace en lecture seule',
    );
    expect(screen.getByRole('link', { name: 'Écrire au support' }).getAttribute('href')).toBe(
      '/support',
    );
  });

  it('anglais : cause « admin » traduite', () => {
    renderBanner(ws({ status: 'read_only', statusCause: 'admin' }), 'en');
    expect(screen.getByRole('heading').textContent).toBe('Your workspace is read-only');
  });

  it('noticeOf : chaque statut et chaque cause', () => {
    expect(noticeOf('active', null)).toBeNull();
    expect(noticeOf('grace', 'grace')).toBe('grace');
    expect(noticeOf('suspended', 'admin')).toBe('suspended');
    expect(noticeOf('read_only', 'trial_ended')).toBe('trial_ended');
    expect(noticeOf('read_only', 'subscription_ended')).toBe('read_only');
    expect(noticeOf('read_only', 'admin')).toBe('admin_read_only');
    expect(noticeOf('read_only', undefined)).toBe('read_only');
    expect(noticeOf('inconnu', null)).toBeNull();
  });

  it('un fuseau invalide ne fait pas planter l’écran : repli sur UTC ; une date invalide donne un texte vide', () => {
    expect(formatDeadline('2026-11-13T23:30:00.000Z', 'fr', 'Pas/UnFuseau')).toBe('13 novembre');
    expect(formatDeadline('2026-11-13T23:30:00.000Z', 'fr', undefined)).toBe('13 novembre');
    expect(formatDeadline('2026-11-13T23:30:00.000Z', 'fr', 'Africa/Douala')).toBe('14 novembre');
    expect(formatDeadline('pas une date', 'fr', 'UTC')).toBe('');
  });

  it('le bandeau s’affiche même avec un fuseau invalide dans la session', () => {
    const value: SessionValue = {
      userId: 'u1',
      email: 'a@b.test',
      firstName: null,
      lastName: null,
      locale: 'fr',
      theme: 'light',
      timezone: 'Pas/UnFuseau',
      serverNow: '2026-11-11T09:00:00.000Z',
      workspace: ws({ status: 'grace', graceUntil: '2026-11-13T09:00:00.000Z' }),
    };
    render(
      <NextIntlClientProvider locale="fr" messages={messagesFor('fr')}>
        <SessionProvider value={value}>
          <AccessBanner />
        </SessionProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('heading').textContent).toBe('Renouvelle avant le 13 novembre');
  });
});

describe('AccessBanner', () => {
  it('espace actif ou absent : rien ne s’affiche', () => {
    expect(renderBanner(ws({})).container.textContent).toBe('');
    cleanup();
    expect(renderBanner(null).container.textContent).toBe('');
  });

  it('grâce : date limite, jours restants et bouton Payer', () => {
    renderBanner(ws({ status: 'grace', graceUntil: '2026-11-13T09:00:00.000Z' }));
    expect(screen.getByRole('heading').textContent).toBe('Renouvelle avant le 13 novembre');
    expect(document.body.textContent).toContain('Il te reste 2 jours.');
    expect(screen.getByRole('link', { name: 'Payer' }).getAttribute('href')).toBe('/abonnement');
  });

  it('grâce, dernier jour : « 1 jour », au singulier', () => {
    renderBanner(ws({ status: 'grace', graceUntil: '2026-11-11T20:00:00.000Z' }));
    expect(document.body.textContent).toContain('Il te reste 1 jour.');
  });

  it('lecture seule : dit que les campagnes continuent chez Meta et que la pause reste possible', () => {
    renderBanner(ws({ status: 'read_only' }));
    expect(screen.getByRole('heading').textContent).toBe('Ton abonnement est terminé');
    expect(document.body.textContent).toContain('Tu peux toujours les mettre en pause.');
    expect(screen.getByRole('link', { name: 'Renouveler' }).getAttribute('href')).toBe(
      '/abonnement',
    );
  });

  it('essai terminé (cause « trial_ended ») : « Choisis une formule »', () => {
    renderBanner(ws({ status: 'read_only', plan: 'trial', statusCause: 'trial_ended' }));
    expect(screen.getByRole('heading').textContent).toBe('Ton essai est terminé');
    expect(screen.getByRole('link', { name: 'Choisir une formule' })).toBeTruthy();
  });

  it('suspension : renvoie vers le support, pas vers le paiement (décision 4)', () => {
    renderBanner(ws({ status: 'suspended' }));
    expect(screen.getByRole('heading').textContent).toBe('Ton espace est suspendu');
    expect(screen.getByRole('link', { name: 'Écrire au support' }).getAttribute('href')).toBe(
      '/support',
    );
  });

  it('un éditeur lit le message sans bouton de paiement', () => {
    renderBanner(ws({ status: 'read_only', role: 'editor' }));
    expect(screen.getByRole('heading')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('en anglais : aucun texte français', () => {
    renderBanner(ws({ status: 'grace', graceUntil: '2026-11-13T09:00:00.000Z' }), 'en');
    expect(screen.getByRole('heading').textContent).toBe('Renew before November 13');
    expect(document.body.textContent).toContain('2 days left.');
    expect(screen.getByRole('link', { name: 'Pay' })).toBeTruthy();
    cleanup();
    renderBanner(ws({ status: 'read_only' }), 'en');
    expect(screen.getByRole('heading').textContent).toBe('Your subscription has ended');
  });
});

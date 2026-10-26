// @vitest-environment happy-dom
// S19 / TR-PAY-07 : bandeaux de grâce, de lecture seule (abonnement ou essai terminé) et de suspension, en FR et en EN.
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import { messagesFor, type Locale } from '@pubeka/i18n';
import { AccessBanner } from './access-banner';
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

  it('essai terminé (formule « trial » en lecture seule) : « Choisis une formule »', () => {
    renderBanner(ws({ status: 'read_only', plan: 'trial' }));
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

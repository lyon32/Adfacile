// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messagesFor, type Locale } from '@pubeka/i18n';
import type { CountryOption } from '../shell/countries';
import { OnboardingFlow } from './onboarding-flow';
import { STEPS, isSkippable, nextPath, parseStep, stepNumber } from './steps';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const COUNTRIES: CountryOption[] = [
  { code: 'CM', name: 'Cameroun', currency: 'XAF' },
  { code: 'SN', name: 'Sénégal', currency: 'XOF' },
];

function renderStep(step: (typeof STEPS)[number], locale: Locale = 'fr') {
  return render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
      <QueryClientProvider client={new QueryClient()}>
        <OnboardingFlow
          step={step}
          countries={COUNTRIES}
          profile={{ countryCode: null, city: null, currency: 'XAF', locale }}
        />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  router.push.mockClear();
  router.refresh.mockClear();
});

describe('étapes (APPFLOW §5)', () => {
  it('cinq étapes dans l’ordre, les deux dernières se passent', () => {
    expect(STEPS).toEqual(['pays', 'langue', 'essai', 'meta', 'marque']);
    expect(STEPS.filter(isSkippable)).toEqual(['meta', 'marque']);
    expect(stepNumber('essai')).toBe(3);
    expect(parseStep('langue')).toBe('langue');
    expect(parseStep('inconnue')).toBeNull();
  });

  it('chaque étape mène à la suivante, la dernière au tableau de bord', () => {
    expect(nextPath('pays')).toBe('/bienvenue/langue');
    expect(nextPath('meta')).toBe('/bienvenue/marque');
    expect(nextPath('marque')).toBe('/');
  });
});

describe('écran de la première configuration', () => {
  it('affiche « Étape X sur 5 » et une barre de progression accessible', () => {
    renderStep('essai');
    expect(screen.getByText('Étape 3 sur 5')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('3');
  });

  it('[Plus tard] seulement aux étapes 4 et 5', () => {
    renderStep('essai');
    expect(screen.queryByRole('button', { name: 'Plus tard' })).toBeNull();
    cleanup();
    renderStep('meta');
    fireEvent.click(screen.getByRole('button', { name: 'Plus tard' }));
    expect(router.push).toHaveBeenCalledWith('/bienvenue/marque');
  });

  it('étape pays : refuse de continuer sans pays, puis enregistre pays, ville et monnaie', async () => {
    let sent: { method?: string | undefined; body: string } | null = null;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      sent = { method: init?.method, body: typeof init?.body === 'string' ? init.body : '' };
      return Promise.resolve(Response.json({ ui_language: 'fr', theme: 'light' }));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderStep('pays');
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(screen.getByText('Choisis ton pays pour continuer.')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Pays'), { target: { value: 'SN' } });
    fireEvent.change(screen.getByLabelText('Ville'), { target: { value: ' Dakar ' } });
    // La monnaie du pays est proposée d'office.
    expect(screen.getByLabelText<HTMLSelectElement>('Monnaie d’affichage').value).toBe('XOF');
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith('/bienvenue/langue');
    });
    expect(sent).toMatchObject({ method: 'PATCH' });
    expect(JSON.parse((sent as { body: string } | null)?.body ?? '{}')).toEqual({
      country_code: 'SN',
      city: 'Dakar',
      currency_display: 'XOF',
    });
  });

  it('une erreur d’enregistrement est annoncée et on reste sur l’étape', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('x', { status: 503 })));
    renderStep('langue');
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    await screen.findByRole('alert');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('TR-PLT-03 : en anglais, aucun texte français', () => {
    renderStep('pays', 'en');
    expect(screen.getByText('Step 1 of 5')).toBeTruthy();
    expect(document.body.textContent).not.toContain('Étape');
    expect(document.body.textContent).not.toContain('Continuer');
  });
});

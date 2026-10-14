// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messagesFor, type Locale } from '@pubeka/i18n';
import { AppShell } from './app-shell';
import { resolveTheme } from './document-sync';
import { ACCOUNT_ITEMS, MENU_ITEMS, TAB_ITEMS, isActive } from './nav-config';
import { SessionProvider, displayName, initialsOf, type SessionValue } from './session-context';

const navigation = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ refresh: vi.fn() }),
}));

function session(over: Partial<SessionValue> = {}): SessionValue {
  return {
    userId: 'u1',
    email: 'awa@exemple.test',
    firstName: 'Awa',
    lastName: 'Ndiaye',
    locale: 'fr',
    theme: 'light',
    workspace: { id: 'w1', name: 'Awa', role: 'owner', plan: 'starter', status: 'active' },
    ...over,
  };
}

function renderShell(locale: Locale, value: SessionValue = session({ locale })) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
      <QueryClientProvider client={new QueryClient()}>
        <SessionProvider value={value}>
          <AppShell idle={null} banner={<p>bandeau</p>}>
            <h1>contenu</h1>
          </AppShell>
        </SessionProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  navigation.pathname = '/';
});

describe('navigation (APPFLOW §2)', () => {
  it('les adresses actives : accueil exact, sections et sous-pages, réglages groupés', () => {
    expect(isActive('/', '/')).toBe(true);
    expect(isActive('/campagnes/nouvelle', '/')).toBe(false);
    expect(isActive('/campagnes/nouvelle', '/campagnes')).toBe(true);
    expect(isActive('/campagnesx', '/campagnes')).toBe(false);
    expect(isActive('/reglages/equipe', '/reglages/profil')).toBe(true);
  });

  it('le téléphone a trois onglets de menu, plus Compte', () => {
    expect(TAB_ITEMS.map((i) => i.href)).toEqual(['/', '/campagnes', '/visuels']);
    expect(MENU_ITEMS).toHaveLength(4);
    expect(ACCOUNT_ITEMS.map((i) => i.href)).toContain('/reglages/profil');
  });

  it('la page courante est marquée aria-current dans la barre latérale', () => {
    navigation.pathname = '/campagnes';
    renderShell('fr');
    const side = screen.getByRole('navigation', { name: 'Navigation principale' });
    const current = within(side).getByRole('link', { current: 'page' });
    expect(current.textContent).toBe('Campagnes');
  });

  it('carte « Passer à Pro » : Starter seulement', () => {
    renderShell('fr');
    expect(screen.getByText('Passer à Pro')).toBeTruthy();
    cleanup();
    const pro = session({
      workspace: { id: 'w', name: 'x', role: 'owner', plan: 'pro', status: 'active' },
    });
    renderShell('fr', pro);
    expect(screen.queryByText('Passer à Pro')).toBeNull();
  });
});

describe('TR-PLT-03 : bascule de langue sans texte en dur', () => {
  const visible = (): string => document.body.textContent;

  it('en français : libellés français', () => {
    renderShell('fr');
    expect(visible()).toContain('Campagnes');
    expect(visible()).toContain('Aucune Page connectée');
    expect(visible()).not.toContain('Campaigns');
  });

  it('en anglais : aucun libellé français ne reste', () => {
    renderShell('en');
    expect(visible()).toContain('Campaigns');
    expect(visible()).toContain('No Page connected');
    const french = ['Campagnes', 'Accueil', 'Réglages', 'Aucune Page', 'Passer à Pro', 'Aller au'];
    for (const word of french) expect(visible()).not.toContain(word);
  });
});

describe('session', () => {
  it('nom affiché et initiales, avec ou sans nom', () => {
    expect(displayName(session())).toBe('Awa Ndiaye');
    expect(initialsOf(session())).toBe('AN');
    const anon = session({ firstName: null, lastName: null });
    expect(displayName(anon)).toBe('awa');
    expect(initialsOf(anon)).toBe('AW');
  });

  it('« système » suit l’appareil, les autres thèmes sont fixes', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FULL_LOADER_MS, FULL_LOADER_SESSION_KEY } from '@pubeka/ui';
import { messagesFor } from '@pubeka/i18n';
import { Opening } from './opening';

function mount() {
  return render(
    <StrictMode>
      <NextIntlClientProvider locale="fr" messages={messagesFor('fr')}>
        <Opening />
      </NextIntlClientProvider>
    </StrictMode>,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  window.sessionStorage.removeItem(FULL_LOADER_SESSION_KEY);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('animation d’ouverture (APPFLOW §2.3, TR-PRF-04)', () => {
  it('se joue à la première ouverture, même quand React exécute les effets deux fois, puis disparaît', () => {
    mount();
    expect(screen.getByRole('status', { name: 'Ouverture de Pubeka' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(FULL_LOADER_MS);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('ne se rejoue pas dans la même session', () => {
    mount();
    act(() => {
      vi.advanceTimersByTime(FULL_LOADER_MS);
    });
    cleanup();
    mount();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('avec « réduire les animations », elle disparaît plus vite', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    mount();
    expect(screen.getByRole('status')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});

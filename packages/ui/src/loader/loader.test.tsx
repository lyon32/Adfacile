import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  claimFullLoader,
  FULL_LOADER_MS,
  FULL_LOADER_REDUCED_MS,
  FULL_LOADER_SESSION_KEY,
  fullLoaderDuration,
  resetLoaderMemory,
} from './loader-policy';
import { OpeningLoader, PendingLoader } from './pubeka-loader';

function memoryStore(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

function stubMatchMedia(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  resetLoaderMemory();
  stubMatchMedia(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TR-PRF-04 — loader complet une fois par session', () => {
  it('ne joue le loader complet que la première fois', () => {
    const store = memoryStore();
    expect(claimFullLoader(store)).toBe(true);
    expect(store.getItem(FULL_LOADER_SESSION_KEY)).toBe('1');
    expect(claimFullLoader(store)).toBe(false);
  });

  it('retient en mémoire sans stockage utilisable', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => undefined,
    };
    expect(claimFullLoader(broken)).toBe(true);
    expect(claimFullLoader(null)).toBe(false);
  });

  it('affiche le loader 3 s, puis appelle onDone ; rien au second montage', () => {
    const store = memoryStore();
    const onDone = vi.fn();
    const first = render(<OpeningLoader label="Chargement" store={store} onDone={onDone} />);
    expect(screen.getByRole('status', { name: 'Chargement' })).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(FULL_LOADER_MS);
    });
    expect(screen.queryByRole('status')).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<OpeningLoader label="Chargement" store={store} onDone={onDone} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});

describe('TR-PRF-09 — réduire les animations', () => {
  it('raccourcit le loader complet', () => {
    expect(fullLoaderDuration(false)).toBe(FULL_LOADER_MS);
    expect(fullLoaderDuration(true)).toBe(FULL_LOADER_REDUCED_MS);
    stubMatchMedia(true);
    render(<OpeningLoader label="Chargement" store={memoryStore()} />);
    act(() => {
      vi.advanceTimersByTime(FULL_LOADER_REDUCED_MS);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('TR-PRF-04 — version courte après 300 ms', () => {
  it('reste cachée sous 300 ms', () => {
    const view = render(<PendingLoader pending label="Chargement" />);
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(screen.queryByRole('status')).toBeNull();
    view.rerender(<PendingLoader pending={false} label="Chargement" />);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('apparaît au-delà de 300 ms et disparaît à la fin', () => {
    const view = render(<PendingLoader pending label="Chargement" />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByRole('status', { name: 'Chargement' })).toBeTruthy();
    view.rerender(<PendingLoader pending={false} label="Chargement" />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

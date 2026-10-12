// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_LIMIT_MS, idlePhase, idleSignInPath } from './idle';
import { IdleLogout } from './idle-logout';
import { LAST_ACTIVITY_STORAGE_KEY } from './use-idle-logout';

describe('idlePhase', () => {
  it('actif avant 9 minutes, avertissement de 9 à 10 minutes, déconnexion à 10', () => {
    expect(idlePhase(8 * 60_000 + 59_999)).toEqual({ kind: 'active' });
    expect(idlePhase(9 * 60_000)).toEqual({ kind: 'warning', secondsLeft: 60 });
    expect(idlePhase(9 * 60_000 + 30_500)).toEqual({ kind: 'warning', secondsLeft: 30 });
    expect(idlePhase(IDLE_LIMIT_MS)).toEqual({ kind: 'expired' });
  });

  it('adresse de reconnexion : motif et retour à l’écran d’origine', () => {
    expect(idleSignInPath('/')).toBe('/connexion?raison=inactivite');
    expect(idleSignInPath('/campagnes/nouvelle?etape=visuel')).toBe(
      '/connexion?raison=inactivite&retour=%2Fcampagnes%2Fnouvelle%3Fetape%3Dvisuel',
    );
  });
});

describe('TR-SEC-13 : déconnexion après 10 minutes d’inactivité', () => {
  const fetchMock = vi.fn(() => Promise.resolve(Response.json({ outcome: 'ok' })));
  const assign = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ now: Date.UTC(2026, 9, 12, 10) });
    vi.stubGlobal('fetch', fetchMock);
    window.localStorage.clear();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'http://app.localhost:5173', pathname: '/campagnes', search: '', assign },
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockClear();
    assign.mockClear();
  });

  const advance = (ms: number): void => {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  };

  it('avertit à 9 minutes avec un compte à rebours de 60 s', () => {
    render(<IdleLogout locale="fr" />);
    advance(8 * 60_000 + 58_000);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    advance(2000);
    expect(screen.getByRole('alertdialog').textContent).toContain('déconnecté dans 60 s');
  });

  it('[Rester connecté] repousse la déconnexion', () => {
    render(<IdleLogout locale="fr" />);
    advance(9 * 60_000 + 1000);
    fireEvent.click(screen.getByRole('button', { name: 'Rester connecté' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    advance(5 * 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('une activité (clavier, clic) remet le compteur à zéro', () => {
    render(<IdleLogout locale="fr" />);
    advance(8 * 60_000);
    fireEvent.keyDown(window, { key: 'a' });
    advance(8 * 60_000);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('EC-AUTH-03 : à 10 minutes, ferme seulement la session puis renvoie à la connexion', async () => {
    render(<IdleLogout locale="fr" />);
    advance(10 * 60_000 + 1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toEqual([
      '/auth/sign-out',
      expect.objectContaining({ method: 'POST' }),
    ]);
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(assign).toHaveBeenCalledWith('/connexion?raison=inactivite&retour=%2Fcampagnes');
  });

  it('un autre onglet actif garde celui-ci ouvert', () => {
    render(<IdleLogout locale="fr" />);
    advance(8 * 60_000);
    window.localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(Date.now()));
    advance(8 * 60_000);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});

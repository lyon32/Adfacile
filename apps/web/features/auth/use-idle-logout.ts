'use client';
// Compte l'inactivité et déclenche l'avertissement puis la déconnexion (LLD §7.5).
// useEffect : synchronisation avec des systèmes extérieurs (écouteurs du navigateur, minuterie).
import { useCallback, useEffect, useRef, useState } from 'react';
import { idlePhase, type IdlePhase } from './idle';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'wheel'] as const;
/** Partage de la dernière activité entre onglets : un onglet actif garde les autres ouverts. */
export const LAST_ACTIVITY_STORAGE_KEY = 'pubeka.auth.last_activity';
const TICK_MS = 1000;

export interface IdleLogout {
  phase: IdlePhase;
  stayConnected: () => void;
}

function readShared(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeShared(value: number): void {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(value));
  } catch {
    // Stockage indisponible (navigation privée) : chaque onglet compte seul.
  }
}

export function useIdleLogout(options: { onExpire: () => void; now?: () => number }): IdleLogout {
  const now = options.now ?? Date.now;
  const lastActivity = useRef(now());
  const expired = useRef(false);
  const [phase, setPhase] = useState<IdlePhase>({ kind: 'active' });
  const phaseRef = useRef<IdlePhase['kind']>('active');
  const onExpire = useRef(options.onExpire);
  useEffect(() => {
    onExpire.current = options.onExpire;
  }, [options.onExpire]);

  const markActive = useCallback(() => {
    const at = now();
    lastActivity.current = at;
    writeShared(at);
    phaseRef.current = 'active';
    setPhase({ kind: 'active' });
  }, [now]);

  useEffect(() => {
    const onActivity = (): void => {
      // Pendant l'avertissement, seul [Rester connecté] prolonge la session.
      if (phaseRef.current === 'active') {
        lastActivity.current = now();
        writeShared(lastActivity.current);
      }
    };
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') onActivity();
    };
    const tick = (): void => {
      if (expired.current) return;
      const shared = readShared();
      if (shared !== null && shared > lastActivity.current) lastActivity.current = shared;
      const next = idlePhase(now() - lastActivity.current);
      phaseRef.current = next.kind;
      setPhase(next);
      if (next.kind === 'expired') {
        expired.current = true;
        onExpire.current();
      }
    };
    for (const name of ACTIVITY_EVENTS)
      window.addEventListener(name, onActivity, { passive: true });
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(tick, TICK_MS);
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [now]);

  return { phase, stayConnected: markActive };
}

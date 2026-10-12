// Blocage après 5 échecs pour un couple e-mail + adresse IP (EC-AUTH-04, TR-SEC-14).
// Les compteurs sont en base (migration 0004) ; seule une empreinte est envoyée.
import { createHash } from 'node:crypto';
import type { ServiceClient } from '@pubeka/db';

export interface LockState {
  locked: boolean;
  retryAfterS: number;
}

export interface LockStore {
  status(key: string): Promise<LockState>;
  recordFailure(key: string): Promise<LockState>;
  clear(key: string): Promise<void>;
}

/** Empreinte SHA-256 de l'e-mail (minuscules, sans espaces) et de l'adresse IP. */
export function loginKey(email: string, ip: string): string {
  return createHash('sha256').update(`${email.trim().toLowerCase()}|${ip}`).digest('hex');
}

interface LockRow {
  locked: boolean;
  retry_after_s: number;
}

function toState(rows: LockRow[] | null, error: { message: string } | null): LockState {
  if (error) throw new Error(`Blocage de connexion indisponible : ${error.message}`);
  const row = rows?.[0];
  if (!row) throw new Error('Blocage de connexion : réponse vide');
  return { locked: row.locked, retryAfterS: row.retry_after_s };
}

export function dbLockStore(svc: ServiceClient): LockStore {
  return {
    async status(key) {
      const { data, error } = await svc.rpc('login_lock_status', { p_key: key });
      return toState(data, error);
    },
    async recordFailure(key) {
      const { data, error } = await svc.rpc('record_login_failure', { p_key: key });
      return toState(data, error);
    },
    async clear(key) {
      const { error } = await svc.rpc('clear_login_failures', { p_key: key });
      if (error) throw new Error(`Blocage de connexion indisponible : ${error.message}`);
    },
  };
}

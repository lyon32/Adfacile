// Crédits : appels aux fonctions SQL protégées (LLD §6.5). Serveur uniquement.
import type { DbClient, ServiceClient } from './client';
import { check, unwrap } from './errors';

/** `false` si le solde est insuffisant ; `core` le traduit en `insufficient_credits`. */
export async function reserveCredits(
  svc: ServiceClient,
  workspaceId: string,
  needed: number,
  jobId: string,
): Promise<boolean> {
  return unwrap(await svc.rpc('reserve_credits', { ws: workspaceId, needed, job: jobId }));
}

/** Rend `amount` crédits (tous si absent). Une seule libération par génération ; retourne le nombre rendu. */
export async function releaseCredits(
  svc: ServiceClient,
  jobId: string,
  amount?: number,
): Promise<number> {
  return unwrap(
    await svc.rpc(
      'release_credits',
      amount === undefined ? { job: jobId } : { job: jobId, amount },
    ),
  );
}

/** Confirme la consommation de ce qui n'a pas été rendu. Idempotent. */
export async function consumeCredits(svc: ServiceClient, jobId: string): Promise<void> {
  check(await svc.rpc('consume_credits', { job: jobId }));
}

export interface CreditBalances {
  monthly: number;
  bonus: number;
  purchased: number;
  total: number;
}

export async function creditBalances(db: DbClient, workspaceId: string): Promise<CreditBalances> {
  const rows = unwrap(
    await db.from('credit_balances').select('bucket, balance').eq('workspace_id', workspaceId),
  );
  const out: CreditBalances = { monthly: 0, bonus: 0, purchased: 0, total: 0 };
  for (const r of rows) {
    if (r.bucket === null || r.balance === null) continue;
    out[r.bucket] = r.balance;
    out.total += r.balance;
  }
  return out;
}

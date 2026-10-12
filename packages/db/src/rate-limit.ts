// Limites de débit (API_SPEC §11) : fenêtre fixe, compteur en base (0003, E7).
import { AppError } from '@pubeka/contracts';
import type { ServiceClient } from './client';
import { unwrap } from './errors';

export interface RateLimitResult {
  allowed: boolean;
  hits: number;
  retryAfterS: number;
}

export async function hitRateLimit(
  svc: ServiceClient,
  key: string,
  limit: number,
  windowS: number,
): Promise<RateLimitResult> {
  const rows = unwrap(
    await svc.rpc('hit_rate_limit', { p_key: key, p_limit: limit, p_window_s: windowS }),
  );
  const row = rows[0];
  if (!row) throw new AppError('internal_error');
  return { allowed: row.allowed, hits: row.hits, retryAfterS: row.retry_after_s };
}

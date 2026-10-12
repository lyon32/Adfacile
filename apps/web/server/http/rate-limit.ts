// Limites de débit (API_SPEC §11, D8 : compteur en base, fenêtre fixe). Comptées par
// utilisateur pour les routes connectées, par adresse IP seulement pour les routes sans
// connexion (EC-AUTH-09 : beaucoup d'abonnés partagent une même IP), par espace pour les
// générations et l'IA.
import { AppError } from '@pubeka/contracts';

export type RateLimitScope = 'ip' | 'user' | 'workspace' | 'admin';

export interface RateLimitRule {
  limit: number;
  windowS: number;
  scope: RateLimitScope;
}

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;

export const RATE_LIMITS = {
  read: { limit: 300, windowS: MINUTE, scope: 'user' },
  write: { limit: 60, windowS: MINUTE, scope: 'user' },
  generation: { limit: 10, windowS: MINUTE, scope: 'workspace' },
  ai: { limit: 20, windowS: HOUR, scope: 'workspace' },
  assistant: { limit: 30, windowS: HOUR, scope: 'user' },
  stats_refresh: { limit: 1, windowS: 5 * MINUTE, scope: 'user' },
  tickets: { limit: 10, windowS: DAY, scope: 'user' },
  export: { limit: 1, windowS: DAY, scope: 'user' },
  public: { limit: 60, windowS: MINUTE, scope: 'ip' },
  admin: { limit: 120, windowS: MINUTE, scope: 'admin' },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitGroup = keyof typeof RATE_LIMITS;

export interface RateLimitHit {
  allowed: boolean;
  hits: number;
  retryAfterS: number;
}

export type RateLimiter = (key: string, limit: number, windowS: number) => Promise<RateLimitHit>;

export interface RateLimitSubject {
  ip: string;
  userId?: string | undefined;
  workspaceId?: string | undefined;
  /** Précision propre à la route (ex. identifiant de campagne pour `stats_refresh`). */
  extra?: string | undefined;
}

export function rateLimitKey(group: RateLimitGroup, subject: RateLimitSubject): string {
  const rule: RateLimitRule = RATE_LIMITS[group];
  let who: string;
  if (rule.scope === 'workspace' && subject.workspaceId !== undefined) {
    who = `ws:${subject.workspaceId}`;
  } else if (rule.scope !== 'ip' && subject.userId !== undefined) {
    who = `user:${subject.userId}`;
  } else {
    who = `ip:${subject.ip}`;
  }
  return `api:${group}:${who}${subject.extra === undefined ? '' : `:${subject.extra}`}`;
}

export interface RateLimitState {
  limit: number;
  remaining: number;
  resetS: number;
}

/** Compte la requête ; lève `429 rate_limited` au-delà de la limite. */
export async function enforceRateLimit(
  limiter: RateLimiter,
  group: RateLimitGroup,
  subject: RateLimitSubject,
): Promise<RateLimitState> {
  const rule: RateLimitRule = RATE_LIMITS[group];
  const hit = await limiter(rateLimitKey(group, subject), rule.limit, rule.windowS);
  if (!hit.allowed) {
    throw new AppError('rate_limited', { retryAfterS: Math.max(1, hit.retryAfterS) });
  }
  return {
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - hit.hits),
    resetS: Math.max(0, hit.retryAfterS),
  };
}

export function rateLimitHeaders(state: RateLimitState): Record<string, string> {
  return {
    'ratelimit-limit': String(state.limit),
    'ratelimit-remaining': String(state.remaining),
    'ratelimit-reset': String(state.resetS),
  };
}

// Formes renvoyées par l'API Meta de Pubeka (openapi.yaml : MetaConnection, HealthCheck, Page,
// AdAccount). Jamais de jeton, d'identifiant de clé ni de contenu brut de Meta.
import type { Json, Tables } from '@pubeka/db';

export type ConnectionStatus = 'ok' | 'expiring' | 'expired' | 'revoked';

export type HealthKey =
  | 'business_portfolio'
  | 'ad_account'
  | 'payment_method'
  | 'page'
  | 'instagram'
  | 'whatsapp'
  | 'pixel'
  | 'permissions';

export interface HealthItem {
  key: HealthKey;
  ok: boolean;
  required?: boolean;
  recommended?: boolean;
  guide_slug?: string;
}

export interface HealthCheckView {
  checked_at: string;
  items: HealthItem[];
}

export interface MetaConnectionView {
  id: string;
  token_type: 'system_user' | 'user';
  status: ConnectionStatus;
  expires_at: string | null;
  business_id: string | null;
  last_health_check: HealthCheckView | null;
}

/** Jours avant l'expiration où la connexion passe à « bientôt expirée » (APPFLOW §6.4 : J-7). */
export const EXPIRING_SOON_DAYS = 7;

const HEALTH_KEYS: readonly HealthKey[] = [
  'business_portfolio',
  'ad_account',
  'payment_method',
  'page',
  'instagram',
  'whatsapp',
  'pixel',
  'permissions',
];

/**
 * Statut enregistré, corrigé par l'heure : une connexion `ok` dont la date est passée est `expired`,
 * dans les 7 jours elle est `expiring`. `revoked` et `expired` enregistrés ne reviennent jamais en
 * arrière sans reconnexion.
 */
export function effectiveStatus(
  stored: ConnectionStatus,
  expiresAt: string | null,
  now: Date,
): ConnectionStatus {
  if (stored === 'revoked' || stored === 'expired') return stored;
  if (expiresAt === null) return stored;
  const remaining = new Date(expiresAt).getTime() - now.getTime();
  if (remaining <= 0) return 'expired';
  if (remaining <= EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000) return 'expiring';
  return 'ok';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHealthKey(value: unknown): value is HealthKey {
  return HEALTH_KEYS.some((key) => key === value);
}

/** Relit le bilan enregistré ; toute autre forme vaut « pas de bilan ». */
export function parseHealthCheck(value: Json | null): HealthCheckView | null {
  if (!isRecord(value) || typeof value.checked_at !== 'string' || !Array.isArray(value.items)) {
    return null;
  }
  const items: HealthItem[] = [];
  for (const raw of value.items as unknown[]) {
    if (!isRecord(raw) || !isHealthKey(raw.key) || typeof raw.ok !== 'boolean') continue;
    items.push({
      key: raw.key,
      ok: raw.ok,
      ...(raw.required === true ? { required: true } : {}),
      ...(raw.recommended === true ? { recommended: true } : {}),
      ...(typeof raw.guide_slug === 'string' ? { guide_slug: raw.guide_slug } : {}),
    });
  }
  return { checked_at: value.checked_at, items };
}

/** Valeur JSON enregistrée dans `meta_connections.last_health_check`. */
export function healthToJson(health: HealthCheckView): Json {
  return {
    checked_at: health.checked_at,
    items: health.items.map((i) => ({
      key: i.key,
      ok: i.ok,
      ...(i.required === true ? { required: true } : {}),
      ...(i.recommended === true ? { recommended: true } : {}),
      ...(i.guide_slug === undefined ? {} : { guide_slug: i.guide_slug }),
    })),
  };
}

export type ConnectionRow = Pick<
  Tables<'meta_connections'>,
  'id' | 'token_type' | 'status' | 'expires_at' | 'business_id' | 'last_health_check'
>;

export function toConnectionView(row: ConnectionRow, now: Date): MetaConnectionView {
  const stored: ConnectionStatus =
    row.status === 'expiring' || row.status === 'expired' || row.status === 'revoked'
      ? row.status
      : 'ok';
  return {
    id: row.id,
    token_type: row.token_type === 'system_user' ? 'system_user' : 'user',
    status: effectiveStatus(stored, row.expires_at, now),
    expires_at: row.expires_at,
    business_id: row.business_id,
    last_health_check: parseHealthCheck(row.last_health_check),
  };
}

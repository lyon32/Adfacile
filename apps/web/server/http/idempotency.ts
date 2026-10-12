// Idempotence des actions qui dépensent de l'argent, des crédits ou un quota
// (API_SPEC §7, LLD §6.3). Les clés vivent 24 h dans `api_idempotency_keys`, par espace.
import { createHash } from 'node:crypto';
import { AppError, ERROR_STATUS } from '@pubeka/contracts';
import type { Json, ServiceClient } from '@pubeka/db';

export interface IdempotencyArgs {
  workspaceId: string;
  key: string;
  route: string;
  bodyHash: string;
}

export interface StoredResponse {
  status: number;
  body: unknown;
}

export type IdempotencyBegin =
  | { kind: 'new' }
  | { kind: 'replay'; response: StoredResponse }
  | { kind: 'running' }
  | { kind: 'mismatch' };

export interface IdempotencyStore {
  begin(args: IdempotencyArgs): Promise<IdempotencyBegin>;
  complete(args: IdempotencyArgs, response: StoredResponse): Promise<void>;
  discard(args: IdempotencyArgs): Promise<void>;
}

/** JSON canonique : clés d'objet triées, à toutes les profondeurs. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function bodyHash(body: unknown): string {
  return createHash('sha256').update(canonicalJson(body)).digest('hex');
}

/** Délai conseillé quand la même intention est encore en cours (API_SPEC §7 règle 4). */
export const RUNNING_RETRY_AFTER_S = 2;

/**
 * Exécute `run` une seule fois par (espace, clé). Même clé et même corps : la réponse
 * enregistrée est rejouée. Une `AppError` 4xx est enregistrée comme une réponse ; une erreur
 * 5xx (ou inattendue) efface la clé pour permettre un nouvel essai.
 */
export async function withIdempotency(
  store: IdempotencyStore,
  args: IdempotencyArgs,
  run: () => Promise<StoredResponse>,
  toErrorResponse: (err: AppError) => StoredResponse,
): Promise<StoredResponse & { replayed: boolean }> {
  const begin = await store.begin(args);
  switch (begin.kind) {
    case 'replay':
      return { ...begin.response, replayed: true };
    case 'running':
      throw new AppError('conflict', { retryAfterS: RUNNING_RETRY_AFTER_S });
    case 'mismatch':
      throw new AppError('idempotency_key_reused');
    case 'new':
      break;
  }
  let response: StoredResponse;
  try {
    response = await run();
  } catch (err) {
    if (err instanceof AppError && ERROR_STATUS[err.code] < 500) {
      const stored = toErrorResponse(err);
      await store.complete(args, stored);
      throw err;
    }
    await store.discard(args);
    throw err;
  }
  await store.complete(args, response);
  return { ...response, replayed: false };
}

function isJson(value: unknown): value is Json {
  if (value === null) return true;
  if (['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isJson);
  if (typeof value === 'object')
    return Object.values(value).every((v) => v === undefined || isJson(v));
  return false;
}

/** Magasin réel : table `api_idempotency_keys` (migration 0003, E2), client service. */
export function dbIdempotencyStore(svc: ServiceClient, now: () => Date): IdempotencyStore {
  const table = () => svc.from('api_idempotency_keys');

  async function insert(args: IdempotencyArgs): Promise<boolean> {
    const { error } = await table().insert({
      workspace_id: args.workspaceId,
      key: args.key,
      route: args.route,
      body_hash: args.bodyHash,
      state: 'running',
    });
    if (error === null) return true;
    if (error.code === '23505') return false;
    throw new AppError('internal_error', { cause: error });
  }

  return {
    async begin(args) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (await insert(args)) return { kind: 'new' };
        const { data, error } = await table()
          .select('route, body_hash, state, response_status, response_body, expires_at')
          .eq('workspace_id', args.workspaceId)
          .eq('key', args.key)
          .maybeSingle();
        if (error !== null) throw new AppError('internal_error', { cause: error });
        if (data === null) continue; // effacée entre-temps : nouvel essai d'insertion
        if (new Date(data.expires_at) <= now()) {
          await this.discard(args);
          continue;
        }
        if (data.route !== args.route || data.body_hash !== args.bodyHash)
          return { kind: 'mismatch' };
        if (data.state === 'running' || data.response_status === null) return { kind: 'running' };
        return {
          kind: 'replay',
          response: { status: data.response_status, body: data.response_body },
        };
      }
      return { kind: 'running' };
    },

    async complete(args, response) {
      const { error } = await table()
        .update({
          state: 'done',
          response_status: response.status,
          response_body: isJson(response.body) ? response.body : null,
        })
        .eq('workspace_id', args.workspaceId)
        .eq('key', args.key);
      if (error !== null) throw new AppError('internal_error', { cause: error });
    },

    async discard(args) {
      const { error } = await table()
        .delete()
        .eq('workspace_id', args.workspaceId)
        .eq('key', args.key);
      if (error !== null) throw new AppError('internal_error', { cause: error });
    },
  };
}

// Client HTTP de l'application (navigateur) vers /api/v1. Les erreurs arrivent au format
// Problem Details (API_SPEC §3) : le code de la liste fermée décide du message affiché.
import type { components } from '@pubeka/contracts';
import type { z } from 'zod';

export type ApiProblem = components['schemas']['Problem'];

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly problem: ApiProblem | null;

  constructor(status: number, problem: ApiProblem | null) {
    super(problem?.code ?? `http_${String(status)}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = problem?.code ?? 'unknown';
    this.problem = problem;
  }
}

function isProblem(value: unknown): value is ApiProblem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof value.code === 'string' &&
    'status' in value
  );
}

export interface ApiRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/** La réponse est validée par un schéma Zod : aucune donnée du réseau n'est crue sur parole. */
export async function apiFetch<S extends z.ZodType>(
  path: string,
  schema: S,
  init: ApiRequest = {},
): Promise<z.infer<S>> {
  const request: RequestInit = {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
  };
  if (init.body !== undefined) {
    request.headers = { 'content-type': 'application/json' };
    request.body = JSON.stringify(init.body);
  }
  if (init.signal !== undefined) request.signal = init.signal;
  const response = await fetch(`/api/v1${path}`, request);
  const payload: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, isProblem(payload) ? payload : null);
  return schema.parse(payload);
}

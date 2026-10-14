// Aide des tests d'intégration Meta : requêtes, `state`, connexion complète d'un espace.
import { randomUUID } from 'node:crypto';
import type { OAuthStatePayload } from '@pubeka/core';
import { testServiceClient, type SeededWorkspace } from '@pubeka/testing';
import { expect } from 'vitest';
import { POST as connect } from '../workspaces/[workspaceId]/meta/connect/route';
import { GET as callback } from './callback/route';
import { createStateCodec } from './state-codec';

export const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://app.localhost:5173';

export function call(
  method: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
): Request {
  return new Request(`${APP}/api/v1${path}`, {
    method,
    headers: { 'x-forwarded-for': `10.${String(Math.floor(Math.random() * 250))}.3.1`, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export const ws = (workspaceId: string) => ({ params: Promise.resolve({ workspaceId }) });
export const conn = (workspaceId: string, connectionId: string) => ({
  params: Promise.resolve({ workspaceId, connectionId }),
});

export async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

export function stateOf(authorizeUrl: string): string {
  const state = new URL(authorizeUrl).searchParams.get('state');
  if (state === null) throw new Error('state absent');
  return state;
}

/** Le `state` d'une demande de connexion du propriétaire. */
export async function newState(
  s: SeededWorkspace,
  returnTo?: 'onboarding' | 'settings',
): Promise<string> {
  const id = s.workspace.id;
  const res = await connect(
    call(
      'POST',
      `/workspaces/${id}/meta/connect`,
      s.owner.headers,
      returnTo && { return_to: returnTo },
    ),
    ws(id),
  );
  expect(res.status).toBe(200);
  return stateOf(((await json(res)) as { authorize_url: string }).authorize_url);
}

export function callbackRequest(
  headers: Record<string, string>,
  query: Record<string, string>,
): Request {
  const qs = new URLSearchParams(query).toString();
  return call('GET', `/meta/callback?${qs}`, headers);
}

/** Connexion complète d'un espace (connect, puis retour de Facebook avec un code factice). */
export async function connectWorkspace(s: SeededWorkspace, returnTo?: 'onboarding' | 'settings') {
  const state = await newState(s, returnTo);
  return callback(callbackRequest(s.owner.headers, { state, code: 'code-de-test' }));
}

export async function connectionRows(workspaceId: string) {
  const { data } = await testServiceClient()
    .from('meta_connections')
    .select('id, status, token_type')
    .eq('workspace_id', workspaceId);
  return data ?? [];
}

export function idOf(connection: { id: string } | undefined): string {
  if (connection === undefined) throw new Error('connexion attendue');
  return connection.id;
}

export function forgedState(payload: OAuthStatePayload): string {
  const secret = process.env.APP_SIGNING_SECRET;
  if (secret === undefined) throw new Error('APP_SIGNING_SECRET absent');
  const codec = createStateCodec(secret);
  // Le codec réel signe n'importe quelle charge utile : on forge un `state` valide mais abusif.
  return codec.seal(payload);
}

export const nonce = () => `${randomUUID()}-${randomUUID()}`.slice(0, 40);
export const inSeconds = (s: number) => Math.floor(Date.now() / 1000) + s;

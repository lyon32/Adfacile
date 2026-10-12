// `api()` avec ses dépendances réelles, contre la pile Supabase locale : appartenance (RLS +
// filtre), rôle, lecture seule, limite de débit en base, idempotence en base.
import { randomUUID } from 'node:crypto';
import { createTestUser, seedWorkspace, type SeededWorkspace } from '@pubeka/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { api } from './routes';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://app.localhost:5173';
let seeded: SeededWorkspace;
let readOnly: SeededWorkspace;
let runs = 0;

// Route d'essai (jamais exposée) : une écriture d'espace idempotente, réservée owner/editor.
const POST = api(
  {
    auth: 'member',
    roles: ['owner', 'editor'],
    writable: true,
    idempotent: true,
    rateLimit: 'write',
    body: z.strictObject({ name: z.string().min(1).max(20) }),
  },
  (ctx, { body }) => {
    runs += 1;
    return Promise.resolve({
      status: 202,
      body: { ws: ctx.workspace.id, name: body.name, run: runs },
    });
  },
);

function call(
  ws: string,
  headers: Record<string, string>,
  body: unknown,
  key = randomUUID(),
): Promise<Response> {
  return POST(
    new Request(`${APP}/api/v1/workspaces/${ws}/essai`, {
      method: 'POST',
      headers: { 'idempotency-key': key, ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ workspaceId: ws }) },
  );
}

async function code(res: Response): Promise<unknown> {
  return ((await res.json()) as { code?: unknown }).code;
}

beforeAll(async () => {
  [seeded, readOnly] = await Promise.all([seedWorkspace(), seedWorkspace({ status: 'read_only' })]);
});

describe('api() réel : contrôles d’accès', () => {
  it('propriétaire et éditeur : 202', async () => {
    expect((await call(seeded.workspace.id, seeded.owner.headers, { name: 'a' })).status).toBe(202);
    expect((await call(seeded.workspace.id, seeded.editor.headers, { name: 'b' })).status).toBe(
      202,
    );
  });

  it('membre d’un autre espace : 404 not_found, jamais 403', async () => {
    const res = await call(seeded.workspace.id, seeded.stranger.headers, { name: 'a' });
    expect(res.status).toBe(404);
    expect(await code(res)).toBe('not_found');
  });

  it('lecteur : 403 role_insufficient', async () => {
    const res = await call(seeded.workspace.id, seeded.viewer.headers, { name: 'a' });
    expect(res.status).toBe(403);
    expect(await code(res)).toBe('role_insufficient');
  });

  it('espace en lecture seule : 403 workspace_read_only', async () => {
    const res = await call(readOnly.workspace.id, readOnly.owner.headers, { name: 'a' });
    expect(res.status).toBe(403);
    expect(await code(res)).toBe('workspace_read_only');
  });

  it('sans session : 401 ; corps invalide : 400', async () => {
    expect((await call(seeded.workspace.id, {}, { name: 'a' })).status).toBe(401);
    const res = await call(seeded.workspace.id, seeded.owner.headers, { name: '' });
    expect(res.status).toBe(400);
  });
});

describe('api() réel : idempotence (TR-SEC-05, API_SPEC §7)', () => {
  it('même clé + même corps : une seule exécution, réponse rejouée', async () => {
    const key = randomUUID();
    const before = runs;
    const first = await call(seeded.workspace.id, seeded.owner.headers, { name: 'x' }, key);
    const second = await call(seeded.workspace.id, seeded.owner.headers, { name: 'x' }, key);
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect(await second.json()).toEqual(await first.json());
    expect(runs).toBe(before + 1);
  });

  it('même clé + autre corps : 409 idempotency_key_reused', async () => {
    const key = randomUUID();
    await call(seeded.workspace.id, seeded.owner.headers, { name: 'x' }, key);
    const res = await call(seeded.workspace.id, seeded.owner.headers, { name: 'y' }, key);
    expect(res.status).toBe(409);
    expect(await code(res)).toBe('idempotency_key_reused');
  });

  it('erreur 4xx enregistrée : même clé = même erreur', async () => {
    const key = randomUUID();
    const first = await call(seeded.workspace.id, seeded.owner.headers, { name: '' }, key);
    const again = await call(seeded.workspace.id, seeded.owner.headers, { name: '' }, key);
    expect(first.status).toBe(400);
    expect(again.status).toBe(400);
    expect(again.headers.get('idempotent-replayed')).toBe('true');
  });
});

describe('api() réel : limite de débit (TR-SEC-09)', () => {
  it('la 61ᵉ écriture de la minute → 429 avec Retry-After', async () => {
    const user = await createTestUser({ label: 'limite' });
    const route = api({ auth: 'user', rateLimit: 'write' }, () => Promise.resolve({ status: 204 }));
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 61; i += 1) {
      last = await route(
        new Request(`${APP}/api/v1/me`, { method: 'POST', headers: user.headers }),
      );
      statuses.push(last.status);
    }
    if (statuses.at(-1) === 429) {
      expect(Number(last?.headers.get('retry-after'))).toBeGreaterThan(0);
      expect(await last?.json()).toMatchObject({ code: 'rate_limited' });
    } else {
      // La fenêtre a basculé : la 61ᵉ requête de la nouvelle fenêtre doit être refusée.
      for (let i = 0; i < 60 && last?.status !== 429; i += 1) {
        last = await route(
          new Request(`${APP}/api/v1/me`, { method: 'POST', headers: user.headers }),
        );
      }
      expect(last?.status).toBe(429);
    }
  });
});

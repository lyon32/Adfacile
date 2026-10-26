// S19 / SECURITY_NOTES §2.7 : la troisième barrière (la base) applique la MÊME règle d'accès que le code. (1) Grille : la fonction SQL
// `private.access_at` et `effectiveAccess` (TypeScript) donnent le même résultat sur toutes les combinaisons d'état, de statut
// d'abonnement et de dates autour des frontières (fin de période, +72 h, grace_until). (2) Un éditeur qui appelle PostgREST
// DIRECTEMENT avec son jeton (sans passer par l'API) est refusé quand l'abonnement est échu depuis plus de 3 jours.
import { effectiveAccess } from '@pubeka/core';
import {
  queryTestDb,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { beforeAll, describe, expect, it } from 'vitest';

const DAY = 24 * 3600 * 1000;
const AT = new Date('2026-11-10T12:00:00.000Z');

type Stored = 'active' | 'read_only' | 'suspended';
type Sub = 'trialing' | 'active' | 'grace' | 'read_only' | 'canceled' | null;
interface Case {
  stored: Stored;
  sub: Sub;
  end: string | null;
  grace: string | null;
}

function grid(): Case[] {
  const cases: Case[] = [];
  const ends = [
    -10 * DAY,
    -72 * 3600_000 - 1000,
    -72 * 3600_000,
    -72 * 3600_000 + 1000,
    -1000,
    0,
    1000,
    10 * DAY,
  ];
  const subs: Sub[] = [null, 'trialing', 'active', 'grace', 'read_only', 'canceled'];
  for (const stored of ['active', 'read_only', 'suspended'] as const) {
    for (const sub of subs) {
      if (sub === null) {
        cases.push({ stored, sub, end: null, grace: null });
        continue;
      }
      for (const offset of ends) {
        const end = AT.getTime() + offset;
        const graces = [null, end - DAY, end + DAY, end + 10 * DAY];
        for (const g of graces) {
          cases.push({
            stored,
            sub,
            end: new Date(end).toISOString(),
            grace: g === null ? null : new Date(g).toISOString(),
          });
        }
      }
    }
  }
  return cases;
}

describe('TR-PAY-07 : la règle SQL et la règle TypeScript ne dérivent pas', () => {
  it('même résultat sur toute la grille (états × statuts × dates aux frontières)', async () => {
    const cases = grid();
    expect(cases.length).toBeGreaterThan(400);
    const rows = await queryTestDb<{ n: number; a: string }>(
      `select c.n::int as n,
              private.access_at(c.stored::public.workspace_status, c.sub::public.subscription_status,
                                c.period_end::timestamptz, c.grace::timestamptz, $2::timestamptz) as a
       from jsonb_to_recordset($1::jsonb) as c(n int, stored text, sub text, period_end text, grace text)
       order by c.n`,
      [
        JSON.stringify(
          cases.map((c, n) => ({
            n,
            stored: c.stored,
            sub: c.sub,
            period_end: c.end,
            grace: c.grace,
          })),
        ),
        AT.toISOString(),
      ],
    );
    expect(rows).toHaveLength(cases.length);
    const mismatches: string[] = [];
    for (const row of rows) {
      const c = cases[row.n];
      if (c === undefined) throw new Error('cas inconnu');
      const expected = effectiveAccess(
        c.stored,
        c.sub === null || c.end === null
          ? null
          : { status: c.sub, period_end: c.end, grace_until: c.grace },
        AT,
      );
      if (expected !== row.a)
        mismatches.push(`${JSON.stringify(c)} : SQL ${row.a}, TS ${expected}`);
    }
    expect(mismatches).toEqual([]);
  });
});

describe('TR-PAY-07 : un éditeur qui appelle la base directement avec son jeton', () => {
  let s: SeededWorkspace;
  beforeAll(async () => {
    s = await seedWorkspace();
  });

  async function subscribe(status: 'trialing' | 'active', endsInDays: number) {
    const svc = testServiceClient();
    await svc.from('subscriptions').delete().eq('workspace_id', s.workspace.id);
    const end = Date.now() + endsInDays * DAY;
    const r = await svc.from('subscriptions').insert({
      workspace_id: s.workspace.id,
      plan_code: 'pro',
      status,
      period_start: new Date(end - 30 * DAY).toISOString(),
      period_end: new Date(end).toISOString(),
    });
    expect(r.error).toBeNull();
  }

  const draft = () =>
    s.editor.db
      .from('campaigns')
      .insert({ workspace_id: s.workspace.id, name: 'direct', created_by: s.editor.id });

  it('abonnement en cours : écriture directe acceptée ; pendant la grâce de 3 jours : refusée (lire, acheter des crédits et pause seulement)', async () => {
    await subscribe('active', 10);
    expect((await draft()).error).toBeNull();
    await subscribe('active', -1);
    expect((await draft()).error?.code).toBe('42501');
  });

  it('échu depuis plus de 3 jours (verrouillé) : refusé par la RLS (42501), alors que workspaces.status est encore « active »', async () => {
    await subscribe('active', -5);
    const stored = await testServiceClient()
      .from('workspaces')
      .select('status')
      .eq('id', s.workspace.id)
      .single();
    expect(stored.data?.status).toBe('active');
    const refused = await draft();
    expect(refused.error?.code).toBe('42501');
  });

  it('essai terminé : refusé tout de suite ; renouvelé : accepté de nouveau', async () => {
    await subscribe('trialing', -0.01);
    expect((await draft()).error?.code).toBe('42501');
    await subscribe('active', 30);
    expect((await draft()).error).toBeNull();
  });
});

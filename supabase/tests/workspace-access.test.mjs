// Tests de la migration 0021 (S19) : l'accès réel d'un espace (grâce de 3 jours, lecture seule, essai terminé, suspension) dans la base — PGlite.
// Usage : node supabase/tests/workspace-access.test.mjs <dossier contenant node_modules/@electric-sql/pglite>
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(resolve(process.argv[2] ?? here), 'package.json'));
const { PGlite } = require('@electric-sql/pglite');

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  create publication supabase_realtime;
`);
const migDir = join(here, '..', 'migrations');
for (const f of readdirSync(migDir).filter((f) => f.endsWith('.sql') && !f.includes('storage')).sort()) {
  await db.exec(readFileSync(join(migDir, f), 'utf8'));
}

let pass = 0, fail = 0;
const results = [];
async function check(name, fn) {
  try { const ok = await fn(); ok ? pass++ : fail++; results.push(`${ok ? '✓' : '✗'} ${name}`); }
  catch (e) { fail++; results.push(`✗ ${name} — exception inattendue : ${e.message}`); }
}
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
async function as(role, sub, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}
const denied = async (fn) => { try { const r = await fn(); return r.affectedRows === 0; } catch (e) { return /row-level|permission denied/i.test(e.message); } };

const OWNER = '11111111-1111-4111-8111-111111111111';
const EDITOR = '22222222-2222-4222-8222-222222222222';
await db.query(`insert into auth.users (id,email) values ($1,'a@test.cm'),($2,'e@test.cm')`, [OWNER, EDITOR]);
const WS = (await q(`select id from public.workspaces where owner_id=$1`, [OWNER]))[0].id;
await db.query(`insert into public.workspace_members (workspace_id,profile_id,role,invited_by) values ($1,$2,'editor',$3)`, [WS, EDITOR, OWNER]);

const DAY = 86400000;
const T0 = Date.parse('2026-11-10T12:00:00Z');
const iso = (offsetDays) => new Date(T0 + offsetDays * DAY).toISOString();

// --- 1. La règle, case par case (mêmes valeurs que packages/billing/src/access.test.ts) ---------------------------------
const rule = async (stored, sub, endDays, graceDays, nowDays) => (await q(
  `select private.access_at($1::public.workspace_status, $2::public.subscription_status, $3::timestamptz, $4::timestamptz, $5::timestamptz) a`,
  [stored, sub, endDays === null ? null : iso(endDays), graceDays === null ? null : iso(graceDays), iso(nowDays)]))[0].a;

const cases = [
  ['active', 'active', 0, null, -0.001, 'active'],
  ['active', 'active', 0, null, 0, 'grace'],
  ['active', 'active', 0, null, 2.999, 'grace'],
  ['active', 'active', 0, null, 3, 'read_only'],
  ['active', 'active', 0, 10, 9.999, 'grace'],
  ['active', 'active', 0, 10, 10, 'read_only'],
  ['active', 'active', 0, -5, -0.001, 'active'],
  ['active', 'active', 0, -5, 1, 'grace'],
  ['active', 'trialing', 0, null, -0.001, 'active'],
  ['active', 'trialing', 0, null, 0, 'read_only'],
  ['active', 'canceled', 0, null, -0.001, 'active'],
  ['active', 'canceled', 0, null, 0, 'read_only'],
  ['active', 'read_only', 10, null, 0, 'read_only'],
  ['active', 'grace', 0, null, 1, 'grace'],
  ['active', 'grace', 0, null, 4, 'read_only'],
  ['active', null, null, null, 0, 'active'],
  ['read_only', 'active', 10, null, 0, 'read_only'],
  ['suspended', 'active', 10, null, 0, 'suspended'],
  ['suspended', null, null, null, 0, 'suspended'],
];
for (const [stored, sub, end, grace, now, expected] of cases) {
  await check(`règle : ${stored} / ${sub} / fin J${end} / grâce ${grace} / maintenant J${now} → ${expected}`, async () =>
    (await rule(stored, sub, end, grace, now)) === expected);
}

// --- 2. La base applique la règle (RLS) : un éditeur direct, sans passer par l'API ----------------------------------------
async function subscribe(status, endsInDays) {
  await db.query(`delete from public.subscriptions where workspace_id=$1`, [WS]);
  const end = Date.now() + endsInDays * DAY;
  await db.query(
    `insert into public.subscriptions (workspace_id,plan_code,status,period_start,period_end) values ($1,'pro',$2,$3,$4)`,
    [WS, status, new Date(end - 30 * DAY).toISOString(), new Date(end).toISOString()]);
}
const createDraft = () => as('authenticated', EDITOR, (tx) =>
  tx.query(`insert into public.campaigns (workspace_id,name,created_by) values ($1,'x',$2)`, [WS, EDITOR]));
const writable = async () => (await q(`select private.ws_writable($1) w`, [WS]))[0].w;

await check('abonnement en cours : l’éditeur crée un brouillon', async () => { await subscribe('active', 10); return !(await denied(createDraft)) && (await writable()); });
await check('J+1 (grâce) : l’éditeur écrit encore', async () => { await subscribe('active', -1); return !(await denied(createDraft)) && (await writable()); });
await check('J+5 : écriture directe REFUSÉE par la base, sans que workspaces.status ait changé', async () => {
  await subscribe('active', -5);
  const stored = (await q(`select status from public.workspaces where id=$1`, [WS]))[0].status;
  return stored === 'active' && (await denied(createDraft)) && !(await writable());
});
await check('essai terminé : écriture refusée tout de suite, sans grâce', async () => { await subscribe('trialing', -0.01); return (await denied(createDraft)) && !(await writable()); });
await check('renouvellement : une nouvelle période rouvre l’écriture', async () => { await subscribe('active', 30); return !(await denied(createDraft)) && (await writable()); });
await check('suspendu par l’administration : refusé même avec un abonnement en cours', async () => {
  await db.query(`update public.workspaces set status='suspended' where id=$1`, [WS]);
  const refused = (await denied(createDraft)) && !(await writable());
  await db.query(`update public.workspaces set status='active' where id=$1`, [WS]);
  return refused;
});
await check('sans abonnement : actif (l’essai démarre en S24)', async () => {
  await db.query(`delete from public.subscriptions where workspace_id=$1`, [WS]);
  return !(await denied(createDraft)) && (await writable());
});
await check('espace inconnu : jamais modifiable', async () =>
  (await q(`select private.ws_writable('99999999-9999-4999-8999-999999999999') w`))[0].w === false);
await check('un client ne peut pas appeler la règle directement (schéma private)', async () =>
  (await as('authenticated', EDITOR, (tx) => tx.query(`select private.ws_access($1)`, [WS])).then(() => false, (e) => /permission denied/i.test(e.message))));

for (const r of results) console.log(r);
console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);

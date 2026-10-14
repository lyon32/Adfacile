// Tests de la migration 0006 (connexion Meta, S11) — PGlite.
// Usage : node supabase/tests/meta-connection.test.mjs <dossier contenant node_modules/@electric-sql/pglite>
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
async function as(role, sub, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`,
      [sub ?? '', JSON.stringify({ sub, aal: 'aal1' })]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}
async function denied(fn) { try { await fn(); return false; } catch (e) { return /permission denied|violates row-level|42501/i.test(e.message); } }
async function fails(fn, re) { try { await fn(); return false; } catch (e) { return re.test(e.message); } }
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const svc = (sql, p = []) => as('service_role', null, async (tx) => (await tx.query(sql, p)).rows);

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,'awa@test.cm',null),($2,'bob@test.cm',null)`, [A, B]);
const WA = (await q(`select id from public.workspaces where owner_id=$1`, [A]))[0].id;
const WB = (await q(`select id from public.workspaces where owner_id=$1`, [B]))[0].id;

const SEALED = 'v1.k1.aXZpdml2aXZpdml2.Y2lwaGVydGV4dA.dGFndGFndGFndGFndGFndA';
const SEALED2 = 'v1.k2.aXZpdml2aXZpdml2.bmV3Y2lwaGVy.dGFndGFndGFndGFndGFndA';
const upsert = (ws, sealed, keyId, exp = '2026-12-01T00:00:00Z') =>
  svc(`select public.upsert_meta_connection($1,'user',$2,$3,$4) as id`, [ws, sealed, keyId, exp]);

let conn;
await check('M2 : la connexion et son jeton scellé sont écrits ensemble', async () => {
  [{ id: conn }] = await upsert(WA, SEALED, 'k1');
  const [c] = await q(`select status, token_type from public.meta_connections where id=$1`, [conn]);
  const [t] = await q(`select sealed, key_id from private.meta_tokens where connection_id=$1`, [conn]);
  return c.status === 'ok' && c.token_type === 'user' && t.sealed === SEALED && t.key_id === 'k1';
});
await check('M2 : une reconnexion garde la même connexion, remplace le jeton et remet le statut à ok', async () => {
  await q(`update public.meta_connections set status='expired', last_health_check='{"x":1}' where id=$1`, [conn]);
  const [{ id }] = await upsert(WA, SEALED2, 'k2');
  const [c] = await q(`select status, last_health_check from public.meta_connections where id=$1`, [conn]);
  const [t] = await q(`select sealed, key_id from private.meta_tokens where connection_id=$1`, [conn]);
  return id === conn && c.status === 'ok' && c.last_health_check === null && t.key_id === 'k2' && t.sealed === SEALED2
    && (await q(`select count(*)::int n from public.meta_connections where workspace_id=$1`, [WA]))[0].n === 1;
});
await check('M2 : un jeton qui n’a pas le format scellé est refusé par la base', () =>
  fails(() => upsert(WA, 'jeton-en-clair', 'k1'), /meta_tokens_sealed_check|check constraint/));
await check('M2 : espace inconnu refusé (P0002)', () =>
  fails(() => upsert('99999999-9999-4999-8999-999999999999', SEALED, 'k1'), /Espace introuvable/));

await check('M3 : le jeton se lit avec l’espace de la connexion', async () => {
  const [t] = await svc(`select * from public.get_meta_token($1,$2)`, [WA, conn]);
  return t.sealed === SEALED2 && t.key_id === 'k2';
});
await check('M3 / EC cloisonnement : un autre espace ne lit pas ce jeton', async () =>
  (await svc(`select * from public.get_meta_token($1,$2)`, [WB, conn])).length === 0);
await check('Le jeton n’est lisible ni par un membre ni par anon (table et fonctions)', async () => {
  for (const sql of [`select * from private.meta_tokens`, `select * from public.get_meta_token('${WA}','${conn}')`,
    `select public.upsert_meta_connection('${WA}','user','${SEALED}','k1')`]) {
    if (!(await denied(() => as('authenticated', A, (tx) => tx.query(sql))))) return false;
    if (!(await denied(() => as('anon', null, (tx) => tx.query(sql))))) return false;
  }
  return true;
});
await check('Un membre lit sa connexion (sans jeton) et pas celle d’un autre espace', async () => {
  await upsert(WB, SEALED, 'k1');
  const r = await as('authenticated', A, async (tx) => (await tx.query(`select id from public.meta_connections`)).rows);
  return r.length === 1 && r[0].id === conn;
});

// --- Pages : limite et verrou ------------------------------------------------
const pg = [];
for (const [i, name] of ['Une', 'Deux', 'Trois'].entries()) {
  const [p] = await q(`insert into public.pages (workspace_id, meta_page_id, name) values ($1,$2,$3) returning id`, [WA, `20000000000${i}`, name]);
  pg.push(p.id);
}
const setPage = (page, want, max, period = null) =>
  svc(`select public.set_page_active($1,$2,$3,$4,$5) as r`, [WA, page, want, max, period]).then((r) => r[0].r);
await check('M4 : active une Page dans la limite de la formule', async () => (await setPage(pg[0], true, 1)) === 'ok'
  && (await q(`select active from public.pages where id=$1`, [pg[0]]))[0].active === true);
await check('M4 / TR-PLA-08 : au-delà de la limite → « limit », rien n’est activé', async () =>
  (await setPage(pg[1], true, 1)) === 'limit' && (await q(`select active from public.pages where id=$1`, [pg[1]]))[0].active === false);
await check('M4 : réactiver une Page déjà active est sans effet (ok)', async () => (await setPage(pg[0], true, 1)) === 'ok');
await check('M4 : la limite de 3 permet 3 Pages, pas 4', async () => {
  const [p4] = await q(`insert into public.pages (workspace_id, meta_page_id, name) values ($1,'200000000009','Quatre') returning id`, [WA]);
  return (await setPage(pg[1], true, 3)) === 'ok' && (await setPage(pg[2], true, 3)) === 'ok' && (await setPage(p4.id, true, 3)) === 'limit';
});
const P0 = '2026-10-01T00:00:00Z';
await check('M4 / APPFLOW §6.2 : Page verrouillée (campagne lancée dans la période) → « locked »', async () => {
  await q(`insert into public.page_activations (workspace_id, page_id, period_start, first_campaign_at) values ($1,$2,$3,'2026-10-05T10:00:00Z')`, [WA, pg[0], P0]);
  return (await setPage(pg[0], false, 3, P0)) === 'locked'
    && (await q(`select active from public.pages where id=$1`, [pg[0]]))[0].active === true;
});
await check('M4 : le verrou ne vaut que pour la période en cours', async () =>
  (await setPage(pg[0], false, 3, '2026-11-01T00:00:00Z')) === 'ok');
await check('M4 : une Page sans campagne se désactive librement', async () => (await setPage(pg[1], false, 3, P0)) === 'ok');
await check('M4 : une Page d’un autre espace est introuvable (P0002)', () =>
  fails(() => svc(`select public.set_page_active($1,$2,true,3,null)`, [WB, pg[2]]), /Page introuvable/));

// --- Comptes publicitaires ---------------------------------------------------
const ad = [];
for (const [i, name] of ['Compte 1', 'Compte 2'].entries()) {
  const [a] = await q(`insert into public.ad_accounts (workspace_id, meta_connection_id, meta_ad_account_id, name) values ($1,$2,$3,$4) returning id`,
    [WA, conn, `act_10000000000${i}`, name]);
  ad.push(a.id);
}
await check('M5 : choisir un compte publicitaire le rend actif', async () => {
  await svc(`select public.set_active_ad_account($1,$2)`, [WA, ad[0]]);
  return (await q(`select id from public.ad_accounts where workspace_id=$1 and is_active`, [WA])).map((r) => r.id).join() === ad[0];
});
await check('M5 : un seul compte actif — le choix d’un autre désactive le premier', async () => {
  await svc(`select public.set_active_ad_account($1,$2)`, [WA, ad[1]]);
  return (await q(`select id from public.ad_accounts where workspace_id=$1 and is_active`, [WA])).map((r) => r.id).join() === ad[1];
});
await check('M5 : la base refuse deux comptes actifs dans le même espace', () =>
  fails(() => q(`update public.ad_accounts set is_active = true where id=$1`, [ad[0]]), /ad_accounts_one_active|unique/));
await check('M5 : un compte d’un autre espace est introuvable', () =>
  fails(() => svc(`select public.set_active_ad_account($1,$2)`, [WB, ad[0]]), /Compte publicitaire introuvable/));

for (const call of [`select public.set_page_active('${WA}','${pg[0]}',true,3,null)`, `select public.set_active_ad_account('${WA}','${ad[0]}')`]) {
  await check(`Interdit à un membre et à anon : ${call.slice(0, 48)}…`, async () =>
    (await denied(() => as('authenticated', A, (tx) => tx.query(call)))) && (await denied(() => as('anon', null, (tx) => tx.query(call)))));
}
await check('TR-SEC-01 : un membre ne voit pas les Pages d’un autre espace', async () =>
  (await as('authenticated', B, async (tx) => (await tx.query(`select id from public.pages`)).rows)).length === 0);
await check('RLS activée sur 100 % des tables après 0006', async () =>
  (await db.query(`select count(*)::int n from pg_tables where schemaname in ('public','private','audit') and not rowsecurity`)).rows[0].n === 0);
await check('Toutes les fonctions SECURITY DEFINER ont un search_path figé après 0006', async () =>
  (await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname in ('public','private') and p.prosecdef
            and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')`)).rows[0].n === 0);

console.log(results.join('\n'));
console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);

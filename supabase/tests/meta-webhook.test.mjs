// Tests de la migration 0007 (webhook Meta, TR-SEC-04, EC-META-09) — PGlite.
// Usage : node supabase/tests/meta-webhook.test.mjs <dossier contenant node_modules/@electric-sql/pglite>
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
async function as(role, fn) { return db.transaction(async (tx) => { await tx.exec(`set local role ${role}`); return fn(tx); }); }
async function denied(fn) { try { await fn(); return false; } catch (e) { return /permission denied|42501/i.test(e.message); } }
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const record = (id, events) => as('service_role', async (tx) => (await tx.query('select public.record_meta_webhook($1,$2::jsonb) as n', [id, JSON.stringify(events)])).rows[0].n);

const U = '11111111-1111-4111-8111-111111111111';
await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,'awa@test.cm',null)`, [U]);
const WS = (await q(`select id from public.workspaces where owner_id=$1`, [U]))[0].id;
const [{ id: CAMP }] = await q(`insert into public.campaigns (workspace_id, name, meta_campaign_id, meta_adset_id) values ($1,'Camp','600000000001','600000000002') returning id`, [WS]);
const [{ id: AD }] = await q(`insert into public.ads (workspace_id, campaign_id, meta_ad_id) values ($1,$2,'600000000003') returning id`, [WS, CAMP]);
const ev = (object_id, kind = 'with_issues') => ({ kind, object_id, payload: { level: 'AD', error_code: '1815' } });
const rows = () => q(`select status, source, campaign_id, ad_id from public.campaign_status_events order by id`);
const seen = (id) => q(`select 1 from private.webhook_events where provider='meta' and event_id=$1`, [id]);

await check('retrouve la campagne, l’ensemble de publicités et la publicité ; renvoie le nombre enregistré', async () => {
  const n = await record('e1', [ev('600000000001'), ev('600000000002', 'in_process'), ev('600000000003')]);
  const r = await rows();
  return n === 3 && r.length === 3 && r.every((x) => x.source === 'webhook' && x.campaign_id === CAMP)
    && r[0].ad_id === null && r[1].status === 'in_process' && r[2].ad_id === AD;
});
await check('TR-SEC-04 : le même événement deux fois → -1, rien n’est refait', async () => {
  const n = await record('e1', [ev('600000000001')]);
  return n === -1 && (await rows()).length === 3;
});
await check('EC-META-09 : objet inconnu ou identifiant invalide ignorés, l’événement est quand même marqué vu', async () => {
  const n = await record('e2', [ev('699999999999'), ev("1' or '1'='1"), { kind: 'with_issues', payload: {} }]);
  return n === 0 && (await seen('e2')).length === 1 && (await rows()).length === 3;
});
await check('atomicité : une écriture qui échoue annule aussi le marqueur « déjà vu »', async () => {
  let failed = false;
  try { await record('e3', [ev('600000000001'), { ...ev('600000000002'), kind: null }]); } catch { failed = true; }
  return failed && (await seen('e3')).length === 0 && (await rows()).length === 3;
});
await check('la relivraison d’un événement dont l’écriture avait échoué est traitée, une seule fois', async () => {
  const first = await record('e3', [ev('600000000001'), ev('600000000002')]);
  const second = await record('e3', [ev('600000000001'), ev('600000000002')]);
  return first === 2 && second === -1 && (await rows()).length === 5;
});
for (const call of [`select public.record_meta_webhook('x','[]'::jsonb)`]) {
  await check('Interdit à un client et à anon (fonction du serveur)', async () =>
    (await denied(() => as('authenticated', (tx) => tx.query(call)))) && (await denied(() => as('anon', (tx) => tx.query(call)))));
}
await check('Toutes les fonctions SECURITY DEFINER ont un search_path figé après 0007', async () =>
  (await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname in ('public','private') and p.prosecdef
            and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')`)).rows[0].n === 0);

console.log(results.join('\n'));
console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);

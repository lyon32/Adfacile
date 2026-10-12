// Tests de la migration 0004 (blocage de connexion, EC-AUTH-04, TR-SEC-14) — PGlite.
// Usage : node supabase/tests/login-attempts.test.mjs <dossier contenant node_modules/@electric-sql/pglite>
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
async function as(role, fn) {
  return db.transaction(async (tx) => { await tx.exec(`set local role ${role}`); return fn(tx); });
}
async function denied(fn) { try { await fn(); return false; } catch (e) { return /permission denied|42501/i.test(e.message); } }

const K1 = 'a'.repeat(64), K2 = 'b'.repeat(64), K3 = 'c'.repeat(64);
const T0 = new Date('2026-10-12T10:00:00Z');
const at = (min) => new Date(T0.getTime() + min * 60_000).toISOString();
const fail1 = (key, min) => as('service_role', async (tx) => (await tx.query(`select * from public.record_login_failure($1, $2)`, [key, at(min)])).rows[0]);
const status = (key, min) => as('service_role', async (tx) => (await tx.query(`select * from public.login_lock_status($1, $2)`, [key, at(min)])).rows[0]);

await check('TR-SEC-14 : 4 échecs ne bloquent pas', async () => {
  for (let i = 0; i < 4; i++) await fail1(K1, i);
  const s = await status(K1, 4);
  return s.locked === false && s.failures === 4;
});
await check('TR-SEC-14 / EC-AUTH-04 : le 5ᵉ échec bloque pour 15 minutes', async () => {
  const s = await fail1(K1, 4);
  return s.locked === true && s.retry_after_s === 900;
});
await check('TR-SEC-14 : la 6ᵉ tentative, 14 minutes plus tard, est encore refusée', async () => {
  const s = await status(K1, 18);
  return s.locked === true && s.retry_after_s === 60;
});
await check('TR-SEC-14 : acceptée 15 minutes après le 5ᵉ échec (horloge simulée)', async () =>
  (await status(K1, 19)).locked === false);
await check('EC-AUTH-04 : le blocage vaut pour ce couple e-mail + IP seulement', async () =>
  (await status(K2, 5)).locked === false);
await check('« 5 échecs d’affilée » : une connexion réussie efface les échecs', async () => {
  for (let i = 0; i < 4; i++) await fail1(K3, i);
  await as('service_role', (tx) => tx.query(`select public.clear_login_failures($1)`, [K3]));
  const s = await fail1(K3, 5);
  return s.locked === false && s.failures === 1;
});
await check('Des échecs étalés sur plus de 15 minutes ne bloquent pas', async () => {
  const k = 'd'.repeat(64);
  for (const m of [0, 5, 10, 16, 20]) await fail1(k, m);
  return (await status(k, 20)).locked === false;
});
await check('Clé refusée si ce n’est pas une empreinte SHA-256 (jamais l’e-mail en clair)', async () => {
  try { await fail1('awa@test.cm', 0); return false; } catch (e) { return /check constraint|login_failures_key_hash_check/.test(e.message); }
});
for (const call of [`select * from public.login_lock_status('${K1}')`, `select * from public.record_login_failure('${K1}')`,
  `select public.clear_login_failures('${K1}')`, `select * from private.login_failures`]) {
  await check(`Interdit à un client et à anon : ${call.slice(0, 50)}…`, async () =>
    (await denied(() => as('authenticated', (tx) => tx.query(call)))) && (await denied(() => as('anon', (tx) => tx.query(call)))));
}
await check('RLS activée sur 100 % des tables après 0004', async () =>
  (await db.query(`select count(*)::int n from pg_tables where schemaname in ('public','private','audit') and not rowsecurity`)).rows[0].n === 0);
await check('Toutes les fonctions SECURITY DEFINER ont un search_path figé après 0004', async () =>
  (await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname in ('public','private') and p.prosecdef
            and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')`)).rows[0].n === 0);

console.log(results.join('\n'));
console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);

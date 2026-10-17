// Tests de la migration 0013 (S15b) : fraîcheur et accès aux taux de change — PGlite.
// Usage : node supabase/tests/exchange-rates.test.mjs <dossier contenant node_modules/@electric-sql/pglite>
// Source des taux : ExchangeRate-API, accès ouvert (une mise à jour par jour, redistribution interdite).
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
for (const f of readdirSync(migDir)
  .filter((f) => f.endsWith('.sql') && !f.includes('storage'))
  .sort()) {
  await db.exec(readFileSync(join(migDir, f), 'utf8'));
}

let pass = 0,
  fail = 0;
const results = [];
async function check(name, fn) {
  try {
    const ok = await fn();
    ok ? pass++ : fail++;
    results.push(`${ok ? '✓' : '✗'} ${name}`);
  } catch (e) {
    fail++;
    results.push(`✗ ${name} — exception inattendue : ${e.message}`);
  }
}
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
async function rejects(fn, pattern) {
  try {
    await fn();
    return false;
  } catch (e) {
    return pattern.test(e.message);
  }
}

const AT = '2026-10-17T00:02:32Z';
const insertRate = (quote, rate, providerAt) =>
  db.query(
    `insert into public.exchange_rates (quote, rate, source, provider_updated_at) values ($1, $2, 'exchangerate-api', $3)`,
    [quote, rate, providerAt],
  );

await check('les colonnes provider_updated_at et next_update_at existent', async () => {
  const cols = await q(`select column_name from information_schema.columns where table_name='exchange_rates'`);
  const names = cols.map((c) => c.column_name);
  return names.includes('provider_updated_at') && names.includes('next_update_at');
});

await check('un taux n’est écrit qu’une fois par publication du fournisseur (même monnaie, même heure)', async () => {
  await insertRate('NGN', 1332.4321, AT);
  return rejects(() => insertRate('NGN', 1332.4321, AT), /duplicate key|unique/i);
});

await check('une autre monnaie à la même heure, ou la même monnaie à une autre heure, passe', async () => {
  await insertRate('TND', 2.9942, AT);
  await insertRate('NGN', 1333, '2026-10-18T00:10:00Z');
  return true;
});

await check('les taux saisis à la main (sans heure du fournisseur) peuvent se répéter', async () => {
  await db.query(`insert into public.exchange_rates (quote, rate, source) values ('XAF', 600, 'manual')`);
  await db.query(`insert into public.exchange_rates (quote, rate, source) values ('XAF', 601, 'manual')`);
  return true;
});

await check('les connectés ne lisent plus la table des taux (redistribution interdite par le fournisseur)', async () => {
  const U = '33333333-3333-4333-8333-333333333333';
  await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,'ada@test.ng',null)`, [U]);
  return rejects(
    () =>
      db.transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [U]);
        await tx.exec('set local role authenticated');
        await tx.query('select * from public.exchange_rates');
      }),
    /permission denied/i,
  );
});

await check('le service lit toujours la table des taux', async () => {
  const rows = await db.transaction(async (tx) => {
    await tx.exec('set local role service_role');
    return (await tx.query('select count(*)::int as n from public.exchange_rates')).rows;
  });
  return rows[0].n >= 1;
});

console.log(results.join('\n'));
console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);

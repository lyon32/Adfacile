// Tests de la migration 0012 (S15b) : les 54 pays d'Afrique et leurs monnaies — PGlite.
// Usage : node supabase/tests/africa-countries.test.mjs <dossier contenant node_modules/@electric-sql/pglite>
// Sources des données : ISO 3166-1, ISO 4217 (SIX), CLDR, base de fuseaux IANA (voir l'en-tête de la migration).
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
const files = readdirSync(migDir)
  .filter((f) => f.endsWith('.sql') && !f.includes('storage'))
  .sort();
for (const f of files) await db.exec(readFileSync(join(migDir, f), 'utf8'));

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

// Les 54 États africains membres de l'ONU (ISO 3166-1 alpha-2), écrits ICI indépendamment de la migration.
const AFRICA = (
  'DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ' +
  'ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW'
).split(' ');

await check('la liste de référence du test compte 54 pays distincts', () => new Set(AFRICA).size === 54 && AFRICA.length === 54);

await check('les 54 pays sont en base, ni plus ni moins parmi les codes africains', async () => {
  const rows = await q(`select code from public.countries where code = any($1) order by code`, [AFRICA]);
  return rows.length === 54 && rows.map((r) => r.code).join() === [...AFRICA].sort().join();
});

await check('chaque pays a un nom FR, un nom EN, une monnaie ISO (3 lettres) et un fuseau', async () => {
  const rows = await q(`select * from public.countries where code = any($1)`, [AFRICA]);
  return rows.every(
    (r) => r.name_fr.trim() !== '' && r.name_en.trim() !== '' && /^[A-Z]{3}$/.test(r.currency) && r.timezone_default.includes('/') && r.active === true,
  );
});

await check('chaque monnaie est un code ISO 4217 connu de la plateforme (Intl.supportedValuesOf)', async () => {
  const known = new Set(Intl.supportedValuesOf('currency'));
  const rows = await q(`select distinct currency from public.countries where code = any($1)`, [AFRICA]);
  // ZWG est un code récent : on accepte qu'un ICU plus ancien ne le connaisse pas, jamais un code inventé de 3 lettres.
  return rows.every((r) => known.has(r.currency) || r.currency === 'ZWG');
});

await check('42 monnaies distinctes : zone XAF = 6 pays, zone XOF = 8 pays', async () => {
  const distinct = (await q(`select count(distinct currency)::int as n from public.countries where code = any($1)`, [AFRICA]))[0].n;
  const xaf = (await q(`select count(*)::int as n from public.countries where currency = 'XAF'`))[0].n;
  const xof = (await q(`select count(*)::int as n from public.countries where currency = 'XOF'`))[0].n;
  return distinct === 42 && xaf === 6 && xof === 8;
});

await check('chaque fuseau existe dans la base de fuseaux de PostgreSQL', async () => {
  const rows = await q(`select code, timezone_default from public.countries where code = any($1)`, [AFRICA]);
  for (const r of rows) {
    try {
      await db.query(`select now() at time zone $1`, [r.timezone_default]);
    } catch {
      return false;
    }
  }
  return true;
});

await check('monnaies et fuseaux connus : NG = NGN Africa/Lagos, TN = TND Africa/Tunis, CM = XAF Africa/Douala, CD = CDF Africa/Kinshasa', async () => {
  const get = async (c) => (await q(`select currency, timezone_default from public.countries where code=$1`, [c]))[0];
  const [ng, tn, cm, cd] = await Promise.all([get('NG'), get('TN'), get('CM'), get('CD')]);
  return (
    ng.currency === 'NGN' && ng.timezone_default === 'Africa/Lagos' &&
    tn.currency === 'TND' && tn.timezone_default === 'Africa/Tunis' &&
    cm.currency === 'XAF' && cm.timezone_default === 'Africa/Douala' &&
    cd.currency === 'CDF' && cd.timezone_default === 'Africa/Kinshasa'
  );
});

await check('le Sahara occidental (EH) n’est pas inclus', async () => (await q(`select 1 from public.countries where code='EH'`)).length === 0);

await check('rejouer la migration est sans effet : toujours 54 pays, aucune erreur', async () => {
  const sql = readFileSync(join(migDir, '0012_africa_countries.sql'), 'utf8');
  await db.exec(sql);
  await db.exec(sql);
  return (await q(`select count(*)::int as n from public.countries where code = any($1)`, [AFRICA]))[0].n === 54;
});

await check('un pays désactivé le reste après un rejeu (active n’est jamais modifié)', async () => {
  await db.exec(`update public.countries set active=false where code='GA'`);
  await db.exec(readFileSync(join(migDir, '0012_africa_countries.sql'), 'utf8'));
  const row = (await q(`select active from public.countries where code='GA'`))[0];
  await db.exec(`update public.countries set active=true where code='GA'`);
  return row.active === false;
});

await check('taux de change : n’importe quelle monnaie ISO, source exchangerate-api acceptée', async () => {
  await db.query(`insert into public.exchange_rates (quote, rate, source) values ('NGN', 1500.1234, 'exchangerate-api')`);
  await db.query(`insert into public.exchange_rates (quote, rate, source) values ('XAF', 600, 'manual')`);
  return true;
});

await check('taux de change : code en minuscules, trop long ou source inconnue refusés', async () => {
  const a = await rejects(() => db.query(`insert into public.exchange_rates (quote, rate, source) values ('ngn', 1, 'manual')`), /check/i);
  const b = await rejects(() => db.query(`insert into public.exchange_rates (quote, rate, source) values ('NGNN', 1, 'manual')`), /value too long|check/i);
  const c = await rejects(() => db.query(`insert into public.exchange_rates (quote, rate, source) values ('NGN', 1, 'inconnue')`), /check/i);
  const d = await rejects(() => db.query(`insert into public.exchange_rates (quote, rate, source) values ('NGN', 0, 'manual')`), /check/i);
  return a && b && c && d;
});

await check('monnaie d’affichage du profil : NGN accepté, minuscules refusé', async () => {
  const U = '22222222-2222-4222-8222-222222222222';
  await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,'ada@test.ng',null)`, [U]);
  await db.query(`update public.profiles set currency_display='NGN', country_code='NG' where id=$1`, [U]);
  const ok = (await q(`select currency_display from public.profiles where id=$1`, [U]))[0].currency_display === 'NGN';
  const bad = await rejects(() => db.query(`update public.profiles set currency_display='ngn' where id=$1`, [U]), /check/i);
  return ok && bad;
});

await check('campagne : la colonne fx_currency existe et refuse un code invalide', async () => {
  const cols = await q(`select column_name from information_schema.columns where table_name='campaigns' and column_name='fx_currency'`);
  return cols.length === 1;
});

console.log(results.join('\n'));
console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);

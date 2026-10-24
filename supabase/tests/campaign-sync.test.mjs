// Tests de la migration 0015 (S17) : synchronisation des statuts et des statistiques — PGlite.
// Usage : node supabase/tests/campaign-sync.test.mjs <dossier contenant node_modules/@electric-sql/pglite>
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
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
async function rejects(fn, pattern) { try { await fn(); return false; } catch (e) { return pattern.test(e.message); } }
async function as(role, sub, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}

const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,'awa@test.cm',null),($2,'koffi@test.cm',null)`, [U1, U2]);
const WS1 = (await q(`select id from public.workspaces where owner_id=$1`, [U1]))[0].id;
const WS2 = (await q(`select id from public.workspaces where owner_id=$1`, [U2]))[0].id;
const newCampaign = async (ws = WS1, user = U1) =>
  (await q(`insert into public.campaigns (workspace_id,name,created_by) values ($1,'Test',$2) returning id`, [ws, user]))[0].id;
const NOW = '2026-10-24T09:00:00Z';
const at = (min) => new Date(Date.parse(NOW) + min * 60000).toISOString();

await check('une campagne neuve n’a jamais été synchronisée ni actualisée', async () => {
  const id = await newCampaign();
  const [c] = await q(`select status_synced_at, stats_synced_at, stats_refresh_requested_at, stats_sync_error from public.campaigns where id=$1`, [id]);
  return c.status_synced_at === null && c.stats_synced_at === null && c.stats_refresh_requested_at === null && c.stats_sync_error === null;
});
for (const e of ['rate_limited', 'fx_not_available', 'meta_error', 'token_expired']) {
  await check(`raison d’échec « ${e} » acceptée`, async () => {
    const id = await newCampaign();
    await db.query(`update public.campaigns set stats_sync_error=$2 where id=$1`, [id, e]);
    return true;
  });
}
await check('raison d’échec inconnue refusée', async () => {
  const id = await newCampaign();
  return rejects(() => db.query(`update public.campaigns set stats_sync_error='panne' where id=$1`, [id]), /check|violates/i);
});

// --- TR-PLA-06 : « Actualiser » limité à une fois toutes les 5 minutes ---
const ask = async (ws, id, when) => (await q(`select public.request_stats_refresh($1,$2,$3::timestamptz) as ok`, [ws, id, when]))[0].ok;
await check('la première demande est acceptée', async () => ask(WS1, await newCampaign(), NOW));
await check('une deuxième demande moins de 5 minutes après est refusée', async () => {
  const id = await newCampaign();
  await ask(WS1, id, NOW);
  return (await ask(WS1, id, at(4.9))) === false;
});
await check('exactement 5 minutes après, la demande est acceptée', async () => {
  const id = await newCampaign();
  await ask(WS1, id, NOW);
  return (await ask(WS1, id, at(5))) === true;
});
await check('une demande refusée ne repousse pas la fenêtre', async () => {
  const id = await newCampaign();
  await ask(WS1, id, NOW); await ask(WS1, id, at(4));
  const [c] = await q(`select stats_refresh_requested_at t from public.campaigns where id=$1`, [id]);
  return new Date(c.t).getTime() === Date.parse(NOW);
});
await check('une campagne d’un autre espace n’est jamais touchée (filtre par espace)', async () => {
  const id = await newCampaign();
  return (await ask(WS2, id, NOW)) === false && (await q(`select stats_refresh_requested_at t from public.campaigns where id=$1`, [id]))[0].t === null;
});
await check('deux demandes simultanées : une seule passe', async () => {
  const id = await newCampaign();
  const r = await Promise.all([ask(WS1, id, NOW), ask(WS1, id, NOW)]);
  return r.filter(Boolean).length === 1;
});
await check('la fonction est réservée au serveur (pas aux connectés, pas aux anonymes)', async () => {
  const id = await newCampaign();
  const a = await rejects(() => as('authenticated', U1, (tx) => tx.query(`select public.request_stats_refresh($1,$2,$3::timestamptz)`, [WS1, id, NOW])), /permission denied/i);
  const b = await rejects(() => as('anon', U1, (tx) => tx.query(`select public.request_stats_refresh($1,$2,$3::timestamptz)`, [WS1, id, NOW])), /permission denied/i);
  return a && b;
});
await check('un membre ne peut pas écrire les colonnes de synchronisation', async () => {
  await newCampaign();
  return rejects(() => as('authenticated', U1, async (tx) => {
    const id = (await tx.query(`select id from public.campaigns limit 1`)).rows[0]?.id;
    await tx.query(`update public.campaigns set stats_synced_at=now(), stats_sync_error=null where id=$1`, [id]);
  }), /permission denied/i);
});

// --- La version (EC-TEAM-08) ne bouge que pour une vraie modification ----
const versionOf = async (id) => (await q(`select version v from public.campaigns where id=$1`, [id]))[0].v;
await check('écrire seulement les dates de synchronisation ne change pas la version', async () => {
  const id = await newCampaign();
  const before = await versionOf(id);
  await db.query(`update public.campaigns set status_synced_at=now(), stats_synced_at=now(), stats_sync_error='rate_limited' where id=$1`, [id]);
  await ask(WS1, id, NOW);
  return (await versionOf(id)) === before;
});
await check('une vraie modification (nom, statut) augmente toujours la version de 1', async () => {
  const id = await newCampaign();
  const before = await versionOf(id);
  await db.query(`update public.campaigns set name='Autre nom' where id=$1`, [id]);
  const mid = await versionOf(id);
  await db.query(`update public.campaigns set name='Autre nom 2', stats_synced_at=now() where id=$1`, [id]);
  return mid === before + 1 && (await versionOf(id)) === before + 2;
});

// --- Statistiques : une ligne par jour, lecture réservée aux membres -----
await check('stats_daily : un jour de campagne ne s’écrit qu’une fois', async () => {
  const id = await newCampaign();
  const ins = () => db.query(`insert into public.stats_daily (workspace_id,campaign_id,date,spend_usd_cents) values ($1,$2,'2026-10-23',500)`, [WS1, id]);
  await ins();
  return rejects(ins, /unique|duplicate/i);
});
await check('stats_daily : un membre lit les statistiques de SON espace, pas celles d’un autre', async () => {
  const id = await newCampaign();
  await db.query(`insert into public.stats_daily (workspace_id,campaign_id,date,spend_usd_cents) values ($1,$2,'2026-10-22',700)`, [WS1, id]);
  const own = await as('authenticated', U1, async (tx) => (await tx.query(`select 1 from public.stats_daily where campaign_id=$1`, [id])).rows);
  const other = await as('authenticated', U2, async (tx) => (await tx.query(`select 1 from public.stats_daily where campaign_id=$1`, [id])).rows);
  return own.length === 1 && other.length === 0;
});
await check('stats_daily : un membre ne peut pas écrire ses statistiques', async () => {
  const id = await newCampaign();
  return rejects(() => as('authenticated', U1, (tx) => tx.query(`insert into public.stats_daily (workspace_id,campaign_id,date) values ($1,$2,'2026-10-21')`, [WS1, id])), /permission denied|row-level|violates/i);
});
await check('l’historique d’une campagne n’est lisible que par les membres de son espace', async () => {
  const id = await newCampaign();
  await db.query(`insert into public.campaign_status_events (workspace_id,campaign_id,status,source) values ($1,$2,'active','poll')`, [WS1, id]);
  const own = await as('authenticated', U1, async (tx) => (await tx.query(`select 1 from public.campaign_status_events where campaign_id=$1`, [id])).rows);
  const other = await as('authenticated', U2, async (tx) => (await tx.query(`select 1 from public.campaign_status_events where campaign_id=$1`, [id])).rows);
  return own.length === 1 && other.length === 0;
});
await check('index créés : tableau de bord et historique', async () => {
  const names = (await q(`select indexname from pg_indexes where schemaname='public'`)).map((r) => r.indexname);
  return ['stats_daily_workspace_date_idx', 'campaign_status_events_campaign_idx', 'campaign_status_events_webhook_idx'].every((n) => names.includes(n));
});

for (const r of results) console.log(r);
console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);

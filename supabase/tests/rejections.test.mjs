// Tests de la migration 0018 (S18) : refus de Meta, rapport du Modérateur, mémoire des refus — PGlite.
// Usage : node supabase/tests/rejections.test.mjs <dossier contenant node_modules/@electric-sql/pglite>
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


const newAd = async (ws, campaign, variant = null) =>
  (await q(`insert into public.ads (workspace_id,campaign_id,variant) values ($1,$2,$3) returning id`, [ws, campaign, variant]))[0].id;
const reject = (ws, campaign, ad = null) =>
  db.query(`insert into public.rejections (workspace_id,campaign_id,ad_id,meta_reason) values ($1,$2,$3,'Refus de test')`, [ws, campaign, ad]);

await check('un refus neuf attend son explication (état « pending », aucune erreur)', async () => {
  const c = await newCampaign(); await reject(WS1, c);
  const [r] = await q(`select explain_status s, explain_error e, fixed_and_republished f, report from public.rejections where campaign_id=$1`, [c]);
  return r.s === 'pending' && r.e === null && r.f === false && r.report === null;
});
for (const s of ['pending', 'running', 'ready', 'failed']) {
  await check(`état d’explication « ${s} » accepté`, async () => {
    const c = await newCampaign(); await reject(WS1, c);
    await db.query(`update public.rejections set explain_status=$2 where campaign_id=$1`, [c, s]);
    return true;
  });
}
await check('état d’explication inconnu refusé', async () => {
  const c = await newCampaign(); await reject(WS1, c);
  return rejects(() => db.query(`update public.rejections set explain_status='autre' where campaign_id=$1`, [c]), /check|violates/i);
});

// --- Un seul refus ouvert par publicité (le même refus lu deux fois n'écrit qu'une ligne) ---
await check('EC-META-06 : deux publicités refusées séparément ont chacune leur refus', async () => {
  const c = await newCampaign(); const a = await newAd(WS1, c, 'A'); const b = await newAd(WS1, c, 'B');
  await reject(WS1, c, a); await reject(WS1, c, b);
  return (await q(`select count(*)::int n from public.rejections where campaign_id=$1`, [c]))[0].n === 2;
});
await check('un deuxième refus ouvert pour la même publicité est refusé (idempotence)', async () => {
  const c = await newCampaign(); const a = await newAd(WS1, c, 'A');
  await reject(WS1, c, a);
  return rejects(() => reject(WS1, c, a), /unique|duplicate/i);
});
await check('un deuxième refus ouvert pour la campagne entière (sans publicité) est refusé', async () => {
  const c = await newCampaign(); await reject(WS1, c);
  return rejects(() => reject(WS1, c), /unique|duplicate/i);
});
await check('après correction et republication, un nouveau refus de la même publicité peut être enregistré', async () => {
  const c = await newCampaign(); const a = await newAd(WS1, c);
  await reject(WS1, c, a);
  await db.query(`update public.rejections set fixed_and_republished=true where campaign_id=$1`, [c]);
  await reject(WS1, c, a);
  return (await q(`select count(*)::int n from public.rejections where campaign_id=$1`, [c]))[0].n === 2;
});

// --- RLS : lecture réservée aux membres de l'espace, aucune écriture par un membre ---
await check('un membre lit les refus de SON espace, pas ceux d’un autre', async () => {
  const c1 = await newCampaign(WS1, U1); const c2 = await newCampaign(WS2, U2);
  await reject(WS1, c1); await reject(WS2, c2);
  const mine = await as('authenticated', U1, (tx) => tx.query(`select campaign_id from public.rejections`));
  return mine.rows.some((r) => r.campaign_id === c1) && !mine.rows.some((r) => r.campaign_id === c2);
});
await check('un membre ne peut pas écrire un refus ni modifier son rapport', async () => {
  const c = await newCampaign(); await reject(WS1, c);
  const a = await rejects(() => as('authenticated', U1, (tx) => tx.query(`insert into public.rejections (workspace_id,campaign_id) values ($1,$2)`, [WS1, c])), /permission denied|row-level/i);
  const b = await as('authenticated', U1, (tx) => tx.query(`update public.rejections set report='{}'::jsonb where campaign_id=$1`, [c])).then(
    (r) => r.affectedRows === 0, (e) => /permission denied/i.test(e.message));
  return a && b;
});
await check('un visiteur anonyme ne lit aucun refus', async () => {
  const c = await newCampaign(); await reject(WS1, c);
  return rejects(() => as('anon', U1, (tx) => tx.query(`select * from public.rejections`)), /permission denied/i);
});

// --- Mémoire des refus (anonyme, compteur par motif) ---
const remember = async (pattern, when = NOW) =>
  (await q(`select public.record_rejection_pattern($1,$2::timestamptz) as n`, [pattern, when]))[0].n;
await check('un motif neuf vaut 1, puis le compteur augmente', async () => {
  const a = await remember('promesse chiffrée de perte de poids');
  const b = await remember('promesse chiffrée de perte de poids', at(5));
  return a === 1 && b === 2;
});
await check('le motif est comparé sans tenir compte de la casse ni des espaces autour', async () => {
  await remember('Question directe sur un problème de peau');
  return (await remember('  question directe sur un problème de peau ')) === 2;
});
await check('la mémoire garde la date du dernier refus', async () => {
  await remember('motif daté'); await remember('motif daté', at(30));
  const [m] = await q(`select last_seen t from private.rejection_memory where pattern='motif daté'`);
  return new Date(m.t).getTime() === Date.parse(at(30));
});
await check('un motif vide ou trop long est refusé', async () => {
  const a = await rejects(() => remember('   '), /motif invalide/i);
  const b = await rejects(() => remember('x'.repeat(201)), /motif invalide/i);
  return a && b;
});
await check('la mémoire des refus ne contient aucun espace ni campagne (anonyme)', async () => {
  const cols = (await q(`select column_name from information_schema.columns where table_schema='private' and table_name='rejection_memory'`)).map((c) => c.column_name).sort();
  return cols.join() === 'count,last_seen,pattern,rule_id';
});
await check('la fonction de mémoire est réservée au serveur (pas aux connectés, pas aux anonymes)', async () => {
  const a = await rejects(() => as('authenticated', U1, (tx) => tx.query(`select public.record_rejection_pattern('x', now())`)), /permission denied/i);
  const b = await rejects(() => as('anon', U1, (tx) => tx.query(`select public.record_rejection_pattern('x', now())`)), /permission denied/i);
  return a && b;
});

// --- Migration 0019 : horodatage de la prise d'une explication ---
await check('0019 : un refus neuf n’a pas de date de prise ; elle peut être écrite', async () => {
  const c = await newCampaign(); await reject(WS1, c);
  const [r] = await q(`select explain_started_at t from public.rejections where campaign_id=$1`, [c]);
  await db.query(`update public.rejections set explain_status='running', explain_started_at=$2 where campaign_id=$1`, [c, NOW]);
  const [after] = await q(`select explain_started_at t from public.rejections where campaign_id=$1`, [c]);
  return r.t === null && new Date(after.t).getTime() === Date.parse(NOW);
});
await check('0019 : un membre ne peut pas écrire la date de prise', async () => {
  const c = await newCampaign(); await reject(WS1, c);
  return as('authenticated', U1, (tx) => tx.query(`update public.rejections set explain_started_at=now() where campaign_id=$1`, [c])).then(
    (r) => r.affectedRows === 0, (e) => /permission denied/i.test(e.message));
});

for (const r of results) console.log(r);
console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);

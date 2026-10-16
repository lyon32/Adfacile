// Tests de la migration 0010 (S15) : garde des statuts de campagne, bornes, propositions — PGlite.
// Usage : node supabase/tests/campaign-drafts.test.mjs <dossier contenant node_modules/@electric-sql/pglite>
// La table des transitions est lue dans le code de `core` (campaign-state.ts) : la garde SQL et la fonction pure
// doivent autoriser EXACTEMENT les mêmes paires (de, vers), sur les 81 paires possibles.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(resolve(process.argv[2] ?? here), 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const machine = await import(
  pathToFileURL(join(here, '..', '..', 'packages', 'core', 'src', 'campaigns', 'campaign-state.ts')).href
);

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

const U = '11111111-1111-4111-8111-111111111111';
await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,'awa@test.cm',null)`, [U]);
const WS = (await q(`select id from public.workspaces where owner_id=$1`, [U]))[0].id;
const newCampaign = async () =>
  (await q(`insert into public.campaigns (workspace_id,name,created_by) values ($1,'Test',$2) returning id`, [WS, U]))[0].id;

/** Place une campagne dans un état donné sans passer par la garde (réplica = déclencheurs coupés). */
async function campaignIn(status) {
  const id = await newCampaign();
  await db.exec(`set session_replication_role = replica`);
  await db.query(`update public.campaigns set status=$2 where id=$1`, [id, status]);
  await db.exec(`set session_replication_role = origin`);
  return id;
}

// --- Garde des statuts : les 81 paires ---------------------------------
for (const from of machine.CAMPAIGN_STATUSES) {
  for (const to of machine.CAMPAIGN_STATUSES) {
    const allowed = machine.canTransition(from, to);
    await check(`garde SQL ${from} → ${to} : ${allowed ? 'autorisé' : 'interdit'} (comme campaign-state.ts)`, async () => {
      const id = await campaignIn(from);
      try {
        await db.query(`update public.campaigns set status=$2 where id=$1`, [id, to]);
        return allowed || from === to;
      } catch (e) {
        return !allowed && from !== to && /Transition de campagne interdite/.test(e.message);
      }
    });
  }
}
await check('une campagne ne peut être créée qu’en brouillon (même par le service)', () =>
  rejects(() => db.query(`insert into public.campaigns (workspace_id,name,status) values ($1,'x','active')`, [WS]), /créée en brouillon/));
await check('un changement qui ne touche pas au statut n’est pas bloqué par la garde', async () => {
  const id = await campaignIn('active');
  await db.query(`update public.campaigns set name='Nouveau nom' where id=$1`, [id]);
  return (await q('select name from public.campaigns where id=$1', [id]))[0].name === 'Nouveau nom';
});

// --- Version, bornes ----------------------------------------------------
await check('chaque modification augmente la version de 1 (EC-TEAM-08)', async () => {
  const id = await newCampaign();
  await db.query(`update public.campaigns set name='A' where id=$1`, [id]);
  await db.query(`update public.campaigns set name='B' where id=$1`, [id]);
  return (await q('select version from public.campaigns where id=$1', [id]))[0].version === 3;
});
await check('une mise à jour conditionnelle sur une version périmée ne touche aucune ligne', async () => {
  const id = await newCampaign();
  await db.query(`update public.campaigns set name='A' where id=$1`, [id]);
  const stale = await db.query(`update public.campaigns set name='B' where id=$1 and version=$2`, [id, 1]);
  return stale.affectedRows === 0;
});
await check('budget quotidien : 99 centimes refusés, 100 acceptés, 1 000 000 acceptés, 1 000 001 refusés', async () => {
  const id = await newCampaign();
  const set = (v) => db.query(`update public.campaigns set daily_budget_usd_cents=$2 where id=$1`, [id, v]);
  return (await rejects(() => set(99), /check|violates/i)) && (await set(100), true) &&
    (await set(1000000), true) && (await rejects(() => set(1000001), /check|violates/i));
});
await check('durée (0011) : 365 jours début et fin compris acceptés (écart 364), 366 refusés (écart 365) ; fin = début et fin avant début refusés', async () => {
  const id = await newCampaign();
  const set = (s, e) => db.query(`update public.campaigns set start_date=$2, end_date=$3 where id=$1`, [id, s, e]);
  return (await set('2026-01-01', '2026-12-31'), true) && (await rejects(() => set('2026-01-01', '2027-01-01'), /check|violates/i)) &&
    (await rejects(() => set('2026-01-10', '2026-01-10'), /check|violates/i)) &&
    (await rejects(() => set('2026-01-10', '2026-01-09'), /check|violates/i)) && (await set('2026-01-10', '2026-01-11'), true);
});

// --- Propositions ------------------------------------------------------
await check('une proposition prête ne peut pas être vide', async () => {
  const id = await newCampaign();
  return rejects(() => db.query(`insert into public.campaign_proposals (workspace_id,campaign_id,version,proposal,status) values ($1,$2,1,'{}','ready')`, [WS, id]), /check|violates/i);
});
await check('une proposition « generating » peut être vide', async () => {
  const id = await newCampaign();
  await db.query(`insert into public.campaign_proposals (workspace_id,campaign_id,version,proposal,status) values ($1,$2,1,'{}','generating')`, [WS, id]);
  return true;
});
await check('la même clé d’idempotence ne crée qu’une génération par campagne (même clé, autre campagne : permis)', async () => {
  const a = await newCampaign(), b = await newCampaign();
  const key = '99999999-9999-4999-8999-999999999999';
  const ins = (c, v) => db.query(`insert into public.campaign_proposals (workspace_id,campaign_id,version,proposal,status,idempotency_key) values ($1,$2,$3,'{"a":1}','ready',$4)`, [WS, c, v, key]);
  await ins(a, 1);
  const dup = await rejects(() => ins(a, 2), /unique|duplicate/i);
  await ins(b, 1);
  return dup;
});
await check('deux propositions ne reçoivent jamais le même numéro de version', async () => {
  const id = await newCampaign();
  const ins = (v) => db.query(`insert into public.campaign_proposals (workspace_id,campaign_id,version,proposal) values ($1,$2,$3,'{"a":1}')`, [WS, id, v]);
  await ins(1);
  return rejects(() => ins(1), /unique|duplicate/i);
});
await check('au plus une proposition retenue par campagne', async () => {
  const id = await newCampaign();
  const ins = (v) => db.query(`insert into public.campaign_proposals (workspace_id,campaign_id,version,proposal,chosen) values ($1,$2,$3,'{"a":1}',true)`, [WS, id, v]);
  await ins(1);
  return rejects(() => ins(2), /unique|duplicate/i);
});
await check('un client ne peut pas écrire une proposition (lecture seule, RLS)', async () => {
  const id = await newCampaign();
  return rejects(() => as('authenticated', U, (tx) =>
    tx.query(`insert into public.campaign_proposals (workspace_id,campaign_id,version,proposal) values ($1,$2,9,'{"a":1}')`, [WS, id])), /permission denied|violates row-level/i);
});
await check('un membre lit les propositions de son espace', async () => {
  const id = await newCampaign();
  await db.query(`insert into public.campaign_proposals (workspace_id,campaign_id,version,proposal) values ($1,$2,1,'{"a":1}')`, [WS, id]);
  const rows = await as('authenticated', U, async (tx) => (await tx.query('select version from public.campaign_proposals where campaign_id=$1', [id])).rows);
  return rows.length === 1;
});
await check('un client ne peut pas modifier le statut ni les colonnes réservées au serveur', async () => {
  const id = await newCampaign();
  const a = await rejects(() => as('authenticated', U, (tx) => tx.query(`update public.campaigns set status='active' where id=$1`, [id])), /permission denied/i);
  const b = await rejects(() => as('authenticated', U, (tx) => tx.query(`update public.campaigns set optimization_goal='REACH' where id=$1`, [id])), /permission denied/i);
  return a && b;
});

console.log(results.join('\n'));
console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);

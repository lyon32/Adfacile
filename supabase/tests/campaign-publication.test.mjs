// Tests de la migration 0014 (S16) : colonnes de publication, clause de responsabilité, index uniques — PGlite.
// Usage : node supabase/tests/campaign-publication.test.mjs <dossier contenant node_modules/@electric-sql/pglite>
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

// --- Valeurs par défaut --------------------------------------------------
await check('une campagne neuve n’a ni référence, ni phase de publication, ni quota', async () => {
  const id = await newCampaign();
  const [c] = await q(`select publish_ref, publish_attempt, publish_phase, quota_state, publish_error, paused_at, publish_idempotency_key from public.campaigns where id=$1`, [id]);
  return c.publish_ref === null && c.publish_attempt === 0 && c.publish_phase === 'none' && c.quota_state === 'none'
    && c.publish_error === null && c.paused_at === null && c.publish_idempotency_key === null;
});

// --- Contraintes de la référence de publication -------------------------
for (const ref of ['pk-1a2b3c4d-1', 'pk-00000000-12', 'pk-abcdef12-9999']) {
  await check(`référence valide acceptée : ${ref}`, async () => {
    const id = await newCampaign();
    await db.query(`update public.campaigns set publish_ref=$2 where id=$1`, [id, ref]);
    return (await q(`select publish_ref from public.campaigns where id=$1`, [id]))[0].publish_ref === ref;
  });
}
for (const ref of ['', 'PK-1a2b3c4d-1', 'pk-1a2b3c4-1', 'pk-1a2b3c4d-', 'pk-1a2b3c4d-12345', 'pk-1a2b3c4g-1', "pk-1a2b3c4d-1' or 1=1"]) {
  await check(`référence invalide refusée : « ${ref} »`, async () => {
    const id = await newCampaign();
    return rejects(() => db.query(`update public.campaigns set publish_ref=$2 where id=$1`, [id, ref]), /check|violates/i);
  });
}
await check('deux campagnes ne partagent pas la même référence (rapprochement non ambigu)', async () => {
  const a = await newCampaign(); const b = await newCampaign();
  await db.query(`update public.campaigns set publish_ref='pk-deadbeef-1' where id=$1`, [a]);
  return rejects(() => db.query(`update public.campaigns set publish_ref='pk-deadbeef-1' where id=$1`, [b]), /unique|duplicate/i);
});

// --- Phase et état du quota ---------------------------------------------
for (const phase of ['none', 'creating', 'created', 'activating', 'done']) {
  await check(`phase de publication « ${phase} » acceptée`, async () => {
    const id = await newCampaign();
    await db.query(`update public.campaigns set publish_phase=$2 where id=$1`, [id, phase]);
    return true;
  });
}
await check('phase inconnue refusée', async () => {
  const id = await newCampaign();
  return rejects(() => db.query(`update public.campaigns set publish_phase='fini' where id=$1`, [id]), /check|violates/i);
});
for (const state of ['none', 'held', 'counted', 'released']) {
  await check(`état du quota « ${state} » accepté`, async () => {
    const id = await newCampaign();
    await db.query(`update public.campaigns set quota_state=$2 where id=$1`, [id, state]);
    return true;
  });
}
await check('état du quota inconnu refusé', async () => {
  const id = await newCampaign();
  return rejects(() => db.query(`update public.campaigns set quota_state='offert' where id=$1`, [id]), /check|violates/i);
});
await check('le numéro de tentative ne peut pas être négatif', async () => {
  const id = await newCampaign();
  return rejects(() => db.query(`update public.campaigns set publish_attempt=-1 where id=$1`, [id]), /check|violates/i);
});

// --- Un membre ne peut pas écrire les colonnes de publication -----------
await check('un membre ne peut pas se donner une référence de publication (écriture serveur seulement)', async () =>
  rejects(() => as('authenticated', U1, async (tx) => {
    const id = (await tx.query(`select id from public.campaigns limit 1`)).rows[0]?.id ?? (await newCampaign());
    await tx.query(`update public.campaigns set publish_ref='pk-aaaaaaaa-1' where id=$1`, [id]);
    await tx.query(`select 1`);
  }), /permission denied|violates|row-level/i));
await check('un membre ne peut pas effacer le quota ou la phase', async () =>
  rejects(() => as('authenticated', U1, async (tx) => {
    const id = (await tx.query(`select id from public.campaigns limit 1`)).rows[0]?.id;
    await tx.query(`update public.campaigns set quota_state='released', publish_phase='done' where id=$1`, [id]);
  }), /permission denied/i));

// --- Table ads : une publicité Meta par campagne ------------------------
await check('la même publicité Meta ne s’enregistre pas deux fois pour une campagne (tâche rejouée)', async () => {
  const id = await newCampaign();
  const ins = () => db.query(`insert into public.ads (workspace_id,campaign_id,meta_ad_id,meta_creative_id,format) values ($1,$2,'123456789','987654321','4:5')`, [WS1, id]);
  await ins();
  return rejects(ins, /unique|duplicate/i);
});
await check('deux campagnes peuvent avoir chacune leur publicité', async () => {
  const a = await newCampaign(); const b = await newCampaign();
  const ins = (c) => db.query(`insert into public.ads (workspace_id,campaign_id,meta_ad_id) values ($1,$2,'555555555')`, [WS1, c]);
  await ins(a); await ins(b);
  return true;
});

// --- Clause de responsabilité --------------------------------------------
await check('la clause s’enregistre une fois, avec la date et l’utilisateur', async () => {
  await db.query(`insert into public.publish_liability_acceptances (workspace_id, accepted_by) values ($1,$2)`, [WS1, U1]);
  const [r] = await q(`select accepted_by, accepted_at, clause_version from public.publish_liability_acceptances where workspace_id=$1`, [WS1]);
  return r.accepted_by === U1 && r.accepted_at instanceof Date && r.clause_version === 'v1';
});
await check('une seule acceptation par espace (la première est conservée)', async () =>
  rejects(() => db.query(`insert into public.publish_liability_acceptances (workspace_id, accepted_by) values ($1,$2)`, [WS1, U1]), /unique|duplicate/i));
await check('un membre lit l’acceptation de SON espace', async () =>
  (await as('authenticated', U1, async (tx) => (await tx.query(`select workspace_id from public.publish_liability_acceptances`)).rows)).length === 1);
await check('un autre espace ne voit pas l’acceptation (RLS)', async () =>
  (await as('authenticated', U2, async (tx) => (await tx.query(`select workspace_id from public.publish_liability_acceptances`)).rows)).length === 0);
await check('un membre ne peut pas écrire l’acceptation lui-même (serveur seulement)', async () =>
  rejects(() => as('authenticated', U2, (tx) => tx.query(`insert into public.publish_liability_acceptances (workspace_id, accepted_by) values ($1,$2)`, [WS2, U2])), /permission denied|row-level/i));
await check('un anonyme ne lit rien', async () =>
  rejects(() => as('anon', U1, (tx) => tx.query(`select * from public.publish_liability_acceptances`)), /permission denied/i));
await check('la clause est supprimée avec l’espace (cascade)', async () => {
  await db.query(`insert into public.publish_liability_acceptances (workspace_id, accepted_by) values ($1,$2)`, [WS2, U2]);
  await db.query(`delete from public.workspaces where id=$1`, [WS2]);
  return (await q(`select 1 from public.publish_liability_acceptances where workspace_id=$1`, [WS2])).length === 0;
});

for (const r of results) console.log(r);
console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);

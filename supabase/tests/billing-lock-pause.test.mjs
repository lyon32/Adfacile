// Tests de la migration 0022 (S19b) : raison de la pause (`pause_reason`) et espaces à mettre en pause (TR-PAY-07, EC-PAY-11) — PGlite.
// Usage : node supabase/tests/billing-lock-pause.test.mjs <dossier contenant node_modules/@electric-sql/pglite>
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

const OWNER = '11111111-1111-4111-8111-111111111111';
const EDITOR = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
await db.query(`insert into auth.users (id,email) values ($1,'a@test.cm'),($2,'e@test.cm'),($3,'o@test.cm')`, [OWNER, EDITOR, OTHER]);
const WS = (await q(`select id from public.workspaces where owner_id=$1`, [OWNER]))[0].id;
const WS2 = (await q(`select id from public.workspaces where owner_id=$1`, [OTHER]))[0].id;
await db.query(`insert into public.workspace_members (workspace_id,profile_id,role,invited_by) values ($1,$2,'editor',$3)`, [WS, EDITOR, OWNER]);

const DAY = 86400000;
const T0 = Date.parse('2026-11-10T12:00:00Z');
const iso = (days) => new Date(T0 + days * DAY).toISOString();
let metaId = 1000000;
const PATHS = {
  draft: [],
  publishing: ['publishing'],
  in_review: ['publishing', 'in_review'],
  active: ['publishing', 'in_review', 'active'],
  paused: ['publishing', 'in_review', 'active', 'paused'],
  error: ['publishing', 'error'],
  stopped: ['publishing', 'in_review', 'stopped'],
};
// Une campagne chez Meta : créée en brouillon puis avancée (le déclencheur de garde impose le chemin).
async function campaign(ws, status, { withMeta = true } = {}) {
  const id = (await q(`insert into public.campaigns (workspace_id,name,created_by) values ($1,'C',$2) returning id`, [ws, OWNER]))[0].id;
  for (const s of PATHS[status]) await db.query(`update public.campaigns set status=$2 where id=$1`, [id, s]);
  if (withMeta) await db.query(`update public.campaigns set meta_campaign_id=$2 where id=$1`, [id, String(metaId++)]);
  return id;
}
async function subscribe(ws, status, endDays, graceDays = null) {
  await db.query(`delete from public.subscriptions where workspace_id=$1`, [ws]);
  await db.query(`insert into public.subscriptions (workspace_id,plan_code,status,period_start,period_end,grace_until) values ($1,'pro',$2,$3,$4,$5)`,
    [ws, status, iso(endDays - 30), iso(endDays), graceDays === null ? null : iso(graceDays)]);
}
const toLock = async (nowDays, limit = 100) =>
  (await q(`select workspace_id from public.workspaces_to_lock_pause($1::timestamptz,$2)`, [iso(nowDays), limit])).map((r) => r.workspace_id);
const reason = async (id) => (await q(`select pause_reason r, status s from public.campaigns where id=$1`, [id]))[0];
const refused = (pattern) => [() => false, (e) => pattern.test(e.message)];

// --- 1. pause_reason : une campagne en pause seulement, effacée dès qu'elle en sort -----------------------------------------
await check('pause_reason accepte billing_lock sur une campagne en pause', async () => {
  const id = await campaign(WS, 'active');
  await db.query(`update public.campaigns set status='paused', pause_reason='billing_lock' where id=$1`, [id]);
  return (await reason(id)).r === 'billing_lock';
});
await check('pause_reason refuse une valeur inconnue', async () => {
  const id = await campaign(WS, 'active');
  return db.query(`update public.campaigns set status='paused', pause_reason='autre' where id=$1`, [id]).then(...refused(/check|violates/i));
});
await check('pause_reason posée sur une campagne qui n’est pas en pause est effacée aussitôt par le déclencheur', async () => {
  const id = await campaign(WS, 'active');
  await db.query(`update public.campaigns set pause_reason='billing_lock' where id=$1`, [id]);
  const r = await reason(id);
  return r.s === 'active' && r.r === null;
});
await check('une campagne créée avec une raison de pause est refusée', async () =>
  db.query(`insert into public.campaigns (workspace_id,name,created_by,pause_reason) values ($1,'x',$2,'billing_lock')`, [WS, OWNER]).then(...refused(/violates/i)));
for (const next of ['active', 'ended', 'stopped']) {
  await check(`la raison s’efface seule quand la campagne passe de paused à ${next}`, async () => {
    const id = await campaign(WS, 'active');
    await db.query(`update public.campaigns set status='paused', pause_reason='billing_lock' where id=$1`, [id]);
    await db.query(`update public.campaigns set status=$2 where id=$1`, [id, next]);
    const r = await reason(id);
    return r.s === next && r.r === null;
  });
}
await check('une campagne mise en pause par le client n’a aucune raison', async () => {
  const id = await campaign(WS, 'active');
  await db.query(`update public.campaigns set status='paused' where id=$1`, [id]);
  return (await reason(id)).r === null;
});
await check('un membre (éditeur) ne peut pas écrire pause_reason avec son jeton', async () => {
  const id = await campaign(WS, 'paused');
  return as('authenticated', EDITOR, (tx) => tx.query(`update public.campaigns set pause_reason='billing_lock' where id=$1`, [id])).then(...refused(/permission denied/i));
});
await check('un membre lit la raison de la pause de sa campagne', async () => {
  const id = await campaign(WS, 'active');
  await db.query(`update public.campaigns set status='paused', pause_reason='billing_lock' where id=$1`, [id]);
  const res = await as('authenticated', EDITOR, (tx) => tx.query(`select pause_reason from public.campaigns where id=$1`, [id]));
  return res.rows[0]?.pause_reason === 'billing_lock';
});

// --- 2. espaces à mettre en pause : horloge fixée aux frontières -----------------------------------------------------------
await db.query(`delete from public.campaigns`);
await subscribe(WS, 'active', 0);
await campaign(WS, 'active');
await check('formule payée échue : en grâce à J+0, pas à mettre en pause', async () => !(await toLock(0)).includes(WS));
await check('J+3 moins une milliseconde : encore en grâce', async () => !(await toLock(3 - 1 / DAY)).includes(WS));
await check('J+3 exact : verrouillé, l’espace est à mettre en pause', async () => (await toLock(3)).includes(WS));
await check('grâce prolongée par l’administration : J+3 ne suffit pas, la nouvelle échéance oui', async () => {
  await subscribe(WS, 'active', 0, 10);
  const early = (await toLock(3)).includes(WS);
  const late = (await toLock(10)).includes(WS);
  return !early && late;
});
await check('essai terminé sans abonnement : verrouillé à la milliseconde de la fin', async () => {
  await subscribe(WS, 'trialing', 0);
  return !(await toLock(-1 / DAY)).includes(WS) && (await toLock(0)).includes(WS);
});
await check('renouvellement : une nouvelle période sort l’espace de la liste', async () => {
  await subscribe(WS, 'active', 0);
  const before = (await toLock(5)).includes(WS);
  await subscribe(WS, 'active', 30);
  return before && !(await toLock(5)).includes(WS);
});
await check('sans abonnement : jamais verrouillé', async () => {
  await db.query(`delete from public.subscriptions where workspace_id=$1`, [WS]);
  return !(await toLock(500)).includes(WS);
});
await check('suspendu ou lecture seule par l’administration : pas de pause automatique', async () => {
  await subscribe(WS, 'active', -10);
  const out = [];
  for (const st of ['suspended', 'read_only']) {
    await db.query(`update public.workspaces set status=$2 where id=$1`, [WS, st]);
    out.push((await toLock(0)).includes(WS));
  }
  await db.query(`update public.workspaces set status='active' where id=$1`, [WS]);
  return out.every((x) => x === false) && (await toLock(0)).includes(WS);
});
await check('un autre espace non verrouillé n’est jamais listé', async () => {
  await subscribe(WS2, 'active', 20);
  await campaign(WS2, 'active');
  return !(await toLock(0)).includes(WS2);
});
for (const st of ['paused', 'draft', 'stopped']) {
  await check(`un espace verrouillé dont la seule campagne est ${st} n’est pas listé`, async () => {
    await db.query(`delete from public.campaigns where workspace_id=$1`, [WS2]);
    await subscribe(WS2, 'active', -10);
    await campaign(WS2, st);
    return !(await toLock(0)).includes(WS2);
  });
}
await check('une campagne en vérification ou en erreur connue de Meta compte ; en erreur sans identifiant Meta, non', async () => {
  await db.query(`delete from public.campaigns where workspace_id=$1`, [WS2]);
  await campaign(WS2, 'error', { withMeta: false });
  const none = !(await toLock(0)).includes(WS2);
  await campaign(WS2, 'in_review');
  return none && (await toLock(0)).includes(WS2);
});
await check('la limite est respectée (au moins 1, au plus la valeur demandée)', async () => {
  await subscribe(WS, 'active', -10);
  return (await toLock(0, 1)).length === 1 && (await toLock(0, 0)).length === 1 && (await toLock(0, 100)).length === 2;
});
await check('un client ne peut pas appeler la liste des espaces à mettre en pause', async () => {
  const viaPublic = await as('authenticated', EDITOR, (tx) => tx.query(`select * from public.workspaces_to_lock_pause($1::timestamptz,10)`, [iso(0)])).then(...refused(/permission denied/i));
  const viaPrivate = await as('authenticated', EDITOR, (tx) => tx.query(`select * from private.workspaces_to_lock_pause($1::timestamptz,10)`, [iso(0)])).then(...refused(/permission denied/i));
  return viaPublic && viaPrivate;
});
await check('le rôle service peut l’appeler', async () =>
  (await as('service_role', OWNER, (tx) => tx.query(`select * from public.workspaces_to_lock_pause($1::timestamptz,10)`, [iso(0)]))).rows.length >= 1);

// --- 3. recul progressif des échecs permanents ---------------------------------------------------------------------------
await check('une campagne dont la prochaine tentative est dans le futur n’est pas listée ; à l’échéance elle l’est de nouveau', async () => {
  await db.query(`delete from public.campaigns`);
  await subscribe(WS, 'active', -10);
  const id = await campaign(WS, 'active');
  await db.query(`update public.campaigns set lock_pause_failures=2, lock_pause_retry_at=$2 where id=$1`, [id, iso(1)]);
  const before = (await toLock(0)).includes(WS);
  const exactly = (await toLock(1)).includes(WS);
  const after = (await toLock(2)).includes(WS);
  return !before && exactly && after;
});
await check('un espace avec une campagne au recul ET une campagne saine reste listé', async () => {
  await db.query(`delete from public.campaigns`);
  await subscribe(WS, 'active', -10);
  const bad = await campaign(WS, 'active');
  await db.query(`update public.campaigns set lock_pause_failures=5, lock_pause_retry_at=$2 where id=$1`, [bad, iso(3)]);
  await campaign(WS, 'in_review');
  return (await toLock(0)).includes(WS);
});
await check('écrire le recul ne change PAS la version de la campagne (pas de 409 pour le client qui prépare une action)', async () => {
  const id = await campaign(WS, 'active');
  const v0 = (await q(`select version from public.campaigns where id=$1`, [id]))[0].version;
  await db.query(`update public.campaigns set lock_pause_failures=1, lock_pause_retry_at=$2 where id=$1`, [id, iso(1)]);
  const v1 = (await q(`select version from public.campaigns where id=$1`, [id]))[0].version;
  await db.query(`update public.campaigns set name='autre' where id=$1`, [id]);
  const v2 = (await q(`select version from public.campaigns where id=$1`, [id]))[0].version;
  return v0 === v1 && v2 === v1 + 1;
});
await check('le compteur d’échecs ne peut pas être négatif', async () => {
  const id = await campaign(WS, 'active');
  return db.query(`update public.campaigns set lock_pause_failures=-1 where id=$1`, [id]).then(...refused(/check|violates/i));
});
await check('un membre ne peut pas écrire le recul avec son jeton', async () => {
  const id = await campaign(WS, 'active');
  return as('authenticated', EDITOR, (tx) => tx.query(`update public.campaigns set lock_pause_retry_at=now() where id=$1`, [id])).then(...refused(/permission denied/i));
});

for (const r of results) console.log(r);
console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail === 0 ? 0 : 1);

// Tests de la migration 0003 (LLD §10, E1 à E10) — sur un vrai PostgreSQL (PGlite).
// Usage : node supabase/tests/api-support.test.mjs <dossier contenant node_modules/@electric-sql/pglite>
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(resolve(process.argv[2] ?? here), 'package.json'));
const { PGlite } = require('@electric-sql/pglite');

const db = new PGlite();
const ids = {
  A: '11111111-1111-1111-1111-111111111111',
  B: '22222222-2222-2222-2222-222222222222',
  E: '55555555-5555-5555-5555-555555555555',
  N: '66666666-6666-6666-6666-666666666666',
};

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
async function as(role, sub, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`,
      [sub ?? '', JSON.stringify({ sub, aal: 'aal1' })]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}
async function check(name, fn) {
  try { const ok = await fn(); ok ? pass++ : fail++; results.push(`${ok ? '✓' : '✗'} ${name}`); }
  catch (e) { fail++; results.push(`✗ ${name} — exception inattendue : ${e.message}`); }
}
async function denied(fn) { try { await fn(); return false; } catch (e) { return /permission denied|violates row-level|ajout seul|42501|new row violates/i.test(e.message); } }
async function fails(fn, re) { try { await fn(); return false; } catch (e) { return re.test(e.message); } }
const rows = async (tx, sql, p = []) => (await tx.query(sql, p)).rows;
const q = async (sql, p = []) => (await db.query(sql, p)).rows;

// --- E10. Inscription ----------------------------------------------------------
await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,'Awa@Test.cm','{"first_name":"Awa","ui_language":"en"}'),($2,'bob@test.cm',null),($3,'eve@test.cm',null),($4,'nina@test.cm',null)`,
  [ids.A, ids.B, ids.E, ids.N]);
const wsOf = async (p) => (await q(`select id from public.workspaces where owner_id=$1`, [p]))[0].id;
const WA = await wsOf(ids.A), WB = await wsOf(ids.B);

await check('E10 : l’inscription crée le profil (e-mail en minuscules, prénom, langue)', async () => {
  const [p] = await q(`select email, first_name, ui_language from public.profiles where id=$1`, [ids.A]);
  return p.email === 'awa@test.cm' && p.first_name === 'Awa' && p.ui_language === 'en';
});
await check('E10 : l’inscription crée un espace et son membre « owner », avec un code de parrainage', async () => {
  const [w] = await q(`select w.name, w.referral_code, m.role from public.workspaces w
    join public.workspace_members m on m.workspace_id=w.id and m.profile_id=w.owner_id where w.owner_id=$1`, [ids.A]);
  return w.name === 'Awa' && /^[A-Z0-9]{8}$/.test(w.referral_code) && w.role === 'owner';
});
await check('E10 : sans prénom, l’espace prend la partie locale de l’e-mail', async () =>
  (await q(`select name from public.workspaces where owner_id=$1`, [ids.B]))[0].name === 'bob');
await check('E10 : l’inscription ne crée NI essai NI crédits (l’essai démarre au clic, S24)', async () =>
  (await q(`select count(*)::int n from public.subscriptions`))[0].n === 0
  && (await q(`select count(*)::int n from public.credit_ledger`))[0].n === 0);
await check('E10 : inscription sans e-mail refusée', () => fails(() =>
  db.query(`insert into auth.users (id) values (gen_random_uuid())`), /e-mail obligatoire/));
await check('E10 : l’utilisateur voit son espace et lui seul', () => as('authenticated', ids.A, async (tx) => {
  const r = await rows(tx, 'select id from public.workspaces');
  return r.length === 1 && r[0].id === WA;
}));

// --- E1. Analyses ----------------------------------------------------------------
await db.query(`insert into public.analyses (workspace_id, created_by, status) values ($1,$2,'queued'),($3,$4,'queued')`, [WA, ids.A, WB, ids.B]);
await check('E1 : un membre lit les analyses de son espace', () => as('authenticated', ids.A, async (tx) =>
  (await rows(tx, 'select workspace_id from public.analyses')).every((r) => r.workspace_id === WA)));
await check('E1 : accès croisé — A ne lit pas l’analyse de B, même en la visant', () => as('authenticated', ids.A, async (tx) =>
  (await rows(tx, 'select * from public.analyses where workspace_id=$1', [WB])).length === 0));
await check('E1 : un client ne peut pas créer ni modifier une analyse', async () =>
  (await denied(() => as('authenticated', ids.A, (tx) => tx.query(`insert into public.analyses (workspace_id) values ($1)`, [WA]))))
  && (await denied(() => as('authenticated', ids.A, (tx) => tx.query(`update public.analyses set status='ready' where workspace_id=$1`, [WA])))));
await check('E1 : état « blocked » sans motif refusé', () => fails(() =>
  db.query(`update public.analyses set status='blocked' where workspace_id=$1`, [WA]), /check/));
await check('E1 : état inconnu refusé', () => fails(() =>
  db.query(`update public.analyses set status='done' where workspace_id=$1`, [WA]), /check/));
await check('E1 : visiteur (anon) sans accès', () => denied(() => as('anon', null, (tx) => tx.query('select * from public.analyses'))));

// --- E2. Idempotence -------------------------------------------------------------
const h = 'a'.repeat(64);
await check('E2 : clés d’idempotence invisibles pour un client', () => denied(() => as('authenticated', ids.A, (tx) =>
  tx.query('select * from public.api_idempotency_keys'))));
await check('E2 : même clé dans le même espace refusée (clé primaire)', async () => {
  await db.query(`insert into public.api_idempotency_keys (workspace_id,key,route,body_hash) values ($1,'7f000000-0000-4000-8000-000000000001','POST /generations',$2)`, [WA, h]);
  return fails(() => db.query(`insert into public.api_idempotency_keys (workspace_id,key,route,body_hash) values ($1,'7f000000-0000-4000-8000-000000000001','POST /generations',$2)`, [WA, h]), /duplicate key/);
});
await check('E2 : la même clé reste libre dans un autre espace', async () =>
  (await db.query(`insert into public.api_idempotency_keys (workspace_id,key,route,body_hash) values ($1,'7f000000-0000-4000-8000-000000000001','POST /generations',$2)`, [WB, h])).affectedRows === 1);
await check('E2 : « done » sans statut de réponse refusé', () => fails(() =>
  db.query(`update public.api_idempotency_keys set state='done' where workspace_id=$1`, [WA]), /check/));
await check('E2 : purge des clés de plus de 24 h (et seulement elles)', () => as('service_role', null, async (tx) => {
  await tx.query(`update public.api_idempotency_keys set expires_at = now() - interval '1 minute' where workspace_id=$1`, [WA]);
  const n = (await rows(tx, 'select private.purge_idempotency_keys() n'))[0].n;
  const left = (await rows(tx, 'select workspace_id from public.api_idempotency_keys'));
  return n === 1 && left.length === 1 && left[0].workspace_id === WB;
}));
await check('E2 : un client ne peut pas lancer la purge', () => denied(() => as('authenticated', ids.A, (tx) =>
  tx.query('select private.purge_idempotency_keys()'))));

// --- E3. Webhooks ----------------------------------------------------------------
await check('E3 : premier événement accepté, rejeu détecté', () => as('service_role', null, async (tx) => {
  const a = (await rows(tx, `select private.record_webhook_event('saspay','evt_1') ok`))[0].ok;
  const b = (await rows(tx, `select private.record_webhook_event('saspay','evt_1') ok`))[0].ok;
  const c = (await rows(tx, `select private.record_webhook_event('fal','evt_1') ok`))[0].ok;
  return a === true && b === false && c === true;
}));
await check('E3 : événements illisibles et non inscriptibles par un client', async () =>
  (await denied(() => as('authenticated', ids.A, (tx) => tx.query('select * from private.webhook_events'))))
  && (await denied(() => as('authenticated', ids.A, (tx) => tx.query(`select private.record_webhook_event('saspay','x')`)))));

// --- E4. Crédits partiels et bonus ---------------------------------------------
const bal = async (tx, ws) => Object.fromEntries((await rows(tx,
  `select bucket, balance from public.credit_balances where workspace_id=$1`, [ws])).map((r) => [r.bucket, r.balance]));
const J = (n) => `99999999-9999-9999-9999-${String(n).padStart(12, '0')}`;
await db.query(`insert into public.credit_ledger (workspace_id,bucket,kind,amount,period_end) values ($1,'monthly','grant_monthly',10, now() + interval '20 days'),($1,'purchased','purchase',5,null)`, [WA]);

await check('EC-CRED-03 : 3 visuels réservés, 1 échec → 1 crédit rendu, 2 consommés', () => as('service_role', null, async (tx) => {
  await tx.query(`select private.reserve_credits($1, 3, $2)`, [WA, J(1)]);
  const r = (await rows(tx, `select private.release_credits($1, 1) n`, [J(1)]))[0].n;
  await tx.query(`select private.consume_credits($1)`, [J(1)]);
  const kinds = (await rows(tx, `select kind from public.credit_ledger where generation_job_id=$1 order by id`, [J(1)])).map((x) => x.kind).join();
  const b = await bal(tx, WA);
  return r === 1 && kinds === 'reserve,release,consume' && b.monthly === 8 && b.purchased === 5;
}));
await check('E4 : libération partielle idempotente (une seule libération par génération)', () => as('service_role', null, async (tx) => {
  const again = (await rows(tx, `select private.release_credits($1, 1) n`, [J(1)]))[0].n;
  const all = (await rows(tx, `select private.release_credits($1) n`, [J(1)]))[0].n;
  return again === 0 && all === 0 && (await bal(tx, WA)).monthly === 8;
}));
await check('E4 : consommation idempotente', () => as('service_role', null, async (tx) => {
  await tx.query(`select private.consume_credits($1)`, [J(1)]);
  return (await rows(tx, `select count(*)::int n from public.credit_ledger where generation_job_id=$1 and kind='consume'`, [J(1)]))[0].n === 1;
}));
await check('E4 : libérer plus que réservé est refusé', () => fails(() => as('service_role', null, async (tx) => {
  await tx.query(`select private.reserve_credits($1, 2, $2)`, [WA, J(2)]);
  await tx.query(`select private.release_credits($1, 3)`, [J(2)]);
}), /supérieure/));
await check('E4 : montant nul ou négatif refusé', () => fails(() => as('service_role', null, (tx) =>
  tx.query(`select private.release_credits($1, 0)`, [J(1)])), /invalide/));
await check('E4 : tout rendu → la consommation n’écrit rien', () => as('service_role', null, async (tx) => {
  await tx.query(`select private.reserve_credits($1, 2, $2)`, [WA, J(3)]);
  const r = (await rows(tx, `select private.release_credits($1) n`, [J(3)]))[0].n;
  await tx.query(`select private.consume_credits($1)`, [J(3)]);
  return r === 2 && (await rows(tx, `select count(*)::int n from public.credit_ledger where generation_job_id=$1 and kind='consume'`, [J(3)]))[0].n === 0;
}));
await check('E4 : les crédits achetés sont rendus en premier, dans leur compartiment', () => as('service_role', null, async (tx) => {
  await tx.query(`select private.reserve_credits($1, 10, $2)`, [WA, J(4)]);   // 8 mensuels + 2 achetés
  await tx.query(`select private.release_credits($1, 3)`, [J(4)]);           // 2 achetés + 1 mensuel
  const b = await bal(tx, WA);
  return b.purchased === 5 && b.monthly === 1;
}));
await check('E4 : génération inconnue → 0 crédit rendu', () => as('service_role', null, async (tx) =>
  (await rows(tx, `select private.release_credits($1, 1) n`, [J(99)]))[0].n === 0));

await check('EC-CRED-12 : période terminée → crédits mensuels rendus en bonus, avec motif', () => as('service_role', null, async (tx) => {
  await tx.query(`insert into public.credit_ledger (workspace_id,bucket,kind,amount,period_end) values ($1,'monthly','grant_monthly',4, now() - interval '1 day')`, [WB]);
  await tx.query(`select private.reserve_credits($1, 3, $2)`, [WB, J(5)]);
  const r = (await rows(tx, `select private.release_credits($1, 2) n`, [J(5)]))[0].n;
  const rel = (await rows(tx, `select bucket, amount, reason from public.credit_ledger where generation_job_id=$1 and kind='release'`, [J(5)]));
  const b = await bal(tx, WB);
  return r === 2 && rel.length === 1 && rel[0].bucket === 'bonus' && rel[0].amount === 2 && /EC-CRED-12/.test(rel[0].reason)
    && b.bonus === 2 && b.monthly === 1;
}));
await check('EC-CRED-12 : période en cours → crédits mensuels rendus en mensuel', () => as('service_role', null, async (tx) =>
  (await rows(tx, `select bucket from public.credit_ledger where generation_job_id=$1 and kind='release'`, [J(1)]))[0].bucket === 'monthly'));
await check('E4 : registre toujours en ajout seul après 0003', () => denied(() => db.query(`delete from public.credit_ledger where generation_job_id=$1`, [J(1)])));
await check('E4 : un client ne peut pas libérer de crédits', () => denied(() => as('authenticated', ids.A, (tx) =>
  tx.query(`select private.release_credits($1, 1)`, [J(1)]))));

// --- E7. Limites de débit --------------------------------------------------------
await check('E7 : 3 appels autorisés puis refus avec délai', () => as('service_role', null, async (tx) => {
  const r = [];
  for (let i = 0; i < 4; i++) r.push((await rows(tx, `select * from private.hit_rate_limit('ip:1.2.3.4:write', 3, 60)`))[0]);
  return r.slice(0, 3).every((x) => x.allowed) && !r[3].allowed && r[3].hits === 4 && r[3].retry_after_s >= 1 && r[3].retry_after_s <= 60;
}));
await check('E7 : clés indépendantes', () => as('service_role', null, async (tx) =>
  (await rows(tx, `select * from private.hit_rate_limit('ip:5.6.7.8:write', 3, 60)`))[0].allowed === true));
await check('E7 : paramètres invalides refusés', () => fails(() => as('service_role', null, (tx) =>
  tx.query(`select * from private.hit_rate_limit('k', 0, 60)`)), /invalides/));
await check('E7 : un client ne peut ni appeler la fonction ni lire les compteurs', async () =>
  (await denied(() => as('authenticated', ids.A, (tx) => tx.query(`select * from private.hit_rate_limit('k', 3, 60)`))))
  && (await denied(() => as('authenticated', ids.A, (tx) => tx.query('select * from private.rate_limits')))));

// --- E8. Transfert de propriété --------------------------------------------------
await db.query(`insert into public.workspace_members (workspace_id, profile_id, role) values ($1,$2,'editor')`, [WA, ids.E]);
await check('E8 : seul le propriétaire peut transférer', () => fails(() => as('service_role', null, (tx) =>
  tx.query(`select private.transfer_ownership($1,$2,$3)`, [WA, ids.E, ids.E])), /propriétaire/));
await check('E8 : le nouveau propriétaire doit être membre (pas de transfert vers un autre espace)', () => fails(() => as('service_role', null, (tx) =>
  tx.query(`select private.transfer_ownership($1,$2,$3)`, [WA, ids.N, ids.A])), /membre/));
await check('E8 : transfert → l’ancien propriétaire devient éditeur, journalisé', () => as('service_role', null, async (tx) => {
  await tx.query(`select private.transfer_ownership($1,$2,$3)`, [WA, ids.E, ids.A]);
  const roles = Object.fromEntries((await rows(tx, `select profile_id, role from public.workspace_members where workspace_id=$1`, [WA])).map((r) => [r.profile_id, r.role]));
  const owner = (await rows(tx, `select owner_id from public.workspaces where id=$1`, [WA]))[0].owner_id;
  const log = await rows(tx, `select action, before, after from audit.workspace_log where workspace_id=$1`, [WA]);
  return roles[ids.A] === 'editor' && roles[ids.E] === 'owner' && owner === ids.E
    && log.length === 1 && log[0].before.owner_id === ids.A && log[0].after.owner_id === ids.E;
}));
await check('E8 : un client ne peut pas appeler le transfert directement', () => denied(() => as('authenticated', ids.E, (tx) =>
  tx.query(`select private.transfer_ownership($1,$2,$3)`, [WA, ids.A, ids.E]))));
await check('E8 : journal de l’espace en ajout seul', () => denied(() => db.query(`delete from audit.workspace_log`)));

// --- E9. Version des campagnes ---------------------------------------------------
await check('EC-TEAM-08 : version 1 à la création, +1 à chaque modification', () => as('authenticated', ids.E, async (tx) => {
  const [c] = await rows(tx, `insert into public.campaigns (workspace_id,name,created_by) values ($1,'C',$2) returning id, version`, [WA, ids.E]);
  await tx.query(`update public.campaigns set name='C2' where id=$1`, [c.id]);
  await tx.query(`update public.campaigns set name='C3' where id=$1`, [c.id]);
  return c.version === 1 && (await rows(tx, `select version from public.campaigns where id=$1`, [c.id]))[0].version === 3;
}));
await check('EC-TEAM-08 : un client ne peut pas fixer la version lui-même', () => denied(() => as('authenticated', ids.E, (tx) =>
  tx.query(`update public.campaigns set version=1 where workspace_id=$1`, [WA]))));

// --- Enveloppes publiques (appelées par packages/db via rpc) ------------------------
for (const call of [`select public.reserve_credits('${ids.A}', 1, gen_random_uuid())`, `select public.release_credits(gen_random_uuid(), 1)`,
  `select public.consume_credits(gen_random_uuid())`, `select * from public.hit_rate_limit('k', 3, 60)`,
  `select public.record_webhook_event('saspay','y')`, `select public.transfer_ownership(gen_random_uuid(), gen_random_uuid(), gen_random_uuid())`,
  `select public.purge_idempotency_keys()`]) {
  await check(`Enveloppe interdite à un client et à anon : ${call.slice(7, 40)}…`, async () =>
    (await denied(() => as('authenticated', ids.A, (tx) => tx.query(call)))) && (await denied(() => as('anon', null, (tx) => tx.query(call)))));
}
await check('Enveloppe publique utilisable par le serveur (rejeu de webhook)', () => as('service_role', null, async (tx) =>
  (await rows(tx, `select public.record_webhook_event('saspay','evt_1') ok`))[0].ok === false));

// --- Couverture --------------------------------------------------------------
await check('RLS activée sur 100 % des tables après 0003', async () =>
  (await q(`select count(*)::int n from pg_tables where schemaname in ('public','private','audit') and not rowsecurity`))[0].n === 0);
await check('Toutes les fonctions SECURITY DEFINER ont un search_path figé après 0003', async () =>
  (await q(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname in ('public','private') and p.prosecdef
            and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')`))[0].n === 0);

console.log(results.join('\n'));
console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);

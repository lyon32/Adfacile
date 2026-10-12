// Tests de sécurité de la base Pubeka — exécutés sur un vrai PostgreSQL (PGlite).
// Usage : node supabase/tests/security.test.mjs <dossier contenant node_modules/@electric-sql/pglite>
// Simule les rôles Supabase (anon, authenticated, service_role) et les fonctions auth.uid() / auth.jwt().
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(resolve(process.argv[2] ?? here), 'package.json'));
const { PGlite } = require('@electric-sql/pglite');

const db = new PGlite();
const ids = {
  A: '11111111-1111-1111-1111-111111111111', B: '22222222-2222-2222-2222-222222222222',
  ADM: '33333333-3333-3333-3333-333333333333', V: '44444444-4444-4444-4444-444444444444',
  WA: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', WB: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  CA: 'cccccccc-cccc-cccc-cccc-ccccccccccca', CB: 'cccccccc-cccc-cccc-cccc-cccccccccccb',
};

// --- Bouchons Supabase -------------------------------------------------
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`);
// Toutes les migrations, dans l'ordre, sauf celles du stockage (le schéma « storage » n'existe que dans Supabase).
const migDir = join(here, '..', 'migrations');
for (const f of readdirSync(migDir).filter((f) => f.endsWith('.sql') && !f.includes('storage')).sort()) {
  await db.exec(readFileSync(join(migDir, f), 'utf8'));
}

// --- Données de test (superutilisateur) --------------------------------
await db.exec(`
  -- L'inscription crée le profil et un espace personnel (0003, E10) ; les espaces de test sont ajoutés ensuite.
  insert into auth.users (id,email) values ('${ids.A}','a@test.cm'),('${ids.B}','b@test.cm'),('${ids.ADM}','adm@pubeka.com'),('${ids.V}','v@test.cm');
  insert into public.workspaces (id,name,owner_id) values ('${ids.WA}','Boutique A','${ids.A}'),('${ids.WB}','Boutique B','${ids.B}');
  insert into public.workspace_members values ('${ids.WA}','${ids.A}','owner',null,now()),('${ids.WB}','${ids.B}','owner',null,now()),('${ids.WA}','${ids.V}','viewer',null,now());
  insert into public.campaigns (id,workspace_id,name,created_by) values ('${ids.CA}','${ids.WA}','Campagne A','${ids.A}'),('${ids.CB}','${ids.WB}','Campagne SECRETE B','${ids.B}');
  insert into public.meta_connections (id,workspace_id,token_type) values ('dddddddd-dddd-dddd-dddd-dddddddddddd','${ids.WB}','user');
  insert into private.meta_tokens values ('dddddddd-dddd-dddd-dddd-dddddddddddd','\\x00'::bytea,'\\x000000000000000000000000'::bytea,'\\x00000000000000000000000000000000'::bytea,1,now());
  insert into public.credit_ledger (workspace_id,bucket,kind,amount) values ('${ids.WA}','monthly','grant_monthly',10),('${ids.WA}','purchased','purchase',3),('${ids.WB}','monthly','grant_monthly',10);
  insert into private.admin_users (profile_id) values ('${ids.ADM}');
  insert into public.agent_runs (workspace_id,agent,model,prompt_version,valid_schema) values ('${ids.WA}','analyste','gemini','v2',true);
  insert into public.media_providers (code,concurrency_limit,retention_hours) values ('fal',2,168) on conflict do nothing;
  insert into public.media_models (id,provider_code,endpoint,capabilities,display_name,status) values
    ('fal:flux-3','fal','blackforestlabs/flux-3/edit-image','{c3_edit}','FLUX 3','active'),
    ('fal:secret-test','fal','x/y','{c1_text_to_image}','Modele en test','testing');
  insert into public.blog_posts (locale,slug,title,body_md,status) values ('fr','payer-pub','Payer','...','published'),('fr','brouillon-ia','Brouillon','...','draft_ai');
`);

// --- Outils -------------------------------------------------------------
let pass = 0, fail = 0;
const results = [];
async function as(role, sub, aal, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true)`,
      [sub ?? '', JSON.stringify({ sub, aal: aal ?? 'aal1' })]);
    await tx.exec(`set local role ${role}`);
    return fn(tx);
  });
}
async function check(name, fn) {
  try { const ok = await fn(); ok ? pass++ : fail++; results.push(`${ok ? '✓' : '✗'} ${name}`); }
  catch (e) { fail++; results.push(`✗ ${name} — exception inattendue : ${e.message}`); }
}
async function denied(fn) { try { await fn(); return false; } catch (e) { return /permission denied|violates row-level|ajout seul|42501|new row violates/i.test(e.message); } }
const rows = async (tx, sql, p = []) => (await tx.query(sql, p)).rows;

// --- 1. Isolation entre clients -----------------------------------------
await check('A ne voit que ses campagnes', () => as('authenticated', ids.A, null, async tx =>
  (await rows(tx, 'select name from public.campaigns')).every(r => r.name === 'Campagne A')));
await check('A ne peut pas lire la campagne de B même en la visant directement', () => as('authenticated', ids.A, null, async tx =>
  (await rows(tx, 'select * from public.campaigns where id = $1', [ids.CB])).length === 0));
await check('A ne peut pas créer une campagne dans l’espace de B', () => denied(() => as('authenticated', ids.A, null, tx =>
  tx.query(`insert into public.campaigns (workspace_id,name,created_by) values ($1,'pirate',$2)`, [ids.WB, ids.A]))));
await check('A ne peut pas modifier la campagne de B (0 ligne touchée)', () => as('authenticated', ids.A, null, async tx =>
  (await tx.query(`update public.campaigns set name='pirate' where id=$1`, [ids.CB])).affectedRows === 0));
await check('A ne peut pas déplacer sa campagne vers l’espace de B', () => denied(() => as('authenticated', ids.A, null, tx =>
  tx.query(`update public.campaigns set workspace_id=$1 where id=$2`, [ids.WB, ids.CA]))));
await check('A ne voit que son propre profil', () => as('authenticated', ids.A, null, async tx =>
  (await rows(tx, 'select id from public.profiles')).length === 1));
await check('A ne voit pas les crédits de B', () => as('authenticated', ids.A, null, async tx =>
  (await rows(tx, 'select * from public.credit_ledger where workspace_id=$1', [ids.WB])).length === 0));

// --- 2. Injection SQL ----------------------------------------------------
const inj = "' OR '1'='1' --";
await check('Injection dans un filtre : aucune donnée de B ne fuit', () => as('authenticated', ids.A, null, async tx =>
  (await rows(tx, 'select name from public.campaigns where name = $1 or true', [inj])).every(r => r.name === 'Campagne A')));
await check('Injection stockée telle quelle comme simple texte', () => as('authenticated', ids.A, null, async tx => {
  await tx.query(`insert into public.campaigns (workspace_id,name,created_by) values ($1,$2,$3)`, [ids.WA, "x'); drop table public.campaigns; --", ids.A]);
  return (await rows(tx, `select count(*)::int n from public.campaigns`))[0].n >= 2;
}));
await check('La table campagnes existe toujours après la tentative', async () =>
  (await db.query(`select to_regclass('public.campaigns') is not null as ok`)).rows[0].ok);
await check('Aucune fonction applicative n’utilise de SQL dynamique (EXECUTE)', async () =>
  (await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname in ('public','private') and p.prosrc ~* '\\mexecute\\M'`)).rows[0].n === 0);
await check('Toutes les fonctions SECURITY DEFINER ont un search_path figé', async () =>
  (await db.query(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                   where n.nspname in ('public','private') and p.prosecdef
                   and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')`)).rows[0].n === 0);

// --- 3. Secrets et tables internes ----------------------------------------
await check('Jetons Meta illisibles par un client', () => denied(() => as('authenticated', ids.B, null, tx => tx.query('select * from private.meta_tokens'))));
await check('Jetons Meta illisibles sans connexion (anon)', () => denied(() => as('anon', null, null, tx => tx.query('select * from private.meta_tokens'))));
await check('Liste des administrateurs illisible', () => denied(() => as('authenticated', ids.A, null, tx => tx.query('select * from private.admin_users'))));
await check('Journal d’administration illisible', () => denied(() => as('authenticated', ids.A, null, tx => tx.query('select * from audit.admin_log'))));
await check('Réglages internes illisibles', () => denied(() => as('authenticated', ids.A, null, tx => tx.query('select * from private.app_settings'))));
await check('Journal des agents (prompts, coûts) invisible pour le client', () => as('authenticated', ids.A, null, async tx =>
  (await rows(tx, 'select * from public.agent_runs')).length === 0));
await check('Endpoint fournisseur d’un modèle illisible (colonne protégée)', () => denied(() => as('authenticated', ids.A, null, tx => tx.query('select endpoint from public.media_models'))));
await check('Modèle « en test » invisible pour le client', () => as('authenticated', ids.A, null, async tx =>
  (await rows(tx, 'select id from public.media_models')).every(r => r.id !== 'fal:secret-test')));

// --- 4. Visiteur non connecté (anon) ---------------------------------------
await check('Visiteur : aucune campagne lisible', () => denied(() => as('anon', null, null, tx => tx.query('select * from public.campaigns'))));
await check('Visiteur : aucun profil lisible', () => denied(() => as('anon', null, null, tx => tx.query('select * from public.profiles'))));
await check('Visiteur : seuls les articles publiés sont visibles', () => as('anon', null, null, async tx =>
  (await rows(tx, 'select slug from public.blog_posts')).map(r => r.slug).join() === 'payer-pub'));
await check('Visiteur : peut lire le mode maintenance', () => as('anon', null, null, async tx =>
  (await rows(tx, 'select public.maintenance_status() as m'))[0].m.active === false));

// --- 5. Crédits et paiements ----------------------------------------------
await check('Client : impossible de s’ajouter des crédits', () => denied(() => as('authenticated', ids.A, null, tx =>
  tx.query(`insert into public.credit_ledger (workspace_id,bucket,kind,amount) values ($1,'purchased','purchase',1000)`, [ids.WA]))));
await check('Client : impossible d’appeler la réservation de crédits', () => denied(() => as('authenticated', ids.A, null, tx =>
  tx.query(`select private.reserve_credits($1, 1, gen_random_uuid())`, [ids.WA]))));
await check('Client : impossible de marquer un paiement comme payé', () => denied(() => as('authenticated', ids.A, null, tx =>
  tx.query(`insert into public.payments (workspace_id,purpose,amount_xaf,idempotency_key,status) values ($1,'credits',1,gen_random_uuid(),'succeeded')`, [ids.WA]))));
await check('Registre des crédits : modification refusée, même pour le serveur', () => denied(() =>
  db.query(`update public.credit_ledger set amount = 9999`)));
await check('Registre des crédits : suppression refusée, même pour le serveur', () => denied(() =>
  db.query(`delete from public.credit_ledger`)));
await check('Journal d’administration : modification refusée', async () => {
  await db.query(`insert into audit.admin_log (admin_id, action) values ($1,'test')`, [ids.ADM]);
  return denied(() => db.query(`update audit.admin_log set action='efface'`));
});

const job1 = '99999999-9999-9999-9999-999999999991', job2 = '99999999-9999-9999-9999-999999999992';
await check('Serveur : réservation refusée si solde insuffisant (13 dispo, 50 demandés)', () => as('service_role', null, null, async tx =>
  (await rows(tx, `select private.reserve_credits($1, 50, $2) as ok`, [ids.WA, job1]))[0].ok === false));
await check('Serveur : réservation de 12 crédits (10 mensuels puis 2 achetés)', () => as('service_role', null, null, async tx => {
  const ok = (await rows(tx, `select private.reserve_credits($1, 12, $2) as ok`, [ids.WA, job2]))[0].ok;
  const b = await rows(tx, `select bucket, balance from public.credit_balances where workspace_id=$1 order by bucket`, [ids.WA]);
  return ok && b.find(x => x.bucket === 'monthly').balance === 0 && b.find(x => x.bucket === 'purchased').balance === 1;
}));
await check('Serveur : crédits rendus une seule fois (libération idempotente)', () => as('service_role', null, null, async tx => {
  const first = (await rows(tx, `select private.release_credits($1) as n`, [job2]))[0].n;
  const second = (await rows(tx, `select private.release_credits($1) as n`, [job2]))[0].n;
  const total = (await rows(tx, `select sum(amount)::int s from public.credit_ledger where workspace_id=$1`, [ids.WA]))[0].s;
  return first === 12 && second === 0 && total === 13;
}));

// --- 6. Rôles dans l’équipe et espace en lecture seule ------------------------
await check('Lecteur (viewer) : ne peut pas créer de campagne', () => denied(() => as('authenticated', ids.V, null, tx =>
  tx.query(`insert into public.campaigns (workspace_id,name,created_by) values ($1,'x',$2)`, [ids.WA, ids.V]))));
await check('Lecteur : ne voit pas les paiements', () => as('authenticated', ids.V, null, async tx =>
  (await rows(tx, 'select * from public.payments')).length === 0));
await db.query(`update public.workspaces set status='read_only' where id=$1`, [ids.WA]);
await check('Espace en lecture seule : création de campagne refusée', () => denied(() => as('authenticated', ids.A, null, tx =>
  tx.query(`insert into public.campaigns (workspace_id,name,created_by) values ($1,'x',$2)`, [ids.WA, ids.A]))));
await db.query(`update public.workspaces set status='active' where id=$1`, [ids.WA]);
await check('Client : ne peut pas changer son espace en « actif » lui-même (statut protégé)', () => denied(() => as('authenticated', ids.A, null, tx =>
  tx.query(`update public.workspaces set status='active' where id=$1`, [ids.WA]))));
await check('Client : ne peut pas se donner le rôle propriétaire ailleurs', () => denied(() => as('authenticated', ids.A, null, tx =>
  tx.query(`insert into public.workspace_members values ($1,$2,'owner',null,now())`, [ids.WB, ids.A]))));

// --- 7. Administration -------------------------------------------------------
await check('Admin SANS double vérification (aal1) : ne voit pas les campagnes des clients', () => as('authenticated', ids.ADM, 'aal1', async tx =>
  (await rows(tx, 'select * from public.campaigns')).length === 0));
await check('Admin AVEC double vérification (aal2) : voit les campagnes', () => as('authenticated', ids.ADM, 'aal2', async tx =>
  (await rows(tx, 'select * from public.campaigns')).length >= 2));
await check('Client qui falsifie aal2 sans être admin : rien de plus', () => as('authenticated', ids.A, 'aal2', async tx =>
  (await rows(tx, 'select * from public.campaigns where workspace_id=$1', [ids.WB])).length === 0));
await db.query(`update private.admin_users set locked_until = now() + interval '15 minutes' where profile_id=$1`, [ids.ADM]);
await check('Admin verrouillé (5 échecs) : plus aucun accès admin', () => as('authenticated', ids.ADM, 'aal2', async tx =>
  (await rows(tx, 'select * from public.campaigns')).length === 0));

// --- 8. Couverture RLS --------------------------------------------------------
await check('RLS activée sur 100 % des tables (public, private, audit)', async () =>
  (await db.query(`select count(*)::int n from pg_tables where schemaname in ('public','private','audit') and not rowsecurity`)).rows[0].n === 0);
await check('Aucune table de public n’est accessible à anon sauf le contenu public', async () =>
  (await db.query(`select array_agg(distinct table_name order by table_name) t from information_schema.role_table_grants
                   where grantee='anon' and table_schema='public'`)).rows[0].t.join() === 'blog_posts,help_articles');

console.log(results.join('\n'));
console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);

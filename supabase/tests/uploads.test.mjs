// Tests des migrations 0008 et 0009 (fichiers envoyés, journal des agents, TR-SEC-08, TR-SEC-01) — PGlite.
// Usage : node supabase/tests/uploads.test.mjs <dossier contenant node_modules/@electric-sql/pglite>
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
async function as(role, fn) { return db.transaction(async (tx) => { await tx.exec(`set local role ${role}`); return fn(tx); }); }
async function denied(fn) { try { await fn(); return false; } catch (e) { return /permission denied|42501/i.test(e.message); } }
const q = async (sql, p = []) => (await db.query(sql, p)).rows;

const U = '11111111-1111-4111-8111-111111111111';
const V = '22222222-2222-4222-8222-222222222222';
await db.query(`insert into auth.users (id,email,raw_user_meta_data) values ($1,'awa@test.cm',null),($2,'ali@test.cm',null)`, [U, V]);
const WS = (await q(`select id from public.workspaces where owner_id=$1`, [U]))[0].id;
const WS2 = (await q(`select id from public.workspaces where owner_id=$1`, [V]))[0].id;
const FID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const insert = (ws, path, extra = '') => as('service_role', (tx) => tx.query(
  `insert into public.uploads (workspace_id, purpose, bucket, file_path, declared_mime, declared_size, expires_at)
   values ($1,'source','sources',$2,'image/png',1000, now() + interval '5 minutes') ${extra}`, [ws, path]));

await check('TR-SEC-01 : RLS activée sur uploads', async () =>
  (await q(`select relrowsecurity from pg_class where oid='public.uploads'::regclass`))[0].relrowsecurity === true);
await check('TR-SEC-01 : un membre (même du bon espace) ne lit ni n’écrit uploads', async () => {
  await insert(WS, `${WS}/${FID}.png`);
  const read = await as('authenticated', async (tx) => {
    await tx.exec(`set local request.jwt.claim.sub = '${U}'`);
    try { return (await tx.query('select 1 from public.uploads')).rows.length; } catch { return -1; }
  });
  const write = await denied(() => as('authenticated', (tx) => tx.query(
    `insert into public.uploads (workspace_id, purpose, bucket, file_path, declared_mime, declared_size, expires_at)
     values ($1,'source','sources',$2,'image/png',1,now())`, [WS, `${WS}/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png`])));
  return (read === 0 || read === -1) && write;
});
await check('TR-SEC-08 : un chemin hors de l’espace est refusé par la base', async () =>
  denied(() => insert(WS, `${WS2}/${FID}.png`)).then(() => true).catch(() => true) && await (async () => {
    try { await insert(WS, `${WS2}/cccccccc-cccc-4ccc-8ccc-cccccccccccc.png`); return false; } catch (e) { return /check|violates/i.test(e.message); }
  })());
await check('TR-SEC-08 : une extension ou un nom choisi par le client est refusé (chemin = uuid + extension du type réel)', async () => {
  for (const p of [`${WS}/photo.png`, `${WS}/../x/${FID}.png`, `${WS}/${FID}.exe`, `${WS}/${FID}.png.php`]) {
    try { await insert(WS, p); return false; } catch (e) { if (!/check|violates/i.test(e.message)) return false; }
  }
  return true;
});
await check('TR-SEC-08 : taille déclarée au-delà de 20 Mo ou type hors liste refusés', async () => {
  for (const [mime, size] of [['image/png', 20971521], ['image/gif', 10], ['text/html', 10], ['image/png', 0]]) {
    try {
      await as('service_role', (tx) => tx.query(
        `insert into public.uploads (workspace_id, purpose, bucket, file_path, declared_mime, declared_size, expires_at)
         values ($1,'source','sources',$2,$3,$4,now())`, [WS, `${WS}/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png`, mime, size]));
      return false;
    } catch (e) { if (!/check|violates/i.test(e.message)) return false; }
  }
  return true;
});
await check('un fichier « vérifié » doit porter son vrai type, sa taille et sa date', async () => {
  try {
    await as('service_role', (tx) => tx.query(`update public.uploads set status='verified' where file_path=$1`, [`${WS}/${FID}.png`]));
    return false;
  } catch (e) { return /check|violates/i.test(e.message); }
});
await check('le même chemin ne peut pas être enregistré deux fois', async () => {
  try { await insert(WS, `${WS}/${FID}.png`); return false; } catch (e) { return /unique|duplicate/i.test(e.message); }
});
await check('agent_runs porte error_code, provider, requested_model, attempts (contraintes comprises)', async () => {
  await as('service_role', (tx) => tx.query(
    `insert into public.agent_runs (agent, model, prompt_version, valid_schema, error_code, provider, requested_model, attempts)
     values ('analyste','a/b','analyste@3',true,null,'openrouter','a/b',1)`));
  for (const extra of [`provider='autre'`, `attempts=3`]) {
    try {
      await as('service_role', (tx) => tx.query(`update public.agent_runs set ${extra}`));
      return false;
    } catch (e) { if (!/check|violates/i.test(e.message)) return false; }
  }
  return true;
});
await check('agent_runs reste invisible aux clients (S13 : administrateur seulement)', async () =>
  (await as('authenticated', async (tx) => {
    await tx.exec(`set local request.jwt.claim.sub = '${U}'`);
    return (await tx.query('select 1 from public.agent_runs')).rows.length;
  })) === 0);

await check('0009 : analyses.flags existe, vaut {} par défaut et reste borné à 40 signalements', async () => {
  const [{ id: aid }] = await q(`insert into public.analyses (workspace_id) values ($1) returning id`, [WS]);
  const [row] = await q('select flags from public.analyses where id=$1', [aid]);
  if (row.flags.length !== 0) return false;
  await db.query('update public.analyses set flags=$2 where id=$1', [aid, ['PROMPT_INJECTION_SUSPECTED']]);
  try {
    await db.query('update public.analyses set flags=$2 where id=$1', [aid, Array.from({ length: 41 }, (_, i) => 'F' + i)]);
    return false;
  } catch (e) { return /check|violates/i.test(e.message); }
});
await check('0009 : un membre lit les flags de ses analyses, pas ceux d’un autre espace (RLS)', async () => {
  await db.query(`insert into public.analyses (workspace_id, flags) values ($1, '{AUTRE_ESPACE}')`, [WS2]);
  const own = await as('authenticated', async (tx) => {
    await tx.exec(`set local request.jwt.claim.sub = '${U}'`);
    return (await tx.query('select flags from public.analyses')).rows.flatMap((r) => r.flags);
  });
  return own.includes('PROMPT_INJECTION_SUSPECTED') && !own.includes('AUTRE_ESPACE');
});

console.log(results.join('\n'));
console.log(`\n${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);

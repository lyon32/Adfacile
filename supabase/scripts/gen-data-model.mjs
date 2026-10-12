// Génère la section « Schémas des tables » de docs/architecture/DATA_MODEL.md à partir de la VRAIE base
// (migrations appliquées dans PGlite). Usage : node supabase/scripts/gen-data-model.mjs <dossier pglite> > sortie.md
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(process.argv[2], 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
`);
const migDir = join(here, '..', 'migrations');
for (const f of readdirSync(migDir).filter(f => f.endsWith('.sql') && !f.includes('storage')).sort()) {
  await db.exec(readFileSync(join(migDir, f), 'utf8'));
}

const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const tables = await q(`select table_schema s, table_name t from information_schema.tables
  where table_schema in ('public','private','audit') and table_type='BASE TABLE' order by 1,2`);
const esc = (x) => String(x ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

let out = '';
for (const { s, t } of tables) {
  const cols = await q(`select c.column_name n,
      case when c.data_type='USER-DEFINED' then c.udt_name when c.data_type='ARRAY' then replace(c.udt_name,'_','')||'[]' else c.data_type end ty,
      c.character_maximum_length len, c.is_nullable nul, c.column_default def, c.is_identity ident
    from information_schema.columns c where c.table_schema=$1 and c.table_name=$2 order by c.ordinal_position`, [s, t]);
  const cons = await q(`select con.conname, con.contype, pg_get_constraintdef(con.oid) def
    from pg_constraint con join pg_class rel on rel.oid=con.conrelid join pg_namespace n on n.oid=rel.relnamespace
    where n.nspname=$1 and rel.relname=$2 order by con.contype, con.conname`, [s, t]);
  const idx = await q(`select indexname, indexdef from pg_indexes where schemaname=$1 and tablename=$2 order by indexname`, [s, t]);
  const pol = await q(`select count(*)::int n from pg_policies where schemaname=$1 and tablename=$2`, [s, t]);

  out += `\n#### \`${s}.${t}\`\n\n| Colonne | Type | Null | Défaut |\n|---|---|---|---|\n`;
  for (const c of cols) {
    const ty = c.ty + (c.len ? `(${c.len})` : '');
    const def = c.ident === 'YES' ? 'identity' : (c.def ?? '');
    out += `| ${c.n} | ${esc(ty)} | ${c.nul === 'YES' ? 'oui' : 'non'} | ${esc(def)} |\n`;
  }
  const label = { p: 'Clé primaire', f: 'Clé étrangère', u: 'Unique', c: 'Contrôle' };
  if (cons.length) {
    out += `\n| Contrainte | Définition |\n|---|---|\n`;
    for (const c of cons) out += `| ${label[c.contype] ?? c.contype} | \`${esc(c.def)}\` |\n`;
  }
  const extra = idx.filter(i => !cons.some(c => c.conname === i.indexname));
  if (extra.length) {
    out += `\n| Index | Définition |\n|---|---|\n`;
    for (const i of extra) out += `| ${i.indexname} | \`${esc(i.indexdef.replace(/^CREATE (UNIQUE )?INDEX \S+ ON /, (m, u) => (u ? 'UNIQUE ' : '')))}\` |\n`;
  }
  out += `\nRLS : activée · ${pol[0].n} politique(s)${s !== 'public' ? ' · schéma non exposé par l’API' : ''}\n`;
}
const enums = await q(`select t.typname n, string_agg(e.enumlabel, ' · ' order by e.enumsortorder) v
  from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace ns on ns.oid=t.typnamespace
  where ns.nspname='public' group by 1 order by 1`);
let en = '\n| Énumération | Valeurs |\n|---|---|\n';
for (const e of enums) en += `| ${e.n} | ${e.v} |\n`;
console.log(`<!-- GÉNÉRÉ PAR supabase/scripts/gen-data-model.mjs — ne pas modifier à la main -->\n### Énumérations\n${en}\n### Tables (${tables.length})\n${out}`);

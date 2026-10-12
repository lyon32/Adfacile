// `pnpm ci:env` (CI_CD §9) : écrit sur la sortie standard, au format KEY=valeur de
// $GITHUB_ENV, les variables des tests d'intégration et du build :
// - clés de la pile Supabase locale, lues avec `supabase status -o env` (CLI 2.118.0 :
//   API_URL, PUBLISHABLE_KEY, SECRET_KEY, DB_URL) ;
// - ADMIN_PATH, APP_SIGNING_SECRET, TOKEN_ENCRYPTION_KEYS, TOKEN_ENCRYPTION_ACTIVE_KEY_ID,
//   tirés au hasard à chaque exécution.
// Pile absente (tâche « Build ») : seules les valeurs tirées au hasard sont écrites, avec un
// avertissement sur la sortie d'erreur. Aucune valeur n'est jamais écrite dans un journal.
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function randomAlphanumeric(length) {
  let out = '';
  for (const byte of randomBytes(length)) out += ALPHANUM.charAt(byte % ALPHANUM.length);
  return out;
}

/** Lignes `CLE="valeur"` de `supabase status -o env` → objet. */
export function parseStatusEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(?:"(.*)"|(.*))$/.exec(line.trim());
    if (m) out[m[1]] = m[2] ?? m[3] ?? '';
  }
  return out;
}

export function buildTestEnv(status, current = process.env) {
  const env = {
    ADMIN_PATH: randomAlphanumeric(32),
    APP_SIGNING_SECRET: randomBytes(32).toString('base64'),
    TOKEN_ENCRYPTION_KEYS: JSON.stringify({ ci: randomBytes(32).toString('base64') }),
    TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'ci',
  };
  // Valeurs publiques par défaut (déjà posées par ci.yml) pour un poste local.
  const defaults = {
    NEXT_PUBLIC_APP_ENV: 'development',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:5173',
    NEXT_PUBLIC_APP_URL: 'http://app.localhost:5173',
    SITE_HOSTS: 'localhost:5173',
    PUBEKA_FAKE_PROVIDERS: 'all',
    PUBEKA_JOB_DISPATCH: 'inline',
  };
  for (const [k, v] of Object.entries(defaults)) if (!current[k]) env[k] = v;
  if (status) {
    const pick = {
      NEXT_PUBLIC_SUPABASE_URL: 'API_URL',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'PUBLISHABLE_KEY',
      SUPABASE_SECRET_KEY: 'SECRET_KEY',
      SUPABASE_DB_URL: 'DB_URL',
    };
    for (const [target, source] of Object.entries(pick)) {
      if (!status[source]) throw new Error(`supabase status : ${source} absent`);
      env[target] = status[source];
    }
  }
  return env;
}

function readStatus() {
  try {
    // Commande fixe, sans aucune donnée extérieure.
    const text = execSync('pnpm exec supabase status -o env', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parseStatusEnv(text);
  } catch {
    process.stderr.write('ci:env : pile Supabase locale absente, clés Supabase non écrites.\n');
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = buildTestEnv(readStatus());
  for (const [k, v] of Object.entries(env)) process.stdout.write(`${k}=${v}\n`);
}

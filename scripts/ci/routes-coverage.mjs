// `pnpm test:routes-coverage` (TESTING §4.2) : chaque opération d'openapi.yaml dont la route
// existe dans apps/web/app/api/v1 doit avoir ses 5 cas déclarés par `describeRoute()` dans un
// fichier `*.int.test.ts` (une fonction de test, ou `na('raison')` si le cas est sans objet).
// Échoue aussi pour un gestionnaire exporté par une route absente du contrat.
// Les opérations du contrat pas encore codées sont listées (leur session les ajoutera).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CASES = [
  'success',
  'unauthenticated',
  'otherWorkspace',
  'forbiddenRole',
  'invalidBody',
];
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** Opérations du contrat : { path, method, operationId }. Lecture ligne à ligne du YAML. */
export function parseOperations(yamlText) {
  const ops = [];
  let inPaths = false;
  let path = null;
  let method = null;
  for (const line of yamlText.split(/\r?\n/)) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths && /^\S/.test(line)) inPaths = false;
    if (!inPaths) continue;
    const p = /^ {2}(\/\S*):\s*$/.exec(line);
    if (p) {
      path = p[1];
      method = null;
      continue;
    }
    const m = /^ {4}([a-z]+):/.exec(line);
    if (m) {
      method = METHODS.includes(m[1]) ? m[1] : null;
      continue;
    }
    const o = /^ {6}operationId:\s*(\S+)/.exec(line);
    if (o && path && method) ops.push({ path, method: method.toUpperCase(), operationId: o[1] });
  }
  return ops;
}

/** `/workspaces/{workspaceId}/x` → `workspaces/[workspaceId]/x/route.ts`. */
export function routeFileFor(apiPath) {
  return join(
    ...apiPath
      .split('/')
      .filter(Boolean)
      .map((s) => s.replace(/^\{(.+)\}$/, '[$1]')),
    'route.ts',
  );
}

export function exportedMethods(source) {
  const out = new Set();
  for (const m of source.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) out.add(m[1]);
  return out;
}

/** Cas déclarés par describeRoute('opId', { … }) dans un texte de test. */
export function declaredCases(testSource) {
  const out = new Map();
  const starts = [...testSource.matchAll(/describeRoute\(\s*['"]([A-Za-z0-9_]+)['"]/g)];
  starts.forEach((m, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : testSource.length;
    const block = testSource.slice(m.index, end);
    const found = new Set(out.get(m[1]) ?? []);
    for (const c of CASES) if (new RegExp(`\\b${c}\\s*:`).test(block)) found.add(c);
    out.set(m[1], found);
  });
  return out;
}

function walk(dir, predicate, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, predicate, acc);
    else if (predicate(full)) acc.push(full);
  }
  return acc;
}

export function check(root) {
  const apiDir = join(root, 'apps/web/app/api/v1');
  const ops = parseOperations(readFileSync(join(root, 'api/openapi.yaml'), 'utf8'));
  const declared = new Map();
  for (const file of walk(join(root, 'apps/web'), (f) => f.endsWith('.int.test.ts'))) {
    for (const [op, cases] of declaredCases(readFileSync(file, 'utf8'))) {
      declared.set(op, new Set([...(declared.get(op) ?? []), ...cases]));
    }
  }
  const errors = [];
  const covered = [];
  const pending = [];
  const known = new Set();
  for (const op of ops) {
    const file = join(apiDir, routeFileFor(op.path));
    known.add(`${op.method} ${file}`);
    if (!existsSync(file) || !exportedMethods(readFileSync(file, 'utf8')).has(op.method)) {
      pending.push(op.operationId);
      continue;
    }
    const cases = declared.get(op.operationId);
    const missing = CASES.filter((c) => !cases?.has(c));
    if (missing.length > 0)
      errors.push(
        `${op.operationId} (${op.method} ${op.path}) : cas manquants ${missing.join(', ')}`,
      );
    else covered.push(op.operationId);
  }
  for (const file of walk(apiDir, (f) => f.endsWith('route.ts'))) {
    for (const method of exportedMethods(readFileSync(file, 'utf8'))) {
      if (!known.has(`${method} ${file}`)) {
        errors.push(
          `${method} ${relative(root, file)} : absente d'openapi.yaml (le contrat d'abord)`,
        );
      }
    }
  }
  return { errors, covered, pending };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = resolve(process.argv[2] ?? '.');
  const { errors, covered, pending } = check(root);
  process.stdout.write(
    `Opérations couvertes (5 cas) : ${covered.length} — ${covered.join(', ')}\n`,
  );
  process.stdout.write(`Opérations pas encore codées : ${pending.length}\n`);
  if (errors.length > 0) {
    process.stderr.write(`${errors.map((e) => `✗ ${e}`).join('\n')}\n`);
    process.exit(1);
  }
}

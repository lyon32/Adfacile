// Tests des scripts de CI (lancés par `pnpm test:routes-coverage` avec `node --test`).
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  check,
  declaredCases,
  exportedMethods,
  parseOperations,
  routeFileFor,
} from './routes-coverage.mjs';
import { buildTestEnv, parseStatusEnv, randomAlphanumeric } from './write-test-env.mjs';

const YAML = `openapi: 3.1.0
paths:
  /me:
    get:
      operationId: getMe
    patch:
      operationId: updateMe
    delete:
      operationId: deleteMe
  /workspaces/{workspaceId}:
    get:
      operationId: getWorkspace
components:
  schemas: {}
`;

test('parseOperations lit chemin, méthode et operationId', () => {
  assert.deepEqual(parseOperations(YAML), [
    { path: '/me', method: 'GET', operationId: 'getMe' },
    { path: '/me', method: 'PATCH', operationId: 'updateMe' },
    { path: '/me', method: 'DELETE', operationId: 'deleteMe' },
    { path: '/workspaces/{workspaceId}', method: 'GET', operationId: 'getWorkspace' },
  ]);
  assert.equal(
    routeFileFor('/workspaces/{workspaceId}'),
    join('workspaces', '[workspaceId]', 'route.ts'),
  );
  assert.deepEqual(
    [...exportedMethods('export const GET = 1;\nexport const PATCH = 2;')],
    ['GET', 'PATCH'],
  );
});

test('declaredCases lit les cas de chaque describeRoute', () => {
  const cases = declaredCases(`describeRoute('getMe', { success: f, unauthenticated: f });
describeRoute("updateMe", { invalidBody: na('x') })`);
  assert.deepEqual([...cases.get('getMe')], ['success', 'unauthenticated']);
  assert.deepEqual([...cases.get('updateMe')], ['invalidBody']);
});

function fixture({ cases, extraRoute = false }) {
  const root = mkdtempSync(join(tmpdir(), 'routes-cov-'));
  mkdirSync(join(root, 'api'));
  writeFileSync(join(root, 'api/openapi.yaml'), YAML);
  mkdirSync(join(root, 'apps/web/app/api/v1/me'), { recursive: true });
  writeFileSync(join(root, 'apps/web/app/api/v1/me/route.ts'), 'export const GET = 1;\n');
  if (extraRoute) {
    mkdirSync(join(root, 'apps/web/app/api/v1/other'), { recursive: true });
    writeFileSync(join(root, 'apps/web/app/api/v1/other/route.ts'), 'export const POST = 1;\n');
  }
  writeFileSync(join(root, 'apps/web/me.int.test.ts'), `describeRoute('getMe', { ${cases} });`);
  return root;
}

test('check : 5 cas déclarés → couvert ; cas manquant ou route hors contrat → erreur', () => {
  const all =
    'success: a, unauthenticated: a, otherWorkspace: na("x"), forbiddenRole: na("x"), invalidBody: na("x")';
  let r = check(fixture({ cases: all }));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.covered, ['getMe']);
  assert.deepEqual(r.pending, ['updateMe', 'deleteMe', 'getWorkspace']);
  r = check(fixture({ cases: 'success: a' }));
  assert.match(
    r.errors[0],
    /getMe .* cas manquants unauthenticated, otherWorkspace, forbiddenRole, invalidBody/,
  );
  r = check(fixture({ cases: all, extraRoute: true }));
  assert.match(r.errors[0], /POST .*other.*absente d'openapi\.yaml/);
});

test('ci:env : clés de la pile locale et secrets tirés au hasard', () => {
  const status = parseStatusEnv(
    'API_URL="http://127.0.0.1:54321"\nPUBLISHABLE_KEY=sb_publishable_x\nSECRET_KEY="sb_secret_y"\nDB_URL="postgresql://p"\n',
  );
  const env = buildTestEnv(status, {});
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:54321');
  assert.equal(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 'sb_publishable_x');
  assert.equal(env.SUPABASE_SECRET_KEY, 'sb_secret_y');
  assert.equal(env.SUPABASE_DB_URL, 'postgresql://p');
  assert.match(env.ADMIN_PATH, /^[A-Za-z0-9]{32}$/);
  assert.equal(Buffer.from(env.APP_SIGNING_SECRET, 'base64').length, 32);
  assert.equal(Buffer.from(JSON.parse(env.TOKEN_ENCRYPTION_KEYS).ci, 'base64').length, 32);
  assert.equal(env.TOKEN_ENCRYPTION_ACTIVE_KEY_ID, 'ci');
  assert.notEqual(buildTestEnv(null, {}).ADMIN_PATH, buildTestEnv(null, {}).ADMIN_PATH);
  assert.equal(buildTestEnv(null, { NEXT_PUBLIC_APP_URL: 'x' }).NEXT_PUBLIC_APP_URL, undefined);
  assert.equal(randomAlphanumeric(5).length, 5);
  assert.throws(() => buildTestEnv({ API_URL: 'x' }, {}), /PUBLISHABLE_KEY absent/);
});

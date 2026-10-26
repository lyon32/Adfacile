// S19 / TR-PAY-07 / SECURITY_NOTES §2.7 : toute route d'ÉCRITURE du contrat est classée. Seules les actions ✱
// (pause d'une campagne, paiement, preuve de paiement, support, profil), les lectures déguisées en POST et les
// routes sans espace échappent à `writable: true`. Une nouvelle route d'écriture non classée fait échouer ce test :
// la session qui l'ajoute doit choisir son sort ici, par écrit.
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../../..');
const API_DIR = join(ROOT, 'apps/web/app/api/v1');

type Kind =
  /** Écriture dans un espace : `writable: true` obligatoire (403 workspace_read_only / workspace_suspended). */
  | 'writable'
  /** Action ✱ : toujours permise, même en suspension (pause, support, profil : SECURITY_NOTES §2.1). */
  | 'star'
  /** ✱ d'argent : permise en lecture seule, REFUSÉE en suspension (décision 4) : `writable: 'not_suspended'`. */
  | 'not_suspended'
  /** Lecture ou action sans effet sur l'espace, permise en lecture seule (tableaux de §2.4). */
  | 'read'
  /** Route sans espace (invitation) : l'état de l'espace est contrôlé dans le cas d'usage. */
  | 'personal'
  /** Webhook d'un fournisseur (signature) ou administration (aal2) : hors des droits d'un membre. */
  | 'outside';

const WS = '/workspaces/{workspaceId}';
const CAMPAIGN = `${WS}/campaigns/{campaignId}`;

const CLASSES: Record<string, Kind> = {
  // Compte et équipe
  'PATCH /me': 'star',
  'DELETE /me': 'star',
  'POST /me/export': 'star',
  [`PATCH ${WS}`]: 'writable',
  [`PATCH ${WS}/members/{profileId}`]: 'writable',
  [`DELETE ${WS}/members/{profileId}`]: 'writable',
  [`POST ${WS}/invitations`]: 'writable',
  [`POST ${WS}/transfer-ownership`]: 'writable',
  'POST /invitations/accept': 'personal',
  // Meta et marque
  [`POST ${WS}/meta/connect`]: 'writable',
  [`DELETE ${WS}/meta/connections/{connectionId}`]: 'writable',
  [`POST ${WS}/meta/connections/{connectionId}/health-check`]: 'writable',
  [`PATCH ${WS}/pages/{pageId}`]: 'writable',
  [`PUT ${WS}/pages/{pageId}/brand-kit`]: 'writable',
  [`POST ${WS}/ad-accounts/{adAccountId}/activate`]: 'writable',
  // Campagnes
  [`POST ${WS}/uploads`]: 'writable',
  [`POST ${WS}/analyses`]: 'writable',
  [`POST ${WS}/analyses/{analysisId}/answers`]: 'writable',
  [`POST ${WS}/campaigns`]: 'writable',
  [`PATCH ${CAMPAIGN}`]: 'writable',
  [`POST ${CAMPAIGN}/proposals`]: 'writable',
  [`POST ${CAMPAIGN}/proposals/{version}/choose`]: 'writable',
  [`POST ${CAMPAIGN}/publish`]: 'writable',
  [`POST ${CAMPAIGN}/pause`]: 'star',
  [`POST ${CAMPAIGN}/resume`]: 'writable',
  [`POST ${CAMPAIGN}/relaunch`]: 'writable',
  [`POST ${CAMPAIGN}/stats/refresh`]: 'read',
  [`POST ${CAMPAIGN}/rejections/{rejectionId}/apply-fix`]: 'writable',
  // Générations et visuels (S21 à S23)
  [`POST ${WS}/generations`]: 'writable',
  [`POST ${WS}/generations/{generationId}/cancel`]: 'not_suspended',
  [`POST ${WS}/generations/{generationId}/fallback`]: 'writable',
  [`PATCH ${WS}/visuals/{visualId}`]: 'writable',
  [`POST ${WS}/visuals/{visualId}/edit`]: 'writable',
  [`POST ${WS}/visuals/{visualId}/formats`]: 'writable',
  // Argent, support, notifications (S24 à S29)
  [`POST ${WS}/checkout`]: 'not_suspended',
  [`POST ${WS}/payment-proofs`]: 'not_suspended',
  [`POST ${WS}/recommendations/{recommendationId}/{decision}`]: 'writable',
  'POST /notifications/read': 'star',
  'PUT /notifications/preferences': 'star',
  [`POST ${WS}/tickets`]: 'star',
  [`POST ${WS}/tickets/{ticketId}/messages`]: 'star',
  [`POST ${WS}/assistant/messages`]: 'star',
  // Fournisseurs et administration
  'POST /webhooks/saspay': 'outside',
  'POST /webhooks/meta': 'outside',
  'POST /webhooks/{provider}': 'outside',
  'PATCH /admin/workspaces/{workspaceId}': 'outside',
  'POST /admin/workspaces/{workspaceId}/credits': 'outside',
  'POST /admin/payment-proofs/{proofId}/{decision}': 'outside',
  'POST /admin/tickets/{ticketId}/messages': 'outside',
  'PUT /admin/media-models/{modelId}': 'outside',
  'PUT /admin/routing-rules/{capability}': 'outside',
  'PUT /admin/settings/{key}': 'outside',
  'PUT /admin/vat-rates/{countryCode}': 'outside',
};

/** Les seules actions ✱ : SECURITY_NOTES §2.1. En ajouter une demande une décision écrite de la personne. */
const STAR_ACTIONS = [
  'DELETE /me',
  'PATCH /me',
  'POST /me/export',
  'POST /notifications/read',
  `POST ${WS}/assistant/messages`,
  `POST ${CAMPAIGN}/pause`,
  `POST ${WS}/tickets`,
  `POST ${WS}/tickets/{ticketId}/messages`,
  'PUT /notifications/preferences',
];

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

function contractWrites(): string[] {
  const out: string[] = [];
  let inPaths = false;
  let path: string | null = null;
  for (const line of readFileSync(join(ROOT, 'api/openapi.yaml'), 'utf8').split(/\r?\n/)) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }
    if (inPaths && /^\S/.test(line)) inPaths = false;
    if (!inPaths) continue;
    const p = /^ {2}(\/\S*):\s*$/.exec(line);
    if (p) {
      path = p[1] ?? null;
      continue;
    }
    const m = /^ {4}(post|put|patch|delete):/.exec(line);
    if (m && path !== null) out.push(`${(m[1] ?? '').toUpperCase()} ${path}`);
  }
  return out;
}

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === 'route.ts') out.push(full);
  }
  return out;
}

/** `/workspaces/{workspaceId}/x` devient `.../workspaces/[workspaceId]/x/route.ts`. */
function fileOf(contractPath: string): string {
  const segments = contractPath
    .split('/')
    .filter(Boolean)
    .map((s) => s.replace(/^\{(.+)\}$/, '[$1]'));
  return join(API_DIR, ...segments, 'route.ts');
}

/** Retire les commentaires : un commentaire « writable: true » ne protège rien. */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** Le fichier exporte-t-il ce verbe HTTP, sous quelque forme que ce soit ? */
export function exportsMethod(src: string, method: string): boolean {
  const code = stripComments(src);
  return (
    new RegExp(`export\\s+(?:const|let|var|async\\s+function|function)\\s+${method}\\b`).test(
      code,
    ) || new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`).test(code)
  );
}

/**
 * Texte du gestionnaire `api({...}, …)` d'un verbe. Reconnaît `export const M = api(` et `export const M = withX(api(`.
 * Toute AUTRE forme exportée (fonction, ré-export, alias) est inconnue : le test échoue plutôt que d'ignorer la route.
 */
export function handlerOf(
  src: string,
  method: string,
): { kind: 'api'; source: string } | { kind: 'unknown' } | null {
  if (!exportsMethod(src, method)) return null;
  const code = stripComments(src);
  const start = code.search(
    new RegExp(`export\\s+const\\s+${method}\\s*=\\s*(?:[\\w.]+\\(\\s*)*api\\(`),
  );
  if (start < 0) return { kind: 'unknown' };
  const rest = code.slice(start + 1);
  const next = rest.search(/\nexport\s/);
  return {
    kind: 'api',
    source: next < 0 ? code.slice(start) : code.slice(start, start + 1 + next),
  };
}

/** Texte (sans commentaires) du gestionnaire d'un verbe dans un fichier de route ; null si absent ; échoue si la forme est inconnue. */
function handlerSource(file: string, method: string): string | null {
  if (!existsSync(file)) return null;
  const found = handlerOf(readFileSync(file, 'utf8'), method);
  if (found === null) return null;
  if (found.kind === 'unknown') {
    throw new Error(
      `${file} : ${method} exporté sous une forme que ce test ne sait pas lire (api(...) attendu)`,
    );
  }
  return found.source;
}

/** `writable: true`, `writable: 'not_suspended'` ou rien (commentaires exclus). */
export function writableOf(source: string): 'true' | 'not_suspended' | null {
  const code = stripComments(source);
  if (/\bwritable:\s*true\b/.test(code)) return 'true';
  if (/\bwritable:\s*['"]not_suspended['"]/.test(code)) return 'not_suspended';
  return null;
}

describe('TR-PAY-07 : routes d’écriture et lecture seule', () => {
  const writes = contractWrites();

  it('toute route d’écriture du contrat est classée, et rien d’autre (une nouvelle route non classée échoue)', () => {
    expect(writes.length).toBeGreaterThan(40);
    expect([...writes].sort()).toEqual(Object.keys(CLASSES).sort());
  });

  it('seules les actions ✱ de SECURITY_NOTES §2.1 sont marquées ✱', () => {
    const stars = Object.entries(CLASSES)
      .filter(([, kind]) => kind === 'star')
      .map(([key]) => key)
      .sort();
    expect(stars).toEqual([...STAR_ACTIONS].sort());
  });

  it('chaque route d’écriture codée déclare `writable: true`, sauf ✱, lectures et routes sans espace', () => {
    const checked: string[] = [];
    for (const key of writes) {
      const [method = '', path = ''] = key.split(' ');
      const kind = CLASSES[key];
      const source = handlerSource(fileOf(path), method);
      if (source === null) continue; // pas encore codée : sa session la déclarera (le test ci-dessus la force à la classer)
      checked.push(key);
      const expected =
        kind === 'writable' ? 'true' : kind === 'not_suspended' ? 'not_suspended' : null;
      expect(
        writableOf(source),
        `${key} (${String(kind)}) : writable attendu ${String(expected)}`,
      ).toBe(expected);
    }
    // Garde contre un chemin mal calculé : les routes d'espace déjà codées sont bien vérifiées.
    expect(checked).toContain(`POST ${CAMPAIGN}/publish`);
    expect(checked).toContain(`POST ${CAMPAIGN}/pause`);
    expect(checked.length).toBeGreaterThanOrEqual(20);
  });

  it('la pause (✱) reste réservée aux rôles propriétaire et éditeur', () => {
    const pause = handlerSource(fileOf(`${CAMPAIGN}/pause`), 'POST');
    expect(pause).toMatch(/roles:\s*\['owner',\s*'editor'\]/);
  });

  it('aucun gestionnaire d’écriture dans app/api/v1 n’échappe au contrat', () => {
    const declared = new Set(writes);
    const found: string[] = [];
    for (const file of routeFiles(API_DIR)) {
      const rel = file
        .slice(API_DIR.length)
        .replace(/\\/g, '/')
        .replace(/\/route\.ts$/, '');
      const contractPath = rel.replace(/\[(\w+)\]/g, '{$1}');
      const src = readFileSync(file, 'utf8');
      for (const method of WRITE_METHODS) {
        if (!exportsMethod(src, method)) continue;
        // Forme inconnue (fonction, ré-export…) : refusée, jamais ignorée.
        expect(
          handlerOf(src, method)?.kind,
          `${method} ${contractPath} : forme d'export inconnue`,
        ).toBe('api');
        if (!declared.has(`${method} ${contractPath}`)) found.push(`${method} ${contractPath}`);
      }
    }
    expect(found).toEqual([]);
  });
});

// Tâches de fond (jobs/src/handlers) : aucune ne démarre de travail payant ou d'écriture pour un espace en lecture
// seule sans y avoir été autorisée par une route `writable`. Une nouvelle tâche doit être classée ici.
const JOBS: Record<string, string> = {
  'analysis-run': 'lancée par la route analyses (writable) ; finit ce qui a été autorisé',
  'campaign-publish':
    'lancée par publish / relaunch / apply-fix (writable) ; finit la publication autorisée',
  'campaign-reconcile': 'rapprochement en LECTURE chez Meta des publications restées en cours',
  'campaign-sync':
    'miroir de Meta (statuts, statistiques) : les campagnes continuent chez Meta en lecture seule',
  'campaign-explain':
    'travail du système : ignore les espaces en lecture seule ou suspendus (S19, loadWorkspaceAccess)',
  'fx-refresh': 'taux de change, aucun espace',
  'system-ping': 'sonde technique, aucun espace',
};

describe('TR-PAY-07 : tâches de fond', () => {
  it('chaque tâche est classée (une nouvelle tâche non classée échoue)', () => {
    const dir = join(ROOT, 'jobs/src/handlers');
    const found = readdirSync(dir)
      .filter((n) => n.endsWith('.ts') && !n.endsWith('.test.ts'))
      .map((n) => n.replace(/.ts$/, ''))
      .sort();
    expect(found).toEqual(Object.keys(JOBS).sort());
  });
});

// Espace VERROUILLÉ (essai terminé sans abonnement, ou grâce écoulée ; décision de la personne du 26/10/2026) : TOUT est refusé,
// lecture des statistiques comprise (`403 workspace_locked`), sauf cette liste : s'abonner ou renouveler (checkout, preuve de
// paiement), mettre en pause une campagne qui diffuse chez Meta, écrire au support, lire l'état de l'espace pour afficher l'écran de
// verrouillage, et la gestion du compte (routes sans espace, hors de ce contrôle). Toute autre route d'espace doit refuser.
const LOCKED_OK = new Set([
  `GET ${WS}`,
  `POST ${CAMPAIGN}/pause`,
  `POST ${WS}/checkout`,
  `POST ${WS}/payment-proofs`,
  `POST ${WS}/tickets`,
  `POST ${WS}/tickets/{ticketId}/messages`,
  `POST ${WS}/assistant/messages`,
  `POST ${WS}/generations/{generationId}/cancel`,
]);

describe('TR-PAY-07 : espace verrouillé', () => {
  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

  it('seules les routes de la liste restent permises quand l’espace est verrouillé ; toutes les autres routes d’espace refusent', () => {
    const allowedFound: string[] = [];
    const checked: string[] = [];
    for (const file of routeFiles(API_DIR)) {
      const rel = file
        .slice(API_DIR.length)
        .replace(/\\/g, '/')
        .replace(/\/route\.ts$/, '');
      if (!rel.startsWith('/workspaces/')) continue; // routes sans espace : /me, /notifications, /invitations… hors de ce contrôle
      const contractPath = rel.replace(/\[(\w+)\]/g, '{$1}');
      const src = readFileSync(file, 'utf8');
      for (const method of METHODS) {
        if (!exportsMethod(src, method)) continue;
        const handler = handlerOf(src, method);
        expect(handler?.kind, `${method} ${contractPath} : forme inconnue`).toBe('api');
        if (handler?.kind !== 'api') continue;
        const key = `${method} ${contractPath}`;
        checked.push(key);
        const code = stripComments(handler.source);
        const allows =
          /\ballowLocked:\s*true\b/.test(code) || writableOf(handler.source) === 'not_suspended';
        expect(allows, `${key} : allowLocked ${LOCKED_OK.has(key) ? 'attendu' : 'interdit'}`).toBe(
          LOCKED_OK.has(key),
        );
        if (allows) allowedFound.push(key);
      }
    }
    expect(checked.length).toBeGreaterThan(30);
    expect(allowedFound.sort()).toEqual(
      [...LOCKED_OK].filter((key) => checked.includes(key)).sort(),
    );
  });

  it('lecture : une route GET de statistiques refuse en verrouillé (elle ne déclare pas allowLocked)', () => {
    const stats = readFileSync(
      join(API_DIR, 'workspaces/[workspaceId]/campaigns/[campaignId]/stats/route.ts'),
      'utf8',
    );
    expect(/allowLocked/.test(stripComments(stats))).toBe(false);
  });
});

describe('lecteur de routes (durcissement)', () => {
  const route = (body: string) => `import { api } from 'x';\n${body}\n`;

  it('un commentaire « writable: true » ne suffit pas', () => {
    const src = route(
      [
        'export const POST = api(',
        '  // writable: true,',
        '  /* writable: true */',
        "  { auth: 'member', rateLimit: 'write' },",
        '  async () => ({ status: 204 }),',
        ');',
      ].join('\n'),
    );
    const found = handlerOf(src, 'POST');
    expect(found?.kind).toBe('api');
    expect(found?.kind === 'api' ? writableOf(found.source) : 'x').toBeNull();
  });

  it('writable: true et writable: not_suspended sont reconnus', () => {
    expect(writableOf("api({ auth: 'member', writable: true, rateLimit: 'write' }")).toBe('true');
    expect(writableOf("api({ auth: 'member', writable: 'not_suspended' }")).toBe('not_suspended');
    expect(writableOf("api({ auth: 'member' }")).toBeNull();
  });

  it('reconnaît api(...) enveloppé : export const POST = withAudit(api(...))', () => {
    const wrapped = "export const POST = withAudit(api({ auth: 'member', writable: true }, h));";
    expect(handlerOf(route(wrapped), 'POST')?.kind).toBe('api');
  });

  it('formes inconnues : fonction exportée, ré-export, alias donnent « unknown », jamais ignorées', () => {
    const fn = 'export async function POST() { return new Response(); }';
    expect(handlerOf(route(fn), 'POST')?.kind).toBe('unknown');
    const reexport = 'const h = api({}, g);\nexport { h as POST };';
    expect(handlerOf(route(reexport), 'POST')?.kind).toBe('unknown');
    expect(handlerOf(route('export const POST = handler;'), 'POST')?.kind).toBe('unknown');
  });

  it('un verbe non exporté est absent ; un export commenté ne compte pas', () => {
    expect(handlerOf(route('export const GET = api({}, g);'), 'POST')).toBeNull();
    expect(
      handlerOf(route('// export const POST = api({ writable: true }, g);'), 'POST'),
    ).toBeNull();
  });

  it('handlerSource échoue sur une forme inconnue dans une vraie route', () => {
    const dir = mkdtempSync(join(tmpdir(), 'routes-'));
    const file = join(dir, 'route.ts');
    writeFileSync(file, route('export async function POST() { return new Response(); }'));
    expect(() => handlerSource(file, 'POST')).toThrow(/forme que ce test ne sait pas lire/);
  });
});

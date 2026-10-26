// S19 / TR-PAY-07 / SECURITY_NOTES §2.7 : toute route d'ÉCRITURE du contrat est classée. Seules les actions ✱
// (pause d'une campagne, paiement, preuve de paiement, support, profil), les lectures déguisées en POST et les
// routes sans espace échappent à `writable: true`. Une nouvelle route d'écriture non classée fait échouer ce test :
// la session qui l'ajoute doit choisir son sort ici, par écrit.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../../../..');
const API_DIR = join(ROOT, 'apps/web/app/api/v1');

type Kind =
  /** Écriture dans un espace : `writable: true` obligatoire (403 workspace_read_only / workspace_suspended). */
  | 'writable'
  /** Action ✱ : toujours permise (SECURITY_NOTES §2.1). */
  | 'star'
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
  [`POST ${WS}/generations/{generationId}/cancel`]: 'read',
  [`POST ${WS}/generations/{generationId}/fallback`]: 'writable',
  [`PATCH ${WS}/visuals/{visualId}`]: 'writable',
  [`POST ${WS}/visuals/{visualId}/edit`]: 'writable',
  [`POST ${WS}/visuals/{visualId}/formats`]: 'writable',
  // Argent, support, notifications (S24 à S29)
  [`POST ${WS}/checkout`]: 'star',
  [`POST ${WS}/payment-proofs`]: 'star',
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
  `POST ${WS}/checkout`,
  `POST ${WS}/payment-proofs`,
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

/** Texte du gestionnaire exporté pour une méthode, ou null. */
function handlerSource(file: string, method: string): string | null {
  if (!existsSync(file)) return null;
  const src = readFileSync(file, 'utf8');
  const start = src.search(new RegExp(`export const ${method} = api\\(`));
  if (start < 0) return null;
  const rest = src.slice(start + 1);
  const next = rest.search(/\nexport const /);
  return next < 0 ? src.slice(start) : src.slice(start, start + 1 + next);
}

const declaresWritable = (source: string): boolean => /\bwritable:\s*true\b/.test(source);

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
      const expected = kind === 'writable';
      expect(
        declaresWritable(source),
        `${key} (${String(kind)}) : writable: true ${expected ? 'obligatoire' : 'interdit'}`,
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
        if (!new RegExp(`export const ${method} = api\\(`).test(src)) continue;
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

// Les 5 cas de chaque route (API_SPEC §15, TESTING §4.2) : succès, 401, 404 autre espace,
// 403 rôle, 400 corps invalide. `pnpm test:routes-coverage` lit ces déclarations dans les
// fichiers de test : un cas absent fait échouer la CI. Un cas sans objet pour la route
// (route publique, sans corps…) se déclare avec `na('raison')`.
import { describe, it } from 'vitest';

export const ROUTE_CASES = [
  'success',
  'unauthenticated',
  'otherWorkspace',
  'forbiddenRole',
  'invalidBody',
] as const;

export type RouteCase = (typeof ROUTE_CASES)[number];

const NA = Symbol('na');
export interface NotApplicable {
  readonly [NA]: true;
  readonly reason: string;
}

export function na(reason: string): NotApplicable {
  if (reason.trim().length < 5) throw new Error('na() : la raison est obligatoire');
  return { [NA]: true, reason };
}

export type RouteCases = Record<RouteCase, (() => Promise<void>) | NotApplicable> & {
  /** Cas propres à la route (429, 413, 503…). */
  extra?: Record<string, () => Promise<void>>;
};

const TITLES: Record<RouteCase, string> = {
  success: 'succès',
  unauthenticated: '401 sans session',
  otherWorkspace: '404 autre espace',
  forbiddenRole: '403 rôle insuffisant',
  invalidBody: '400 corps invalide',
};

export function describeRoute(operationId: string, cases: RouteCases): void {
  describe(`[route:${operationId}]`, () => {
    for (const name of ROUTE_CASES) {
      const c = cases[name];
      // Un cas « sans objet » n'est pas un test : sa raison est lue par test:routes-coverage.
      if (typeof c === 'function') it(TITLES[name], c);
    }
    for (const [title, fn] of Object.entries(cases.extra ?? {})) it(title, fn);
  });
}

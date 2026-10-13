// Adresses visées par les tests de fumée (CI_CD §4) et en-têtes de contournement de la
// protection des déploiements Vercel (« Protection Bypass for Automation »).
// Lecture seule : ces tests n'écrivent rien, ils peuvent viser la préproduction comme la production.

/** Valeurs par défaut : le poste de développement (CLAUDE.md §8). */
const LOCAL_APP_URL = 'http://app.localhost:5173';
const LOCAL_SITE_URL = 'http://localhost:5173';

export interface SmokeTargets {
  /** Origine de l'application (`BASE_URL`), ex. `https://pubeka-staging.vercel.app`. */
  readonly appUrl: string;
  /** Origine du site public (`SITE_BASE_URL`), ex. `https://pubeka-staging-site.vercel.app`. */
  readonly siteUrl: string;
  /** Secret de contournement (`VERCEL_AUTOMATION_BYPASS_SECRET`), absent en local. */
  readonly bypassSecret: string | undefined;
}

type Env = Readonly<Record<string, string | undefined>>;

function origin(name: string, value: string | undefined, fallback: string): string {
  const raw = value === undefined || value.trim() === '' ? fallback : value.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} n'est pas une adresse valide.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} doit commencer par http:// ou https://.`);
  }
  return url.origin;
}

export function smokeTargets(env: Env): SmokeTargets {
  const secret = env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  return {
    appUrl: origin('BASE_URL', env.BASE_URL, LOCAL_APP_URL),
    siteUrl: origin('SITE_BASE_URL', env.SITE_BASE_URL, LOCAL_SITE_URL),
    bypassSecret: secret === undefined || secret === '' ? undefined : secret,
  };
}

/**
 * En-têtes à ajouter aux requêtes vers nos propres adresses. `x-vercel-set-bypass-cookie`
 * demande à Vercel un cookie, pour que les requêtes suivantes du navigateur passent aussi.
 */
export function bypassHeaders(targets: SmokeTargets): Record<string, string> {
  if (targets.bypassSecret === undefined) return {};
  return {
    'x-vercel-protection-bypass': targets.bypassSecret,
    'x-vercel-set-bypass-cookie': 'true',
  };
}

/**
 * Vrai seulement pour l'application et le site : le secret n'est jamais envoyé à un tiers
 * (CAPTCHA, polices, mesure d'audience).
 */
export function isOwnOrigin(url: URL, targets: SmokeTargets): boolean {
  return url.origin === targets.appUrl || url.origin === targets.siteUrl;
}

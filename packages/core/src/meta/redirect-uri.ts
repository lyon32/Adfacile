// Adresse de retour OAuth (« redirect_uri ») envoyée à Facebook. Portée de `validateFacebookConfig`
// (AdFacile, backend/src/config/facebook.js) : une adresse fausse fait répondre Meta « Impossible
// de charger cette URL » sans rien qui remonte à la cause. On échoue donc tôt, avec un message
// qui dit quoi corriger. Documentation : https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow
// (l'adresse doit correspondre exactement à une « URI de redirection OAuth valide » déclarée dans
// les réglages de l'application Meta).

/** Chemin de la route de retour (API_SPEC §14 : `GET /meta/callback`). */
export const META_CALLBACK_PATH = '/api/v1/meta/callback';

export interface RedirectUriCheck {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Hôtes de développement où `http://` est accepté par Meta. */
function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  );
}

/** Vérifie l'adresse de retour : URL absolue, chemin du callback, https hors développement. */
export function validateMetaRedirectUri(redirectUri: string | undefined): RedirectUriCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (redirectUri === undefined || redirectUri === '') {
    errors.push("L'adresse de retour OAuth est absente (NEXT_PUBLIC_APP_URL).");
    return { valid: false, errors, warnings };
  }
  let parsed: URL | undefined;
  try {
    parsed = new URL(redirectUri);
  } catch {
    errors.push(
      `L'adresse de retour OAuth n'est pas une URL absolue valide : « ${redirectUri} ». Attendu : https://<domaine>${META_CALLBACK_PATH}`,
    );
  }
  if (parsed !== undefined) {
    if (parsed.pathname !== META_CALLBACK_PATH) {
      errors.push(
        `L'adresse de retour OAuth doit se terminer par ${META_CALLBACK_PATH} (actuellement « ${parsed.pathname} »), sinon Meta renvoie le code sur une route inexistante.`,
      );
    }
    if (parsed.protocol === 'http:' && !isLocalHost(parsed.hostname)) {
      warnings.push(
        "L'adresse de retour OAuth utilise http:// sur un domaine public : Meta exige https:// et la rejettera.",
      );
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

/** Adresse de retour de l'application : `<NEXT_PUBLIC_APP_URL>/api/v1/meta/callback`. */
export function metaRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}${META_CALLBACK_PATH}`;
}

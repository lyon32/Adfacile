// Traduction des erreurs de la Marketing API en messages actionnables, puis en codes Pubeka.
// Porté de backend/src/utils/facebookErrors.js (comportement inchangé) ; la table sert de mémoire :
// chaque erreur rencontrée en production doit finir ici plutôt que d'être relayée telle quelle.
// Codes d'erreur : https://developers.facebook.com/docs/graph-api/guides/error-handling
import { AppError, type FieldError } from '@pubeka/contracts';

/** Objet `error` renvoyé par la Graph API. Tous les champs sont facultatifs : la forme vient de Meta. */
export interface MetaApiError {
  message?: string | undefined;
  type?: string | undefined;
  code?: number | undefined;
  error_subcode?: number | undefined;
  error_user_title?: string | undefined;
  error_user_msg?: string | undefined;
  fbtrace_id?: string | undefined;
}

export type MetaFix = 'destination' | 'retry' | 'reconnect' | 'billing';

export interface TranslatedMetaError {
  title: string;
  message: string;
  fix: MetaFix | null;
  code: number | undefined;
  subcode: number | undefined;
}

interface KnownError {
  title: string;
  message: string;
  fix: MetaFix;
}

const INCOMPATIBLE_AD: KnownError = {
  // Publicité non-Messenger dans un ensemble de publicités Messenger : la destination vise une
  // conversation mais la création porte un bouton de site web. Attrapé en amont par messaging-destinations.
  title: 'Publicité incompatible avec la destination choisie',
  message:
    'Votre publicité envoie vers une conversation (Messenger, Instagram ou WhatsApp), ' +
    'mais son bouton renvoie vers un site web. Choisissez une destination de messagerie ' +
    'ou passez la publicité en destination « Site Web ».',
  fix: 'destination',
};

const TOKEN_EXPIRED: KnownError = {
  title: 'Connexion Facebook expirée',
  message: 'Votre connexion Facebook a expiré. Reconnectez votre compte dans les paramètres.',
  fix: 'reconnect',
};

const FACEBOOK_ERRORS: Readonly<Record<number, KnownError>> = {
  1815675: INCOMPATIBLE_AD,
  // Capacité d'application manquante. Rencontrée sur /adimages avec le paramètre url : l'envoi par
  // URL distante est réservé à certaines apps, l'envoi des octets en multipart fonctionne toujours.
  3: {
    title: 'Opération non autorisée pour cette application',
    message:
      "Facebook a refusé cette opération pour l'application Pubeka. " +
      'Si le problème concerne votre visuel, réessayez ; sinon contactez le support.',
    fix: 'retry',
  },
  190: TOKEN_EXPIRED,
  200: {
    title: 'Autorisation insuffisante',
    message:
      "Pubeka n'a pas les autorisations nécessaires sur votre compte publicitaire. " +
      'Reconnectez votre compte en acceptant toutes les autorisations demandées.',
    fix: 'reconnect',
  },
  17: {
    title: 'Trop de requêtes',
    message:
      "Facebook limite temporairement le nombre d'opérations. Réessayez dans quelques minutes.",
    fix: 'retry',
  },
  2635: {
    title: 'Compte publicitaire indisponible',
    message:
      'Votre compte publicitaire Facebook est désactivé ou son moyen de paiement est invalide. ' +
      'Vérifiez-le dans le Gestionnaire de publicités Meta.',
    fix: 'billing',
  },
};

/** Sous-codes plus précis que le code principal. */
const FACEBOOK_ERROR_SUBCODES: Readonly<Record<number, KnownError>> = {
  1815675: INCOMPATIBLE_AD,
  // Objectif de performance refusé pour l'objectif de campagne. Relevé sur Ventes vers un site web
  // sans ensemble de données (pixel) : Meta refuse alors toute optimisation.
  2490408: {
    title: 'Objectif de performance refusé par Facebook',
    message:
      'Facebook refuse cet objectif de performance pour cette campagne. Pour Ventes vers un site web, ' +
      'il faut un ensemble de données (pixel) rattaché à votre compte publicitaire. ' +
      'Créez-en un dans le Gestionnaire d’évènements, ou choisissez « Applications de messagerie » ' +
      'comme lieu de conversion.',
    fix: 'destination',
  },
  // Jeton invalidé par un changement de mot de passe, puis session expirée.
  460: TOKEN_EXPIRED,
  463: TOKEN_EXPIRED,
};

function lookup(
  table: Readonly<Record<number, KnownError>>,
  key: number | undefined,
): KnownError | undefined {
  return key === undefined || !Object.hasOwn(table, key) ? undefined : table[key];
}

/**
 * Traduit une erreur Facebook en message affichable.
 * Le sous-code est consulté en premier : il est plus précis que le code.
 */
export function translateFacebookError(fbError: MetaApiError = {}): TranslatedMetaError {
  const known =
    lookup(FACEBOOK_ERROR_SUBCODES, fbError.error_subcode) ?? lookup(FACEBOOK_ERRORS, fbError.code);
  if (known) {
    return {
      title: known.title,
      message: known.message,
      fix: known.fix,
      code: fbError.code,
      subcode: fbError.error_subcode,
    };
  }
  // Erreur inconnue : le message destiné à l'utilisateur que Meta fournit parfois vaut mieux
  // que le message technique.
  return {
    title: fbError.error_user_title ?? 'Erreur Facebook',
    message: fbError.error_user_msg ?? fbError.message ?? 'Erreur inattendue côté Facebook.',
    fix: null,
    code: fbError.code,
    subcode: fbError.error_subcode,
  };
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Lit l'objet `error` d'un corps de réponse Graph (donnée externe : aucune forme n'est présumée). */
export function parseMetaError(body: unknown): MetaApiError | null {
  if (body === null || typeof body !== 'object' || !('error' in body)) return null;
  const error = body.error;
  if (error === null || typeof error !== 'object') return null;
  const get = (key: string): unknown => (key in error ? Reflect.get(error, key) : undefined);
  return {
    message: optionalString(get('message')),
    type: optionalString(get('type')),
    code: optionalNumber(get('code')),
    error_subcode: optionalNumber(get('error_subcode')),
    error_user_title: optionalString(get('error_user_title')),
    error_user_msg: optionalString(get('error_user_msg')),
    fbtrace_id: optionalString(get('fbtrace_id')),
  };
}

/** Jeton révoqué : code 190, quel que soit le sous-code. */
export function isTokenRevokedError(error: MetaApiError | null | undefined): boolean {
  return error?.code === 190;
}

/** Erreur renvoyée par la Graph API (HTTP non 2xx avec un corps `error`). Jamais montrée telle quelle. */
export class MetaGraphError extends Error {
  readonly httpStatus: number;

  constructor(
    readonly fbError: MetaApiError,
    httpStatus: number,
  ) {
    super(fbError.message ?? 'Erreur Facebook API');
    this.name = 'MetaGraphError';
    this.httpStatus = httpStatus;
  }
}

/**
 * Incohérence détectée par Pubeka avant tout appel à Meta (destination de messagerie non reliée,
 * visuel manquant, combinaison refusée…). Le message est affichable tel quel.
 */
export class MetaValidationError extends Error {
  readonly userFacing = true as const;
  readonly validationErrors: string[];

  constructor(message: string, validationErrors?: string[]) {
    super(message);
    this.name = 'MetaValidationError';
    this.validationErrors = validationErrors ?? [message];
  }
}

/** Une opération de lecture a échoué ; `cause` porte l'erreur d'origine (souvent une `MetaGraphError`). */
export class MetaOperationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'MetaOperationError';
  }
}

/**
 * Convertit toute erreur du connecteur en `AppError` (LLD §6.14). Le message d'origine part dans
 * `cause` (Sentry), jamais au client ; `meta` porte le message traduit.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof MetaOperationError && error.cause !== undefined)
    return toAppError(error.cause);

  if (error instanceof MetaValidationError) {
    const errors: FieldError[] = error.validationErrors.map((message) => ({
      field: 'campaign',
      code: 'invalid',
      message,
    }));
    return new AppError('validation_failed', { errors, cause: error });
  }

  if (error instanceof MetaGraphError) {
    const translated = translateFacebookError(error.fbError);
    const meta = {
      title: translated.title,
      message: translated.message,
      fix: translated.fix,
      fbCode: translated.code ?? null,
      fbSubcode: translated.subcode ?? null,
    };
    if (translated.fix === 'reconnect')
      return new AppError('meta_token_expired', { meta, cause: error });
    if (translated.fix === 'billing')
      return new AppError('meta_payment_method_missing', { meta, cause: error });
    return new AppError('meta_error', { meta, cause: error });
  }

  return new AppError('meta_error', { cause: error });
}

/** Codes de Meta qui disent « panne temporaire » sans dire si l'opération a pu aboutir en partie. */
const OUTAGE_CODES: ReadonlySet<number> = new Set([1, 2, 341]);

function isAmbiguousCause(cause: unknown): boolean {
  if (cause instanceof MetaOperationError && cause.cause !== undefined) {
    return isAmbiguousCause(cause.cause);
  }
  if (cause instanceof MetaValidationError) return false;
  if (cause instanceof MetaGraphError) {
    if (cause.httpStatus >= 500) return true;
    return cause.fbError.code !== undefined && OUTAGE_CODES.has(cause.fbError.code);
  }
  // Délai dépassé, connexion coupée, réponse illisible, identifiant absent de la réponse… : Meta a pu agir.
  return true;
}

/**
 * Meta A-T-IL PU créer quelque chose malgré l'erreur ? (SECURITY_NOTES EC-META-05)
 *  - non : refus net (budget, jeton, paiement, validation, paramètre invalide, limitation de débit) ou erreur de Pubeka sans
 *    lien avec Meta : l'échec est définitif ;
 *  - oui : délai dépassé, coupure, réponse illisible, HTTP 5xx, codes 1, 2 et 341 (panne temporaire) : le résultat est incertain,
 *    la tâche doit chercher chez Meta ce qui existe AVANT de conclure, et ne JAMAIS recréer d'office.
 * Dans le doute, c'est incertain.
 */
export function isAmbiguousMetaFailure(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.code === 'meta_error' && isAmbiguousCause(error.cause);
  }
  return isAmbiguousCause(error);
}

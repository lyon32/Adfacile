// Règles des parcours de connexion (APPFLOW §4, SECURITY_NOTES §5.1). Aucune dépendance
// directe à Supabase : tout passe par AuthGateway et LockStore, remplacés dans les tests.
import type { AuthFailure, AuthGateway } from './gateway';
import { loginKey, type LockStore } from './login-lock';

/** Issue d'une action, traduite à l'écran par features/auth (jamais le texte de Supabase). */
export type AuthOutcome =
  | 'ok'
  | 'invalid_credentials'
  | 'locked'
  | 'email_not_confirmed'
  | 'captcha_failed'
  | 'email_taken'
  | 'weak_password'
  | 'rate_limited'
  | 'link_expired'
  | 'unavailable';

export interface ActionResult {
  outcome: AuthOutcome;
  retryAfterS?: number;
}

export interface AuthDeps {
  gateway: AuthGateway;
  locks: LockStore;
  /** Adresse absolue de auth/callback, ex. http://app.localhost:5173/auth/callback */
  callbackUrl: string;
  /** Attente, remplaçable dans les tests (EC-AUTH-05). */
  sleep?: (ms: number) => Promise<void>;
  nowMs?: () => number;
}

/** Codes d'erreur de Supabase Auth (https://supabase.com/docs/guides/auth/debugging/error-codes). */
export function outcomeOf(error: AuthFailure): AuthOutcome {
  switch (error.code) {
    case 'invalid_credentials':
      return 'invalid_credentials';
    case 'email_not_confirmed':
      return 'email_not_confirmed';
    case 'captcha_failed':
      return 'captcha_failed';
    case 'user_already_exists':
    case 'email_exists':
      return 'email_taken';
    case 'weak_password':
      return 'weak_password';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'rate_limited';
    case 'otp_expired':
    case 'flow_state_expired':
    case 'flow_state_not_found':
    case 'bad_code_verifier':
      return 'link_expired';
    case undefined:
    default:
      return error.status === 429 ? 'rate_limited' : 'unavailable';
  }
}

function callbackTo(deps: AuthDeps, next: string): string {
  return `${deps.callbackUrl}?next=${encodeURIComponent(next)}`;
}

export async function signIn(
  deps: AuthDeps,
  input: { email: string; password: string; captchaToken: string; ip: string },
): Promise<ActionResult> {
  const key = loginKey(input.email, input.ip);
  // Bloqué : on n'essaie même pas le mot de passe, et la tentative n'est pas comptée. La réponse
  // est la même que l'e-mail existe ou non (pas de découverte des comptes, EC-AUTH-04).
  const before = await deps.locks.status(key);
  if (before.locked) return { outcome: 'locked', retryAfterS: before.retryAfterS };

  const error = await deps.gateway.signInWithPassword(input);
  if (!error) {
    await deps.locks.clear(key);
    return { outcome: 'ok' };
  }
  const outcome = outcomeOf(error);
  if (outcome !== 'invalid_credentials') return { outcome };
  const after = await deps.locks.recordFailure(key);
  return after.locked
    ? { outcome: 'locked', retryAfterS: after.retryAfterS }
    : { outcome: 'invalid_credentials' };
}

export async function signUp(
  deps: AuthDeps,
  input: { email: string; password: string; captchaToken: string; locale: 'fr' | 'en' },
): Promise<ActionResult> {
  const res = await deps.gateway.signUp({
    email: input.email,
    password: input.password,
    captchaToken: input.captchaToken,
    emailRedirectTo: callbackTo(deps, '/'),
    // Lu par private.handle_new_user (migration 0003, E10). Le fuseau est déclaré à
    // /bienvenue/pays (APPFLOW §5, S09), pas ici.
    data: { ui_language: input.locale },
  });
  if (res.error) return { outcome: outcomeOf(res.error) };
  // APPFLOW §4.1 : « Un compte existe déjà avec cet e-mail. Se connecter ».
  if (res.alreadyRegistered) return { outcome: 'email_taken' };
  return { outcome: 'ok' };
}

export async function resendConfirmation(
  deps: AuthDeps,
  input: { email: string; captchaToken: string },
): Promise<ActionResult> {
  const error = await deps.gateway.resendSignUp({
    ...input,
    emailRedirectTo: callbackTo(deps, '/'),
  });
  return { outcome: error ? outcomeOf(error) : 'ok' };
}

export async function sendMagicLink(
  deps: AuthDeps,
  input: { email: string; captchaToken: string },
): Promise<ActionResult> {
  const error = await deps.gateway.signInWithOtp({
    ...input,
    emailRedirectTo: callbackTo(deps, '/'),
  });
  // E-mail inconnu (otp_disabled / user_not_found) : même réponse qu'un e-mail connu.
  if (!error || error.code === 'otp_disabled' || error.code === 'user_not_found') {
    return { outcome: 'ok' };
  }
  const outcome = outcomeOf(error);
  return { outcome: outcome === 'captcha_failed' || outcome === 'rate_limited' ? outcome : 'ok' };
}

/** Durée minimale de la réponse « mot de passe oublié » : même délai, compte connu ou non. */
export const FORGOT_MIN_DURATION_MS = 1200;

export async function requestPasswordReset(
  deps: AuthDeps,
  input: { email: string; captchaToken: string },
): Promise<ActionResult> {
  const now = deps.nowMs ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const started = now();
  const error = await deps.gateway.resetPasswordForEmail({
    ...input,
    redirectTo: callbackTo(deps, '/mot-de-passe-oublie/nouveau'),
  });
  const elapsed = now() - started;
  if (elapsed < FORGOT_MIN_DURATION_MS) await sleep(FORGOT_MIN_DURATION_MS - elapsed);
  // EC-AUTH-05 : seul le CAPTCHA refusé change la réponse (il ne dit rien sur le compte).
  return { outcome: error && outcomeOf(error) === 'captcha_failed' ? 'captcha_failed' : 'ok' };
}

export async function setNewPassword(
  deps: AuthDeps,
  input: { password: string },
): Promise<ActionResult> {
  const error = await deps.gateway.updatePassword(input.password);
  if (error) {
    const outcome = outcomeOf(error);
    // Pas de session de réinitialisation (lien jamais ouvert, ou déjà utilisé) : lien expiré.
    return {
      outcome:
        error.status === 401 ||
        error.code === 'session_not_found' ||
        error.code === 'no_authorization'
          ? 'link_expired'
          : outcome,
    };
  }
  // EC-AUTH-06 : après une réinitialisation réussie, toutes les AUTRES sessions sont fermées.
  await deps.gateway.signOut('others');
  return { outcome: 'ok' };
}

export async function signOut(deps: Pick<AuthDeps, 'gateway'>): Promise<ActionResult> {
  await deps.gateway.signOut('local');
  return { outcome: 'ok' };
}

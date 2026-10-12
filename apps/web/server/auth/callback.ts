// Retour d'OAuth (Google, Apple), du lien magique, de la confirmation d'e-mail et du lien de
// réinitialisation. Renvoie le chemin vers lequel rediriger (jamais une adresse externe).
import { EMAIL_OTP_TYPES, type AuthGateway, type EmailOtpType } from './gateway';
import { outcomeOf } from './actions';
import { safeNext } from './safe-next';

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (EMAIL_OTP_TYPES as readonly string[]).includes(value);
}

/** Écran de connexion avec un motif affiché (`erreur`), compris par features/auth. */
function failTo(reason: 'lien_expire' | 'connexion_impossible'): string {
  return `/connexion?erreur=${reason}`;
}

export async function handleAuthCallback(
  gateway: AuthGateway,
  params: URLSearchParams,
): Promise<string> {
  const next = safeNext(params.get('next'));
  // Supabase renvoie l'erreur dans l'adresse (lien expiré, accès refusé chez Google ou Apple).
  const errorCode = params.get('error_code');
  if (errorCode !== null || params.get('error') !== null) {
    return failTo(errorCode === 'otp_expired' ? 'lien_expire' : 'connexion_impossible');
  }

  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  const type = params.get('type');
  let error;
  if (code) error = await gateway.exchangeCode(code);
  else if (tokenHash && isEmailOtpType(type))
    error = await gateway.verifyEmailToken(tokenHash, type);
  else return failTo('connexion_impossible');

  if (!error) return next;
  return failTo(outcomeOf(error) === 'link_expired' ? 'lien_expire' : 'connexion_impossible');
}

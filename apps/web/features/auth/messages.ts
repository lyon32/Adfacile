// Textes FR/EN des écrans d'accès (CLAUDE.md §2 : FR et EN dans le même commit).
// Clés au format `domaine.ecran.element`. S09 les déplace dans packages/i18n (next-intl) ;
// en attendant, `t()` lit ce dictionnaire et le test vérifie que les deux langues ont les mêmes clés.
export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

const fr = {
  'auth.common.or': 'ou',
  'auth.common.email': 'E-mail',
  'auth.common.password': 'Mot de passe',
  'auth.common.google': 'Continuer avec Google',
  'auth.common.apple': 'Continuer avec Apple',
  'auth.common.sending': 'Envoi…',
  'auth.common.captcha_wait': 'Vérification anti-robot en cours…',
  'auth.sign_in.title': 'Connexion',
  'auth.sign_in.submit': 'Se connecter',
  'auth.sign_in.forgot': 'Mot de passe oublié ?',
  'auth.sign_in.magic_link': 'Recevoir un lien de connexion par e-mail',
  'auth.sign_in.magic_link_sent':
    'Si un compte existe avec cet e-mail, un lien de connexion vient d’y être envoyé.',
  'auth.sign_in.no_account': 'Pas encore de compte ?',
  'auth.sign_in.to_sign_up': 'Créer un compte',
  'auth.sign_in.idle_notice':
    'Tu as été déconnecté après 10 minutes sans activité. Reconnecte-toi pour reprendre.',
  'auth.sign_up.title': 'Créer ton compte',
  'auth.sign_up.password_hint': '8 caractères minimum.',
  'auth.sign_up.terms': 'J’accepte les conditions d’utilisation et la politique de confidentialité',
  'auth.sign_up.terms_required': 'Accepte les conditions pour continuer.',
  'auth.sign_up.submit': 'Créer mon compte',
  'auth.sign_up.has_account': 'Déjà un compte ?',
  'auth.sign_up.to_sign_in': 'Se connecter',
  'auth.check_email.title': 'Vérifie ta boîte mail',
  'auth.check_email.body':
    'Un lien de confirmation a été envoyé à {email}. Ouvre-le pour activer ton compte.',
  'auth.check_email.resend': 'Renvoyer le lien',
  'auth.check_email.resend_in': 'Renvoyer le lien dans {seconds} s',
  'auth.check_email.resent': 'Lien renvoyé.',
  'auth.forgot.title': 'Mot de passe oublié',
  'auth.forgot.body':
    'Indique ton e-mail : tu recevras un lien pour choisir un nouveau mot de passe (valable 1 heure).',
  'auth.forgot.submit': 'Recevoir le lien',
  'auth.forgot.sent':
    'Si un compte existe avec cet e-mail, un lien de réinitialisation vient d’y être envoyé. Il est valable 1 heure.',
  'auth.forgot.back': 'Retour à la connexion',
  'auth.new_password.title': 'Nouveau mot de passe',
  'auth.new_password.submit': 'Enregistrer et me connecter',
  'auth.errors.invalid_credentials': 'E-mail ou mot de passe incorrect.',
  'auth.errors.locked': 'Trop d’essais. Réessaie dans 15 minutes ou réinitialise ton mot de passe.',
  'auth.errors.email_not_confirmed':
    'Confirme d’abord ton e-mail : ouvre le lien reçu à l’inscription.',
  'auth.errors.captcha_failed': 'La vérification anti-robot a échoué. Réessaie.',
  'auth.errors.email_taken': 'Un compte existe déjà avec cet e-mail.',
  'auth.errors.email_taken_link': 'Se connecter',
  'auth.errors.weak_password':
    'Ce mot de passe est trop faible ou déjà apparu dans une fuite de données. Choisis-en un autre.',
  'auth.errors.password_too_short': '8 caractères minimum.',
  'auth.errors.invalid_email': 'Indique une adresse e-mail valide.',
  'auth.errors.rate_limited': 'Trop de demandes. Patiente une minute puis réessaie.',
  'auth.errors.link_expired': 'Ce lien a expiré.',
  'auth.errors.link_expired_action': 'Recevoir un nouveau lien',
  'auth.errors.unavailable':
    'Connexion impossible pour le moment. Réessaie dans quelques instants.',
  'auth.idle.title': 'Tu es toujours là ?',
  'auth.idle.body': 'Tu vas être déconnecté dans {seconds} s pour ta sécurité.',
  'auth.idle.stay': 'Rester connecté',
  'auth.home.greeting_morning': 'Bonjour',
  'auth.home.greeting_evening': 'Bonsoir',
  'auth.home.sign_out': 'Se déconnecter',
} as const;

export type MessageKey = keyof typeof fr;

const en: Record<MessageKey, string> = {
  'auth.common.or': 'or',
  'auth.common.email': 'Email',
  'auth.common.password': 'Password',
  'auth.common.google': 'Continue with Google',
  'auth.common.apple': 'Continue with Apple',
  'auth.common.sending': 'Sending…',
  'auth.common.captcha_wait': 'Checking you are not a robot…',
  'auth.sign_in.title': 'Sign in',
  'auth.sign_in.submit': 'Sign in',
  'auth.sign_in.forgot': 'Forgot your password?',
  'auth.sign_in.magic_link': 'Email me a sign-in link',
  'auth.sign_in.magic_link_sent':
    'If an account exists with this email, a sign-in link has just been sent to it.',
  'auth.sign_in.no_account': 'No account yet?',
  'auth.sign_in.to_sign_up': 'Create an account',
  'auth.sign_in.idle_notice':
    'You were signed out after 10 minutes of inactivity. Sign in again to continue.',
  'auth.sign_up.title': 'Create your account',
  'auth.sign_up.password_hint': 'At least 8 characters.',
  'auth.sign_up.terms': 'I accept the terms of use and the privacy policy',
  'auth.sign_up.terms_required': 'Accept the terms to continue.',
  'auth.sign_up.submit': 'Create my account',
  'auth.sign_up.has_account': 'Already have an account?',
  'auth.sign_up.to_sign_in': 'Sign in',
  'auth.check_email.title': 'Check your inbox',
  'auth.check_email.body':
    'A confirmation link was sent to {email}. Open it to activate your account.',
  'auth.check_email.resend': 'Resend the link',
  'auth.check_email.resend_in': 'Resend the link in {seconds} s',
  'auth.check_email.resent': 'Link sent again.',
  'auth.forgot.title': 'Forgot your password',
  'auth.forgot.body':
    'Enter your email: you will get a link to choose a new password (valid for 1 hour).',
  'auth.forgot.submit': 'Send the link',
  'auth.forgot.sent':
    'If an account exists with this email, a reset link has just been sent to it. It is valid for 1 hour.',
  'auth.forgot.back': 'Back to sign in',
  'auth.new_password.title': 'New password',
  'auth.new_password.submit': 'Save and sign in',
  'auth.errors.invalid_credentials': 'Incorrect email or password.',
  'auth.errors.locked': 'Too many attempts. Try again in 15 minutes or reset your password.',
  'auth.errors.email_not_confirmed':
    'Confirm your email first: open the link you received when signing up.',
  'auth.errors.captcha_failed': 'The robot check failed. Try again.',
  'auth.errors.email_taken': 'An account already exists with this email.',
  'auth.errors.email_taken_link': 'Sign in',
  'auth.errors.weak_password':
    'This password is too weak or has appeared in a data breach. Choose another one.',
  'auth.errors.password_too_short': 'At least 8 characters.',
  'auth.errors.invalid_email': 'Enter a valid email address.',
  'auth.errors.rate_limited': 'Too many requests. Wait a minute and try again.',
  'auth.errors.link_expired': 'This link has expired.',
  'auth.errors.link_expired_action': 'Get a new link',
  'auth.errors.unavailable': 'Sign-in is unavailable right now. Try again in a moment.',
  'auth.idle.title': 'Are you still there?',
  'auth.idle.body': 'You will be signed out in {seconds} s for your security.',
  'auth.idle.stay': 'Stay signed in',
  'auth.home.greeting_morning': 'Good morning',
  'auth.home.greeting_evening': 'Good evening',
  'auth.home.sign_out': 'Sign out',
};

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { fr, en };

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function translator(locale: Locale): Translate {
  const dict = MESSAGES[locale];
  return (key, vars) =>
    dict[key].replace(/\{(\w+)\}/g, (whole, name: string) =>
      vars && name in vars ? String(vars[name]) : whole,
    );
}

/** Langue de l'écran : cookie NEXT_LOCALE (choix enregistré), sinon langue du navigateur, sinon FR. */
export function pickLocale(cookieValue: string | undefined, acceptLanguage: string | null): Locale {
  const fromCookie = LOCALES.find((l) => l === cookieValue);
  if (fromCookie) return fromCookie;
  const first = acceptLanguage?.split(',')[0]?.trim().slice(0, 2).toLowerCase();
  return LOCALES.find((l) => l === first) ?? 'fr';
}

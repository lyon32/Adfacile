// Interface étroite vers Supabase Auth : le code de connexion en dépend, les tests la remplacent
// par une fausse implémentation (TESTING §6 : pas de vrai service dans un test).
import type { SupabaseClient } from '@supabase/supabase-js';

export type OAuthProvider = 'google' | 'apple';
export const OAUTH_PROVIDERS: readonly OAuthProvider[] = ['google', 'apple'];

/** Erreur renvoyée par Supabase Auth, réduite à ce qui sert à décider (jamais le texte). */
export interface AuthFailure {
  code: string | undefined;
  status: number | undefined;
}

export interface SignUpResult {
  error: AuthFailure | null;
  /** Supabase renvoie un utilisateur sans identité quand l'e-mail existe déjà (confirmation activée). */
  alreadyRegistered: boolean;
}

export interface AuthGateway {
  signInWithPassword(args: {
    email: string;
    password: string;
    captchaToken: string;
  }): Promise<AuthFailure | null>;
  signUp(args: {
    email: string;
    password: string;
    captchaToken: string;
    emailRedirectTo: string;
    data: Record<string, string>;
  }): Promise<SignUpResult>;
  signInWithOtp(args: {
    email: string;
    captchaToken: string;
    emailRedirectTo: string;
  }): Promise<AuthFailure | null>;
  resetPasswordForEmail(args: {
    email: string;
    captchaToken: string;
    redirectTo: string;
  }): Promise<AuthFailure | null>;
  resendSignUp(args: {
    email: string;
    captchaToken: string;
    emailRedirectTo: string;
  }): Promise<AuthFailure | null>;
  updatePassword(password: string): Promise<AuthFailure | null>;
  signOut(scope: 'local' | 'others' | 'global'): Promise<AuthFailure | null>;
  oauthUrl(provider: OAuthProvider, redirectTo: string): Promise<string | null>;
  exchangeCode(code: string): Promise<AuthFailure | null>;
  verifyEmailToken(tokenHash: string, type: EmailOtpType): Promise<AuthFailure | null>;
}

export type EmailOtpType =
  'signup' | 'magiclink' | 'recovery' | 'email' | 'invite' | 'email_change';
export const EMAIL_OTP_TYPES: readonly EmailOtpType[] = [
  'signup',
  'magiclink',
  'recovery',
  'email',
  'invite',
  'email_change',
];

function failure(
  error: { code?: string | undefined; status?: number | undefined } | null,
): AuthFailure | null {
  return error ? { code: error.code, status: error.status } : null;
}

/** Adaptateur vers le vrai client (cookies de session gérés par @supabase/ssr). */
export function supabaseGateway(client: SupabaseClient): AuthGateway {
  const auth = client.auth;
  return {
    async signInWithPassword({ email, password, captchaToken }) {
      const { error } = await auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });
      return failure(error);
    },
    async signUp({ email, password, captchaToken, emailRedirectTo, data }) {
      const res = await auth.signUp({
        email,
        password,
        options: { captchaToken, emailRedirectTo, data },
      });
      const identities = res.data.user?.identities;
      return {
        error: failure(res.error),
        alreadyRegistered: res.error === null && identities?.length === 0,
      };
    },
    async signInWithOtp({ email, captchaToken, emailRedirectTo }) {
      // shouldCreateUser: false : le lien magique connecte, il ne crée pas de compte (les
      // conditions doivent être acceptées à l'inscription).
      const { error } = await auth.signInWithOtp({
        email,
        options: { captchaToken, emailRedirectTo, shouldCreateUser: false },
      });
      return failure(error);
    },
    async resetPasswordForEmail({ email, captchaToken, redirectTo }) {
      const { error } = await auth.resetPasswordForEmail(email, { captchaToken, redirectTo });
      return failure(error);
    },
    async resendSignUp({ email, captchaToken, emailRedirectTo }) {
      const { error } = await auth.resend({
        type: 'signup',
        email,
        options: { captchaToken, emailRedirectTo },
      });
      return failure(error);
    },
    async updatePassword(password) {
      const { error } = await auth.updateUser({ password });
      return failure(error);
    },
    async signOut(scope) {
      const { error } = await auth.signOut({ scope });
      return failure(error);
    },
    async oauthUrl(provider, redirectTo) {
      const { data, error } = await auth.signInWithOAuth({ provider, options: { redirectTo } });
      return error ? null : data.url;
    },
    async exchangeCode(code) {
      const { error } = await auth.exchangeCodeForSession(code);
      return failure(error);
    },
    async verifyEmailToken(tokenHash, type) {
      const { error } = await auth.verifyOtp({ token_hash: tokenHash, type });
      return failure(error);
    },
  };
}

// Fausses implémentations de Supabase Auth et du blocage, pour les tests (TESTING §6) :
// comptes en mémoire, faux fournisseurs Google et Apple, horloge simulée. Aucun réseau.
import type { AuthFailure, AuthGateway, EmailOtpType, OAuthProvider } from '../gateway';
import type { LockState, LockStore } from '../login-lock';

export const VALID_CAPTCHA = 'XXXX.DUMMY.TOKEN.XXXX';

interface FakeUser {
  email: string;
  password: string;
  confirmed: boolean;
}

export class FakeAuthGateway implements AuthGateway {
  readonly users = new Map<string, FakeUser>();
  readonly calls: string[] = [];
  readonly sentEmails: { kind: string; email: string; redirectTo: string }[] = [];
  /** Codes OAuth délivrés par les faux Google / Apple : code → fournisseur. */
  readonly oauthCodes = new Map<string, OAuthProvider>();
  readonly emailTokens = new Map<string, { type: EmailOtpType; expired: boolean }>();
  session: string | null = null;
  otherSessions = 1;
  /** Fournisseurs configurés (identifiants présents) ; les autres échouent comme Supabase. */
  configuredProviders = new Set<OAuthProvider>(['google', 'apple']);

  addUser(email: string, password: string, confirmed = true): void {
    this.users.set(email.toLowerCase(), { email: email.toLowerCase(), password, confirmed });
  }

  private captcha(token: string): AuthFailure | null {
    return token === VALID_CAPTCHA ? null : { code: 'captcha_failed', status: 400 };
  }

  signInWithPassword(args: {
    email: string;
    password: string;
    captchaToken: string;
  }): Promise<AuthFailure | null> {
    this.calls.push('signInWithPassword');
    const bad = this.captcha(args.captchaToken);
    if (bad) return Promise.resolve(bad);
    const user = this.users.get(args.email.toLowerCase());
    if (user?.password !== args.password) {
      return Promise.resolve({ code: 'invalid_credentials', status: 400 });
    }
    if (!user.confirmed) return Promise.resolve({ code: 'email_not_confirmed', status: 400 });
    this.session = user.email;
    return Promise.resolve(null);
  }

  signUp(args: {
    email: string;
    password: string;
    captchaToken: string;
    emailRedirectTo: string;
  }): Promise<{ error: AuthFailure | null; alreadyRegistered: boolean }> {
    this.calls.push('signUp');
    const bad = this.captcha(args.captchaToken);
    if (bad) return Promise.resolve({ error: bad, alreadyRegistered: false });
    if (args.password.length < 8) {
      return Promise.resolve({
        error: { code: 'weak_password', status: 422 },
        alreadyRegistered: false,
      });
    }
    const key = args.email.toLowerCase();
    // Comme Supabase avec confirmation : pas d'erreur, mais un utilisateur sans identité.
    if (this.users.has(key)) return Promise.resolve({ error: null, alreadyRegistered: true });
    this.addUser(key, args.password, false);
    this.sentEmails.push({ kind: 'signup', email: key, redirectTo: args.emailRedirectTo });
    return Promise.resolve({ error: null, alreadyRegistered: false });
  }

  signInWithOtp(args: {
    email: string;
    captchaToken: string;
    emailRedirectTo: string;
  }): Promise<AuthFailure | null> {
    this.calls.push('signInWithOtp');
    const bad = this.captcha(args.captchaToken);
    if (bad) return Promise.resolve(bad);
    if (!this.users.has(args.email.toLowerCase())) {
      return Promise.resolve({ code: 'otp_disabled', status: 422 });
    }
    this.sentEmails.push({
      kind: 'magiclink',
      email: args.email,
      redirectTo: args.emailRedirectTo,
    });
    return Promise.resolve(null);
  }

  resetPasswordForEmail(args: {
    email: string;
    captchaToken: string;
    redirectTo: string;
  }): Promise<AuthFailure | null> {
    this.calls.push('resetPasswordForEmail');
    const bad = this.captcha(args.captchaToken);
    if (bad) return Promise.resolve(bad);
    if (this.users.has(args.email.toLowerCase())) {
      this.sentEmails.push({ kind: 'recovery', email: args.email, redirectTo: args.redirectTo });
    }
    return Promise.resolve(null);
  }

  resendSignUp(args: {
    email: string;
    captchaToken: string;
    emailRedirectTo: string;
  }): Promise<AuthFailure | null> {
    this.calls.push('resendSignUp');
    const bad = this.captcha(args.captchaToken);
    if (bad) return Promise.resolve(bad);
    this.sentEmails.push({ kind: 'signup', email: args.email, redirectTo: args.emailRedirectTo });
    return Promise.resolve(null);
  }

  updatePassword(password: string): Promise<AuthFailure | null> {
    this.calls.push('updatePassword');
    if (this.session === null) return Promise.resolve({ code: 'session_not_found', status: 401 });
    const user = this.users.get(this.session);
    if (user) user.password = password;
    return Promise.resolve(null);
  }

  signOut(scope: 'local' | 'others' | 'global'): Promise<AuthFailure | null> {
    this.calls.push(`signOut:${scope}`);
    if (scope === 'others' || scope === 'global') this.otherSessions = 0;
    if (scope === 'local' || scope === 'global') this.session = null;
    return Promise.resolve(null);
  }

  /** Faux Google / Apple : renvoie l'adresse du fournisseur, avec un code délivré au retour. */
  oauthUrl(provider: OAuthProvider, redirectTo: string): Promise<string | null> {
    this.calls.push(`oauth:${provider}`);
    if (!this.configuredProviders.has(provider)) return Promise.resolve(null);
    const code = `code-${provider}-${String(this.oauthCodes.size + 1)}`;
    this.oauthCodes.set(code, provider);
    return Promise.resolve(
      `https://fake-${provider}.test/authorize?redirect_to=${encodeURIComponent(redirectTo)}&code=${code}`,
    );
  }

  exchangeCode(code: string): Promise<AuthFailure | null> {
    this.calls.push('exchangeCode');
    const provider = this.oauthCodes.get(code);
    if (!provider) return Promise.resolve({ code: 'flow_state_not_found', status: 404 });
    // Un code ne sert qu'une fois (PKCE).
    this.oauthCodes.delete(code);
    this.session = `${provider}-user@example.test`;
    return Promise.resolve(null);
  }

  verifyEmailToken(tokenHash: string, type: EmailOtpType): Promise<AuthFailure | null> {
    this.calls.push(`verify:${type}`);
    const token = this.emailTokens.get(tokenHash);
    if (token?.type !== type || token.expired) {
      return Promise.resolve({ code: 'otp_expired', status: 403 });
    }
    this.emailTokens.delete(tokenHash);
    this.session = tokenHash;
    return Promise.resolve(null);
  }
}

/** Même règle que la migration 0004, en mémoire, avec une horloge simulée. */
export class FakeLockStore implements LockStore {
  private readonly failures = new Map<string, number[]>();
  constructor(readonly clock: { nowMs: number }) {}

  private state(key: string): LockState {
    const list = (this.failures.get(key) ?? []).filter((t) => t <= this.clock.nowMs);
    const last = list.at(-1);
    if (last === undefined) return { locked: false, retryAfterS: 0 };
    const recent = list.filter((t) => t > last - 15 * 60_000).length;
    const until = last + 15 * 60_000;
    return recent >= 5 && until > this.clock.nowMs
      ? { locked: true, retryAfterS: Math.max(1, Math.ceil((until - this.clock.nowMs) / 1000)) }
      : { locked: false, retryAfterS: 0 };
  }

  status(key: string): Promise<LockState> {
    return Promise.resolve(this.state(key));
  }

  recordFailure(key: string): Promise<LockState> {
    this.failures.set(key, [...(this.failures.get(key) ?? []), this.clock.nowMs]);
    return Promise.resolve(this.state(key));
  }

  clear(key: string): Promise<void> {
    this.failures.delete(key);
    return Promise.resolve();
  }
}

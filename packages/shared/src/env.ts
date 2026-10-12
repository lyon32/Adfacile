// Seul point de lecture des variables d'environnement (ENV_SETUP §1.12, CONVENTIONS §6.10).
// Quatre règles : 1. variable obligatoire absente ou mal formée → refus, avec son nom et
// jamais sa valeur ; 2. PUBEKA_FAKE_PROVIDERS refusée en production ; 3. `sk_test_` refusée
// en production et `sk_live_` hors production ; 4. tout NEXT_PUBLIC_ hors liste est refusé.
import { z } from 'zod';

export const APP_ENVS = ['development', 'preview', 'production'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

/** Seules variables autorisées à être publiques (lisibles par le navigateur). */
export const PUBLIC_ENV_NAMES = [
  'NEXT_PUBLIC_APP_ENV',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_CAPTCHA_SITE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SENTRY_DSN',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST',
] as const;

const FAKE_PROVIDERS = ['meta', 'saspay', 'media', 'ai', 'email'] as const;

const url = z.url({ protocol: /^https?$/ });
const text = z.string().min(1);
const optionalText = text.optional();

const fakeProviders = z
  .string()
  .min(1)
  .refine(
    (v) =>
      v === 'all' ||
      v.split(',').every((p) => (FAKE_PROVIDERS as readonly string[]).includes(p.trim())),
    { message: 'all, ou une liste parmi meta,saspay,media,ai,email' },
  );

const encryptionKeys = z.string().refine(
  (v) => {
    try {
      const parsed: unknown = JSON.parse(v);
      return z
        .record(
          z.string().min(1),
          z.base64().refine((k) => Buffer.from(k, 'base64').length === 32),
        )
        .refine((o) => Object.keys(o).length > 0)
        .safeParse(parsed).success;
    } catch {
      return false;
    }
  },
  { message: 'objet JSON { identifiant: clé de 32 octets en base64 }' },
);

const EnvSchema = z
  .object({
    // 1.1 Application et domaines
    NEXT_PUBLIC_APP_ENV: z.enum(APP_ENVS),
    NEXT_PUBLIC_SITE_URL: url,
    NEXT_PUBLIC_APP_URL: url,
    SITE_HOSTS: text,
    ADMIN_PATH: z.string().regex(/^[A-Za-z0-9]{32}$/, '32 lettres ou chiffres'),
    APP_SIGNING_SECRET: z
      .base64()
      .refine((v) => Buffer.from(v, 'base64').length >= 32, '32 octets en base64'),
    NEXT_PUBLIC_CAPTCHA_SITE_KEY: optionalText,
    PUBLIC_WEBHOOK_BASE_URL: url.optional(),
    PUBEKA_JOB_DISPATCH: z.enum(['trigger', 'inline']).default('trigger'),
    PUBEKA_FAKE_PROVIDERS: fakeProviders.optional(),
    // 1.2 Supabase
    NEXT_PUBLIC_SUPABASE_URL: url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().startsWith('sb_publishable_'),
    SUPABASE_URL: url.optional(),
    SUPABASE_SECRET_KEY: z.string().startsWith('sb_secret_'),
    // 1.3 Chiffrement des jetons
    TOKEN_ENCRYPTION_KEYS: encryptionKeys,
    TOKEN_ENCRYPTION_ACTIVE_KEY_ID: text,
    // 1.4 Meta
    META_APP_ID: z.string().regex(/^\d+$/).optional(),
    META_APP_SECRET: z
      .string()
      .regex(/^[0-9a-f]{32}$/i)
      .optional(),
    META_LOGIN_CONFIG_ID: z.string().regex(/^\d+$/).optional(),
    META_GRAPH_API_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/)
      .optional(),
    META_WEBHOOK_VERIFY_TOKEN: optionalText,
    // 1.5 SasPay
    SASPAY_API_URL: url.optional(),
    SASPAY_SECRET_KEY: z
      .string()
      .regex(/^sk_(test|live)_.+$/)
      .optional(),
    SASPAY_WEBHOOK_SECRET: optionalText,
    // 1.6 IA texte et lecture des sources (une seule passerelle, choix ❓ D-2)
    OPENROUTER_API_KEY: optionalText,
    AI_GATEWAY_API_KEY: optionalText,
    JINA_API_KEY: optionalText,
    // 1.7 Images et vidéos
    FAL_KEY: optionalText,
    HF_KEY: optionalText,
    HIGGSFIELD_WEBHOOK_SECRET: optionalText,
    ARK_API_KEY: optionalText,
    BYTEPLUS_WEBHOOK_SECRET: optionalText,
    // 1.8 E-mails
    RESEND_API_KEY: z.string().startsWith('re_').optional(),
    RESEND_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
    EMAIL_FROM_NOTIFICATIONS: optionalText,
    EMAIL_FROM_SUPPORT: optionalText,
    // 1.9 Trigger.dev
    TRIGGER_SECRET_KEY: z.string().startsWith('tr_').optional(),
    TRIGGER_PROJECT_REF: z.string().startsWith('proj_').optional(),
    // 1.10 Suivi
    NEXT_PUBLIC_SENTRY_DSN: url.optional(),
    SENTRY_DSN: url.optional(),
    NEXT_PUBLIC_POSTHOG_KEY: optionalText,
    NEXT_PUBLIC_POSTHOG_HOST: url.optional(),
  })
  .superRefine((env, ctx) => {
    const isProduction = env.NEXT_PUBLIC_APP_ENV === 'production';
    const fail = (name: string, message: string): void => {
      ctx.addIssue({ code: 'custom', path: [name], message });
    };
    if (!env.TOKEN_ENCRYPTION_KEYS.includes(`"${env.TOKEN_ENCRYPTION_ACTIVE_KEY_ID}"`)) {
      fail('TOKEN_ENCRYPTION_ACTIVE_KEY_ID', 'absente de TOKEN_ENCRYPTION_KEYS');
    }
    if (env.PUBEKA_JOB_DISPATCH === 'trigger' && env.TRIGGER_SECRET_KEY === undefined) {
      fail('TRIGGER_SECRET_KEY', 'obligatoire quand PUBEKA_JOB_DISPATCH=trigger');
    }
    if (isProduction && env.PUBEKA_FAKE_PROVIDERS !== undefined) {
      fail('PUBEKA_FAKE_PROVIDERS', 'interdite en production');
    }
    if (isProduction && env.PUBEKA_JOB_DISPATCH === 'inline') {
      fail('PUBEKA_JOB_DISPATCH', 'inline interdit en production');
    }
    const saspayKey = env.SASPAY_SECRET_KEY;
    if (isProduction && saspayKey?.startsWith('sk_test_') === true) {
      fail('SASPAY_SECRET_KEY', 'clé de test interdite en production');
    }
    if (!isProduction && saspayKey?.startsWith('sk_live_') === true) {
      fail('SASPAY_SECRET_KEY', 'clé de production interdite hors production');
    }
  });

export type Env = z.infer<typeof EnvSchema>;

/** Erreur de démarrage : nomme chaque variable fautive, sans jamais montrer sa valeur. */
export class EnvError extends Error {
  constructor(readonly problems: readonly { name: string; reason: string }[]) {
    super(
      `Variables d'environnement invalides : ${problems
        .map((p) => `${p.name} (${p.reason})`)
        .join(', ')}`,
    );
    this.name = 'EnvError';
  }
}

export type EnvSource = Record<string, string | undefined>;

export function parseEnv(source: EnvSource): Env {
  // Une valeur vide vaut une variable absente (fichiers .env.example recopiés).
  const cleaned: EnvSource = {};
  for (const [name, value] of Object.entries(source)) {
    if (value !== undefined && value !== '') cleaned[name] = value;
  }

  const problems: { name: string; reason: string }[] = [];
  const allowedPublic: readonly string[] = PUBLIC_ENV_NAMES;
  for (const name of Object.keys(cleaned)) {
    if (name.startsWith('NEXT_PUBLIC_') && !allowedPublic.includes(name)) {
      problems.push({ name, reason: 'NEXT_PUBLIC_ non autorisée : jamais de secret public' });
    }
  }

  const result = EnvSchema.safeParse(cleaned);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const name = String(issue.path[0] ?? '(racine)');
      const isMissing = issue.code === 'invalid_type' && cleaned[name] === undefined;
      // Message de Zod ou du schéma, jamais la valeur reçue.
      problems.push({ name, reason: isMissing ? 'obligatoire' : formatReason(issue) });
    }
  }
  if (problems.length > 0 || !result.success) throw new EnvError(problems);
  return result.data;
}

function formatReason(issue: z.core.$ZodIssue): string {
  return issue.code === 'custom' ? issue.message : `forme invalide (${issue.code})`;
}

let cached: Env | undefined;

/** Variables du processus, validées une fois. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

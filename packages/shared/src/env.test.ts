import { describe, expect, it } from 'vitest';
import { EnvError, parseEnv, type EnvSource } from './env';

// Valeurs factices, de la seule forme attendue (aucun vrai secret).
const KEY_32 = Buffer.alloc(32, 7).toString('base64');

function validEnv(overrides: EnvSource = {}): EnvSource {
  return {
    NEXT_PUBLIC_APP_ENV: 'development',
    NEXT_PUBLIC_SITE_URL: 'http://localhost:5173',
    NEXT_PUBLIC_APP_URL: 'http://app.localhost:5173',
    SITE_HOSTS: 'localhost:5173',
    ADMIN_PATH: 'a'.repeat(32),
    APP_SIGNING_SECRET: KEY_32,
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_factice',
    SUPABASE_SECRET_KEY: 'sb_secret_factice',
    TOKEN_ENCRYPTION_KEYS: JSON.stringify({ k1: KEY_32 }),
    TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'k1',
    PUBEKA_JOB_DISPATCH: 'inline',
    ...overrides,
  };
}

function problemsOf(source: EnvSource): { name: string; reason: string }[] {
  try {
    parseEnv(source);
  } catch (err) {
    if (err instanceof EnvError) return [...err.problems];
    throw err;
  }
  return [];
}

describe('parseEnv (ENV_SETUP §1.12)', () => {
  it('accepte un environnement de développement complet', () => {
    const env = parseEnv(validEnv());
    expect(env.NEXT_PUBLIC_APP_ENV).toBe('development');
    expect(env.PUBEKA_JOB_DISPATCH).toBe('inline');
  });

  it('règle 1 : refuse une variable obligatoire absente et la nomme', () => {
    const problems = problemsOf(validEnv({ SUPABASE_SECRET_KEY: undefined }));
    expect(problems).toContainEqual({ name: 'SUPABASE_SECRET_KEY', reason: 'obligatoire' });
  });

  it('règle 1 : une valeur vide compte comme absente', () => {
    const problems = problemsOf(validEnv({ ADMIN_PATH: '' }));
    expect(problems).toContainEqual({ name: 'ADMIN_PATH', reason: 'obligatoire' });
  });

  it("règle 1 : n'affiche jamais la valeur d'une variable mal formée", () => {
    const secretValue = 'valeur-secrete-qui-ne-doit-pas-fuiter';
    let message = '';
    try {
      parseEnv(validEnv({ SUPABASE_SECRET_KEY: secretValue }));
    } catch (err) {
      message = err instanceof Error ? err.message : '';
    }
    expect(message).toContain('SUPABASE_SECRET_KEY');
    expect(message).not.toContain(secretValue);
  });

  it('règle 2 (TR-SEC-03) : refuse PUBEKA_FAKE_PROVIDERS en production', () => {
    const problems = problemsOf(
      validEnv({
        NEXT_PUBLIC_APP_ENV: 'production',
        PUBEKA_JOB_DISPATCH: 'trigger',
        TRIGGER_SECRET_KEY: 'tr_prod_factice',
        PUBEKA_FAKE_PROVIDERS: 'all',
      }),
    );
    expect(problems.map((p) => p.name)).toEqual(['PUBEKA_FAKE_PROVIDERS']);
  });

  it('accepte PUBEKA_FAKE_PROVIDERS hors production, en liste', () => {
    expect(parseEnv(validEnv({ PUBEKA_FAKE_PROVIDERS: 'meta,saspay' })).PUBEKA_FAKE_PROVIDERS).toBe(
      'meta,saspay',
    );
  });

  it('PUBEKA_META_PUBLISH : facultative, jamais forcée, acceptée telle quelle (même en production)', () => {
    expect(parseEnv(validEnv()).PUBEKA_META_PUBLISH).toBeUndefined();
    expect(parseEnv(validEnv({ PUBEKA_META_PUBLISH: 'enabled' })).PUBEKA_META_PUBLISH).toBe(
      'enabled',
    );
    expect(parseEnv(validEnv({ PUBEKA_META_PUBLISH: 'autre' })).PUBEKA_META_PUBLISH).toBe('autre');
    expect(
      problemsOf(
        validEnv({ PUBEKA_META_PUBLISH: 'enabled', NEXT_PUBLIC_APP_ENV: 'production' }),
      ).map((p) => p.name),
    ).not.toContain('PUBEKA_META_PUBLISH');
  });

  it('refuse un fournisseur inconnu dans PUBEKA_FAKE_PROVIDERS', () => {
    const problems = problemsOf(validEnv({ PUBEKA_FAKE_PROVIDERS: 'meta,paypal' }));
    expect(problems.map((p) => p.name)).toEqual(['PUBEKA_FAKE_PROVIDERS']);
  });

  it('refuse PUBEKA_JOB_DISPATCH=inline en production', () => {
    const problems = problemsOf(validEnv({ NEXT_PUBLIC_APP_ENV: 'production' }));
    expect(problems.map((p) => p.name)).toEqual(['PUBEKA_JOB_DISPATCH']);
  });

  it('exige TRIGGER_SECRET_KEY quand les tâches passent par Trigger.dev', () => {
    const problems = problemsOf(validEnv({ PUBEKA_JOB_DISPATCH: undefined }));
    expect(problems.map((p) => p.name)).toEqual(['TRIGGER_SECRET_KEY']);
  });

  it('règle 3 (TR-SEC-03) : refuse une clé sk_test_ en production', () => {
    const problems = problemsOf(
      validEnv({
        NEXT_PUBLIC_APP_ENV: 'production',
        PUBEKA_JOB_DISPATCH: 'trigger',
        TRIGGER_SECRET_KEY: 'tr_prod_factice',
        SASPAY_SECRET_KEY: 'sk_test_factice',
      }),
    );
    expect(problems.map((p) => p.name)).toEqual(['SASPAY_SECRET_KEY']);
  });

  it('règle 3 : refuse une clé sk_live_ hors production', () => {
    const problems = problemsOf(validEnv({ SASPAY_SECRET_KEY: 'sk_live_factice' }));
    expect(problems.map((p) => p.name)).toEqual(['SASPAY_SECRET_KEY']);
  });

  it('règle 3 : accepte sk_live_ en production et sk_test_ en préversion', () => {
    const prod = validEnv({
      NEXT_PUBLIC_APP_ENV: 'production',
      PUBEKA_JOB_DISPATCH: 'trigger',
      TRIGGER_SECRET_KEY: 'tr_prod_factice',
      SASPAY_SECRET_KEY: 'sk_live_factice',
    });
    expect(parseEnv(prod).SASPAY_SECRET_KEY).toBe('sk_live_factice');
    const preview = validEnv({
      NEXT_PUBLIC_APP_ENV: 'preview',
      SASPAY_SECRET_KEY: 'sk_test_factice',
    });
    expect(parseEnv(preview).SASPAY_SECRET_KEY).toBe('sk_test_factice');
  });

  it('règle 4 (TR-SEC-03) : refuse une variable NEXT_PUBLIC_ hors de la liste publique', () => {
    const problems = problemsOf(validEnv({ NEXT_PUBLIC_SASPAY_SECRET_KEY: 'sk_test_factice' }));
    expect(problems.map((p) => p.name)).toEqual(['NEXT_PUBLIC_SASPAY_SECRET_KEY']);
  });

  it('refuse une clé active absente du trousseau de chiffrement', () => {
    const problems = problemsOf(validEnv({ TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'k2' }));
    expect(problems.map((p) => p.name)).toEqual(['TOKEN_ENCRYPTION_ACTIVE_KEY_ID']);
  });

  it("refuse un trousseau qui n'est pas du JSON de clés de 32 octets", () => {
    expect(
      problemsOf(validEnv({ TOKEN_ENCRYPTION_KEYS: 'pas du json' })).map((p) => p.name),
    ).toContain('TOKEN_ENCRYPTION_KEYS');
    expect(
      problemsOf(validEnv({ TOKEN_ENCRYPTION_KEYS: JSON.stringify({ k1: 'YWJj' }) })).map(
        (p) => p.name,
      ),
    ).toContain('TOKEN_ENCRYPTION_KEYS');
  });

  it('refuse une adresse qui n’est pas en http(s)', () => {
    const problems = problemsOf(validEnv({ NEXT_PUBLIC_SITE_URL: 'ftp://exemple.com' }));
    expect(problems).toContainEqual({
      name: 'NEXT_PUBLIC_SITE_URL',
      reason: 'forme invalide (invalid_format)',
    });
  });

  it('IA texte (D-2) : accepte la passerelle OpenRouter, le réglage des modèles et la confidentialité', () => {
    const env = parseEnv(
      validEnv({
        OPENROUTER_API_KEY: 'sk-or-factice',
        OPENROUTER_DATA_COLLECTION: 'deny',
        AGENT_MODELS: JSON.stringify({ analyste: 'google/gemma-4-31b-it:free' }),
      }),
    );
    expect(env.OPENROUTER_DATA_COLLECTION).toBe('deny');
    expect(env.AGENT_MODELS).toContain('gemma');
  });

  it('IA texte : refuse un réglage de confidentialité inconnu et un AGENT_MODELS qui n’est pas un objet JSON', () => {
    expect(
      problemsOf(validEnv({ OPENROUTER_DATA_COLLECTION: 'peut-etre' })).map((p) => p.name),
    ).toEqual(['OPENROUTER_DATA_COLLECTION']);
    expect(problemsOf(validEnv({ AGENT_MODELS: 'pas du json' })).map((p) => p.name)).toEqual([
      'AGENT_MODELS',
    ]);
    expect(problemsOf(validEnv({ AGENT_MODELS: '["a"]' })).map((p) => p.name)).toEqual([
      'AGENT_MODELS',
    ]);
  });
});

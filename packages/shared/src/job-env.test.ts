// Variables d'environnement MINIMALES des tâches planifiées Trigger.dev (S16b) : chaque tâche ne valide, donc ne demande, que ce
// qu'elle lit. Avant, `getEnv()` exigeait les ~15 variables obligatoires de l'application (ADMIN_PATH, APP_SIGNING_SECRET, clés
// Supabase publiables…) : une tâche planifiée sur Trigger.dev, sans variable, échouait avant d'avoir commencé. Les valeurs ci-dessous
// ont la seule FORME attendue, aucune n'est un vrai secret.
import { describe, expect, it } from 'vitest';
import { EnvError } from './env';
import {
  CAMPAIGN_RECONCILE_ENV_NAMES,
  FX_REFRESH_ENV_NAMES,
  parseCampaignReconcileEnv,
  parseFxRefreshEnv,
} from './job-env';

const KEY_32 = Buffer.alloc(32, 7).toString('base64');

const supabase = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_SECRET_KEY: 'sb_secret_factice',
};
const reconcile = {
  ...supabase,
  NEXT_PUBLIC_APP_ENV: 'preview',
  TOKEN_ENCRYPTION_KEYS: JSON.stringify({ k1: KEY_32 }),
  TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'k1',
  META_APP_ID: '123456789012345',
  META_APP_SECRET: 'ab'.repeat(16),
};

function without(source: Record<string, string>, ...names: string[]): Record<string, string> {
  return Object.fromEntries(Object.entries(source).filter(([name]) => !names.includes(name)));
}

function problemsOf(run: () => unknown): { name: string; reason: string }[] {
  try {
    run();
  } catch (error) {
    if (error instanceof EnvError) return [...error.problems];
    throw error;
  }
  return [];
}

describe('fx.refresh : seulement l’adresse et la clé secrète de Supabase', () => {
  it('liste exacte des variables demandées', () => {
    expect([...FX_REFRESH_ENV_NAMES].sort()).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SECRET_KEY',
      'SUPABASE_URL',
    ]);
  });

  it('démarre avec ces deux variables et RIEN d’autre (ni ADMIN_PATH, ni clé publiable, ni chiffrement)', () => {
    const env = parseFxRefreshEnv(supabase);
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
    expect(env.SUPABASE_SECRET_KEY).toBe('sb_secret_factice');
  });

  it('ignore les autres variables du processus, même invalides (elles ne concernent pas cette tâche)', () => {
    expect(() =>
      parseFxRefreshEnv({ ...supabase, TOKEN_ENCRYPTION_KEYS: 'pas du json', META_APP_ID: 'x' }),
    ).not.toThrow();
  });

  it('une valeur vide vaut une variable absente ; l’erreur nomme la variable, jamais sa valeur', () => {
    const problems = problemsOf(() =>
      parseFxRefreshEnv({
        NEXT_PUBLIC_SUPABASE_URL: '',
        SUPABASE_SECRET_KEY: 'mauvais-secret-visible',
      }),
    );
    expect(problems.map((p) => p.name).sort()).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SECRET_KEY',
    ]);
    expect(JSON.stringify(problems)).not.toContain('mauvais-secret-visible');
  });

  it('SUPABASE_URL facultative : acceptée si elle est valide, refusée sinon', () => {
    expect(
      parseFxRefreshEnv({ ...supabase, SUPABASE_URL: 'https://x.supabase.co' }).SUPABASE_URL,
    ).toBe('https://x.supabase.co');
    expect(
      problemsOf(() => parseFxRefreshEnv({ ...supabase, SUPABASE_URL: 'ftp://x' })).map(
        (p) => p.name,
      ),
    ).toEqual(['SUPABASE_URL']);
  });
});

describe('campaign.reconcile : Supabase, chiffrement des jetons, Meta et interrupteur', () => {
  it('liste exacte des variables demandées', () => {
    expect([...CAMPAIGN_RECONCILE_ENV_NAMES].sort()).toEqual(
      [
        'META_APP_ID',
        'META_APP_SECRET',
        'META_GRAPH_API_VERSION',
        'META_LOGIN_CONFIG_ID',
        'NEXT_PUBLIC_APP_ENV',
        'NEXT_PUBLIC_SUPABASE_URL',
        'PUBEKA_FAKE_PROVIDERS',
        'PUBEKA_META_PUBLISH',
        'SUPABASE_SECRET_KEY',
        'SUPABASE_URL',
        'TOKEN_ENCRYPTION_ACTIVE_KEY_ID',
        'TOKEN_ENCRYPTION_KEYS',
      ].sort(),
    );
  });

  it('démarre avec le sous-ensemble minimal, sans les variables propres au site (ADMIN_PATH, APP_SIGNING_SECRET, SasPay, IA…)', () => {
    const env = parseCampaignReconcileEnv(reconcile);
    expect(env.TOKEN_ENCRYPTION_ACTIVE_KEY_ID).toBe('k1');
    expect(env.PUBEKA_META_PUBLISH).toBeUndefined();
  });

  it('l’interrupteur est transmis tel quel : jamais forcé, jamais deviné', () => {
    expect(
      parseCampaignReconcileEnv({ ...reconcile, PUBEKA_META_PUBLISH: 'enabled' })
        .PUBEKA_META_PUBLISH,
    ).toBe('enabled');
    expect(
      parseCampaignReconcileEnv({ ...reconcile, PUBEKA_META_PUBLISH: 'oui' }).PUBEKA_META_PUBLISH,
    ).toBe('oui');
  });

  it.each([
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'NEXT_PUBLIC_APP_ENV',
    'TOKEN_ENCRYPTION_KEYS',
    'TOKEN_ENCRYPTION_ACTIVE_KEY_ID',
  ])('%s absente : refusée par son nom', (name) => {
    expect(
      problemsOf(() => parseCampaignReconcileEnv(without(reconcile, name))).map((p) => p.name),
    ).toContain(name);
  });

  it('clé active absente de TOKEN_ENCRYPTION_KEYS : refusée (aucun jeton ne se déchiffrerait)', () => {
    const problems = problemsOf(() =>
      parseCampaignReconcileEnv({ ...reconcile, TOKEN_ENCRYPTION_ACTIVE_KEY_ID: 'autre' }),
    );
    expect(problems.map((p) => p.name)).toEqual(['TOKEN_ENCRYPTION_ACTIVE_KEY_ID']);
  });

  it('clés de chiffrement mal formées : refusées sans afficher leur contenu', () => {
    const problems = problemsOf(() =>
      parseCampaignReconcileEnv({
        ...reconcile,
        TOKEN_ENCRYPTION_KEYS: '{"k1":"trop-court-secret"}',
      }),
    );
    expect(problems.map((p) => p.name)).toContain('TOKEN_ENCRYPTION_KEYS');
    expect(JSON.stringify(problems)).not.toContain('trop-court-secret');
  });

  it('PUBEKA_FAKE_PROVIDERS en production : refusée, comme dans l’application (aucune fausse Meta en production)', () => {
    const problems = problemsOf(() =>
      parseCampaignReconcileEnv({
        ...reconcile,
        NEXT_PUBLIC_APP_ENV: 'production',
        PUBEKA_FAKE_PROVIDERS: 'all',
      }),
    );
    expect(problems.map((p) => p.name)).toEqual(['PUBEKA_FAKE_PROVIDERS']);
  });

  it('PUBEKA_FAKE_PROVIDERS accepté hors production (préproduction, développement)', () => {
    expect(
      parseCampaignReconcileEnv({ ...reconcile, PUBEKA_FAKE_PROVIDERS: 'saspay,media,ai,email' })
        .PUBEKA_FAKE_PROVIDERS,
    ).toBe('saspay,media,ai,email');
  });

  it('Meta : identifiants facultatifs ici (la fausse Meta n’en a pas besoin), mais de bonne forme quand ils sont donnés', () => {
    expect(() =>
      parseCampaignReconcileEnv(without(reconcile, 'META_APP_ID', 'META_APP_SECRET')),
    ).not.toThrow();
    expect(
      problemsOf(() => parseCampaignReconcileEnv({ ...reconcile, META_APP_SECRET: 'court' })).map(
        (p) => p.name,
      ),
    ).toEqual(['META_APP_SECRET']);
  });
});

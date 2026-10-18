// Variables d'environnement MINIMALES des tâches de fond planifiées sur Trigger.dev (S16b). `getEnv()` exige toutes les variables
// obligatoires de l'application (ADMIN_PATH, APP_SIGNING_SECRET, clé publiable Supabase…) : sur Trigger.dev, où il faut recopier
// chaque variable à la main, c'est inutilement lourd et expose plus de secrets que nécessaire. Chaque tâche ne valide donc que ce
// qu'elle lit, avec les MÊMES règles de forme que l'application (`ENV_FIELDS`). L'erreur nomme la variable fautive, jamais sa valeur.
import { z } from 'zod';
import { cleanEnvSource, ENV_FIELDS, envProblemsOf, EnvError, type EnvSource } from './env';

function parseSubset<S extends z.ZodType>(
  schema: S,
  source: EnvSource,
  extra: (data: z.infer<S>) => { name: string; reason: string }[] = () => [],
): z.infer<S> {
  const cleaned = cleanEnvSource(source);
  const result = schema.safeParse(cleaned);
  if (!result.success) throw new EnvError(envProblemsOf(result.error.issues, cleaned));
  const problems = extra(result.data);
  if (problems.length > 0) throw new EnvError(problems);
  return result.data;
}

// ---- fx.refresh : l'adresse et la clé secrète de Supabase, rien d'autre --------------------------------------------------------

const fxRefreshSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: ENV_FIELDS.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_URL: ENV_FIELDS.SUPABASE_URL,
  SUPABASE_SECRET_KEY: ENV_FIELDS.SUPABASE_SECRET_KEY,
});
export type FxRefreshEnv = z.infer<typeof fxRefreshSchema>;
export const FX_REFRESH_ENV_NAMES = Object.keys(
  fxRefreshSchema.shape,
) as readonly (keyof FxRefreshEnv)[];

export function parseFxRefreshEnv(source: EnvSource = process.env): FxRefreshEnv {
  return parseSubset(fxRefreshSchema, source);
}

// ---- campaign.reconcile (et campaign.publish) : Supabase, chiffrement des jetons, Meta, interrupteur ----------------------------

const campaignReconcileSchema = z.object({
  NEXT_PUBLIC_APP_ENV: ENV_FIELDS.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_SUPABASE_URL: ENV_FIELDS.NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_URL: ENV_FIELDS.SUPABASE_URL,
  SUPABASE_SECRET_KEY: ENV_FIELDS.SUPABASE_SECRET_KEY,
  TOKEN_ENCRYPTION_KEYS: ENV_FIELDS.TOKEN_ENCRYPTION_KEYS,
  TOKEN_ENCRYPTION_ACTIVE_KEY_ID: ENV_FIELDS.TOKEN_ENCRYPTION_ACTIVE_KEY_ID,
  META_APP_ID: ENV_FIELDS.META_APP_ID,
  META_APP_SECRET: ENV_FIELDS.META_APP_SECRET,
  META_LOGIN_CONFIG_ID: ENV_FIELDS.META_LOGIN_CONFIG_ID,
  META_GRAPH_API_VERSION: ENV_FIELDS.META_GRAPH_API_VERSION,
  PUBEKA_FAKE_PROVIDERS: ENV_FIELDS.PUBEKA_FAKE_PROVIDERS,
  PUBEKA_META_PUBLISH: ENV_FIELDS.PUBEKA_META_PUBLISH,
});
export type CampaignReconcileEnv = z.infer<typeof campaignReconcileSchema>;
export const CAMPAIGN_RECONCILE_ENV_NAMES = Object.keys(
  campaignReconcileSchema.shape,
) as readonly (keyof CampaignReconcileEnv)[];

export function parseCampaignReconcileEnv(source: EnvSource = process.env): CampaignReconcileEnv {
  return parseSubset(campaignReconcileSchema, source, (env) => {
    const problems: { name: string; reason: string }[] = [];
    // Mêmes règles que `getEnv()` pour ce qui touche ces variables.
    if (!env.TOKEN_ENCRYPTION_KEYS.includes(`"${env.TOKEN_ENCRYPTION_ACTIVE_KEY_ID}"`)) {
      problems.push({
        name: 'TOKEN_ENCRYPTION_ACTIVE_KEY_ID',
        reason: 'absente de TOKEN_ENCRYPTION_KEYS',
      });
    }
    if (env.NEXT_PUBLIC_APP_ENV === 'production' && env.PUBEKA_FAKE_PROVIDERS !== undefined) {
      problems.push({ name: 'PUBEKA_FAKE_PROVIDERS', reason: 'interdite en production' });
    }
    return problems;
  });
}

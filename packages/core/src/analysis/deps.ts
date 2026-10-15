// Dépendances des cas d'usage « sources et analyse » (LLD §6.10-6.11). `core` ne connaît ni HTTP ni React ni Trigger.dev :
// il reçoit des ports que `apps/web` (images, lancement de tâche) et `jobs` (lecture, appel IA) remplissent.
import {
  createAiGateway,
  EnvAgentConfigSource,
  OpenRouterModelCatalog,
  StaticModelCatalog,
  usesFakeAi,
  type AgentConfigSource,
  type AgentKeyStore,
  type AiGateway,
  type FakeAiGatewayOptions,
  type ModelCatalog,
} from '@pubeka/agents';
import type { Env } from '@pubeka/shared';
import { FAKE_ANALYSTE_OUTPUT } from './fake-analyste';
import { createJinaReader, type JinaReader } from './jina';
import type { Transport } from './node-transport';
import type { DnsResolver } from './safe-url';
import type { FileMime } from '../uploads/file-types';

export const ANALYSIS_RUN_TASK = 'analysis.run';

/** Lance une tâche de fond avec une clé d'idempotence (deux lancements, une seule exécution). */
export interface JobEnqueuer {
  enqueue(taskId: string, payload: unknown, idempotencyKey: string): Promise<void>;
}

export type ImageMime = Extract<FileMime, 'image/png' | 'image/jpeg' | 'image/webp'>;

/**
 * Ré-encode une image reçue : supprime métadonnées (EXIF, dont la position GPS) et contenu caché, limite les dimensions.
 * Refuse (`unsupported_file_type`) ce qui ne se décode pas. Réalisé par `apps/web` (bibliothèque native), pas par `core`.
 */
export interface ImageProcessor {
  reencode(bytes: Uint8Array, mime: ImageMime): Promise<{ bytes: Uint8Array; mime: ImageMime }>;
}

/** Ce que l'écran de départ de l'analyse a besoin de vérifier et de lancer. */
export interface StartAnalysisDeps {
  jobs: JobEnqueuer;
  images: ImageProcessor;
  newId?: () => string;
  /** Résolveur DNS et transport remplaçables (tests) pour valider les adresses. */
  resolve?: DnsResolver;
}

/** Ce que la tâche d'analyse a besoin pour lire les sources et appeler l'Analyste. */
export interface RunAnalysisDeps {
  gateway: AiGateway;
  configs: AgentConfigSource;
  keys?: AgentKeyStore;
  catalog: ModelCatalog;
  /** Absent : pas de lecture de secours (clé `JINA_API_KEY` non fournie). */
  jina?: JinaReader | undefined;
  resolve?: DnsResolver;
  transport?: Transport;
  /**
   * Point d'accroche des quotas et crédits (S24). Appelé UNE fois, seulement quand l'analyse est acceptée (jamais pour
   * un produit illégal : TR-AGT-06) ; une erreur ici fait échouer l'analyse.
   */
  afterAccepted?: (analysisId: string, workspaceId: string) => Promise<void>;
  timeoutMs?: number;
  maxBytes?: number;
}

export type AnalysisEnv = Pick<
  Env,
  | 'PUBEKA_FAKE_PROVIDERS'
  | 'OPENROUTER_API_KEY'
  | 'OPENROUTER_DATA_COLLECTION'
  | 'AGENT_MODELS'
  | 'JINA_API_KEY'
>;

/**
 * Construit les dépendances d'exécution depuis l'environnement. Avec `PUBEKA_FAKE_PROVIDERS` contenant `ai`, la fausse
 * passerelle est servie (aucune dépense) ; `fake` fournit alors ses réponses.
 */
export function createAnalysisRunDeps(
  env: AnalysisEnv,
  fake: FakeAiGatewayOptions = {},
): RunAnalysisDeps {
  const fakeAi = usesFakeAi(env);
  return {
    gateway: createAiGateway(env, { fixtures: { analyste: FAKE_ANALYSTE_OUTPUT }, ...fake }),
    configs: new EnvAgentConfigSource(env.AGENT_MODELS),
    // La fausse passerelle accepte les images : aucun appel réseau pour demander le catalogue.
    catalog: fakeAi ? new StaticModelCatalog({}, true) : new OpenRouterModelCatalog(),
    ...(env.JINA_API_KEY === undefined || fakeAi
      ? {}
      : { jina: createJinaReader({ apiKey: env.JINA_API_KEY }) }),
  };
}

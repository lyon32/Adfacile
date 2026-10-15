// Fausses dépendances de la tâche d'analyse (TESTING §6) : fausse IA, fausse lecture des sites, aucun réseau, aucune dépense.
// Utilisées par les tests d'intégration et de parcours, qui n'ont pas le droit d'importer `@pubeka/agents` directement (LLD §3).
import {
  EnvAgentConfigSource,
  FakeAiGateway,
  StaticModelCatalog,
  type FakeReply,
} from '@pubeka/agents';
import { FAKE_ANALYSTE_OUTPUT } from './fake-analyste';
import type { RunAnalysisDeps } from './deps';

export type { FakeReply };

export interface FakeAnalysisRun {
  deps: RunAnalysisDeps;
  /** Réponses programmables (`enqueue`) et appels reçus (`calls`) : le nombre d'appels prouve la dépense. */
  gateway: FakeAiGateway;
}

export function fakeAnalysisRunDeps(
  overrides: Partial<RunAnalysisDeps> = {},
  options: { agentModels?: string; imagesSupported?: boolean | null } = {},
): FakeAnalysisRun {
  const gateway = new FakeAiGateway({ fixtures: { analyste: FAKE_ANALYSTE_OUTPUT } });
  return {
    gateway,
    deps: {
      gateway,
      configs: new EnvAgentConfigSource(options.agentModels),
      catalog: new StaticModelCatalog({}, options.imagesSupported ?? true),
      ...overrides,
    },
  };
}

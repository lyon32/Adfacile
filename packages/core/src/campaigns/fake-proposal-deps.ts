// Fausses dépendances des propositions (TESTING §6) : fausse IA, aucun réseau, aucune dépense. Utilisées par les tests
// d'intégration, qui n'ont pas le droit d'importer `@pubeka/agents` directement (LLD §3).
import { EnvAgentConfigSource, FakeAiGateway, type FakeReply } from '@pubeka/agents';
import { fakeStrategeOutput } from './fake-stratege';
import type { ProposalDeps } from './proposal-deps';

export type { FakeReply };

export interface FakeProposalRun {
  deps: ProposalDeps;
  /** Réponses programmables (`enqueue`) et appels reçus (`calls`) : le nombre d'appels prouve la dépense. */
  gateway: FakeAiGateway;
}

export function fakeProposalDeps(overrides: Partial<ProposalDeps> = {}): FakeProposalRun {
  const gateway = new FakeAiGateway({ dynamicFixtures: { stratege: fakeStrategeOutput } });
  return {
    gateway,
    deps: { gateway, configs: new EnvAgentConfigSource(undefined), ...overrides },
  };
}

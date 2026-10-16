// Dépendances des cas d'usage « propositions » (LLD §6.8, §6.10). `core` ne connaît ni HTTP ni Trigger.dev : il reçoit la
// passerelle IA et le réglage des modèles, et deux points d'accroche que S24 (crédits, quotas) remplira.
import {
  createAiGateway,
  EnvAgentConfigSource,
  type AgentConfigSource,
  type AgentKeyStore,
  type AiGateway,
  type FakeAiGatewayOptions,
} from '@pubeka/agents';
import type { Env } from '@pubeka/shared';
import { fakeStrategeOutput } from './fake-stratege';

export interface ProposalDeps {
  gateway: AiGateway;
  configs: AgentConfigSource;
  keys?: AgentKeyStore;
  /**
   * Point d'accroche des quotas et des crédits (S24). Appelé UNE fois par génération, après la réservation de la ligne
   * (la clé d'idempotence est prise) et AVANT l'appel au modèle : une erreur ici (`insufficient_credits`…) arrête tout sans
   * dépense. Pas de quota avant S24 : le seul garde-fou est la limite de débit « ai » de la route (20 par heure et par espace).
   */
  beforeSpend?: (campaignId: string, workspaceId: string) => Promise<void>;
  /** Appelé seulement quand la proposition est acceptée (valide et enregistrée) : c'est là que S24 consommera. */
  afterAccepted?: (campaignId: string, workspaceId: string, version: number) => Promise<void>;
  /** Une génération « en cours » plus ancienne que ce délai est considérée perdue (processus interrompu). */
  staleAfterMs?: number;
}

export type ProposalEnv = Pick<
  Env,
  'PUBEKA_FAKE_PROVIDERS' | 'OPENROUTER_API_KEY' | 'OPENROUTER_DATA_COLLECTION' | 'AGENT_MODELS'
>;

/**
 * Construit les dépendances depuis l'environnement. Avec `PUBEKA_FAKE_PROVIDERS` contenant `ai`, la fausse passerelle est
 * servie (aucune dépense) et répond avec une proposition calculée depuis la requête.
 */
export function createProposalDeps(
  env: ProposalEnv,
  fake: FakeAiGatewayOptions = {},
): ProposalDeps {
  return {
    gateway: createAiGateway(env, { dynamicFixtures: { stratege: fakeStrategeOutput }, ...fake }),
    configs: new EnvAgentConfigSource(env.AGENT_MODELS),
  };
}

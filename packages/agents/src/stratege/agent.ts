// Agent 2 : Stratège campagne (docs/agents/02-stratege-campagne.md). Il propose UNE campagne complète à partir de la fiche
// de l'Analyste et des réponses ; il ne fait ni visuel ni publication. Le modèle n'est JAMAIS écrit ici : il vient du réglage
// (`AgentConfig`, S13), donc de `models.json`, de `AGENT_MODELS` ou plus tard de l'administration (S31).
//
// Contenu non fiable (R8, TR-SEC-07) : la fiche et les réponses viennent de sources que l'utilisateur ne maîtrise pas
// toujours. Les réponses sont encadrées par `wrapUntrusted` ; dans la fiche, toute chaîne qui ressemble à une consigne adressée
// à une IA est retirée avant l'envoi et signalée (`PROMPT_INJECTION_SUSPECTED`). Les montants en FCFA et la TVA ne sont jamais
// demandés à l'agent : le code les calcule (docs/agents/02 §6).
import { applyAgentConfig } from '../runtime/types';
import type { AgentConfig, AgentDefinition, ChatMessage } from '../runtime/types';
import { detectInjection, wrapUntrusted } from '../runtime/untrusted';
import { buildCopyContext } from './copy-rules';
import { STRATEGE_PROMPT_V3 } from './prompt-v3';
import {
  strategeInputSchema,
  strategeOutputSchemaFor,
  type ParsedStrategeInput,
  type StrategeOutput,
} from './schema';

export const STRATEGE_PROMPT_VERSION = 'stratege@3';
/** Une proposition tient largement dans cette limite ; elle borne le coût d'une réponse trop bavarde. */
export const STRATEGE_MAX_OUTPUT_TOKENS = 2500;
const REMOVED = '[retiré : consigne suspecte]';

/** Remplace les chaînes qui ressemblent à une consigne adressée à une IA ; rend la valeur nettoyée et ce qui a été retiré. */
function sanitize(value: unknown, removed: string[]): unknown {
  if (typeof value === 'string') {
    if (detectInjection(value).suspicious) {
      removed.push(value.slice(0, 80));
      return REMOVED;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item: unknown) => sanitize(item, removed));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitize(item, removed)]),
    );
  }
  return value;
}

export interface PreparedStrategeMessage {
  message: Record<string, unknown>;
  /** Vrai si une consigne suspecte a été retirée de la fiche ou des réponses. */
  injectionSuspected: boolean;
}

export function prepareStrategeMessage(input: ParsedStrategeInput): PreparedStrategeMessage {
  const removed: string[] = [];
  const profile = sanitize(input.profile, removed);
  const answers = input.answers.map((a) => {
    if (detectInjection(a.answer).suspicious) removed.push(a.answer.slice(0, 80));
    return { question: a.question, answer: wrapUntrusted(a.answer) };
  });
  return {
    injectionSuspected: removed.length > 0,
    // Même forme que le message du banc (bench/engine.mjs `userMessage`), plus les réponses et le kit de marque.
    message: {
      today: input.today,
      output_language: input.output_language,
      ad_address: input.ad_address,
      profile,
      answers,
      brand_kit: input.brand_kit,
      account_state: input.account_state,
      user_constraints: input.user_constraints,
      previous_proposals: input.previous_proposals,
    },
  };
}

export function buildStrategeMessages(input: ParsedStrategeInput): ChatMessage[] {
  return [
    { role: 'system', content: STRATEGE_PROMPT_V3 },
    { role: 'user', content: JSON.stringify(prepareStrategeMessage(input).message) },
  ];
}

/** Contexte de contrôle R3 : tout ce que l'agent a le droit de citer (fiche, réponses, kit de marque). */
export function strategeCopyContext(input: ParsedStrategeInput) {
  return buildCopyContext({
    language: input.output_language,
    address: input.ad_address,
    sources: [input.profile, input.answers.map((a) => [a.question, a.answer]), input.brand_kit],
  });
}

/**
 * Définition de l'agent pour UNE entrée : le schéma de sortie connaît les sources (R3), le ton, la date du jour, les pixels
 * du compte et les contraintes de l'utilisateur.
 */
export function strategeAgent(
  config: AgentConfig,
  input: ParsedStrategeInput,
): AgentDefinition<ParsedStrategeInput, StrategeOutput> {
  return applyAgentConfig(
    {
      name: 'stratege',
      promptVersion: STRATEGE_PROMPT_VERSION,
      model: config.model,
      temperature: config.temperature,
      maxOutputTokens: STRATEGE_MAX_OUTPUT_TOKENS,
      inputSchema: strategeInputSchema,
      outputSchema: strategeOutputSchemaFor(input, strategeCopyContext(input)),
      buildMessages: buildStrategeMessages,
    },
    config,
  );
}

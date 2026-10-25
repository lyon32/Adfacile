// Agent 4 : Modérateur (docs/agents/04-moderateur.md). Il intervient UNIQUEMENT après un refus de Meta : il explique le motif
// et propose la correction. Il ne juge jamais une campagne avant sa publication. Le modèle n'est JAMAIS écrit ici : il vient du
// réglage (`AgentConfig`, S13).
//
// Contenu non fiable (R8, TR-SEC-07) : le motif de Meta, la description du visuel et la page de destination sont encadrés par
// `wrapUntrusted` ; les textes de la publicité (écrits ou modifiés par le client) sont nettoyés de toute consigne adressée à une
// IA (`detectInjection`) et le cas est signalé. Les textes de la publicité restent LITTÉRAUX : l'extrait cité doit pouvoir y être
// retrouvé par le code.
import { applyAgentConfig } from '../runtime/types';
import type { AgentConfig, AgentDefinition, ChatMessage } from '../runtime/types';
import { detectInjection, wrapUntrusted } from '../runtime/untrusted';
import { MODERATEUR_PROMPT_V2 } from './prompt-v2';
import {
  moderateurInputSchema,
  moderateurOutputSchemaFor,
  type ModerateurOutput,
  type ParsedModerateurInput,
} from './schema';

export const MODERATEUR_PROMPT_VERSION = 'moderateur@2';
/** Un rapport et une correction tiennent largement dans cette limite. */
export const MODERATEUR_MAX_OUTPUT_TOKENS = 1200;
const REMOVED = '[retiré : consigne suspecte]';

export interface PreparedModerateurMessage {
  message: Record<string, unknown>;
  /** Vrai si une consigne suspecte a été retirée de la publicité ou repérée dans le motif. */
  injectionSuspected: boolean;
}

export function prepareModerateurMessage(input: ParsedModerateurInput): PreparedModerateurMessage {
  let suspected = false;
  const clean = (value: string): string => {
    if (!detectInjection(value).suspicious) return value;
    suspected = true;
    return REMOVED;
  };
  const watch = (value: string): string => {
    if (detectInjection(value).suspicious) suspected = true;
    return wrapUntrusted(value);
  };
  const { ad } = input;
  const message = {
    // Même forme que le message du banc (bench/engine.mjs `userMessage`) ; les textes libres sont encadrés comme données.
    output_language: input.output_language,
    ad: {
      product: clean(ad.product),
      primary_text: clean(ad.primary_text),
      headline: clean(ad.headline),
      ...(ad.description === null ? {} : { description: clean(ad.description) }),
      visual: watch(ad.visual),
      ...(ad.landing_page === null ? {} : { landing_page: watch(ad.landing_page) }),
    },
    meta_rejection: watch(input.meta_rejection),
  };
  return { message, injectionSuspected: suspected };
}

export function buildModerateurMessages(input: ParsedModerateurInput): ChatMessage[] {
  return [
    { role: 'system', content: MODERATEUR_PROMPT_V2 },
    { role: 'user', content: JSON.stringify(prepareModerateurMessage(input).message) },
  ];
}

/** Définition de l'agent pour UNE entrée : le schéma de sortie connaît la publicité (citations et chiffres vérifiés). */
export function moderateurAgent(
  config: AgentConfig,
  input: ParsedModerateurInput,
): AgentDefinition<ParsedModerateurInput, ModerateurOutput> {
  return applyAgentConfig(
    {
      name: 'moderateur',
      promptVersion: MODERATEUR_PROMPT_VERSION,
      model: config.model,
      temperature: config.temperature,
      maxOutputTokens: MODERATEUR_MAX_OUTPUT_TOKENS,
      inputSchema: moderateurInputSchema,
      outputSchema: moderateurOutputSchemaFor(input),
      buildMessages: buildModerateurMessages,
    },
    config,
  );
}

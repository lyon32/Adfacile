// Agent 1 : Analyste business (docs/agents/01-analyste-business.md). Transforme les sources en fiche `BusinessProfile`
// et en 3 à 5 questions. Il ne propose ni campagne ni visuel. Le modèle n'est JAMAIS écrit ici : il vient du réglage
// (`AgentConfig`, S13), donc de `models.json`, de `AGENT_MODELS` ou plus tard de l'administration (S31).
//
// Contenu non fiable (R8, TR-SEC-07) : tout texte venu d'un site, d'un PDF, d'une image ou d'une description est encadré
// par `wrapUntrusted` ; la consigne de l'utilisateur (« ce que je veux comme pub ») l'est aussi, parce qu'elle peut
// avoir été copiée d'ailleurs. Les photos sont envoyées comme parties d'image du message (`image_url`).
import { applyAgentConfig } from '../runtime/types';
import type { AgentConfig, AgentDefinition, ChatContentPart, ChatMessage } from '../runtime/types';
import { wrapUntrusted } from '../runtime/untrusted';
import { ANALYSTE_PROMPT_V2 } from './prompt-v2';
import {
  analysteInputSchema,
  analysteOutputSchema,
  type AnalysteOutput,
  type ParsedAnalysteInput,
} from './schema';

export const ANALYSTE_PROMPT_VERSION = 'analyste@2';
/** Une fiche et ses questions tiennent largement dans cette limite ; elle borne le coût d'une réponse trop bavarde. */
export const ANALYSTE_MAX_OUTPUT_TOKENS = 4000;

type Prepared = Record<string, unknown>;

/** Message utilisateur : un seul JSON (comme le banc), les textes de source encadrés comme données. */
function prepare(input: ParsedAnalysteInput): Prepared {
  return {
    business_id: input.business_id,
    locale: input.locale,
    brand_kit: input.brand_kit,
    user_intent: input.user_intent === null ? null : wrapUntrusted(input.user_intent),
    sources: input.sources.map((source, index) => {
      switch (source.type) {
        case 'text':
          return { index, type: 'text', content: wrapUntrusted(source.content) };
        case 'image': {
          const sent = input.images.some((image) => image.index === index);
          return { index, type: 'image', role: source.role, attached: sent };
        }
        case 'document':
          return {
            index,
            type: 'document',
            filename: source.filename,
            extracted_text: wrapUntrusted(source.extracted_text),
          };
        case 'website':
        case 'app_link':
        case 'social_post':
          return {
            index,
            type: source.type,
            url: source.url,
            extracted_text: wrapUntrusted(source.extracted_text),
          };
      }
    }),
  };
}

export function buildAnalysteMessages(input: ParsedAnalysteInput): ChatMessage[] {
  const json = JSON.stringify(prepare(input));
  const system: ChatMessage = { role: 'system', content: ANALYSTE_PROMPT_V2 };
  if (input.images.length === 0) return [system, { role: 'user', content: json }];

  const parts: ChatContentPart[] = [{ type: 'text', text: json }];
  for (const image of input.images) {
    // L'étiquette dit à quelle source (index) correspond l'image qui suit : `source` de la fiche pointe juste.
    parts.push({ type: 'text', text: `Image de la source ${String(image.index)} :` });
    parts.push({
      type: 'image_url',
      image_url: { url: `data:${image.mime};base64,${image.base64}` },
    });
  }
  return [system, { role: 'user', content: parts }];
}

/** Définition de l'agent avec le réglage lu derrière `AgentConfigSource`. */
export function analysteAgent(
  config: AgentConfig,
): AgentDefinition<ParsedAnalysteInput, AnalysteOutput> {
  return applyAgentConfig(
    {
      name: 'analyste',
      promptVersion: ANALYSTE_PROMPT_VERSION,
      model: config.model,
      temperature: config.temperature,
      maxOutputTokens: ANALYSTE_MAX_OUTPUT_TOKENS,
      inputSchema: analysteInputSchema,
      outputSchema: analysteOutputSchema,
      buildMessages: buildAnalysteMessages,
    },
    config,
  );
}

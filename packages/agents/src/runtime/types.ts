// Types communs du moteur des agents (LLD §6.10, docs/agents/README R1 à R12).
// Un agent ne lit pas la base et n'appelle pas Meta : il reçoit ses données et rend un JSON validé.
import type { z } from 'zod';

export const AGENT_NAMES = [
  'analyste',
  'stratege',
  'designer',
  'moderateur',
  'optimiseur',
  'aide',
] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

/**
 * Partie d'un message multimodal (format OpenAI repris par OpenRouter, documentation :
 * https://openrouter.ai/docs/features/multimodal/images ). Une image est envoyée en URL de données (`data:image/…;base64,…`) :
 * le modèle doit accepter les images (`architecture.input_modalities` d'OpenRouter), voir `model-catalog.ts`.
 */
export type ChatContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

/** Nombre de caractères d'un message (les images comptent pour 0 : elles sont facturées à part). */
export function messageLength(message: ChatMessage): number {
  if (typeof message.content === 'string') return message.content.length;
  return message.content.reduce((n, part) => n + (part.type === 'text' ? part.text.length : 0), 0);
}

/** Forme de la réponse demandée au modèle. `json_object` : JSON libre, validé ensuite par Zod. */
export type AiResponseFormat =
  { type: 'json_object' } | { type: 'json_schema'; name: string; schema: Record<string, unknown> };

/** Fournisseurs de modèles texte. OpenRouter par défaut ; les autres sont prévus pour une clé propre à un agent (S31). */
export const AI_PROVIDERS = ['openrouter', 'anthropic', 'openai', 'gemini'] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

export interface AiCompletionRequest {
  /** Fournisseur de l'appel ; `openrouter` si absent. Seul OpenRouter est réalisé en S13 (les autres : `bad_request`). */
  provider?: AiProviderId;
  /**
   * Clé propre à cet appel (clé d'un agent définie par l'administration, S31). Absente : clé globale de la passerelle.
   * Jamais journalisée, jamais copiée dans un message d'erreur.
   */
  apiKey?: string;
  /** Identifiant de modèle de la passerelle (ex. `google/gemma-4-31b-it:free`). Jamais écrit en dur. */
  model: string;
  /** Modèle de secours, essayé par la passerelle elle-même si le premier est indisponible. */
  fallbackModel?: string;
  messages: ChatMessage[];
  temperature: number;
  maxOutputTokens?: number;
  responseFormat: AiResponseFormat;
  signal?: AbortSignal;
  /**
   * Affichage progressif : si présent, la passerelle demande le texte en flux et appelle `onText` à chaque fragment reçu.
   * L'appel rend toujours la réponse COMPLÈTE ; les fragments ne sont qu'un aperçu non contractuel (la validation se fait
   * sur le texte final). Absent : un seul aller-retour, sans flux.
   */
  onText?: (delta: string) => void;
  /** Pour le journal et pour les fausses implémentations ; jamais envoyé au fournisseur. */
  trace?: { agent: AgentName; promptVersion: string };
}

export interface AiCompletion {
  text: string;
  /** Modèle qui a réellement répondu (peut être le modèle de secours). */
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  /** Coût facturé par la passerelle, en dollars ; `null` s'il n'est pas connu. */
  costUsd: number | null;
  finishReason: string | null;
}

/** Passerelle IA texte. Un seul appel réseau par `complete` : aucune relance cachée (TR-AGT-01). */
export interface AiGateway {
  complete(request: AiCompletionRequest): Promise<AiCompletion>;
}

export type AiGatewayErrorKind =
  | 'rate_limited'
  | 'insufficient_credits'
  | 'unauthorized'
  | 'bad_request'
  | 'timeout'
  | 'unavailable'
  | 'bad_response';

export class AiGatewayError extends Error {
  constructor(
    readonly kind: AiGatewayErrorKind,
    message: string,
    readonly opts: { status?: number; retryAfterS?: number; cause?: unknown } = {},
  ) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'AiGatewayError';
  }
}

/**
 * Réglage d'un agent, lu derrière `AgentConfigSource`. En S13 la source est `EnvAgentConfigSource` (models.json et
 * `AGENT_MODELS`) ; S31 branchera une source en base, modifiable sans redéploiement, sans toucher à `runAgent`.
 */
export interface AgentConfig {
  agent: AgentName;
  provider: AiProviderId;
  model: string;
  fallbackModel?: string;
  temperature: number;
  /** Référence d'une clé propre (identifiant en base), jamais la clé : résolue par `AgentKeyStore`. Absente : clé globale. */
  keyRef?: string;
}

export interface AgentConfigSource {
  get(agent: AgentName): Promise<AgentConfig>;
}

/**
 * Donne la clé d'API d'une référence. S31 : lecture d'une clé stockée CHIFFRÉE (même mécanisme que
 * `TOKEN_ENCRYPTION_KEYS`), en écriture seule côté administration. Ne renvoie ni ne journalise jamais la clé.
 */
export interface AgentKeyStore {
  resolve(keyRef: string): Promise<string>;
}

export interface AgentDefinition<I, O> {
  name: AgentName;
  /** Fournisseur ; `openrouter` si absent. */
  provider?: AiProviderId;
  /** Référence de clé propre (voir `AgentConfig.keyRef`). */
  keyRef?: string;
  /** Ex. `analyste@2`. Tout changement de prompt crée une nouvelle version (R12). */
  promptVersion: string;
  /** Identifiant passerelle : vient de la configuration (`resolveAgentModel`), jamais d'une constante. */
  model: string;
  fallbackModel?: string;
  /** Fixée par la configuration, pas par l'agent (R10). */
  temperature: number;
  maxOutputTokens?: number;
  /** `json_object` par défaut ; `json_schema` demande une sortie structurée au modèle (Zod → JSON Schema). */
  responseFormat?: 'json_object' | 'json_schema';
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  buildMessages(input: I): ChatMessage[];
}

/** Ligne du journal `agent_runs` (TR-AGT-02). Elle est écrite par `core`, jamais par `agents`. */
export interface AgentRunRecord {
  workspaceId: string | null;
  agent: AgentName;
  /** Modèle qui a réellement répondu (principal ou modèle de secours). */
  model: string;
  /** Modèle demandé (le réglage). Différent de `model` : le modèle de secours a répondu. */
  requestedModel: string;
  provider: AiProviderId;
  /** Nombre d'appels à la passerelle : 0 (entrée refusée), 1 ou 2 (jamais plus). */
  attempts: number;
  /** Code d'erreur applicatif si l'exécution a échoué, sinon `null`. */
  errorCode: string | null;
  promptVersion: string;
  input: unknown;
  /** JSON valide renvoyé par le modèle ; `null` si la sortie n'a jamais été valide. */
  output: unknown;
  validSchema: boolean;
  /** Vrai si un nouvel essai a eu lieu (au plus un). */
  retried: boolean;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  latencyMs: number;
}

export interface RunAgentOptions {
  workspaceId: string | null;
  gateway: AiGateway;
  signal?: AbortSignal;
  /**
   * Aperçu progressif (Stratège, Assistant) : reçoit les fragments du PREMIER appel seulement. Le nouvel essai éventuel
   * (sortie invalide) n'est pas diffusé : l'aperçu déjà montré est remplacé par la sortie finale validée.
   */
  onText?: (delta: string) => void;
  /** Appelé juste avant l'unique nouvel essai : l'aperçu déjà montré va être remplacé. */
  onRetry?: () => void;
  /** Horloge injectable pour mesurer la durée (millisecondes) ; défaut `Date.now`. */
  clock?: () => number;
  /** Nécessaire seulement si l'agent a une clé propre (`keyRef`). */
  keys?: AgentKeyStore;
}

/** Applique un réglage d'agent (venu d'une `AgentConfigSource`) à la définition de l'agent. */
export function applyAgentConfig<I, O>(
  def: AgentDefinition<I, O>,
  config: AgentConfig,
): AgentDefinition<I, O> {
  return {
    ...def,
    provider: config.provider,
    model: config.model,
    temperature: config.temperature,
    ...(config.fallbackModel === undefined ? {} : { fallbackModel: config.fallbackModel }),
    ...(config.keyRef === undefined ? {} : { keyRef: config.keyRef }),
  };
}

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

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Forme de la réponse demandée au modèle. `json_object` : JSON libre, validé ensuite par Zod. */
export type AiResponseFormat =
  { type: 'json_object' } | { type: 'json_schema'; name: string; schema: Record<string, unknown> };

export interface AiCompletionRequest {
  /** Identifiant de modèle de la passerelle (ex. `google/gemma-4-31b-it:free`). Jamais écrit en dur. */
  model: string;
  /** Modèle de secours, essayé par la passerelle elle-même si le premier est indisponible. */
  fallbackModel?: string;
  messages: ChatMessage[];
  temperature: number;
  maxOutputTokens?: number;
  responseFormat: AiResponseFormat;
  signal?: AbortSignal;
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

export interface AgentDefinition<I, O> {
  name: AgentName;
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
  model: string;
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
  /** Horloge injectable pour mesurer la durée (millisecondes) ; défaut `Date.now`. */
  clock?: () => number;
}

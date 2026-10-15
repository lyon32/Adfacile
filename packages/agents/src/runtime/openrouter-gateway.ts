// Passerelle IA texte : OpenRouter (décision D-2, 15/10/2026).
// Documentation officielle (lue avant d'écrire ce fichier) :
//   requêtes     https://openrouter.ai/docs/api-reference/overview
//   sorties JSON https://openrouter.ai/docs/features/structured-outputs
//   secours      https://openrouter.ai/docs/guides/routing/model-fallbacks   (champ `models`)
//   données      https://openrouter.ai/docs/features/provider-routing         (`provider.data_collection`)
//   coût         https://openrouter.ai/docs/guides/guides/usage-accounting    (`usage.cost`, toujours présent)
//   erreurs      https://openrouter.ai/docs/api-reference/errors
// Un appel de `complete` = UNE requête HTTP, sans relance : un résultat incertain n'est jamais rejoué
// ici (TR-AGT-01, EC-META-05). Le seul nouvel essai prévu est celui de `runAgent`.
import { z } from 'zod';
import type { AiCompletion, AiCompletionRequest, AiGateway } from './types';
import { AiGatewayError } from './types';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_MESSAGE_LENGTH = 200;

export interface OpenRouterGatewayOptions {
  apiKey: string;
  baseUrl?: string;
  /** `deny` : refuser les modèles dont le fournisseur peut conserver les textes (réglage de confidentialité). */
  dataCollection?: 'allow' | 'deny';
  /** Délai maximal d'une requête, en millisecondes. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  referer?: string;
  title?: string;
}

const successSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable().optional() }).optional(),
        finish_reason: z.string().nullable().optional(),
        error: z.object({ message: z.string().optional() }).optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      cost: z.number().nullable().optional(),
    })
    .optional(),
});

const errorSchema = z.object({
  error: z.object({
    code: z.union([z.number(), z.string()]).optional(),
    message: z.string().optional(),
  }),
});

function shorten(message: string): string {
  return message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message;
}

function kindForStatus(status: number): AiGatewayError['kind'] {
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 402) return 'insufficient_credits';
  if (status === 408) return 'timeout';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'unavailable';
  return 'bad_request';
}

export class OpenRouterGateway implements AiGateway {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenRouterGatewayOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async complete(request: AiCompletionRequest): Promise<AiCompletion> {
    // Appel direct chez un autre fournisseur (clé propre à un agent) : l'interface est prête, pas la réalisation (S31).
    if (request.provider !== undefined && request.provider !== 'openrouter') {
      throw new AiGatewayError(
        'bad_request',
        `Fournisseur « ${request.provider} » non pris en charge par cette passerelle`,
      );
    }
    const timeout = AbortSignal.timeout(this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const signal =
      request.signal === undefined ? timeout : AbortSignal.any([request.signal, timeout]);

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${request.apiKey ?? this.options.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.options.referer ?? 'https://pubeka.com',
          'X-Title': this.options.title ?? 'Pubeka',
        },
        body: JSON.stringify(this.body(request)),
        signal,
      });
    } catch (cause) {
      if (timeout.aborted) throw new AiGatewayError('timeout', 'Délai dépassé', { cause });
      if (request.signal?.aborted === true)
        throw new AiGatewayError('timeout', 'Appel annulé', { cause });
      throw new AiGatewayError('unavailable', 'Passerelle IA injoignable', { cause });
    }

    if (!response.ok) throw await this.failure(response);

    const json: unknown = await response.json().catch(() => null);
    const parsed = successSchema.safeParse(json);
    if (!parsed.success)
      throw new AiGatewayError('bad_response', 'Réponse de la passerelle illisible');

    const choice = parsed.data.choices[0];
    // Une erreur survenue pendant la génération arrive avec un statut 200 (documentation, « errors »).
    if (choice?.error !== undefined) {
      throw new AiGatewayError('unavailable', shorten(choice.error.message ?? 'Erreur du modèle'));
    }
    const text = choice?.message?.content;
    if (typeof text !== 'string' || text.trim() === '') {
      throw new AiGatewayError('bad_response', 'Réponse vide du modèle');
    }
    const usage = parsed.data.usage;
    return {
      text,
      model: parsed.data.model ?? request.model,
      tokensIn: usage?.prompt_tokens ?? null,
      tokensOut: usage?.completion_tokens ?? null,
      costUsd: usage?.cost ?? null,
      finishReason: choice?.finish_reason ?? null,
    };
  }

  private body(request: AiCompletionRequest): Record<string, unknown> {
    const provider: Record<string, unknown> = {};
    if (this.options.dataCollection !== undefined)
      provider.data_collection = this.options.dataCollection;
    // Sortie structurée : ne router que vers les fournisseurs qui la prennent en charge.
    if (request.responseFormat.type === 'json_schema') provider.require_parameters = true;

    const responseFormat =
      request.responseFormat.type === 'json_object'
        ? { type: 'json_object' }
        : {
            type: 'json_schema',
            json_schema: {
              name: request.responseFormat.name,
              strict: true,
              schema: request.responseFormat.schema,
            },
          };

    return {
      // `models` = ordre de priorité ; la passerelle essaie le suivant si le premier est indisponible.
      ...(request.fallbackModel === undefined
        ? { model: request.model }
        : { models: [request.model, request.fallbackModel] }),
      messages: request.messages,
      temperature: request.temperature,
      ...(request.maxOutputTokens === undefined ? {} : { max_tokens: request.maxOutputTokens }),
      response_format: responseFormat,
      ...(Object.keys(provider).length === 0 ? {} : { provider }),
    };
  }

  private async failure(response: Response): Promise<AiGatewayError> {
    const json: unknown = await response.json().catch(() => null);
    const parsed = errorSchema.safeParse(json);
    const detail = parsed.success ? parsed.data.error.message : undefined;
    const retryHeader = Number(response.headers.get('Retry-After'));
    return new AiGatewayError(
      kindForStatus(response.status),
      shorten(detail ?? `Erreur ${String(response.status)}`),
      {
        status: response.status,
        ...(Number.isFinite(retryHeader) && retryHeader > 0 ? { retryAfterS: retryHeader } : {}),
      },
    );
  }
}

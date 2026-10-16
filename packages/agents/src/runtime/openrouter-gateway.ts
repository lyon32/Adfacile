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

const LF = String.fromCharCode(10);
const CR_END = new RegExp(`${String.fromCharCode(13)}$`);

const usageSchema = z.object({
  prompt_tokens: z.number().optional(),
  completion_tokens: z.number().optional(),
  cost: z.number().nullable().optional(),
});

const chunkSchema = z.object({
  model: z.string().optional(),
  error: z.object({ message: z.string().optional() }).optional(),
  choices: z
    .array(
      z.object({
        delta: z.object({ content: z.string().nullable().optional() }).optional(),
        finish_reason: z.string().nullable().optional(),
        error: z.object({ message: z.string().optional() }).optional(),
      }),
    )
    .optional(),
  usage: usageSchema.optional(),
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
    if (request.onText !== undefined) {
      return this.readStream(response, request, { timedOut: () => timeout.aborted });
    }

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
      ...(request.onText === undefined ? {} : { stream: true }),
      messages: request.messages,
      temperature: request.temperature,
      ...(request.maxOutputTokens === undefined ? {} : { max_tokens: request.maxOutputTokens }),
      response_format: responseFormat,
      ...(Object.keys(provider).length === 0 ? {} : { provider }),
    };
  }

  /**
   * Lecture du flux SSE (https://openrouter.ai/docs/api-reference/streaming) : lignes `data: {json}`, commentaires `: …`
   * à ignorer, fin `data: [DONE]`, `usage` dans un dernier fragment, erreur en cours de route = fragment avec un champ
   * `error` (le statut HTTP reste 200). Les fragments de texte sont transmis à `onText` ; la réponse rendue est complète.
   */
  private async readStream(
    response: Response,
    request: AiCompletionRequest,
    state: { timedOut: () => boolean },
  ): Promise<AiCompletion> {
    const onText = request.onText;
    if (response.body === null || onText === undefined) {
      throw new AiGatewayError('bad_response', 'Flux de la passerelle absent');
    }
    const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let text = '';
    let model: string | undefined;
    let finish = null as string | null;
    let usage: z.infer<typeof usageSchema> | undefined;

    const handle = (line: string): boolean => {
      // Commentaire SSE (« : OPENROUTER PROCESSING ») ou ligne vide : ignoré, sans JSON.parse.
      if (line === '' || line.startsWith(':')) return false;
      if (!line.startsWith('data:')) return false;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return true;
      let json: unknown;
      try {
        json = JSON.parse(payload);
      } catch {
        throw new AiGatewayError('bad_response', 'Fragment de flux illisible');
      }
      const chunk = chunkSchema.safeParse(json);
      if (!chunk.success) throw new AiGatewayError('bad_response', 'Fragment de flux inattendu');
      if (chunk.data.error !== undefined) {
        throw new AiGatewayError(
          'unavailable',
          shorten(chunk.data.error.message ?? 'Erreur du modèle'),
        );
      }
      model = chunk.data.model ?? model;
      if (chunk.data.usage !== undefined) usage = chunk.data.usage;
      const choice = chunk.data.choices?.[0];
      if (choice?.error !== undefined) {
        throw new AiGatewayError(
          'unavailable',
          shorten(choice.error.message ?? 'Erreur du modèle'),
        );
      }
      if (typeof choice?.finish_reason === 'string') finish = choice.finish_reason;
      const delta = choice?.delta?.content;
      if (typeof delta === 'string' && delta !== '') {
        text += delta;
        onText(delta);
      }
      return false;
    };

    try {
      let done = false;
      while (!done) {
        const read = await reader.read();
        if (read.done) break;
        pending += decoder.decode(read.value, { stream: true });
        let newline = pending.indexOf(LF);
        while (newline !== -1 && !done) {
          done = handle(pending.slice(0, newline).replace(CR_END, ''));
          pending = pending.slice(newline + 1);
          newline = pending.indexOf(LF);
        }
      }
      if (!done && pending.trim() !== '') handle(pending.trim());
    } catch (cause) {
      if (cause instanceof AiGatewayError) throw cause;
      if (state.timedOut()) throw new AiGatewayError('timeout', 'Délai dépassé', { cause });
      if (request.signal?.aborted === true) {
        throw new AiGatewayError('timeout', 'Appel annulé', { cause });
      }
      throw new AiGatewayError('unavailable', 'Flux de la passerelle interrompu', { cause });
    } finally {
      reader.releaseLock();
    }

    if (finish === 'error')
      throw new AiGatewayError('unavailable', 'Erreur du modèle en cours de route');
    if (text.trim() === '') throw new AiGatewayError('bad_response', 'Réponse vide du modèle');
    return {
      text,
      model: model ?? request.model,
      tokensIn: usage?.prompt_tokens ?? null,
      tokensOut: usage?.completion_tokens ?? null,
      costUsd: usage?.cost ?? null,
      finishReason: finish,
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

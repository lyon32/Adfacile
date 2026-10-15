// Exécution d'un agent (LLD §6.10, TR-AGT-01, TR-AGT-02).
//
// Règle centrale : AU PLUS DEUX appels à la passerelle par exécution.
//   appel 1 → sortie valide : fini ;
//   appel 1 → sortie invalide : UN seul nouvel essai, avec l'erreur de validation dans le message ;
//   appel 2 → sortie invalide : échec visible. Jamais d'appel 3.
// Une panne de la passerelle n'est jamais rejouée : le résultat d'un appel qui a échoué est incertain
// (le fournisseur a peut-être répondu et facturé), donc on le signale au lieu de relancer
// (docs/ROADMAP §8.1 règle 5, SECURITY_NOTES EC-META-05).
import { z } from 'zod';
import { AppError, type ErrorCode } from '@pubeka/contracts';
import type {
  AgentDefinition,
  AgentRunRecord,
  AiCompletion,
  AiResponseFormat,
  ChatMessage,
  RunAgentOptions,
} from './types';
import { AiGatewayError } from './types';

export type AgentFailureReason =
  'invalid_input' | 'gateway' | 'invalid_output' | 'out_of_scope' | 'aborted';

/**
 * Échec d'un agent. Porte le journal de l'exécution : `core` l'inscrit quand même dans `agent_runs`
 * (un appel raté a pu coûter des jetons).
 */
export class AgentRunError extends AppError {
  constructor(
    code: ErrorCode,
    readonly reason: AgentFailureReason,
    readonly run: AgentRunRecord,
    opts: { cause?: unknown; retryAfterS?: number } = {},
  ) {
    super(code, {
      meta: { reason, agent: run.agent },
      ...(opts.cause === undefined ? {} : { cause: opts.cause }),
      ...(opts.retryAfterS === undefined ? {} : { retryAfterS: opts.retryAfterS }),
    });
    this.name = 'AgentRunError';
  }
}

const MAX_ISSUES_IN_RETRY = 8;
const MAX_ECHOED_ANSWER = 6_000;

function stripFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

type Validation<O> =
  | { ok: true; output: O }
  | { ok: false; outOfScope: true }
  | { ok: false; outOfScope: false; problem: string };

const outOfScopeSchema = z.strictObject({ error: z.literal('OUT_OF_SCOPE') });

function validate<O>(text: string, schema: z.ZodType<O>): Validation<O> {
  let json: unknown;
  try {
    json = JSON.parse(stripFence(text));
  } catch {
    return { ok: false, outOfScope: false, problem: "ce n'était pas un JSON valide" };
  }
  // R1 : un agent qui refuse une tâche hors de sa mission le dit ainsi ; ce n'est pas une erreur de forme.
  if (outOfScopeSchema.safeParse(json).success) return { ok: false, outOfScope: true };
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, output: result.data };
  const issues = result.error.issues
    .slice(0, MAX_ISSUES_IN_RETRY)
    .map((issue) => `${issue.path.map(String).join('.') || '(racine)'} : ${issue.message}`);
  return {
    ok: false,
    outOfScope: false,
    problem: `le JSON ne respecte pas le schéma (${issues.join(' ; ')})`,
  };
}

function retryMessages(messages: ChatMessage[], answer: string, problem: string): ChatMessage[] {
  return [
    ...messages,
    { role: 'assistant', content: answer.slice(0, MAX_ECHOED_ANSWER) },
    {
      role: 'user',
      content: `Ta réponse précédente est refusée : ${problem}. Réponds uniquement par le JSON corrigé, conforme au schéma, sans aucun texte autour et sans Markdown.`,
    },
  ];
}

function responseFormatFor<I, O>(def: AgentDefinition<I, O>): AiResponseFormat {
  if (def.responseFormat !== 'json_schema') return { type: 'json_object' };
  try {
    const schema = z.toJSONSchema(def.outputSchema);
    delete schema.$schema;
    return { type: 'json_schema', name: `${def.name}_output`, schema };
  } catch (cause) {
    throw new AppError('internal_error', { cause });
  }
}

function codeFor(error: AiGatewayError): ErrorCode {
  return error.kind === 'rate_limited' ? 'rate_limited' : 'provider_unavailable';
}

export async function runAgent<I, O>(
  def: AgentDefinition<I, O>,
  input: I,
  opts: RunAgentOptions,
): Promise<{ output: O; run: AgentRunRecord }> {
  const clock = opts.clock ?? Date.now;
  const startedAt = clock();

  const totals = {
    tokensIn: null as number | null,
    tokensOut: null as number | null,
    costUsd: null as number | null,
  };
  let model = def.model;
  let retried = false;
  let attempts = 0;

  const record = (
    output: unknown,
    validSchema: boolean,
    shownInput: unknown,
    errorCode: string | null = null,
  ): AgentRunRecord => ({
    workspaceId: opts.workspaceId,
    agent: def.name,
    model,
    requestedModel: def.model,
    provider: def.provider ?? 'openrouter',
    attempts,
    errorCode,
    promptVersion: def.promptVersion,
    input: shownInput,
    output,
    validSchema,
    retried,
    ...totals,
    latencyMs: Math.max(0, clock() - startedAt),
  });

  const parsedInput = def.inputSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new AgentRunError(
      'validation_failed',
      'invalid_input',
      record(null, false, null, 'validation_failed'),
      {
        cause: parsedInput.error,
      },
    );
  }
  const agentInput = parsedInput.data;
  const messages = def.buildMessages(agentInput);
  const responseFormat = responseFormatFor(def);

  // Clé propre à l'agent (S31) : résolue ici, passée à la passerelle, jamais copiée dans le journal ni dans une erreur.
  let apiKey: string | undefined;
  if (def.keyRef !== undefined) {
    if (opts.keys === undefined) {
      throw new AgentRunError(
        'internal_error',
        'gateway',
        record(null, false, agentInput, 'internal_error'),
      );
    }
    try {
      apiKey = await opts.keys.resolve(def.keyRef);
    } catch {
      throw new AgentRunError(
        'provider_unavailable',
        'gateway',
        record(null, false, agentInput, 'provider_unavailable'),
      );
    }
  }

  const call = async (sent: ChatMessage[]): Promise<AiCompletion> => {
    let completion: AiCompletion;
    attempts += 1;
    try {
      completion = await opts.gateway.complete({
        ...(def.provider === undefined ? {} : { provider: def.provider }),
        ...(apiKey === undefined ? {} : { apiKey }),
        model: def.model,
        ...(def.fallbackModel === undefined ? {} : { fallbackModel: def.fallbackModel }),
        messages: sent,
        temperature: def.temperature,
        ...(def.maxOutputTokens === undefined ? {} : { maxOutputTokens: def.maxOutputTokens }),
        responseFormat,
        ...(opts.signal === undefined ? {} : { signal: opts.signal }),
        trace: { agent: def.name, promptVersion: def.promptVersion },
      });
    } catch (cause) {
      if (cause instanceof AiGatewayError) {
        throw new AgentRunError(
          codeFor(cause),
          'gateway',
          record(null, false, agentInput, codeFor(cause)),
          {
            cause,
            ...(cause.opts.retryAfterS === undefined
              ? {}
              : { retryAfterS: cause.opts.retryAfterS }),
          },
        );
      }
      throw new AgentRunError(
        'provider_unavailable',
        'gateway',
        record(null, false, agentInput, 'provider_unavailable'),
        { cause },
      );
    }
    model = completion.model;
    totals.tokensIn = sum(totals.tokensIn, completion.tokensIn);
    totals.tokensOut = sum(totals.tokensOut, completion.tokensOut);
    totals.costUsd = sum(totals.costUsd, completion.costUsd);
    return completion;
  };

  const first = await call(messages);
  const firstCheck = validate(first.text, def.outputSchema);
  if (firstCheck.ok) {
    return { output: firstCheck.output, run: record(firstCheck.output, true, agentInput) };
  }
  if (firstCheck.outOfScope) {
    throw new AgentRunError(
      'validation_failed',
      'out_of_scope',
      record(null, false, agentInput, 'validation_failed'),
    );
  }
  if (opts.signal?.aborted === true) {
    throw new AgentRunError(
      'provider_unavailable',
      'aborted',
      record(null, false, agentInput, 'provider_unavailable'),
    );
  }

  // Un seul nouvel essai. Il n'y a volontairement aucune boucle : un troisième appel est impossible.
  retried = true;
  const second = await call(retryMessages(messages, first.text, firstCheck.problem));
  const secondCheck = validate(second.text, def.outputSchema);
  if (secondCheck.ok) {
    return { output: secondCheck.output, run: record(secondCheck.output, true, agentInput) };
  }
  throw new AgentRunError(
    secondCheck.outOfScope ? 'validation_failed' : 'provider_unavailable',
    secondCheck.outOfScope ? 'out_of_scope' : 'invalid_output',
    record(
      null,
      false,
      agentInput,
      secondCheck.outOfScope ? 'validation_failed' : 'provider_unavailable',
    ),
  );
}

function sum(total: number | null, add: number | null): number | null {
  if (add === null) return total;
  return (total ?? 0) + add;
}

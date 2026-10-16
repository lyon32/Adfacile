// Fausse passerelle IA (TESTING §6.1) : aucune dépense, aucun réseau. Les réponses sont soit
// programmées appel après appel (`enqueue`), soit tirées d'une fixture par agent. Active en
// développement avec `PUBEKA_FAKE_PROVIDERS=ai` ou `all`. L'affichage progressif (flux) arrive avec
// S15, premier agent qui en a besoin.
import type {
  AgentName,
  AiCompletion,
  AiCompletionRequest,
  AiGateway,
  AiGatewayErrorKind,
} from './types';
import { AiGatewayError, messageLength } from './types';

export type FakeReply =
  /** Réponse valide : l'objet est sérialisé en JSON. */
  | { json: unknown }
  /** Texte brut tel quel (JSON cassé, bavardage, bloc Markdown…) pour tester le nouvel essai. */
  | { text: string }
  /** Panne de la passerelle. */
  | { fail: AiGatewayErrorKind };

export interface FakeAiGatewayOptions {
  /** Sortie d'agent par défaut, servie quand aucune réponse programmée n'est en attente. */
  fixtures?: Partial<Record<AgentName, unknown>>;
  /**
   * Sortie d'agent calculée depuis la requête (ex. des dates relatives à « aujourd'hui »), servie quand aucune réponse
   * n'est programmée. Prioritaire sur `fixtures` pour le même agent.
   */
  dynamicFixtures?: Partial<Record<AgentName, (request: AiCompletionRequest) => unknown>>;
  /** Coût simulé par appel, en dollars. */
  costUsdPerCall?: number;
}

/** Estimation grossière : 4 caractères par jeton, suffisante pour remplir le journal des tests. */
function estimateTokens(characters: number): number {
  return Math.max(1, Math.ceil(characters / 4));
}

export class FakeAiGateway implements AiGateway {
  /** Toutes les requêtes reçues, dans l'ordre : les tests y lisent le nombre d'appels. */
  readonly calls: AiCompletionRequest[] = [];
  private readonly queue: FakeReply[] = [];

  constructor(private readonly options: FakeAiGatewayOptions = {}) {}

  /** Programme les prochaines réponses, consommées une par appel. */
  enqueue(...replies: FakeReply[]): this {
    this.queue.push(...replies);
    return this;
  }

  /** Nombre de réponses programmées qui n'ont pas encore été servies. */
  get pending(): number {
    return this.queue.length;
  }

  complete(request: AiCompletionRequest): Promise<AiCompletion> {
    this.calls.push(request);
    try {
      return Promise.resolve(this.reply(request));
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private reply(request: AiCompletionRequest): AiCompletion {
    const scripted = this.queue.shift();
    const reply = scripted ?? this.fixtureFor(request);
    if ('fail' in reply) {
      throw new AiGatewayError(reply.fail, `FakeAiGateway : panne simulée (${reply.fail})`);
    }
    const text = 'json' in reply ? JSON.stringify(reply.json) : reply.text;
    const promptChars = request.messages.reduce((n, m) => n + messageLength(m), 0);
    return {
      text,
      model: request.model,
      tokensIn: estimateTokens(promptChars),
      tokensOut: estimateTokens(text.length),
      costUsd: this.options.costUsdPerCall ?? 0,
      finishReason: 'stop',
    };
  }

  private fixtureFor(request: AiCompletionRequest): FakeReply {
    const agent = request.trace?.agent;
    const dynamic = agent === undefined ? undefined : this.options.dynamicFixtures?.[agent];
    if (dynamic !== undefined) return { json: dynamic(request) };
    const fixtures = this.options.fixtures;
    if (agent !== undefined && fixtures !== undefined && agent in fixtures) {
      return { json: fixtures[agent] };
    }
    throw new AiGatewayError(
      'unavailable',
      'FakeAiGateway : aucune réponse programmée ni fixture pour cet appel',
    );
  }
}

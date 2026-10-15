// Choix de la passerelle selon l'environnement (ENV_SETUP §1.1 et §1.6) : la fausse implémentation
// quand `PUBEKA_FAKE_PROVIDERS` contient `ai` (ou vaut `all`), sinon OpenRouter.
import { AppError } from '@pubeka/contracts';
import type { Env } from '@pubeka/shared';
import { FakeAiGateway, type FakeAiGatewayOptions } from './fake-ai-gateway';
import { OpenRouterGateway } from './openrouter-gateway';
import type { AiGateway } from './types';

export type AiGatewayEnv = Pick<
  Env,
  'PUBEKA_FAKE_PROVIDERS' | 'OPENROUTER_API_KEY' | 'OPENROUTER_DATA_COLLECTION'
>;

export function usesFakeAi(env: Pick<Env, 'PUBEKA_FAKE_PROVIDERS'>): boolean {
  const list = env.PUBEKA_FAKE_PROVIDERS;
  if (list === undefined) return false;
  return list === 'all' || list.split(',').some((p) => p.trim() === 'ai');
}

export function createAiGateway(env: AiGatewayEnv, fake: FakeAiGatewayOptions = {}): AiGateway {
  if (usesFakeAi(env)) return new FakeAiGateway(fake);
  if (env.OPENROUTER_API_KEY === undefined) {
    throw new AppError('provider_unavailable', {
      cause: new Error('OPENROUTER_API_KEY absente'),
    });
  }
  return new OpenRouterGateway({
    apiKey: env.OPENROUTER_API_KEY,
    ...(env.OPENROUTER_DATA_COLLECTION === undefined
      ? {}
      : { dataCollection: env.OPENROUTER_DATA_COLLECTION }),
  });
}

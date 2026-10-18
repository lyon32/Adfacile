import { ExchangeRateApiSource, refreshExchangeRates, type RefreshReport } from '@pubeka/core';
import { createServiceClient } from '@pubeka/db';
import { parseFxRefreshEnv } from '@pubeka/shared';
import { z } from 'zod';
import type { JobHandlerDefinition } from '../dispatcher';

// Tâche `fx.refresh` (S15b) : rafraîchit les taux de change des monnaies des pays actifs. Planifiée (toutes les 6 heures),
// mais le fournisseur (ExchangeRate-API, accès ouvert) ne publie qu'UNE fois par jour : le cas d'usage ne l'appelle que si
// la prochaine mise à jour annoncée est passée. Idempotente (un taux n'est écrit qu'une fois par publication) et jamais
// relancée d'elle-même : une erreur est journalisée, on attend la prochaine exécution. Aucune clé d'API.
export const FX_REFRESH_TASK = 'fx.refresh';

export const fxRefreshPayloadSchema = z.strictObject({});
export type FxRefreshPayload = z.infer<typeof fxRefreshPayloadSchema>;

export const fxRefreshHandler: JobHandlerDefinition<FxRefreshPayload, RefreshReport> = {
  id: FX_REFRESH_TASK,
  payloadSchema: fxRefreshPayloadSchema,
  run: async (_payload, ctx) => {
    // Sous-ensemble minimal (shared/job-env.ts) : seulement l'adresse et la clé secrète de Supabase.
    const env = parseFxRefreshEnv();
    const svc = createServiceClient({
      url: env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
      secretKey: env.SUPABASE_SECRET_KEY,
    });
    return refreshExchangeRates({ svc, source: new ExchangeRateApiSource(), now: ctx.now });
  },
};

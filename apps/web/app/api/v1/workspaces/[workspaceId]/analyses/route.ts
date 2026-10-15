// POST /api/v1/workspaces/{workspaceId}/analyses : lance l'Analyste (202). Action qui dépense (appel IA) :
// `Idempotency-Key` obligatoire, limite « ai » par espace (20 par heure), propriétaire ou éditeur.
import { startAnalysis } from '@pubeka/core';
import { api } from '../../../../../../server/http/routes';
import { analysisRequestSchema } from '../../../analysis/schemas';
import { startAnalysisOptions } from '../../../analysis/services';

export const POST = api(
  {
    auth: 'member',
    roles: ['owner', 'editor'],
    writable: true,
    rateLimit: 'ai',
    idempotent: true,
    body: analysisRequestSchema,
  },
  async (ctx, { body }) => ({
    status: 202,
    body: await startAnalysis(ctx, body, startAnalysisOptions()),
  }),
);

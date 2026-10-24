// GET /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/stats : onglet « Résultats » (APPFLOW §11.3, TR-PLA-06). Lecture seule,
// tout membre. Les chiffres viennent de notre base (copiés de Meta toutes les heures) ; montants en dollars, et en monnaie locale
// seulement avec un taux de moins de 48 h (aucune TVA, le taux lui-même n'est jamais publié).
import { getCampaignStats } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { campaignIdParam } from '../../../../../campaigns/params';
import { statsQuery } from '../../../../../campaigns/schemas';

export const GET = api(
  { auth: 'member', rateLimit: 'read', query: statsQuery },
  async (ctx, { params, query }) => ({
    status: 200,
    body: await getCampaignStats(ctx, campaignIdParam(params), query),
  }),
);

// POST /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/stats/refresh : bouton « Actualiser » (TR-PLA-06). Tout membre : la
// copie est en LECTURE seule chez Meta (aucune dépense), d'où pas d'`Idempotency-Key` ; la limite d'une fois toutes les 5 minutes par
// campagne est appliquée par la base. La copie se fait en arrière-plan, l'écran se met à jour tout seul.
import { requestStatsRefresh } from '@pubeka/core';
import { api } from '../../../../../../../../../server/http/routes';
import { campaignIdParam } from '../../../../../../campaigns/params';
import { syncJobs } from '../../../../../../campaigns/services';

export const POST = api({ auth: 'member', rateLimit: 'write' }, async (ctx, { params }) => ({
  status: 202,
  body: await requestStatsRefresh(ctx, campaignIdParam(params), syncJobs()),
}));

// GET /api/v1/workspaces/{workspaceId}/overview : tableau de bord `/` et bandeau du haut (APPFLOW §7, PRD §10.1). Lecture seule,
// tout membre : compteurs, dépensé ce mois, graphique des résultats, tableau des campagnes.
import { getOverview, parseOverviewRange } from '@pubeka/core';
import { api } from '../../../../../../server/http/routes';
import { overviewQuery } from '../../../campaigns/schemas';

export const GET = api(
  { auth: 'member', rateLimit: 'read', query: overviewQuery },
  async (ctx, { query }) => ({
    status: 200,
    body: await getOverview(ctx, parseOverviewRange(query.range)),
  }),
);

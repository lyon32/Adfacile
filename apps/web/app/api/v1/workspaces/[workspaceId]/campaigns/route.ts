// GET : liste des campagnes de l'espace (tout membre), filtrée par statut ou par Page, avec curseur.
// POST /api/v1/workspaces/{workspaceId}/campaigns : crée un brouillon à partir d'une analyse prête (201).
// Aucune dépense (pas d'appel IA) : pas d'Idempotency-Key. Propriétaire ou éditeur, espace modifiable.
import { createDraft, listCampaigns } from '@pubeka/core';
import { api } from '../../../../../../server/http/routes';
import { createCampaignSchema, listCampaignsQuery } from '../../../campaigns/schemas';
import { cursorCodec } from '../../../campaigns/services';

export const POST = api(
  {
    auth: 'member',
    roles: ['owner', 'editor'],
    writable: true,
    rateLimit: 'write',
    body: createCampaignSchema,
  },
  async (ctx, { body }) => {
    const campaign = await createDraft(ctx, body);
    return {
      status: 201,
      body: campaign,
      location: `/api/v1/workspaces/${ctx.workspace.id}/campaigns/${campaign.id}`,
    };
  },
);

export const GET = api(
  { auth: 'member', rateLimit: 'read', query: listCampaignsQuery },
  async (ctx, { query }) => ({
    status: 200,
    body: await listCampaigns(
      ctx,
      { status: query.status, pageId: query.page_id, limit: query.limit, cursor: query.cursor },
      cursorCodec(),
    ),
  }),
);

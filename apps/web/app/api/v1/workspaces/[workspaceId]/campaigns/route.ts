// POST /api/v1/workspaces/{workspaceId}/campaigns : crée un brouillon à partir d'une analyse prête (201).
// Aucune dépense (pas d'appel IA) : pas d'Idempotency-Key. Propriétaire ou éditeur, espace modifiable.
import { createDraft } from '@pubeka/core';
import { api } from '../../../../../../server/http/routes';
import { createCampaignSchema } from '../../../campaigns/schemas';

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

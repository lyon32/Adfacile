// POST /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/publish : publie la campagne chez Meta (202).
// Action qui engage de l'argent chez Meta et un quota : `Idempotency-Key` obligatoire (UUID), propriétaire ou éditeur, espace
// modifiable. La route ne parle jamais à Meta : elle valide tout, retient le quota, passe la campagne en « publication » et lance
// la tâche `campaign.publish` (voir core/campaigns/publish). Le budget, les dates et les textes sont relus en base.
import { publishCampaign } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { campaignIdParam, idempotencyKeyOf } from '../../../../../campaigns/params';
import { publishSchema } from '../../../../../campaigns/schemas';
import { publishDeps } from '../../../../../campaigns/services';

export const POST = api(
  {
    auth: 'member',
    roles: ['owner', 'editor'],
    writable: true,
    rateLimit: 'write',
    idempotent: true,
    body: publishSchema,
  },
  async (ctx, { params, headers, body }) => ({
    status: 202,
    body: await publishCampaign(
      ctx,
      campaignIdParam(params),
      {
        idempotencyKey: idempotencyKeyOf(headers),
        acceptLiability: body.accept_liability,
        confirmedTotal:
          body.confirmed_total === undefined
            ? undefined
            : {
                amountMinor: body.confirmed_total.amount_minor,
                currency: body.confirmed_total.currency,
              },
      },
      publishDeps(),
    ),
  }),
);

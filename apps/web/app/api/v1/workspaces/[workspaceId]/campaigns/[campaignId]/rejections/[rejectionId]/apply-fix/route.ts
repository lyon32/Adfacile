// POST /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/rejections/{rejectionId}/apply-fix : « Appliquer la correction et
// republier » (202). Propriétaire ou éditeur, espace modifiable, `Idempotency-Key` obligatoire (UUID). Republie la MÊME campagne
// sans décompter de quota (EC-CAMP-07) par le chemin de la publication : la route ne parle jamais à Meta, elle lance la tâche
// `campaign.publish`, et elle est bloquée tant que la publication réelle n'est pas activée (PUBEKA_META_PUBLISH).
import { applyRejectionFix } from '@pubeka/core';
import { api } from '../../../../../../../../../../server/http/routes';
import {
  campaignIdParam,
  idempotencyKeyOf,
  rejectionIdParam,
} from '../../../../../../../campaigns/params';
import { publishDeps } from '../../../../../../../campaigns/services';

export const POST = api(
  {
    auth: 'member',
    roles: ['owner', 'editor'],
    writable: true,
    rateLimit: 'write',
    idempotent: true,
  },
  async (ctx, { params, headers }) => ({
    status: 202,
    body: await applyRejectionFix(
      ctx,
      campaignIdParam(params),
      rejectionIdParam(params),
      { idempotencyKey: idempotencyKeyOf(headers) },
      publishDeps(),
    ),
  }),
);

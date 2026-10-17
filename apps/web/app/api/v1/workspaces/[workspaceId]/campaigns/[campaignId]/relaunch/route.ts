// POST /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/relaunch : deux usages choisis par `mode`.
//  - `recover` : une campagne ARRÊTÉE (paiement Meta refusé) repart, APRÈS que le client a réglé sa facture ou rechargé ses fonds
//    chez Meta (200). Action du client, jamais une détection automatique. Si Meta refuse, son message traduit remonte.
//  - `copy` : un nouveau brouillon copié de la campagne (PRD F9, 201), compté comme une nouvelle campagne à sa publication.
import { relaunchCampaign } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { campaignIdParam } from '../../../../../campaigns/params';
import { relaunchSchema } from '../../../../../campaigns/schemas';
import { controlDeps } from '../../../../../campaigns/services';

export const POST = api(
  {
    auth: 'member',
    roles: ['owner', 'editor'],
    writable: true,
    rateLimit: 'write',
    body: relaunchSchema,
  },
  async (ctx, { params, body }) => ({
    status: body.mode === 'copy' ? 201 : 200,
    body: await relaunchCampaign(ctx, campaignIdParam(params), body, controlDeps()),
  }),
);

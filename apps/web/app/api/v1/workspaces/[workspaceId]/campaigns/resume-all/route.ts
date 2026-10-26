// POST /api/v1/workspaces/{workspaceId}/campaigns/resume-all : reprend les publicités mises en pause par le verrouillage (S19b), après le
// renouvellement. Propriétaire ou éditeur, espace ACTIF (`writable`). Reprendre ACTIVE chez Meta (dépense) : `Idempotency-Key` obligatoire
// et interrupteur `PUBEKA_META_PUBLISH` vérifié avant tout appel. Ne reprend que les campagnes au motif `billing_lock`.
import { resumeLockedCampaigns } from '@pubeka/core';
import { api } from '../../../../../../../server/http/routes';
import { emptyBodySchema } from '../../../../campaigns/schemas';
import { controlDeps } from '../../../../campaigns/services';

/**
 * Délai maximal (secondes ; la plateforme coupe au-delà). Un lot est de 10 campagnes au plus (`ACTION_BATCH`) ; chacune coûte quelques appels
 * à Meta (ordre, relecture), de l'ordre de la seconde : 120 s laissent une large marge, comme la génération des propositions. Au-delà de 10
 * campagnes, la réponse dit `more: true` et le client clique encore (rejouable : ce qui est fait n'est jamais refait).
 */
export const maxDuration = 120;

export const POST = api(
  {
    auth: 'member',
    roles: ['owner', 'editor'],
    writable: true,
    rateLimit: 'write',
    idempotent: true,
    body: emptyBodySchema,
  },
  async (ctx) => ({ status: 200, body: await resumeLockedCampaigns(ctx, controlDeps()) }),
);

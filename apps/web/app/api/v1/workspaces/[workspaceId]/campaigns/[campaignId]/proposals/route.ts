// GET  /api/v1/workspaces/{workspaceId}/campaigns/{campaignId}/proposals : propositions terminées (tout membre).
// POST : génère UNE proposition (Stratège). Action qui dépense un appel IA : `Idempotency-Key` obligatoire, limite « ai »
// (20 par heure et par espace), propriétaire ou éditeur. L'idempotence est tenue par la ligne réservée en base
// (`startProposal`), pas par `api()` : une réponse en flux ne peut pas être rejouée.
//
// Avec `Accept: text/event-stream` : flux `field` (champ terminé, aperçu NON contractuel) → `done` (proposition validée et
// enregistrée) ou `error` (Problem Details), `retry` si le Stratège doit réécrire. Toute erreur détectée AVANT la
// réservation (404, 403, 400, 409, échec rejoué…) est une réponse HTTP normale, sans flux.
// Si le client coupe, la génération se termine et s'enregistre : la même clé la retrouve (reprise).
import { generateProposal, listProposals, startProposal } from '@pubeka/core';
import { api } from '../../../../../../../../server/http/routes';
import { sseStream } from '../../../../../../../../server/http/sse';
import { campaignIdParam, idempotencyKeyOf } from '../../../../../campaigns/params';
import { proposalDeps } from '../../../../../campaigns/services';

/** Délai maximal d'une génération en flux (secondes) ; la plateforme coupe au-delà. */
export const maxDuration = 120;
const STREAM_DEADLINE_MS = 100_000;

export const GET = api({ auth: 'member', rateLimit: 'read' }, async (ctx, { params }) => ({
  status: 200,
  body: { data: await listProposals(ctx, campaignIdParam(params)) },
}));

export const POST = api(
  { auth: 'member', roles: ['owner', 'editor'], writable: true, rateLimit: 'ai', stream: true },
  async (ctx, { params, headers, wantsStream }) => {
    const campaignId = campaignIdParam(params);
    const options = { idempotencyKey: idempotencyKeyOf(headers) };
    if (!wantsStream) {
      return {
        status: 201,
        body: await generateProposal(ctx, campaignId, options, proposalDeps()),
      };
    }
    const started = await startProposal(ctx, campaignId, options, proposalDeps());
    const path = `/api/v1/workspaces/${ctx.workspace.id}/campaigns/${campaignId}/proposals`;
    return {
      stream: sseStream(
        async (sender) => {
          if (started.kind === 'replay') {
            sender.send('done', started.proposal);
            return;
          }
          const proposal = await started.run({
            signal: AbortSignal.timeout(STREAM_DEADLINE_MS),
            onField: (event) => {
              sender.send('field', event);
            },
            onRetry: () => {
              sender.send('retry', {});
            },
          });
          sender.send('done', proposal);
        },
        { path, requestId: ctx.requestId },
      ),
    };
  },
);

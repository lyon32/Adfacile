// /api/v1/webhooks/meta (API_SPEC §12, SECURITY_NOTES §3.4, TR-SEC-04).
// GET  : abonnement de Meta (`hub.verify_token` en temps constant, puis `hub.challenge`).
// POST : événements de statut des publicités ; la signature `X-Hub-Signature-256` est vérifiée sur
//        le corps BRUT avant toute lecture du JSON ; un événement déjà vu → 200 sans rien refaire.
import { AppError } from '@pubeka/contracts';
import { recordMetaStatusEvents } from '@pubeka/core';
import { createLogger, createRequestId, getEnv } from '@pubeka/shared';
import { api } from '../../../../../server/http/routes';
import { fieldError, problem } from '../../../../../server/http/problem';
import { syncJobs } from '../../campaigns/services';
import { extractStatusEvents, MetaWebhookSchema } from './events';
import { verifyMetaSignature, verifyTokenMatches, webhookEventId } from './signature';

const logger = createLogger({ base: { module: 'webhook-meta' } });
const CHALLENGE = /^[0-9]{1,20}$/;

/** GET : réponse en texte brut (Meta attend la valeur du défi seule). */
export const GET = (req: Request): Response => {
  const requestId = createRequestId();
  const path = new URL(req.url).pathname;
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const headers = { 'x-request-id': requestId, 'x-content-type-options': 'nosniff' };
  if (mode === null || token === null || challenge === null) {
    return problem(
      fieldError(
        'hub.mode',
        'required',
        'hub.mode, hub.verify_token et hub.challenge sont attendus',
      ),
      {
        path,
        requestId,
        headers,
      },
    );
  }
  // Jeton faux, jeton non configuré ou mode inattendu : 403, jamais le défi.
  if (mode !== 'subscribe' || !verifyTokenMatches(token, getEnv().META_WEBHOOK_VERIFY_TOKEN)) {
    return problem(new AppError('forbidden'), { path, requestId, headers });
  }
  // Un défi est un entier (documentation de Meta) : rien d'autre n'est renvoyé au demandeur.
  if (!CHALLENGE.test(challenge)) {
    return problem(fieldError('hub.challenge', 'invalid_format', 'Entier attendu'), {
      path,
      requestId,
      headers,
    });
  }
  return new Response(challenge, {
    status: 200,
    headers: {
      ...headers,
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
};

export const POST = api(
  { auth: 'webhook', provider: 'meta', rateLimit: 'none' },
  async (ctx, { rawBody, headers }) => {
    // 1. Signature, sur le corps brut, avant de lire quoi que ce soit.
    const signature = headers.get('x-hub-signature-256');
    if (!verifyMetaSignature(rawBody, signature, getEnv().META_APP_SECRET)) {
      throw new AppError('webhook_signature_invalid');
    }
    // 2. Forme : un corps signé mais inconnu est journalisé et ignoré (200).
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      logger.warn('Webhook Meta : corps non JSON ignoré', { requestId: ctx.requestId });
      return { status: 200, body: { status: 'ignored' } };
    }
    const parsed = MetaWebhookSchema.safeParse(json);
    if (!parsed.success) {
      logger.warn('Webhook Meta : forme inconnue ignorée', { requestId: ctx.requestId });
      return { status: 200, body: { status: 'ignored' } };
    }
    // 3. Pas de contrôle d'heure : Meta relivre un événement échoué pendant 36 h (documentation de
    //    Meta) ; la protection contre le rejeu est l'empreinte du corps, enregistrée une seule fois.
    // 4. Doublon et enregistrement dans la même transaction : une écriture qui échoue lève une
    //    erreur (5xx) et Meta réessaie.
    const { events, ignored } = extractStatusEvents(parsed.data);
    const outcome = await recordMetaStatusEvents(ctx, webhookEventId(rawBody), events);
    if (outcome.duplicate) return { status: 200, body: { status: 'duplicate' } };
    if (ignored > 0 || outcome.unknown > 0) {
      // EC-META-09 : objet ou champ inconnu de nous, journalisé et ignoré.
      logger.info('Webhook Meta : éléments ignorés', {
        requestId: ctx.requestId,
        ignored,
        unknown: outcome.unknown,
      });
    }
    // S17 : le signal est enregistré ; on lance la relecture du statut chez Meta (le webhook n'est qu'un signal, TR-PLA-05). Un échec
    // de lancement ne fait jamais échouer le webhook (déjà marqué « vu ») : la vérification toutes les 15 minutes rattrape.
    if (outcome.recorded > 0) {
      const eventId = webhookEventId(rawBody);
      try {
        await syncJobs().enqueue(
          'campaign.sync-status',
          { scope: 'webhook' },
          `campaign.sync-status:${eventId}`,
        );
      } catch (error) {
        logger.warn('Webhook Meta : relecture non lancée, la vérification planifiée rattrape', {
          requestId: ctx.requestId,
          err: error,
        });
      }
    }
    return { status: 200, body: { status: 'processed', recorded: outcome.recorded } };
  },
);

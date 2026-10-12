// Webhooks déjà traités (0003, E3).
// `true` = nouvel événement à traiter ; `false` = rejeu : répondre 200 sans rien refaire.
import type { ServiceClient } from './client';
import { unwrap } from './errors';

export async function recordWebhookEvent(
  svc: ServiceClient,
  provider: string,
  eventId: string,
): Promise<boolean> {
  return unwrap(
    await svc.rpc('record_webhook_event', { p_provider: provider, p_event_id: eventId }),
  );
}

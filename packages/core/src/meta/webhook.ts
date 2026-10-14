// Événements de statut envoyés par Meta (EC-META-08, EC-META-09). Meta fait foi pour le statut,
// le budget et les dates : un webhook n'est qu'un signal. On l'enregistre dans le journal des
// statuts de la campagne concernée (source « webhook ») ; la synchronisation (S17) relit chez Meta
// et décide. Un objet inconnu de Pubeka est ignoré (200).
//
// Le marqueur « déjà vu » et l'écriture dans le journal se font dans la MÊME transaction
// (migration 0007) : si l'écriture échoue, rien n'est marqué, l'erreur remonte (5xx) et la
// relivraison de Meta, qui dure jusqu'à 36 h, est traitée normalement.
import { unwrap, type Json } from '@pubeka/db';
import type { ServiceCtx } from '../context';

export interface MetaStatusEvent {
  kind: 'in_process' | 'with_issues';
  adAccountId: string;
  /** Identifiant chez Meta de la campagne, de l'ensemble ou de la publicité concernée. */
  objectId: string;
  level: string | null;
  detail: Record<string, string | null>;
}

export interface WebhookOutcome {
  duplicate: boolean;
  recorded: number;
  unknown: number;
}

/**
 * Enregistre les événements d'une notification déjà authentifiée (signature vérifiée par l'appelant).
 * `eventId` : empreinte du corps ; un événement déjà vu ne refait rien (SECURITY_NOTES §3.4 règle 3).
 */
export async function recordMetaStatusEvents(
  ctx: ServiceCtx,
  eventId: string,
  events: readonly MetaStatusEvent[],
): Promise<WebhookOutcome> {
  const payload: Json = events.map((event) => ({
    kind: event.kind,
    object_id: event.objectId,
    payload: { level: event.level, ...event.detail },
  }));
  const recorded = unwrap(
    await ctx.svc.rpc('record_meta_webhook', { p_event_id: eventId, p_events: payload }),
  );
  if (recorded < 0) return { duplicate: true, recorded: 0, unknown: 0 };
  return { duplicate: false, recorded, unknown: events.length - recorded };
}

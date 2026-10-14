// Événements Meta lus par Pubeka : statut des publicités du compte publicitaire (objet
// `ad_account`, champs `in_process_ad_objects` et `with_issues_ad_objects`). Documentation :
// https://developers.facebook.com/docs/graph-api/webhooks/reference/ad_account
// Tout le reste est ignoré (200), jamais traité « au mieux » (SECURITY_NOTES §3.4 règle 4).
import type { MetaStatusEvent } from '@pubeka/core';
import { z } from 'zod';

const Id = z.union([z.string(), z.number()]).transform(String);

const Change = z.looseObject({ field: z.string(), value: z.unknown() });
const Entry = z.looseObject({
  id: Id,
  changes: z.array(Change).max(1000).optional(),
});
export const MetaWebhookSchema = z.looseObject({
  object: z.string(),
  entry: z.array(Entry).max(1000),
});
export type MetaWebhookPayload = z.infer<typeof MetaWebhookSchema>;

const InProcess = z.looseObject({
  id: Id,
  level: z.string().optional(),
  status_name: z.string().max(100).optional(),
});
const WithIssues = z.looseObject({
  id: Id,
  level: z.string().optional(),
  error_code: z.union([z.string(), z.number()]).transform(String).optional(),
  error_summary: z.string().max(500).optional(),
});

/** Événements de statut reconnus ; les autres champs et les valeurs mal formées sont comptés comme ignorés. */
export function extractStatusEvents(payload: MetaWebhookPayload): {
  events: MetaStatusEvent[];
  ignored: number;
} {
  const events: MetaStatusEvent[] = [];
  let ignored = 0;
  if (payload.object !== 'ad_account') return { events, ignored: payload.entry.length };
  for (const entry of payload.entry) {
    for (const change of entry.changes ?? []) {
      if (change.field === 'in_process_ad_objects') {
        const value = InProcess.safeParse(change.value);
        if (!value.success) {
          ignored += 1;
          continue;
        }
        events.push({
          kind: 'in_process',
          adAccountId: entry.id,
          objectId: value.data.id,
          level: value.data.level ?? null,
          detail: { status_name: value.data.status_name ?? null },
        });
      } else if (change.field === 'with_issues_ad_objects') {
        const value = WithIssues.safeParse(change.value);
        if (!value.success) {
          ignored += 1;
          continue;
        }
        events.push({
          kind: 'with_issues',
          adAccountId: entry.id,
          objectId: value.data.id,
          level: value.data.level ?? null,
          detail: {
            error_code: value.data.error_code ?? null,
            error_summary: value.data.error_summary ?? null,
          },
        });
      } else {
        ignored += 1;
      }
    }
  }
  return { events, ignored };
}

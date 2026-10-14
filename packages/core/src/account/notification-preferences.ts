// Préférences de notification par type (GET et PUT /notifications/preferences, APPFLOW §16 :
// cloche et e-mail par type). Lecture et écriture par le client soumis à la RLS, filtrées par
// l'identifiant de l'utilisateur (SECURITY_NOTES §2).
import { unwrap } from '@pubeka/db';
import type { Ctx } from '../context';

/** Les 12 types de notification de l'application (APPFLOW §16). */
export const NOTIFICATION_TYPES = [
  'generation_ready',
  'campaign_approved',
  'campaign_rejected',
  'meta_payment_failed',
  'budget_exhausted',
  'campaign_ended',
  'quota_almost_reached',
  'subscription_ending',
  'meta_token_renewal',
  'support_reply',
  'weekly_summary',
  'optimizer_suggestion',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationPreference {
  type: NotificationType;
  in_app: boolean;
  email: boolean;
}

/** Un type jamais réglé est activé partout. */
export async function getNotificationPreferences(ctx: Ctx): Promise<NotificationPreference[]> {
  const rows = unwrap(
    await ctx.db
      .from('notification_preferences')
      .select('type, in_app, email')
      .eq('profile_id', ctx.user.id),
  );
  const saved = new Map(rows.map((row) => [row.type, row]));
  return NOTIFICATION_TYPES.map((type) => {
    const row = saved.get(type);
    return { type, in_app: row?.in_app ?? true, email: row?.email ?? true };
  });
}

/** Enregistre les types reçus ; les autres gardent leur valeur. Types déjà validés par la route. */
export async function putNotificationPreferences(
  ctx: Ctx,
  preferences: readonly NotificationPreference[],
): Promise<void> {
  if (preferences.length === 0) return;
  unwrap(
    await ctx.db.from('notification_preferences').upsert(
      preferences.map((p) => ({
        profile_id: ctx.user.id,
        type: p.type,
        in_app: p.in_app,
        email: p.email,
      })),
      { onConflict: 'profile_id,type' },
    ),
  );
}

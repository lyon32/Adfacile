'use client';
// Réglages > Notifications : cloche et e-mail pour chacun des 12 types (APPFLOW §14, §16).
import { Switch } from '@pubeka/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { z } from 'zod';
import { apiFetch } from '../../lib/api';

export const NOTIFICATION_TYPE_IDS = [
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

const PreferenceSchema = z.object({
  type: z.enum(NOTIFICATION_TYPE_IDS),
  in_app: z.boolean(),
  email: z.boolean(),
});
const ListSchema = z.object({ data: z.array(PreferenceSchema) });

export type Preference = z.infer<typeof PreferenceSchema>;
type Channel = 'in_app' | 'email';

const QUERY_KEY = ['notification-preferences'] as const;

export function toggled(list: readonly Preference[], type: Preference['type'], channel: Channel) {
  return list.map((p) => (p.type === type ? { ...p, [channel]: !p[channel] } : p));
}

export function NotificationsForm({ initial }: { initial: Preference[] }): ReactNode {
  const t = useTranslations('settings.notifications');
  const common = useTranslations('settings');
  const client = useQueryClient();
  const [failed, setFailed] = useState(false);

  // Premier affichage fourni par le serveur ; le cache prend ensuite le relais.
  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await apiFetch('/notifications/preferences', ListSchema)).data,
    initialData: initial,
  });

  const save = useMutation({
    mutationFn: (list: Preference[]) =>
      apiFetch('/notifications/preferences', z.undefined(), {
        method: 'PUT',
        body: { data: list },
      }),
    onMutate: (list) => {
      setFailed(false);
      const before = client.getQueryData<Preference[]>(QUERY_KEY);
      client.setQueryData(QUERY_KEY, list);
      return { before };
    },
    onError: (_error, _list, context) => {
      setFailed(true);
      client.setQueryData(QUERY_KEY, context?.before ?? initial);
    },
  });

  const channels: readonly { id: Channel; label: string }[] = [
    { id: 'in_app', label: t('in_app') },
    { id: 'email', label: t('email') },
  ];

  return (
    <div className="flex flex-col gap-3">
      <ul
        aria-label={t('group_label')}
        className="border-line bg-panel divide-line divide-y rounded-lg border"
      >
        <li
          aria-hidden="true"
          className="text-muted tracking-eyebrow hidden items-center justify-end gap-2 px-4 py-2 text-xs font-bold uppercase sm:flex"
        >
          {channels.map((channel) => (
            <span key={channel.id} className="w-12 text-center">
              {channel.label}
            </span>
          ))}
        </li>
        {data.map((preference) => (
          <li
            key={preference.type}
            className="flex flex-col gap-1 px-4 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="font-semibold">{t(`types.${preference.type}`)}</span>
            <span className="flex items-center gap-4 sm:gap-2">
              {channels.map((channel) => (
                <label key={channel.id} className="flex items-center gap-1 sm:gap-0">
                  <span className="text-meta text-muted sm:sr-only">{channel.label}</span>
                  <Switch
                    checked={preference[channel.id]}
                    aria-label={t('toggle', {
                      type: t(`types.${preference.type}`),
                      channel: channel.label,
                    })}
                    onCheckedChange={() => {
                      save.mutate(toggled(data, preference.type, channel.id));
                    }}
                  />
                </label>
              ))}
            </span>
          </li>
        ))}
      </ul>
      {failed ? (
        <p role="alert" className="text-meta text-error font-semibold">
          {common('save_failed')}
        </p>
      ) : null}
    </div>
  );
}

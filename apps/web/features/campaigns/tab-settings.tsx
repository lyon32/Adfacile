'use client';
// Onglet « Réglages » (APPFLOW §11.3) : ce qui a été publié (budget, dates, zone, textes), en lecture. La modification d'une campagne
// déjà publiée n'existe pas encore : pour changer quelque chose, « Dupliquer » repart de l'aperçu avec la même campagne copiée.
import { Card } from '@pubeka/ui';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { Campaign } from '../campaign-wizard/proposal-api';
import { moneyText, useUiLocale } from './money';

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames(locale, { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function SettingsTab({ campaign }: { campaign: Campaign }): ReactNode {
  const t = useTranslations('campaigns.settings');
  const format = useFormatter();
  const locale = useLocale();
  const ui = useUiLocale();
  const day = (iso: string): string =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });
  const daily = campaign.cost.daily ?? null;
  const countries = campaign.geo.countries ?? [];
  const cities = campaign.geo.cities ?? [];

  const rows: [string, ReactNode][] = [
    [t('budget'), daily === null ? t('unknown') : t('per_day', { amount: moneyText(daily, ui) })],
    [
      t('dates'),
      campaign.start_date && campaign.end_date
        ? t('from_to', { from: day(campaign.start_date), to: day(campaign.end_date) })
        : t('unknown'),
    ],
    [
      t('zone'),
      countries.length + cities.length === 0
        ? t('unknown')
        : [
            ...countries.map((code) => countryName(code, locale)),
            ...cities.map((city) => `${city.name} (${String(city.radius_km)} km)`),
          ].join(', '),
    ],
    [t('headline'), campaign.copy.headline ?? t('unknown')],
    [t('primary_text'), campaign.copy.primary_text ?? t('unknown')],
  ];

  return (
    <Card className="flex flex-col gap-4">
      <dl className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-meta text-muted">{label}</dt>
            <dd className="font-semibold break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-meta text-muted">{t('how_to_change')}</p>
    </Card>
  );
}

'use client';
// Graphique des résultats (APPFLOW §7.1) : barres hachées, la dernière période (aujourd'hui) en Lime. Les couleurs sont des jetons
// du design system. Le graphique est doublé d'un tableau lisible par un lecteur d'écran (TR-ACC) : l'information ne dépend ni de
// la couleur ni de la forme.
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export interface ChartPoint {
  date: string;
  value: number;
}

const HATCH = 'repeating-linear-gradient(135deg, var(--field-line) 0 2px, transparent 2px 6px)';

export function ResultsChart({
  points,
  label,
  valueLabel,
}: {
  points: readonly ChartPoint[];
  /** Légende courte du graphique (nom accessible). */
  label: string;
  /** Nom de la colonne des valeurs dans le tableau caché (« Résultats »). */
  valueLabel: string;
}): ReactNode {
  const t = useTranslations('campaigns.chart');
  const format = useFormatter();
  const max = Math.max(1, ...points.map((p) => p.value));
  const day = (iso: string): string =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  const last = points.length - 1;
  const total = points.reduce((sum, p) => sum + p.value, 0);

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="sr-only">{label}</figcaption>
      {total === 0 ? <p className="text-meta text-muted">{t('empty')}</p> : null}
      <div
        aria-hidden="true"
        className="border-line flex h-40 items-end gap-1 border-b sm:h-48 sm:gap-1.5"
      >
        {points.map((point, index) => (
          <div
            key={point.date}
            title={`${day(point.date)} : ${format.number(point.value)}`}
            className={
              index === last
                ? 'bg-accent min-h-1 flex-1 rounded-t-sm'
                : 'border-field-line min-h-1 flex-1 rounded-t-sm border border-b-0'
            }
            style={{
              height: `${String(Math.max(2, Math.round((point.value / max) * 100)))}%`,
              ...(index === last ? {} : { backgroundImage: HATCH }),
            }}
          />
        ))}
      </div>
      <div aria-hidden="true" className="text-meta text-muted flex justify-between tabular-nums">
        <span>{points[0] === undefined ? '' : day(points[0].date)}</span>
        <span>{points[last] === undefined ? '' : day(points[last].date)}</span>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{t('date')}</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{day(point.date)}</th>
              <td>{format.number(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

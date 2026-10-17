'use client';
// Carte de lecture d'une proposition (APPFLOW §8.3) : fiche à rangées « étiquette / valeur », avec la justification en petit
// sous chaque choix. Pendant l'écriture du Stratège, les rangées encore vides montrent un emplacement à la hauteur de leur
// contenu (pas de saut de page) et se remplissent une à une.
import { minorUnits } from '@pubeka/shared';
import { formatLocalMoney, formatUsdApprox, cn, type UiLocale } from '@pubeka/ui';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { Display } from './proposal-display';
import { typographic } from './typography';

function formatDay(day: string, locale: UiLocale): string {
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

function Row({
  label,
  pending,
  empty,
  children,
  reason,
}: {
  label: string;
  /** L'écriture est en cours : une rangée sans valeur est un emplacement, pas une absence. */
  pending: boolean;
  empty: boolean;
  children: ReactNode;
  reason?: string | null;
}): ReactNode {
  const t = useTranslations('campaign.wizard.proposal');
  const locale = useLocale();
  return (
    <div className="border-line grid gap-1 border-t py-3 first:border-t-0 sm:grid-cols-[8.5rem_1fr] sm:gap-4">
      <dt className="tracking-eyebrow text-muted pt-0.5 text-xs font-bold uppercase">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-1">
        {empty ? (
          pending ? (
            <span
              aria-hidden="true"
              className="bg-line h-5 w-2/3 rounded-sm motion-safe:animate-pulse"
            />
          ) : (
            <span className="text-muted">—</span>
          )
        ) : (
          <div className="min-w-0 break-words">{children}</div>
        )}
        {reason === undefined || reason === null || reason === '' ? null : (
          <p className="text-meta text-muted">
            <span className="font-semibold">{t('why')}</span> {typographic(reason, locale)}
          </p>
        )}
      </dd>
    </div>
  );
}

export function ProposalCard({
  display,
  pending,
}: {
  display: Display;
  pending: boolean;
}): ReactNode {
  const t = useTranslations('campaign.wizard.proposal');
  const locale = useLocale();
  const ui: UiLocale = locale === 'en' ? 'en' : 'fr';
  const d = display;
  const zoneEmpty = d.cities === null;

  return (
    <dl className="flex flex-col">
      <Row
        label={t('labels.objective')}
        pending={pending}
        empty={d.objective === null}
        reason={d.objectiveReason}
      >
        {d.objective === null ? null : (
          <span className="font-semibold">{t(`objectives.${d.objective}`)}</span>
        )}
      </Row>
      <Row label={t('labels.destination')} pending={pending} empty={d.destination === null}>
        {d.destination === null ? null : t(`destinations.${d.destination}`)}
      </Row>
      <Row label={t('labels.zone')} pending={pending} empty={zoneEmpty} reason={d.zoneReason}>
        {d.cities === null ? null : (
          <ul className="flex flex-col gap-0.5">
            {d.cities.length === 0
              ? d.countries.map((country) => <li key={country}>{country}</li>)
              : d.cities.map((city) => (
                  <li key={city.name}>
                    {city.name} ·{' '}
                    <span className="tabular-nums">{t('radius', { km: city.radiusKm })}</span>
                  </li>
                ))}
          </ul>
        )}
      </Row>
      <Row
        label={t('labels.budget')}
        pending={pending}
        empty={d.budgetUsdCents === null}
        reason={d.budgetReason}
      >
        {d.budgetUsdCents === null ? null : (
          <span className="tabular-nums">
            <span className="font-semibold">
              {t('per_day', {
                amount:
                  d.dailyMoney === null
                    ? formatUsdApprox(d.budgetUsdCents, ui)
                    : formatLocalMoney(
                        d.dailyMoney.local_minor,
                        d.dailyMoney.currency,
                        minorUnits(d.dailyMoney.currency),
                        ui,
                      ),
              })}
            </span>
            {d.dailyMoney === null ? null : (
              <span className="text-meta text-muted">
                {' '}
                · {formatUsdApprox(d.budgetUsdCents, ui)}
              </span>
            )}
          </span>
        )}
      </Row>
      <Row
        label={t('labels.dates')}
        pending={pending}
        empty={d.startDate === null || d.endDate === null}
        reason={d.scheduleReason}
      >
        {d.startDate === null || d.endDate === null
          ? null
          : t('date_range', { start: formatDay(d.startDate, ui), end: formatDay(d.endDate, ui) })}
      </Row>
      <Row label={t('labels.text')} pending={pending} empty={d.primaryText === null}>
        {d.primaryText === null ? null : (
          <p className="whitespace-pre-line">{typographic(d.primaryText, locale)}</p>
        )}
      </Row>
      <Row label={t('labels.headline')} pending={pending} empty={d.headline === null}>
        {d.headline === null ? null : (
          <span className="font-semibold">{typographic(d.headline, locale)}</span>
        )}
      </Row>
      {d.description === null || d.description === '' ? null : (
        <Row label={t('labels.description')} pending={false} empty={false}>
          {typographic(d.description, locale)}
        </Row>
      )}
      <Row label={t('labels.button')} pending={pending} empty={d.cta === null}>
        {d.cta === null ? null : (
          <span
            className={cn(
              'border-line inline-block rounded-md border px-3 py-1 text-sm font-semibold',
            )}
          >
            {t(`ctas.${d.cta}`)}
          </span>
        )}
      </Row>
    </dl>
  );
}

'use client';
// Un échec de publication, tel que l'écran « Publier » le montre (APPFLOW §8.6) : ce qui s'est passé en une phrase, ce que devient la
// campagne et le quota, et l'action proposée. Jamais de code technique, jamais de message brut de Meta : le titre et le message d'une
// erreur connue sont ceux que le serveur a déjà traduits.
import {
  Button,
  buttonVariants,
  Card,
  cn,
  formatLocalMoney,
  formatUsdApprox,
  type UiLocale,
} from '@pubeka/ui';
import { minorUnits } from '@pubeka/shared';
import { AlertTriangle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { PublishFailure, PublishFailureKind } from './publish-errors';
import { typographic } from './typography';

export interface FailurePanelProps {
  failure: PublishFailure;
  campaignId: string;
  busy: boolean;
  onGuide: () => void;
  onRetry: () => void;
  onConfirmTotal: (total: { amount_minor: number; currency: string }) => void;
  onBackToProposal: () => void;
  onSources: () => void;
}

type KeyedKind = Exclude<PublishFailureKind, 'liability' | 'meta_known' | 'unknown'>;

function formatDate(day: string, locale: UiLocale): string {
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(day));
}

const LINKS: Partial<Record<KeyedKind, string>> = {
  reconnect: '/reglages/comptes-meta',
  not_connected: '/reglages/comptes-meta',
  quota: '/abonnement',
  page_limit: '/abonnement',
  account_currency: '/reglages/comptes-meta',
  read_only: '/abonnement',
};

export function FailurePanel(props: FailurePanelProps): ReactNode {
  const { failure } = props;
  const t = useTranslations('campaign.wizard.publish.errors');
  const locale = useLocale();
  const ui: UiLocale = locale === 'en' ? 'en' : 'fr';

  const heading = (title: string, body: string | null): ReactNode => (
    <>
      <h2 className="text-title flex items-start gap-2 text-lg font-bold">
        <AlertTriangle aria-hidden="true" className="mt-1 size-5 shrink-0" />
        {typographic(title, locale)}
      </h2>
      {body === null ? null : <p className="text-muted">{typographic(body, locale)}</p>}
    </>
  );

  // Meta a répondu avec une erreur connue : sa traduction simple, quota non décompté.
  if (failure.kind === 'meta_known') {
    return (
      <Card role="alert" className="flex flex-col gap-3">
        {heading(
          failure.metaTitle ?? t('meta_known.title_fallback'),
          failure.metaMessage ?? t('meta_known.body_fallback'),
        )}
        <Button
          type="button"
          variant="quiet"
          className="self-start"
          disabled={props.busy}
          onClick={props.onRetry}
        >
          {t('meta_known.action')}
        </Button>
      </Card>
    );
  }
  // Erreur inconnue : message général et ticket proposé.
  if (failure.kind === 'unknown') {
    return (
      <Card role="alert" className="flex flex-col gap-3">
        {failure.uncertain === true
          ? heading(t('uncertain.title'), t('uncertain.body'))
          : heading(t('unknown.title'), t('unknown.body'))}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="quiet"
            className="w-full sm:w-auto"
            disabled={props.busy}
            onClick={props.onRetry}
          >
            {t('unknown.action')}
          </Button>
          <Link
            href="/support"
            className={cn(buttonVariants({ variant: 'quiet' }), 'w-full sm:w-auto')}
          >
            {t('unknown.support')}
          </Link>
        </div>
      </Card>
    );
  }
  if (failure.kind === 'liability') return null;

  const kind: KeyedKind = failure.kind;
  const total = failure.newTotal ?? null;
  const amount =
    total === null
      ? ''
      : `${formatLocalMoney(total.amount_minor, total.currency, minorUnits(total.currency), ui)} · ${formatUsdApprox(total.usd_cents, ui)}`;
  const body =
    kind === 'page_limit'
      ? failure.availableFrom === null || failure.availableFrom === undefined
        ? t('page_limit.body_nodate')
        : t('page_limit.body', { date: formatDate(failure.availableFrom, ui) })
      : kind === 'total_changed'
        ? total === null
          ? t('total_changed.body_nofx')
          : t('total_changed.body', { amount })
        : t(`${kind}.body`);
  const link = LINKS[kind];

  return (
    <Card role="alert" className="flex flex-col gap-3">
      {heading(t(`${kind}.title`), body)}
      {kind === 'fields' && failure.fields !== undefined ? (
        <ul className="text-meta flex list-disc flex-col gap-1 pl-5">
          {failure.fields.map((item) => (
            <li key={`${item.field}-${item.message}`}>{typographic(item.message, locale)}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        {kind === 'no_payment_method' ? (
          <Button type="button" className="w-full sm:w-auto" onClick={props.onGuide}>
            {t('no_payment_method.action')}
          </Button>
        ) : null}
        {link === undefined || kind === 'publish_disabled' ? null : (
          <Link
            href={link}
            className={cn(buttonVariants({ variant: 'primary' }), 'w-full sm:w-auto')}
          >
            {t(`${kind}.action`)}
          </Link>
        )}
        {kind === 'total_changed' && total !== null ? (
          <Button
            type="button"
            className="w-full sm:w-auto"
            disabled={props.busy}
            onClick={() => {
              props.onConfirmTotal({ amount_minor: total.amount_minor, currency: total.currency });
            }}
          >
            {t('total_changed.action')}
          </Button>
        ) : null}
        {kind === 'fields' || kind === 'budget_too_low' ? (
          <Button
            type="button"
            variant="quiet"
            className="w-full sm:w-auto"
            onClick={props.onBackToProposal}
          >
            {t(`${kind}.action`)}
          </Button>
        ) : null}
        {kind === 'visual_expired' ? (
          <Button
            type="button"
            variant="quiet"
            className="w-full sm:w-auto"
            onClick={props.onSources}
          >
            {t('visual_expired.action')}
          </Button>
        ) : null}
        {kind === 'fx_not_available' || kind === 'rate_limited' ? (
          <Button
            type="button"
            variant="quiet"
            className="w-full sm:w-auto"
            disabled={props.busy}
            onClick={props.onRetry}
          >
            {t(`${kind}.action`)}
          </Button>
        ) : null}
        {kind === 'already_published' || kind === 'in_progress' ? (
          <Link
            href={`/campagnes/${props.campaignId}`}
            className={cn(buttonVariants({ variant: 'quiet' }), 'w-full sm:w-auto')}
          >
            {t(`${kind}.action`)}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

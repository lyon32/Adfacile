'use client';
// Message affiché pour une issue d'action (jamais le texte renvoyé par Supabase).
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { Outcome } from './post-auth';

const OUTCOME_KEYS = {
  invalid_credentials: 'invalid_credentials',
  locked: 'locked',
  email_not_confirmed: 'email_not_confirmed',
  captcha_failed: 'captcha_failed',
  email_taken: 'email_taken',
  weak_password: 'weak_password',
  rate_limited: 'rate_limited',
  link_expired: 'link_expired',
  unavailable: 'unavailable',
} as const satisfies Record<Exclude<Outcome, 'ok'>, string>;

export const LINK_CLASS = 'text-ink font-semibold underline underline-offset-4';

export function OutcomeMessage({ outcome }: { outcome: Outcome | null }): ReactNode {
  const t = useTranslations('auth.errors');
  if (outcome === null || outcome === 'ok') return null;
  return (
    <p
      role="alert"
      className="border-error text-error rounded-md border px-3 py-2 text-sm font-semibold"
    >
      {t(OUTCOME_KEYS[outcome])}{' '}
      {outcome === 'email_taken' && (
        <a className={LINK_CLASS} href="/connexion">
          {t('email_taken_link')}
        </a>
      )}
      {outcome === 'link_expired' && (
        <a className={LINK_CLASS} href="/mot-de-passe-oublie">
          {t('link_expired_action')}
        </a>
      )}
    </p>
  );
}

'use client';
// Réglages > Pages (APPFLOW §6.2, §14) : Pages connectées, activation selon la formule, Page
// verrouillée pour la période, langue et ton des pubs. Activer ou désactiver : propriétaire ;
// langue et ton : propriétaire ou éditeur (SECURITY_NOTES §2.3). Le serveur fait foi.
import { Button, Card, cn, Switch } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { SelectField } from '../settings/select-field';
import { useRenewalMessage, useWorkspaceWritable } from '../shell/use-writable';
import { usePages, useUpdatePage, type MetaPage } from './api';

type Role = 'owner' | 'editor' | 'viewer';

/** Clé du message d'une erreur de l'API sur une Page. */
export function pageErrorKey(
  error: unknown,
): 'limit' | 'locked' | 'forbidden' | 'read_only' | 'generic' {
  if (!(error instanceof ApiError)) return 'generic';
  if (error.code === 'page_limit_reached') return 'limit';
  if (error.code === 'conflict') return 'locked';
  if (error.code === 'workspace_read_only' || error.code === 'workspace_locked') return 'read_only';
  if (error.code === 'role_insufficient' || error.code === 'forbidden') return 'forbidden';
  return 'generic';
}

function PageRow({
  page,
  role,
  pending,
  onPatch,
}: {
  page: MetaPage;
  role: Role;
  pending: boolean;
  onPatch: (patch: {
    active?: boolean;
    ad_language?: 'fr' | 'en';
    ad_address?: 'vous' | 'tu';
  }) => void;
}): ReactNode {
  const t = useTranslations('meta.pages');
  const writable = useWorkspaceWritable();
  const canToggle = role === 'owner' && writable;
  const canEdit = (role === 'owner' || role === 'editor') && writable;
  const locked = page.locked_for_period === true && page.active;
  const switchId = `page-active-${page.id}`;
  return (
    <li className="flex flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p id={`${switchId}-name`} className="truncate text-base font-semibold">
            {page.name}
          </p>
          <p className="text-meta text-muted flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="tabular-nums">{page.meta_page_id}</span>
            <span>
              {page.instagram_linked === true ? t('instagram_linked') : t('instagram_missing')}
            </span>
            <span>
              {page.whatsapp_linked === true ? t('whatsapp_linked') : t('whatsapp_missing')}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor={switchId} className="text-meta font-semibold">
            {page.active ? t('active') : t('inactive')}
          </label>
          <Switch
            id={switchId}
            aria-labelledby={`${switchId}-name`}
            checked={page.active}
            disabled={!canToggle || pending || locked}
            onCheckedChange={(active) => {
              onPatch({ active });
            }}
          />
        </div>
      </div>
      {locked ? (
        <p className="text-meta border-line rounded-md border px-3 py-2 font-semibold">
          {t('locked')}
        </p>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          label={t('ad_language')}
          value={page.ad_language ?? 'fr'}
          disabled={!canEdit || pending}
          options={[
            { value: 'fr', label: 'Français' },
            { value: 'en', label: 'English' },
          ]}
          onChange={(event) => {
            onPatch({ ad_language: event.target.value === 'en' ? 'en' : 'fr' });
          }}
        />
        <SelectField
          label={t('ad_address')}
          value={page.ad_address ?? 'vous'}
          disabled={!canEdit || pending}
          options={[
            { value: 'vous', label: t('address_vous') },
            { value: 'tu', label: t('address_tu') },
          ]}
          onChange={(event) => {
            onPatch({ ad_address: event.target.value === 'tu' ? 'tu' : 'vous' });
          }}
        />
      </div>
    </li>
  );
}

export function PagesPanel({ workspaceId, role }: { workspaceId: string; role: Role }): ReactNode {
  const t = useTranslations('meta.pages');
  const writable = useWorkspaceWritable();
  const renewal = useRenewalMessage();
  const pages = usePages(workspaceId);
  const update = useUpdatePage(workspaceId);

  if (pages.isPending) return <p className="text-muted">{t('loading')}</p>;
  if (pages.isError) {
    return (
      <p role="alert" className="text-error font-semibold">
        {t('load_failed')}
      </p>
    );
  }
  const { data, quotas } = pages.data;
  const atLimit = quotas.pages_active >= quotas.pages_limit;
  const anyLocked = data.some((p) => p.locked_for_period === true);

  if (data.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-title font-semibold">{t('empty_title')}</p>
        <p className="text-muted">{t('empty_body')}</p>
        <Button asChild className="w-full sm:w-auto sm:self-start">
          <Link href="/reglages/comptes-meta">{t('empty_cta')}</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-meta text-muted font-semibold tabular-nums">
          {t('count', { active: quotas.pages_active, limit: quotas.pages_limit })}
        </span>
        {atLimit ? <span className="text-meta text-muted">{t('limit_reached')}</span> : null}
      </p>
      {quotas.pages_limit === 1 && anyLocked ? (
        <p className="text-meta text-muted">{t('starter_hint')}</p>
      ) : null}
      <ul className={cn('border-line bg-panel divide-line divide-y rounded-lg border')}>
        {data.map((page) => (
          <PageRow
            key={page.id}
            page={page}
            role={role}
            pending={update.isPending}
            onPatch={(patch) => {
              update.mutate({ pageId: page.id, patch });
            }}
          />
        ))}
      </ul>
      {update.isError ? (
        <p role="alert" className="text-meta text-error font-semibold">
          {t(`errors.${pageErrorKey(update.error)}`)}
        </p>
      ) : null}
      {writable ? null : (
        <p className="text-meta text-muted">
          {renewal ? t('renew_to_edit') : t('admin_read_only')}
        </p>
      )}
      {role === 'owner' ? null : <p className="text-meta text-muted">{t('only_owner')}</p>}
    </div>
  );
}

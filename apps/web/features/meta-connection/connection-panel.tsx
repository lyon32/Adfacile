'use client';
// Connexion Meta (APPFLOW §6.1, §6.3, §6.4) : se connecter, voir l'état de la connexion, choisir le
// compte publicitaire, lire le bilan de santé. Même panneau dans la première configuration et
// dans Réglages > Comptes Meta. Les droits sont ceux du serveur (propriétaire) ; l'écran masque
// seulement ce que le serveur refuserait.
import {
  Button,
  Card,
  CardDescription,
  CardTitle,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Eyebrow,
} from '@pubeka/ui';
import { Check, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/api';
import { SelectField } from '../settings/select-field';
import {
  useActivateAdAccount,
  useAdAccounts,
  useConnections,
  useDisconnect,
  useHealthCheck,
  useStartConnect,
  type AdAccount,
  type Health,
  type MetaConnection,
} from './api';
import { HealthList } from './health-list';
import type { ConnectNotice } from './notice';

/** Clé du message d'une erreur de l'API (liste fermée d'API_SPEC §4). */
export function errorKey(error: unknown): 'expired' | 'forbidden' | 'unavailable' | 'generic' {
  const code = error instanceof ApiError ? error.code : '';
  if (code === 'meta_token_expired') return 'expired';
  if (
    code === 'role_insufficient' ||
    code === 'forbidden' ||
    code === 'workspace_read_only' ||
    code === 'workspace_locked'
  ) {
    return 'forbidden';
  }
  return code === 'provider_unavailable' || code === 'maintenance' ? 'unavailable' : 'generic';
}

/** Ce que l'écran de première configuration doit savoir pour proposer « Continuer ». */
export function readiness(
  connections: readonly MetaConnection[] | undefined,
  health: Health | null | undefined,
): { connected: boolean; canContinue: boolean; hasWarnings: boolean } {
  const connected = (connections?.length ?? 0) > 0;
  const accountOk = health?.items.some((i) => i.key === 'ad_account' && i.ok) === true;
  return {
    connected,
    canContinue: connected && accountOk,
    hasWarnings: health?.items.some((i) => !i.ok) === true,
  };
}

export function useMetaReadiness(workspaceId: string) {
  const connections = useConnections(workspaceId);
  const connection = connections.data?.[0];
  return { connection, ...readiness(connections.data, connection?.last_health_check) };
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(iso),
  );
}

function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

/** Carte dans Réglages ; simple bloc séparé par un filet dans la première configuration (déjà dans une carte). */
function Panel({
  variant,
  className,
  children,
}: {
  variant: 'onboarding' | 'settings';
  className: string;
  children: ReactNode;
}): ReactNode {
  return variant === 'settings' ? (
    <Card className={className}>{children}</Card>
  ) : (
    <div className={cn('border-line border-t pt-5', className)}>{children}</div>
  );
}

function List({ items, icon }: { items: readonly string[]; icon: 'yes' | 'no' }): ReactNode {
  const Icon = icon === 'yes' ? Check : X;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((text) => (
        <li key={text} className="flex items-start gap-2">
          <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

function Notice({
  notice,
  onRetry,
  pending,
}: {
  notice: ConnectNotice;
  onRetry: () => void;
  pending: boolean;
}) {
  const t = useTranslations('meta.connect');
  if (notice === 'connected') {
    return (
      <p role="status" className="text-meta text-ink font-semibold">
        {t('connected_notice')}
      </p>
    );
  }
  return (
    <div role="alert" className="border-error flex flex-col gap-3 rounded-md border border-l-4 p-4">
      <p className="font-semibold">{t('failed_title')}</p>
      <p className="text-meta text-muted">{t(`failed.${notice}`)}</p>
      {notice === 'forbidden' ? null : (
        <Button type="button" size="sm" onClick={onRetry} disabled={pending} className="self-start">
          {t('retry')}
        </Button>
      )}
    </div>
  );
}

function ConnectCard({
  workspaceId,
  isOwner,
  variant,
  notice,
}: {
  workspaceId: string;
  isOwner: boolean;
  variant: 'onboarding' | 'settings';
  notice: ConnectNotice | null;
}): ReactNode {
  const t = useTranslations('meta.connect');
  const start = useStartConnect(workspaceId);
  const go = (): void => {
    start.mutate(variant, {
      onSuccess: (result) => {
        window.location.assign(result.authorize_url);
      },
    });
  };
  const can = [t('can_1'), t('can_2'), t('can_3')];
  const never = [t('never_1'), t('never_2'), t('never_3')];
  return (
    <Panel variant={variant} className="flex flex-col gap-5 border-t-0 pt-0">
      {variant === 'settings' ? (
        <div className="flex flex-col gap-1.5">
          <Eyebrow>{t('eyebrow')}</Eyebrow>
          <CardTitle className="text-xl font-bold">{t('title')}</CardTitle>
          <CardDescription className="text-base">{t('body')}</CardDescription>
        </div>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <section aria-labelledby="meta-can" className="flex flex-col gap-2">
          <h3 id="meta-can" className="text-title font-semibold">
            {t('can_title')}
          </h3>
          <List items={can} icon="yes" />
        </section>
        <section aria-labelledby="meta-never" className="flex flex-col gap-2">
          <h3 id="meta-never" className="text-title font-semibold">
            {t('never_title')}
          </h3>
          <List items={never} icon="no" />
        </section>
      </div>
      {notice === null ? null : <Notice notice={notice} onRetry={go} pending={start.isPending} />}
      {start.isError ? (
        <p role="alert" className="text-meta text-error font-semibold">
          {t(`errors.${errorKey(start.error)}`)}
        </p>
      ) : null}
      {isOwner ? (
        <Button
          type="button"
          onClick={go}
          disabled={start.isPending}
          className="w-full sm:w-auto sm:self-start"
        >
          {start.isPending ? t('connecting') : t('cta')}
        </Button>
      ) : (
        <p className="text-meta text-muted">{t('only_owner')}</p>
      )}
    </Panel>
  );
}

function StatusLine({ connection }: { connection: MetaConnection }): ReactNode {
  const t = useTranslations('meta.connection');
  const locale = useLocale();
  const tone =
    connection.status === 'ok'
      ? 'bg-success'
      : connection.status === 'expiring'
        ? 'bg-warn'
        : 'bg-error';
  const date = connection.expires_at === null ? null : formatDate(connection.expires_at, locale);
  return (
    <div className="flex flex-col gap-1">
      <p className="flex items-center gap-2 font-semibold">
        <span aria-hidden="true" className={cn('size-2.5 rounded-full', tone)} />
        {t(`status.${connection.status}`)}
      </p>
      <p className="text-meta text-muted">
        {t(connection.token_type === 'system_user' ? 'type_system' : 'type_user')}
        {date !== null && connection.status !== 'revoked'
          ? ` · ${t(connection.status === 'expired' ? 'expired_on' : 'expires_on', { date })}`
          : ''}
      </p>
    </div>
  );
}

function DisconnectDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}): ReactNode {
  const t = useTranslations('meta.connection');
  const common = useTranslations('common');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={common('close')}>
        <DialogTitle>{t('disconnect_title')}</DialogTitle>
        <DialogDescription>{t('disconnect_body')}</DialogDescription>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row-reverse">
          <Button disabled={pending} onClick={onConfirm}>
            {t('disconnect_confirm')}
          </Button>
          <DialogClose asChild>
            <Button variant="quiet">{common('cancel')}</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AccountPicker({
  workspaceId,
  isOwner,
  variant,
}: {
  workspaceId: string;
  isOwner: boolean;
  variant: 'onboarding' | 'settings';
}): ReactNode {
  const t = useTranslations('meta.ad_accounts');
  const accounts = useAdAccounts(workspaceId, true);
  const activate = useActivateAdAccount(workspaceId);
  const list: readonly AdAccount[] = accounts.data ?? [];
  const active = list.find((a) => a.is_active);
  const label = (a: AdAccount): string =>
    `${a.name ?? a.meta_ad_account_id} · ${a.meta_ad_account_id}`;
  return (
    <Panel variant={variant} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('body')}</CardDescription>
      </div>
      {accounts.isPending ? <p className="text-muted">{t('loading')}</p> : null}
      {accounts.isSuccess && list.length === 0 ? <p className="text-muted">{t('empty')}</p> : null}
      {list.length > 0 ? (
        <SelectField
          label={t('select_label')}
          value={active?.id ?? ''}
          {...(active === undefined ? { placeholder: t('select_placeholder') } : {})}
          disabled={!isOwner || activate.isPending}
          options={list.map((a) => ({ value: a.id, label: label(a) }))}
          onChange={(event) => {
            if (event.target.value !== '') activate.mutate(event.target.value);
          }}
        />
      ) : null}
      {active === undefined ? null : (
        <p className="text-meta text-muted">
          {active.has_payment_method === true
            ? t('payment_ok')
            : active.has_payment_method === false
              ? t('payment_missing')
              : t('payment_unknown')}
          {active.currency === undefined || active.currency === '' ? '' : ` · ${active.currency}`}
        </p>
      )}
      {activate.isError ? (
        <p role="alert" className="text-meta text-error font-semibold">
          {t('error')}
        </p>
      ) : null}
      {isOwner ? null : <p className="text-meta text-muted">{t('only_owner')}</p>}
    </Panel>
  );
}

export interface ConnectionPanelProps {
  workspaceId: string;
  isOwner: boolean;
  variant: 'onboarding' | 'settings';
  /** Résultat du retour de Facebook (`?meta=`), lu par la page serveur. */
  notice: ConnectNotice | null;
}

export function ConnectionPanel({
  workspaceId,
  isOwner,
  variant,
  notice,
}: ConnectionPanelProps): ReactNode {
  const t = useTranslations('meta.connection');
  const health = useTranslations('meta.health');
  const connect = useTranslations('meta.connect');
  const locale = useLocale();
  const connections = useConnections(workspaceId);
  const check = useHealthCheck(workspaceId);
  const disconnect = useDisconnect(workspaceId);
  const startConnect = useStartConnect(workspaceId);
  const [confirming, setConfirming] = useState(false);
  const connection = connections.data?.[0];
  const autoChecked = useRef(false);

  // Au retour de Facebook, le bilan se lance seul, une seule fois (APPFLOW §6.1 : « retour ⟶ bilan »).
  useEffect(() => {
    if (
      notice === 'connected' &&
      connection !== undefined &&
      (connection.last_health_check === null || connection.last_health_check === undefined) &&
      !autoChecked.current
    ) {
      autoChecked.current = true;
      check.mutate(connection.id);
    }
  }, [notice, connection, check]);

  if (connections.isPending) return <p className="text-muted">{t('loading')}</p>;
  if (connections.isError) {
    return (
      <p role="alert" className="text-error font-semibold">
        {t('load_failed')}
      </p>
    );
  }
  if (connection === undefined) {
    return (
      <ConnectCard workspaceId={workspaceId} isOwner={isOwner} variant={variant} notice={notice} />
    );
  }

  const result = check.data ?? connection.last_health_check ?? null;
  const unusable = connection.status === 'expired' || connection.status === 'revoked';
  const reconnect = (): void => {
    startConnect.mutate(variant, {
      onSuccess: (r) => {
        window.location.assign(r.authorize_url);
      },
    });
  };
  const failure = check.error ?? disconnect.error ?? startConnect.error;

  return (
    <div className="flex flex-col gap-6">
      {notice === 'connected' ? (
        <p role="status" className="text-meta text-ink font-semibold">
          {connect('connected_notice')}
        </p>
      ) : null}

      <Panel variant={variant} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('body')}</CardDescription>
        </div>
        <StatusLine connection={connection} />
        {unusable ? (
          <p
            role="alert"
            className="border-error text-meta rounded-md border border-l-4 px-4 py-3 font-semibold"
          >
            {t(connection.status === 'revoked' ? 'revoked_banner' : 'expired_banner')}
          </p>
        ) : null}
        {isOwner ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            {unusable || connection.status === 'expiring' ? (
              <Button type="button" onClick={reconnect} disabled={startConnect.isPending}>
                {t('reconnect')}
              </Button>
            ) : null}
            {unusable ? null : (
              <Button
                type="button"
                variant={connection.status === 'expiring' ? 'quiet' : 'primary'}
                onClick={() => {
                  check.mutate(connection.id);
                }}
                disabled={check.isPending}
              >
                {check.isPending ? t('rechecking') : t('recheck')}
              </Button>
            )}
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                setConfirming(true);
              }}
            >
              {t('disconnect')}
            </Button>
          </div>
        ) : (
          <p className="text-meta text-muted">{t('only_owner')}</p>
        )}
        {failure === null ? null : (
          <p role="alert" className="text-meta text-error font-semibold">
            {t(`errors.${errorKey(failure)}`)}
          </p>
        )}
      </Panel>

      {unusable ? null : (
        <AccountPicker workspaceId={workspaceId} isOwner={isOwner} variant={variant} />
      )}

      {unusable ? null : (
        <Panel variant={variant} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <CardTitle>{health('title')}</CardTitle>
            <CardDescription>
              {result === null
                ? health('never_checked')
                : health('checked_at', { date: formatDateTime(result.checked_at, locale) })}
            </CardDescription>
          </div>
          {check.isPending && result === null ? (
            <p className="text-muted">{health('running')}</p>
          ) : null}
          {result === null ? null : <HealthList items={result.items} />}
        </Panel>
      )}

      <DisconnectDialog
        open={confirming}
        onOpenChange={setConfirming}
        pending={disconnect.isPending}
        onConfirm={() => {
          disconnect.mutate(connection.id, {
            onSuccess: () => {
              setConfirming(false);
            },
          });
        }}
      />
    </div>
  );
}

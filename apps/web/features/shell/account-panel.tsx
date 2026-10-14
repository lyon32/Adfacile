'use client';
// Panneau du compte : réglages, langue, thème, déconnexion (APPFLOW §2.1 « carte utilisateur »
// et onglet Compte du téléphone). Sur téléphone il contient aussi le sélecteur de Page.
import { Button, Dialog, DialogClose, DialogContent, DialogTitle, cn } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { Locale, Theme } from '@pubeka/i18n';
import { clearQueryCache } from '../../lib/query-client';
import { postAuth } from '../auth/post-auth';
import { ACCOUNT_ITEMS } from './nav-config';
import { PageSelector } from './page-selector';
import { displayName, useSession } from './session-context';
import { useUpdateMe } from './use-update-me';

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled: boolean;
}): ReactNode {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="border-field-line flex rounded-md border p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          disabled={disabled}
          onClick={() => {
            if (option.value !== value) onChange(option.value);
          }}
          className={cn(
            'min-h-11 flex-1 rounded-sm px-3 text-sm font-semibold transition-colors motion-reduce:transition-none',
            option.value === value ? 'bg-ink text-bg' : 'text-muted hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function AccountPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactNode {
  const t = useTranslations('shell');
  const tNav = useTranslations('shell.nav');
  const session = useSession();
  const update = useUpdateMe();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = (): void => {
    setSigningOut(true);
    void postAuth('/auth/sign-out', {}).finally(() => {
      clearQueryCache();
      window.location.assign(new URL('/connexion', window.location.origin).href);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        closeLabel={t('account.close')}
        className="max-h-[90dvh] overflow-y-auto"
      >
        <DialogTitle>{t('account.title')}</DialogTitle>
        <p className="text-meta text-muted mt-1 break-all">
          {displayName(session)} · {session.email}
        </p>

        <div className="mt-5 flex flex-col gap-5">
          <div className="min-[980px]:hidden">
            <PageSelector />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-meta text-muted font-semibold">{t('account.language')}</p>
            <Choice<Locale>
              label={t('account.language')}
              value={session.locale}
              disabled={update.isPending}
              options={[
                { value: 'fr', label: 'Français' },
                { value: 'en', label: 'English' },
              ]}
              onChange={(ui_language) => {
                update.mutate({ ui_language });
              }}
            />
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-meta text-muted font-semibold">{t('account.theme')}</p>
            <Choice<Theme>
              label={t('account.theme')}
              value={session.theme}
              disabled={update.isPending}
              options={[
                { value: 'light', label: t('account.theme_light') },
                { value: 'dark', label: t('account.theme_dark') },
                { value: 'system', label: t('account.theme_system') },
              ]}
              onChange={(theme) => {
                update.mutate({ theme });
              }}
            />
          </div>

          {update.isError ? (
            <p role="alert" className="text-meta text-error font-semibold">
              {t('account.update_failed')}
            </p>
          ) : null}

          <nav aria-label={t('account.title')} className="flex flex-col">
            {ACCOUNT_ITEMS.map((item) => (
              <DialogClose key={item.href} asChild>
                <Link
                  href={item.href}
                  className="text-ink hover:bg-bg flex min-h-11 items-center gap-3 rounded-md px-2 font-semibold"
                >
                  <item.icon aria-hidden="true" className="text-muted size-5" />
                  {tNav(item.key)}
                </Link>
              </DialogClose>
            ))}
          </nav>

          <Button variant="quiet" onClick={signOut} disabled={signingOut}>
            {t('account.sign_out')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

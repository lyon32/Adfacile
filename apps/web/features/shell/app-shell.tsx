'use client';
// Coque de l'application (APPFLOW §2) : barre latérale à partir de 980 px, sinon barre du haut
// et onglets en bas. Le contenu de l'écran est `children`.
import { cn } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { AccessBanner } from './access-banner';
import { AccountPanel } from './account-panel';
import { Logo } from './logo';
import { ACCOUNT_ITEMS, MENU_ITEMS, TAB_ITEMS, isActive, type NavItem } from './nav-config';
import { PageSelector } from './page-selector';
import { displayName, initialsOf, useSession } from './session-context';

function Avatar({ className }: { className?: string }): ReactNode {
  const session = useSession();
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-ink text-bg flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        className,
      )}
    >
      {initialsOf(session)}
    </span>
  );
}

function SideLink({ item, pathname }: { item: NavItem; pathname: string }): ReactNode {
  const t = useTranslations('shell.nav');
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-11 items-center gap-3 rounded-md border px-3 text-[15px] font-semibold transition-colors motion-reduce:transition-none',
        active ? 'border-line bg-panel text-ink' : 'text-muted hover:text-ink border-transparent',
      )}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="bg-success absolute top-2.5 bottom-2.5 -left-px w-[3px] rounded-full"
        />
      ) : null}
      <item.icon aria-hidden="true" className="size-5 shrink-0" />
      {t(item.key)}
    </Link>
  );
}

function SideNav({ pathname, onOpenAccount }: { pathname: string; onOpenAccount: () => void }) {
  const t = useTranslations('shell');
  const session = useSession();
  const plan = session.workspace?.plan ?? 'trial';
  return (
    <aside className="border-line bg-panel sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col gap-6 overflow-y-auto border-r p-4 min-[980px]:flex">
      <Link href="/" aria-label={t('brand')} className="px-2 pt-1">
        <Logo className="h-7 w-auto" />
      </Link>

      <PageSelector />

      <nav aria-label={t('nav.main_label')} className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <p className="tracking-eyebrow text-muted px-3 pb-1 text-xs font-bold uppercase">
            {t('nav.menu_title')}
          </p>
          {MENU_ITEMS.map((item) => (
            <SideLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <p className="tracking-eyebrow text-muted px-3 pb-1 text-xs font-bold uppercase">
            {t('nav.account_title')}
          </p>
          {ACCOUNT_ITEMS.map((item) => (
            <SideLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        {plan === 'starter' ? (
          <div className="bg-ink text-bg rounded-md p-4">
            <p className="text-title font-bold">{t('upgrade.title')}</p>
            <p className="mt-1 text-[13px] opacity-80">{t('upgrade.body')}</p>
            <Link
              href="/abonnement"
              className="bg-accent text-on-accent mt-3 inline-flex min-h-11 items-center rounded-md px-4 text-sm font-bold"
            >
              {t('upgrade.cta')}
            </Link>
          </div>
        ) : null}
        <button
          type="button"
          onClick={onOpenAccount}
          aria-label={t('account.open')}
          className="border-line hover:bg-bg flex min-h-14 items-center gap-3 rounded-md border p-2 text-left"
        >
          <Avatar />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{displayName(session)}</span>
            <span className="text-muted block truncate text-xs">{t(`plan.${plan}`)}</span>
          </span>
        </button>
      </div>
    </aside>
  );
}

function MobileTopBar({ onOpenAccount }: { onOpenAccount: () => void }): ReactNode {
  const t = useTranslations('shell');
  return (
    <header className="border-line bg-panel sticky top-0 z-30 flex h-14 items-center justify-between border-b px-4 min-[980px]:hidden">
      <Link href="/" aria-label={t('brand')}>
        <Logo className="h-6 w-auto" />
      </Link>
      <button
        type="button"
        onClick={onOpenAccount}
        aria-label={t('account.open')}
        className="-mr-1 flex size-11 items-center justify-center"
      >
        <Avatar />
      </button>
    </header>
  );
}

function MobileTabs({
  pathname,
  onOpenAccount,
}: {
  pathname: string;
  onOpenAccount: () => void;
}): ReactNode {
  const t = useTranslations('shell');
  const tab =
    'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold';
  return (
    <nav
      aria-label={t('tabs.label')}
      className="border-line bg-panel fixed inset-x-0 bottom-0 z-30 flex border-t pb-[env(safe-area-inset-bottom)] min-[980px]:hidden"
    >
      {TAB_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(tab, active ? 'text-ink' : 'text-muted')}
          >
            {active ? (
              <span
                aria-hidden="true"
                className="bg-success absolute top-0 h-[3px] w-8 rounded-full"
              />
            ) : null}
            <item.icon aria-hidden="true" className="size-5" />
            {t(`tabs.${item.key as 'home' | 'campaigns' | 'visuals'}`)}
          </Link>
        );
      })}
      <button type="button" onClick={onOpenAccount} className={cn(tab, 'text-muted')}>
        <Avatar className="size-5 text-[9px]" />
        {t('tabs.account')}
      </button>
    </nav>
  );
}

export function AppShell({
  children,
  idle,
  banner,
}: {
  children: ReactNode;
  /** Garde d'inactivité (TR-SEC-13), fournie par le serveur. */
  idle: ReactNode;
  banner: ReactNode;
}): ReactNode {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const openAccount = (): void => {
    setAccountOpen(true);
  };
  return (
    <div className="min-[980px]:flex">
      <a
        href="#contenu"
        className="bg-accent text-on-accent sr-only z-50 rounded-md px-4 py-3 font-bold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('skip_link')}
      </a>
      <SideNav pathname={pathname} onOpenAccount={openAccount} />
      <div className="min-w-0 flex-1">
        <MobileTopBar onOpenAccount={openAccount} />
        <main
          id="contenu"
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 outline-none min-[980px]:px-10 min-[980px]:pt-10 min-[980px]:pb-16"
        >
          <AccessBanner />
          {pathname === '/' || pathname.startsWith('/bienvenue') ? null : banner}
          {children}
        </main>
      </div>
      <MobileTabs pathname={pathname} onOpenAccount={openAccount} />
      <AccountPanel open={accountOpen} onOpenChange={setAccountOpen} />
      {idle}
    </div>
  );
}

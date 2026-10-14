'use client';
// Google et Apple (APPFLOW §4.1-4.2) : simples liens vers /auth/oauth/{fournisseur}, qui
// redirige vers Supabase Auth puis vers Google ou Apple.
import { Button } from '@pubeka/ui';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export function OAuthButtons(): ReactNode {
  const t = useTranslations('auth.common');
  return (
    <>
      <div className="flex flex-col gap-2">
        <Button asChild variant="quiet">
          <a href="/auth/oauth/google">{t('google')}</a>
        </Button>
        <Button asChild variant="quiet">
          <a href="/auth/oauth/apple">{t('apple')}</a>
        </Button>
      </div>
      <div className="text-muted flex items-center gap-3 text-sm">
        <span aria-hidden="true" className="bg-line h-px flex-1" />
        {t('or')}
        <span aria-hidden="true" className="bg-line h-px flex-1" />
      </div>
    </>
  );
}

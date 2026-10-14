// Cadre commun des écrans d'accès (sans barre latérale, LLD §2.1 console/(auth)) : logo, carte,
// choix de la langue.
import type { ReactNode } from 'react';
import { Card } from '@pubeka/ui';
import { Logo } from '../shell/logo';
import { LocaleSwitch } from './locale-switch';

export function AuthShell({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-4 pt-8 pb-12 sm:pt-16">
      <div className="flex items-center justify-between gap-4">
        <Logo className="h-8 w-auto" />
        <LocaleSwitch />
      </div>
      <Card className="flex flex-col gap-5 sm:p-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        {children}
      </Card>
    </main>
  );
}

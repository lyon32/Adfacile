'use client';
// Fournisseurs du navigateur : TanStack Query et nuqs (adresse). next-intl est posé par le serveur.
import { QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from 'react';
import { getQueryClient } from './query-client';

export function Providers({ children }: { children: ReactNode }): ReactNode {
  return (
    <NuqsAdapter>
      <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>
    </NuqsAdapter>
  );
}

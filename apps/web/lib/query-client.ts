// TanStack Query v5 (LLD §7.2) : un client par navigateur, un par requête côté serveur.
import { QueryClient, environmentManager } from '@tanstack/react-query';
import { ApiError } from './api';

const STALE_MS = 30_000;

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: STALE_MS,
        // Une erreur du client (4xx) ne se réessaie pas : seule une panne réseau ou 5xx le mérite.
        retry: (count, error) =>
          count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  });
}

let browserClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) return makeQueryClient();
  browserClient ??= makeQueryClient();
  return browserClient;
}

/** Vide le cache (déconnexion : LLD §7.5). */
export function clearQueryCache(): void {
  browserClient?.clear();
}

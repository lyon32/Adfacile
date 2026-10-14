// Santé du jeton Meta. Porté de backend/src/services/facebookTokenHealth.js.
//
// Meta peut invalider un jeton à tout moment (code 190) : changement de mot de passe, déconnexion « de
// tous les appareils », session réinitialisée pour sécurité (sous-code 460), expiration (463). Aucune
// application ne peut l'empêcher ; elle peut seulement le détecter et demander une reconnexion
// (`meta_token_expired`, voir `toAppError`).
//
// Ce module vérifie le jeton auprès de Meta (debug_token), avec un cache court : l'état vient toujours
// de Meta, le cache évite seulement de l'interroger à chaque page.
// Documentation : https://developers.facebook.com/docs/graph-api/reference/debug_token
import { z } from 'zod';
import type { GraphClient } from './graph';

const CACHE_TTL_MS = 5 * 60 * 1000;

export interface TokenState {
  /** null : Meta injoignable, on ne conclut pas à une révocation. */
  valid: boolean | null;
  reason?: 'revoked';
  subcode?: number | null;
  dataAccessExpiresAt?: string | null;
}

const debugSchema = z.looseObject({
  data: z
    .looseObject({
      is_valid: z.boolean().optional(),
      data_access_expires_at: z.number().optional(),
      error: z.looseObject({ subcode: z.number().optional() }).optional(),
    })
    .optional(),
});

export interface TokenHealthOptions {
  graph: GraphClient;
  appId: string;
  appSecret: string;
  now: () => Date;
  ttlMs?: number;
}

export class TokenHealth {
  private readonly cache = new Map<string, { state: TokenState; expires: number }>();

  constructor(private readonly options: TokenHealthOptions) {}

  private remember(key: string, state: TokenState): TokenState {
    this.cache.set(key, {
      state,
      expires: this.options.now().getTime() + (this.options.ttlMs ?? CACHE_TTL_MS),
    });
    return state;
  }

  /** Marque le jeton comme révoqué : à appeler dès qu'un appel Graph renvoie 190. */
  markRevoked(key: string, subcode: number | null = null): void {
    this.remember(key, { valid: false, reason: 'revoked', subcode });
  }

  /** Oublie l'état mis en cache (après une reconnexion). */
  forget(key: string): void {
    this.cache.delete(key);
  }

  /** État du jeton selon Meta. `key` identifie la connexion (jamais le jeton lui-même). */
  async check(key: string, token: string): Promise<TokenState> {
    const cached = this.cache.get(key);
    if (cached && cached.expires > this.options.now().getTime()) return cached.state;

    try {
      const raw = await this.options.graph.get('debug_token', {
        input_token: token,
        access_token: `${this.options.appId}|${this.options.appSecret}`,
      });
      const data = debugSchema.parse(raw).data ?? {};
      const end = data.data_access_expires_at
        ? new Date(data.data_access_expires_at * 1000).toISOString()
        : null;

      if (data.is_valid) return this.remember(key, { valid: true, dataAccessExpiresAt: end });
      return this.remember(key, {
        valid: false,
        reason: 'revoked',
        subcode: data.error?.subcode ?? null,
        dataAccessExpiresAt: end,
      });
    } catch {
      return { valid: null }; // non mis en cache : on réessaiera
    }
  }
}

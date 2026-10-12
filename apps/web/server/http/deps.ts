import 'server-only';
// Dépendances réelles de `api()` : Supabase (session, appartenance, limites, idempotence),
// horloge, journal. Prouvées par les tests d'intégration sur la pile locale (`test:int`).
import { createServerClient } from '@supabase/ssr';
import { getMaintenance } from '@pubeka/core';
import {
  createServiceClient,
  createUserClient,
  hitRateLimit,
  type Database,
  type DbClient,
  type ServiceClient,
} from '@pubeka/db';
import { createLogger, createRequestId, getEnv } from '@pubeka/shared';
import type { ApiDeps, Authentication } from './api';
import { dbIdempotencyStore } from './idempotency';
import { hasBearer } from './origin-check';

const logger = createLogger({ base: { module: 'api' } });

function cookieClient(req: Request, url: string, publishableKey: string): DbClient {
  const header = req.headers.get('cookie') ?? '';
  const cookies = header
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.includes('='))
    .map((part) => {
      const i = part.indexOf('=');
      return { name: part.slice(0, i), value: decodeURIComponent(part.slice(i + 1)) };
    });
  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookies,
      // Le rafraîchissement des cookies est fait par proxy.ts sur les pages ; l'API lit seulement.
      setAll: () => undefined,
    },
  });
}

function hasSessionCookie(req: Request): boolean {
  return /(?:^|;\s*)sb-[^=]*-auth-token/.test(req.headers.get('cookie') ?? '');
}

async function authenticate(req: Request): Promise<Authentication> {
  const env = getEnv();
  const bearer = hasBearer(req.headers);
  if (!bearer && !hasSessionCookie(req)) return { kind: 'none' };
  let db: DbClient;
  let token: string | undefined;
  if (bearer) {
    token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    db = createUserClient({
      url: env.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      accessToken: token,
    });
  } else {
    db = cookieClient(req, env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  }
  // Jeton vérifié auprès de Supabase Auth à chaque requête (API_SPEC §2.2 règle 1).
  const { data, error } = await db.auth.getUser(token);
  if (error !== null || data.user.email === undefined) return { kind: 'expired' };
  const profile = await db
    .from('profiles')
    .select('ui_language, timezone')
    .eq('id', data.user.id)
    .maybeSingle();
  return {
    kind: 'ok',
    db,
    user: {
      id: data.user.id,
      email: data.user.email,
      locale: profile.data?.ui_language === 'en' ? 'en' : 'fr',
      timezone: profile.data?.timezone ?? 'Africa/Douala',
    },
  };
}

let svcClient: ServiceClient | undefined;
function svc(): ServiceClient {
  const env = getEnv();
  svcClient ??= createServiceClient({
    url: env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
    secretKey: env.SUPABASE_SECRET_KEY,
  });
  return svcClient;
}

export function realApiDeps(): ApiDeps {
  const env = getEnv();
  const service = svc();
  const now = (): Date => new Date();
  return {
    appUrl: env.NEXT_PUBLIC_APP_URL,
    svc: service,
    now,
    newRequestId: createRequestId,
    isMaintenance: async () =>
      (await getMaintenance({ requestId: 'maintenance', svc: service, now })).active,
    authenticate,
    async membership(db, userId, workspaceId) {
      // Client de l'utilisateur : la RLS s'applique en plus du filtre (deux barrières).
      const member = await db
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspaceId)
        .eq('profile_id', userId)
        .maybeSingle();
      if (member.error !== null || member.data === null) return null;
      const ws = await db.from('workspaces').select('status').eq('id', workspaceId).maybeSingle();
      if (ws.error !== null || ws.data === null) return null;
      return { role: member.data.role, access: ws.data.status };
    },
    // L'administration (aal2, admin_users, verrouillage) arrive en S30 : 404 pour tous d'ici là.
    isAdmin: () => Promise.resolve(false),
    rateLimiter: (key, limit, windowS) => hitRateLimit(service, key, limit, windowS),
    idempotency: dbIdempotencyStore(service, now),
    reportError: (err, fields) => {
      logger.error('Erreur inattendue', { ...fields, err });
    },
  };
}

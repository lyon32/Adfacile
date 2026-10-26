// Connexion Meta (APPFLOW §6.1, API_SPEC §14) : démarrer, recevoir le retour de Facebook, lister,
// déconnecter. Droits : propriétaire seulement pour connecter et déconnecter (SECURITY_NOTES §2.3) ;
// tous les membres voient les connexions, jamais le jeton.
import { AppError, type ErrorCode } from '@pubeka/contracts';
import { check, one, unwrap } from '@pubeka/db';
import type { PlatformAdAccount, PlatformPage } from '@pubeka/platforms';
import type { Ctx, MemberCtx, MemberRole, WorkspaceAccess } from '../context';
import { loadWorkspaceAccess } from '../workspaces/access';
import { assertRole, assertWritable } from '../workspaces/guards';
import type { MetaDeps } from './deps';
import { consumeOAuthState, createOAuthState, readOAuthState, type ReturnTo } from './oauth-state';
import { pagePlanOf } from './plan';
import { syncMetaAssets } from './sync';
import { sealToken } from './token';
import {
  effectiveStatus,
  toConnectionView,
  type ConnectionRow,
  type MetaConnectionView,
} from './view';

/** Erreurs renvoyées par le connecteur quand Meta refuse ou ne répond pas. */
const META_FAILURES: readonly ErrorCode[] = [
  'meta_error',
  'meta_token_expired',
  'meta_payment_method_missing',
];

const CONNECTION_COLUMNS = 'id, token_type, status, expires_at, business_id, last_health_check';

export interface StartConnectInput {
  return_to?: ReturnTo | undefined;
}

/** `POST {ws}/meta/connect` : l'adresse de la fenêtre Facebook, avec un `state` signé. */
export function startMetaConnect(
  ctx: MemberCtx,
  input: StartConnectInput,
  deps: MetaDeps,
): { authorize_url: string } {
  assertRole(ctx, ['owner']);
  assertWritable(ctx);
  const state = createOAuthState(deps.state, {
    userId: ctx.user.id,
    workspaceId: ctx.workspace.id,
    nonce: deps.newNonce(),
    returnTo: input.return_to ?? 'settings',
    now: ctx.now(),
  });
  return { authorize_url: deps.connector.authorizeUrl(state, deps.redirectUri) };
}

export type CallbackFailure = 'denied' | 'state' | 'forbidden' | 'meta';

export interface CallbackInput {
  state: string;
  code?: string | undefined;
  /** Présent quand l'utilisateur a refusé ou fermé la fenêtre (`error=access_denied`). */
  error?: string | undefined;
}

const RETURN_PATH: Record<ReturnTo, string> = {
  onboarding: '/bienvenue/meta',
  settings: '/reglages/comptes-meta',
};

function destination(returnTo: ReturnTo, failure: CallbackFailure | null): string {
  const base = RETURN_PATH[returnTo];
  return failure === null ? `${base}?meta=connected` : `${base}?meta=error&reason=${failure}`;
}

async function callerMembership(
  ctx: Ctx,
  workspaceId: string,
): Promise<{ role: MemberRole; access: WorkspaceAccess } | null> {
  const member = unwrap<{ role: MemberRole } | null>(
    await ctx.db
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('profile_id', ctx.user.id)
      .maybeSingle(),
  );
  if (member === null) return null;
  const access = await loadWorkspaceAccess(ctx.db, ctx.svc, workspaceId, ctx.now());
  return access === null ? null : { role: member.role, access };
}

/**
 * `GET /meta/callback` : vérifie le `state`, échange le code, chiffre et enregistre le jeton, puis
 * les comptes publicitaires et les Pages. Renvoie toujours une adresse de redirection : un refus
 * ou un échec devient « La connexion n'a pas abouti » (APPFLOW §6.1), pas une page d'erreur.
 */
export async function completeMetaConnect(
  ctx: Ctx,
  input: CallbackInput,
  deps: MetaDeps,
): Promise<{ location: string }> {
  const fallback: ReturnTo = 'settings';
  const payload = readOAuthState(deps.state, input.state, ctx.now());
  // Le `state` doit avoir été créé pour CETTE session : un état signé pour un autre utilisateur
  // (lien envoyé à la victime) est refusé.
  if (payload?.u !== ctx.user.id) {
    return { location: destination(fallback, 'state') };
  }
  const back = payload.r;
  // Usage unique : un `state` rejoué est refusé, même signé et non expiré.
  if (!(await consumeOAuthState(ctx.svc, payload.n))) {
    return { location: destination(back, 'state') };
  }
  const membership = await callerMembership(ctx, payload.w);
  // Propriétaire et espace modifiable, comme pour `POST meta/connect` (lecture seule : refusé).
  if (
    membership?.role !== 'owner' ||
    membership.access === 'suspended' ||
    membership.access === 'read_only'
  ) {
    return { location: destination(back, 'forbidden') };
  }
  if (input.error !== undefined || input.code === undefined || input.code === '') {
    return { location: destination(back, 'denied') };
  }

  try {
    const token = await deps.connector.exchangeCode(input.code, deps.redirectUri);
    const [accounts, pages] = await Promise.all([
      deps.connector.listAdAccounts(token),
      deps.connector.listPages(token),
    ]);
    const { sealed, keyId } = sealToken(deps, token.accessToken);
    const connectionId = unwrap(
      await ctx.svc.rpc('upsert_meta_connection', {
        ws: payload.w,
        p_token_type: 'user',
        p_sealed: sealed,
        p_key_id: keyId,
        ...(token.expiresAt === null ? {} : { p_expires_at: token.expiresAt.toISOString() }),
      }),
    );
    await recordAssets(ctx, payload.w, connectionId, accounts, pages);
    return { location: destination(back, null) };
  } catch (error) {
    // Erreur de Meta (code refusé, jeton rejeté, panne) : message neutre à l'écran ; la cause
    // est dans `AppError.cause` pour les journaux.
    if (error instanceof AppError && META_FAILURES.includes(error.code)) {
      return { location: destination(back, 'meta') };
    }
    throw error;
  }
}

async function recordAssets(
  ctx: Ctx,
  workspaceId: string,
  connectionId: string,
  accounts: readonly PlatformAdAccount[],
  pages: readonly PlatformPage[],
): Promise<void> {
  const plan = await pagePlanOf(ctx.svc, workspaceId);
  await syncMetaAssets(ctx.svc, {
    workspaceId,
    connectionId,
    accounts,
    pages,
    maxPages: plan.maxPages,
  });
}

/** `GET {ws}/meta/connections` : sans jeton, avec l'état « bientôt expiré » calculé. */
export async function listMetaConnections(ctx: MemberCtx): Promise<MetaConnectionView[]> {
  const rows = unwrap(
    await ctx.db
      .from('meta_connections')
      .select(CONNECTION_COLUMNS)
      .eq('workspace_id', ctx.workspace.id)
      .order('created_at', { ascending: true }),
  );
  return rows.map((row) => toConnectionView(row, ctx.now()));
}

/** Une connexion de cet espace ; `not_found` pour une autre (jamais 403, API_SPEC §2.2). */
export async function getMetaConnection(
  ctx: MemberCtx,
  connectionId: string,
): Promise<MetaConnectionView & { expiresAtDate: Date | null }> {
  const row = one<ConnectionRow>(
    await ctx.db
      .from('meta_connections')
      .select(CONNECTION_COLUMNS)
      .eq('workspace_id', ctx.workspace.id)
      .eq('id', connectionId)
      .maybeSingle(),
  );
  return {
    ...toConnectionView(row, ctx.now()),
    expiresAtDate: row.expires_at === null ? null : new Date(row.expires_at),
  };
}

/**
 * `DELETE {ws}/meta/connections/{id}` : le jeton est effacé (avec la connexion) et les Pages sont
 * désactivées. Les campagnes déjà publiées restent actives chez Meta (EC-META-02).
 */
export async function disconnectMeta(ctx: MemberCtx, connectionId: string): Promise<void> {
  assertRole(ctx, ['owner']);
  assertWritable(ctx);
  await getMetaConnection(ctx, connectionId);
  check(
    await ctx.svc
      .from('meta_connections')
      .delete()
      .eq('workspace_id', ctx.workspace.id)
      .eq('id', connectionId),
  );
  check(
    await ctx.svc
      .from('pages')
      .update({ active: false })
      .eq('workspace_id', ctx.workspace.id)
      .eq('active', true),
  );
}

export { effectiveStatus };

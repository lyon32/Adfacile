// Bilan de santé du compte (F1, APPFLOW §6.3) : une liste verte ou rouge ; Pubeka détecte et
// guide, il ne crée rien à la place du client. « Revérifier » relit aussi les comptes publicitaires
// et les Pages chez Meta, puis contrôle le compte et la Page actifs.
import { AppError } from '@pubeka/contracts';
import { check, unwrap, type ServiceClient } from '@pubeka/db';
import type { HealthCheckItem } from '@pubeka/platforms';
import type { MemberCtx } from '../context';
import { assertRole, assertWritable } from '../workspaces/guards';
import { getMetaConnection } from './connections';
import type { MetaDeps } from './deps';
import { pagePlanOf } from './plan';
import { syncMetaAssets } from './sync';
import { loadToken } from './token';
import { healthToJson, type HealthCheckView, type HealthItem, type HealthKey } from './view';

/** Guides pas à pas (panneau « Comment faire ») : un identifiant par élément. */
export const GUIDE_SLUGS: Record<HealthKey, string> = {
  business_portfolio: 'business-portfolio',
  ad_account: 'ad-account',
  payment_method: 'payment-method',
  page: 'facebook-page',
  instagram: 'instagram',
  whatsapp: 'whatsapp-business',
  pixel: 'pixel',
  permissions: 'permissions',
};

const INSTAGRAM_ID = /^[0-9]{5,25}$/;

function item(key: HealthKey, ok: boolean): HealthItem {
  return {
    key,
    ok,
    // Seul le compte publicitaire bloque la suite ; WhatsApp est « fortement recommandé ».
    ...(key === 'ad_account' ? { required: true } : {}),
    ...(key === 'whatsapp' ? { recommended: true } : {}),
    ...(ok ? {} : { guide_slug: GUIDE_SLUGS[key] }),
  };
}

function okOf(items: readonly HealthCheckItem[], key: HealthCheckItem['key']): boolean {
  return items.find((i) => i.key === key)?.status === 'ok';
}

/** Éléments du bilan à partir de ce que Meta a répondu (et de ce qui manque avant de pouvoir demander). */
export function buildHealthItems(args: {
  hasAdAccount: boolean;
  hasPage: boolean;
  checks: readonly HealthCheckItem[] | null;
}): HealthItem[] {
  const { checks } = args;
  const adAccountOk = args.hasAdAccount && (checks === null ? false : okOf(checks, 'ad_account'));
  const items: HealthItem[] = [
    // Un compte publicitaire utilisable n'existe que dans un portefeuille business.
    item('business_portfolio', adAccountOk),
    item('ad_account', adAccountOk),
    item('payment_method', checks !== null && okOf(checks, 'payment_method')),
    item('page', args.hasPage && (checks === null ? true : okOf(checks, 'page'))),
    item('instagram', checks !== null && okOf(checks, 'instagram')),
    item('whatsapp', checks !== null && okOf(checks, 'whatsapp')),
    item('pixel', checks !== null && okOf(checks, 'pixel')),
  ];
  if (checks !== null) items.push(item('permissions', okOf(checks, 'permissions')));
  return items;
}

async function markExpired(svc: ServiceClient, workspaceId: string, id: string): Promise<void> {
  check(
    await svc
      .from('meta_connections')
      .update({ status: 'expired' })
      .eq('workspace_id', workspaceId)
      .eq('id', id),
  );
}

/** `POST {ws}/meta/connections/{id}/health-check`. */
export async function runMetaHealthCheck(
  ctx: MemberCtx,
  connectionId: string,
  deps: MetaDeps,
): Promise<HealthCheckView> {
  assertRole(ctx, ['owner']);
  assertWritable(ctx);
  const workspaceId = ctx.workspace.id;
  const connection = await getMetaConnection(ctx, connectionId);
  if (connection.status === 'expired' || connection.status === 'revoked') {
    if (connection.status === 'expired') await markExpired(ctx.svc, workspaceId, connectionId);
    throw new AppError('meta_token_expired');
  }

  const token = await loadToken(ctx.svc, deps, workspaceId, {
    id: connectionId,
    expiresAt: connection.expiresAtDate,
  });

  let checks: HealthCheckItem[] | null = null;
  let hasAdAccount = false;
  let hasPage = false;
  try {
    const [accounts, pages] = await Promise.all([
      deps.connector.listAdAccounts(token),
      deps.connector.listPages(token),
    ]);
    const plan = await pagePlanOf(ctx.svc, workspaceId);
    await syncMetaAssets(ctx.svc, {
      workspaceId,
      connectionId,
      accounts,
      pages,
      maxPages: plan.maxPages,
    });

    const adRows = unwrap(
      await ctx.svc
        .from('ad_accounts')
        .select('id, meta_ad_account_id, is_active')
        .eq('workspace_id', workspaceId)
        .eq('meta_connection_id', connectionId)
        .order('meta_ad_account_id', { ascending: true }),
    );
    const pageRows = unwrap(
      await ctx.svc
        .from('pages')
        .select('id, meta_page_id, active')
        .eq('workspace_id', workspaceId)
        .order('meta_page_id', { ascending: true }),
    );
    const listedPages = new Set(pages.map((p) => p.id));
    const adAccount = adRows.find((a) => a.is_active) ?? adRows[0];
    const page =
      pageRows.find((p) => p.active && listedPages.has(p.meta_page_id)) ??
      pageRows.find((p) => listedPages.has(p.meta_page_id));
    hasAdAccount = adAccount !== undefined;
    hasPage = page !== undefined;

    if (adAccount !== undefined && page !== undefined) {
      checks = await deps.connector.healthCheck(
        token,
        adAccount.meta_ad_account_id,
        page.meta_page_id,
      );
      const instagram = checks.find((c) => c.key === 'instagram');
      const instagramId = instagram?.detail?.id;
      check(
        await ctx.svc
          .from('ad_accounts')
          .update({ has_payment_method: okOf(checks, 'payment_method') })
          .eq('workspace_id', workspaceId)
          .eq('id', adAccount.id),
      );
      check(
        await ctx.svc
          .from('pages')
          .update({
            instagram_account_id:
              instagram?.status === 'ok' &&
              typeof instagramId === 'string' &&
              INSTAGRAM_ID.test(instagramId)
                ? instagramId
                : null,
            whatsapp_linked: okOf(checks, 'whatsapp'),
          })
          .eq('workspace_id', workspaceId)
          .eq('id', page.id),
      );
    }
  } catch (error) {
    if (error instanceof AppError && error.code === 'meta_token_expired') {
      await markExpired(ctx.svc, workspaceId, connectionId);
    }
    throw error;
  }

  const result: HealthCheckView = {
    checked_at: ctx.now().toISOString(),
    items: buildHealthItems({ hasAdAccount, hasPage, checks }),
  };
  check(
    await ctx.svc
      .from('meta_connections')
      .update({ last_health_check: healthToJson(result) })
      .eq('workspace_id', workspaceId)
      .eq('id', connectionId),
  );
  return result;
}

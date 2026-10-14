// Pages Facebook de l'espace (APPFLOW §6.2, SECURITY_NOTES §2.3) : liste, activation dans la limite
// de la formule (1 / 3 / 10), verrou de la Page pour la période, langue et ton des pubs.
// Activer ou désactiver : propriétaire. Langue et ton des pubs : propriétaire ou éditeur.
import { AppError } from '@pubeka/contracts';
import { check, one, unwrap } from '@pubeka/db';
import type { MemberCtx, PlanCode } from '../context';
import { assertRole, assertWritable } from '../workspaces/guards';
import { pagePlanOf } from './plan';

export interface PageView {
  id: string;
  meta_page_id: string;
  name: string;
  active: boolean;
  locked_for_period: boolean;
  instagram_linked: boolean;
  whatsapp_linked: boolean;
  ad_language: 'fr' | 'en';
  ad_address: 'vous' | 'tu';
}

export interface PagesView {
  data: PageView[];
  quotas: { pages_active: number; pages_limit: number };
}

export interface PageUpdateInput {
  active?: boolean | undefined;
  ad_language?: 'fr' | 'en' | undefined;
  ad_address?: 'vous' | 'tu' | undefined;
}

interface PageRow {
  id: string;
  meta_page_id: string;
  name: string | null;
  active: boolean;
  instagram_account_id: string | null;
  whatsapp_linked: boolean;
  ad_language: string;
  ad_address: string;
}

const PAGE_COLUMNS =
  'id, meta_page_id, name, active, instagram_account_id, whatsapp_linked, ad_language, ad_address';

/** Formule supérieure à proposer quand la limite est atteinte ; `null` pour la plus haute. */
export function upgradeTarget(plan: PlanCode): PlanCode | null {
  return plan === 'starter' ? 'pro' : plan === 'pro' ? 'business' : null;
}

function toView(row: PageRow, locked: boolean): PageView {
  return {
    id: row.id,
    meta_page_id: row.meta_page_id,
    name: row.name ?? row.meta_page_id,
    active: row.active,
    locked_for_period: locked,
    instagram_linked: row.instagram_account_id !== null,
    whatsapp_linked: row.whatsapp_linked,
    ad_language: row.ad_language === 'en' ? 'en' : 'fr',
    ad_address: row.ad_address === 'tu' ? 'tu' : 'vous',
  };
}

/** Pages verrouillées : une campagne a été lancée avec elles pendant la période en cours. */
async function lockedPageIds(
  ctx: MemberCtx,
  periodStart: string | null,
): Promise<ReadonlySet<string>> {
  if (periodStart === null) return new Set();
  const rows = unwrap(
    await ctx.db
      .from('page_activations')
      .select('page_id, first_campaign_at')
      .eq('workspace_id', ctx.workspace.id)
      .eq('period_start', periodStart)
      .not('first_campaign_at', 'is', null),
  );
  return new Set(rows.map((r) => r.page_id));
}

/** `GET {ws}/pages` : tout membre voit les Pages (jamais le jeton de Page). */
export async function listPages(ctx: MemberCtx): Promise<PagesView> {
  const rows = unwrap(
    await ctx.db
      .from('pages')
      .select(PAGE_COLUMNS)
      .eq('workspace_id', ctx.workspace.id)
      .order('name', { ascending: true }),
  );
  const plan = await pagePlanOf(ctx.svc, ctx.workspace.id);
  const locked = await lockedPageIds(ctx, plan.periodStart);
  return {
    data: rows.map((row) => toView(row, locked.has(row.id))),
    quotas: { pages_active: rows.filter((r) => r.active).length, pages_limit: plan.maxPages },
  };
}

async function readPage(ctx: MemberCtx, pageId: string, periodStart: string | null) {
  const row = one<PageRow>(
    await ctx.db
      .from('pages')
      .select(PAGE_COLUMNS)
      .eq('workspace_id', ctx.workspace.id)
      .eq('id', pageId)
      .maybeSingle(),
  );
  return toView(row, (await lockedPageIds(ctx, periodStart)).has(row.id));
}

/** `PATCH {ws}/pages/{pageId}` : activer ou désactiver, langue et ton des pubs. */
export async function updatePage(
  ctx: MemberCtx,
  pageId: string,
  patch: PageUpdateInput,
): Promise<PageView> {
  assertRole(ctx, patch.active === undefined ? ['owner', 'editor'] : ['owner']);
  assertWritable(ctx);
  const plan = await pagePlanOf(ctx.svc, ctx.workspace.id);
  // 404 pour une Page d'un autre espace, avant toute écriture.
  await readPage(ctx, pageId, plan.periodStart);

  // L'activation d'abord : si elle est refusée (limite, verrou), rien d'autre n'a changé.
  if (patch.active !== undefined) {
    const outcome = unwrap(
      await ctx.svc.rpc('set_page_active', {
        ws: ctx.workspace.id,
        p_page: pageId,
        want: patch.active,
        max_pages: plan.maxPages,
        ...(plan.periodStart === null ? {} : { p_period_start: plan.periodStart }),
      }),
    );
    if (outcome === 'limit') {
      const upgradeTo = upgradeTarget(plan.plan);
      throw new AppError('page_limit_reached', {
        meta: {
          pages_limit: plan.maxPages,
          ...(upgradeTo === null ? {} : { upgrade_to: upgradeTo }),
        },
      });
    }
    if (outcome === 'locked') {
      throw new AppError('conflict', { meta: { reason: 'page_locked' } });
    }
  }

  const settings = {
    ...(patch.ad_language === undefined ? {} : { ad_language: patch.ad_language }),
    ...(patch.ad_address === undefined ? {} : { ad_address: patch.ad_address }),
  };
  if (Object.keys(settings).length > 0) {
    check(
      await ctx.db
        .from('pages')
        .update(settings)
        .eq('workspace_id', ctx.workspace.id)
        .eq('id', pageId),
    );
  }
  return readPage(ctx, pageId, plan.periodStart);
}

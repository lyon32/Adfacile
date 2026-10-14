// Comptes publicitaires de l'espace (APPFLOW §6.2) : liste pour tout membre, choix du compte actif
// par le propriétaire, changeable à tout moment (hors formule).
import { check, one, unwrap } from '@pubeka/db';
import type { MemberCtx } from '../context';
import { assertRole, assertWritable } from '../workspaces/guards';

export interface AdAccountView {
  id: string;
  meta_ad_account_id: string;
  name: string;
  currency: string;
  has_payment_method: boolean | null;
  is_active: boolean;
}

interface AdAccountRow {
  id: string;
  meta_ad_account_id: string;
  name: string | null;
  currency: string | null;
  has_payment_method: boolean | null;
  is_active: boolean;
}

const COLUMNS = 'id, meta_ad_account_id, name, currency, has_payment_method, is_active';

function toView(row: AdAccountRow): AdAccountView {
  return {
    id: row.id,
    meta_ad_account_id: row.meta_ad_account_id,
    name: row.name ?? row.meta_ad_account_id,
    currency: row.currency ?? '',
    has_payment_method: row.has_payment_method,
    is_active: row.is_active,
  };
}

/** `GET {ws}/ad-accounts`. */
export async function listAdAccounts(ctx: MemberCtx): Promise<AdAccountView[]> {
  const rows = unwrap(
    await ctx.db
      .from('ad_accounts')
      .select(COLUMNS)
      .eq('workspace_id', ctx.workspace.id)
      .order('name', { ascending: true }),
  );
  return rows.map(toView);
}

/** `POST {ws}/ad-accounts/{id}/activate` : un seul compte actif par espace. */
export async function activateAdAccount(
  ctx: MemberCtx,
  adAccountId: string,
): Promise<AdAccountView> {
  assertRole(ctx, ['owner']);
  assertWritable(ctx);
  // Un compte d'un autre espace est introuvable (404), avant toute écriture.
  one<AdAccountRow>(
    await ctx.db
      .from('ad_accounts')
      .select(COLUMNS)
      .eq('workspace_id', ctx.workspace.id)
      .eq('id', adAccountId)
      .maybeSingle(),
  );
  check(await ctx.svc.rpc('set_active_ad_account', { ws: ctx.workspace.id, p_id: adAccountId }));
  return toView(
    one<AdAccountRow>(
      await ctx.db
        .from('ad_accounts')
        .select(COLUMNS)
        .eq('workspace_id', ctx.workspace.id)
        .eq('id', adAccountId)
        .maybeSingle(),
    ),
  );
}

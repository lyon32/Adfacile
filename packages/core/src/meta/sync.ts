// Enregistre chez Pubeka ce que Meta a renvoyé : comptes publicitaires et Pages (APPFLOW §6.2).
// Relançable sans double effet (upsert par identifiant Meta). Ce que le client a choisi (Page
// active, compte actif, langue et ton des pubs) n'est jamais écrasé par une relecture.
import { check, unwrap, type ServiceClient } from '@pubeka/db';
import type { PlatformAdAccount, PlatformPage } from '@pubeka/platforms';

const AD_ACCOUNT_ID = /^act_[0-9]{5,25}$/;
const PAGE_ID = /^[0-9]{5,25}$/;

export interface SyncInput {
  workspaceId: string;
  connectionId: string;
  accounts: readonly PlatformAdAccount[];
  pages: readonly PlatformPage[];
  /** Limite de Pages de la formule : sert à activer d'office l'unique Page d'un compte. */
  maxPages: number;
}

/** Un seul compte ou une seule Page : on la choisit pour le client (il pourra changer). */
function onlyOne<T>(items: readonly T[]): T | undefined {
  return items.length === 1 ? items[0] : undefined;
}

async function syncAdAccounts(svc: ServiceClient, input: SyncInput): Promise<void> {
  const { workspaceId, connectionId } = input;
  const listed = input.accounts.filter((a) => AD_ACCOUNT_ID.test(a.id));
  if (listed.length > 0) {
    check(
      await svc.from('ad_accounts').upsert(
        listed.map((a) => ({
          workspace_id: workspaceId,
          meta_connection_id: connectionId,
          meta_ad_account_id: a.id,
          name: a.name.slice(0, 200),
          currency: a.currency !== null && /^[A-Z]{3}$/.test(a.currency) ? a.currency : null,
        })),
        { onConflict: 'workspace_id,meta_ad_account_id' },
      ),
    );
  }

  // Comptes qui ne sont plus renvoyés par Meta : supprimés s'ils ne servent à aucune campagne,
  // sinon seulement désactivés (l'historique des campagnes est conservé).
  const known = unwrap(
    await svc
      .from('ad_accounts')
      .select('id, meta_ad_account_id')
      .eq('workspace_id', workspaceId)
      .eq('meta_connection_id', connectionId),
  );
  const listedIds = new Set(listed.map((a) => a.id));
  const stale = known.filter((a) => !listedIds.has(a.meta_ad_account_id)).map((a) => a.id);
  if (stale.length > 0) {
    const used = new Set(
      unwrap(
        await svc
          .from('campaigns')
          .select('ad_account_id')
          .eq('workspace_id', workspaceId)
          .in('ad_account_id', stale),
      ).map((c) => c.ad_account_id),
    );
    const removable = stale.filter((id) => !used.has(id));
    const kept = stale.filter((id) => used.has(id));
    if (removable.length > 0) {
      check(
        await svc.from('ad_accounts').delete().eq('workspace_id', workspaceId).in('id', removable),
      );
    }
    if (kept.length > 0) {
      check(
        await svc
          .from('ad_accounts')
          .update({ is_active: false })
          .eq('workspace_id', workspaceId)
          .in('id', kept),
      );
    }
  }

  const active = unwrap(
    await svc
      .from('ad_accounts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true),
  );
  if (active.length === 0) {
    const usable = listed.filter((a) => a.usable);
    const choice = onlyOne(usable);
    const row =
      choice === undefined
        ? undefined
        : unwrap<{ id: string } | null>(
            await svc
              .from('ad_accounts')
              .select('id')
              .eq('workspace_id', workspaceId)
              .eq('meta_ad_account_id', choice.id)
              .maybeSingle(),
          );
    if (row !== undefined && row !== null) {
      check(await svc.rpc('set_active_ad_account', { ws: workspaceId, p_id: row.id }));
    }
  }
}

async function syncPages(svc: ServiceClient, input: SyncInput): Promise<void> {
  const { workspaceId } = input;
  const listed = input.pages.filter((p) => PAGE_ID.test(p.id));
  if (listed.length > 0) {
    check(
      await svc.from('pages').upsert(
        listed.map((p) => ({
          workspace_id: workspaceId,
          meta_page_id: p.id,
          name: p.name.slice(0, 200),
        })),
        { onConflict: 'workspace_id,meta_page_id' },
      ),
    );
  }

  // Page retirée du portefeuille ou droits perdus (EC-META-03) : désactivée, campagnes conservées.
  const rows = unwrap(
    await svc.from('pages').select('id, meta_page_id, active').eq('workspace_id', workspaceId),
  );
  const listedIds = new Set(listed.map((p) => p.id));
  const lost = rows.filter((p) => p.active && !listedIds.has(p.meta_page_id)).map((p) => p.id);
  if (lost.length > 0) {
    check(
      await svc
        .from('pages')
        .update({ active: false })
        .eq('workspace_id', workspaceId)
        .in('id', lost),
    );
  }

  const stillActive = rows.some((p) => p.active && !lost.includes(p.id));
  const only = onlyOne(listed);
  if (!stillActive && only !== undefined && input.maxPages >= 1) {
    const row = rows.find((p) => p.meta_page_id === only.id);
    if (row !== undefined) {
      check(
        await svc.rpc('set_page_active', {
          ws: workspaceId,
          p_page: row.id,
          want: true,
          max_pages: input.maxPages,
        }),
      );
    }
  }
}

export async function syncMetaAssets(svc: ServiceClient, input: SyncInput): Promise<void> {
  await syncAdAccounts(svc, input);
  await syncPages(svc, input);
}

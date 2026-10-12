// Premiers dépôts : petites fonctions nommées, une requête précise chacune (LLD §4).
// Toujours filtrées par `workspace_id`, même si la RLS le fait déjà (SECURITY_NOTES §2).
import type { DbClient, ServiceClient } from './client';
import type { Tables } from './database.types';
import { check, one } from './errors';

export type WorkspaceRow = Tables<'workspaces'>;
export type AnalysisRow = Tables<'analyses'>;

export const workspacesRepo = {
  async byId(db: DbClient, workspaceId: string): Promise<WorkspaceRow> {
    return one(await db.from('workspaces').select('*').eq('id', workspaceId).maybeSingle());
  },

  /** L'ancien propriétaire devient éditeur ; une transaction, journalisée dans `audit.workspace_log` (E8). */
  async transferOwnership(
    svc: ServiceClient,
    args: { workspaceId: string; newOwnerId: string; actorId: string },
  ): Promise<void> {
    check(
      await svc.rpc('transfer_ownership', {
        ws: args.workspaceId,
        new_owner: args.newOwnerId,
        actor: args.actorId,
      }),
    );
  },
};

export const analysesRepo = {
  async byId(db: DbClient, workspaceId: string, analysisId: string): Promise<AnalysisRow> {
    return one(
      await db
        .from('analyses')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('id', analysisId)
        .maybeSingle(),
    );
  },
};

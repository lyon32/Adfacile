import 'server-only';
// Qui regarde, et dans quel espace : lu une seule fois par requête côté serveur (LLD §7.1,
// « composants serveur pour le premier affichage »). Sert à la langue, au thème et à la coque.
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getMe, listWorkspaces, type Ctx, type Me, type Workspace } from '@pubeka/core';
import { createRequestId } from '@pubeka/shared';
import { createAuthServiceClient, createRequestAuthClient } from '../../server/auth/supabase';
import { getSession } from '../../server/auth/session';

export const WORKSPACE_COOKIE = 'pubeka-workspace';

export interface Viewer {
  me: Me;
  workspaces: Workspace[];
  /** Espace actif : celui du cookie s'il fait partie des espaces de l'utilisateur, sinon le premier. */
  workspace: Workspace | null;
}

export const loadViewer = cache(async (): Promise<Viewer | null> => {
  const session = await getSession();
  if (session === null) return null;
  const ctx: Ctx = {
    requestId: createRequestId(),
    user: { id: session.id, email: session.email ?? '', locale: 'fr', timezone: 'Africa/Douala' },
    db: await createRequestAuthClient(),
    svc: createAuthServiceClient(),
    now: () => new Date(),
  };
  const [me, workspaces] = await Promise.all([getMe(ctx), listWorkspaces(ctx)]);
  const wanted = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const workspace = workspaces.find((w) => w.id === wanted) ?? workspaces[0] ?? null;
  return { me, workspaces, workspace };
});

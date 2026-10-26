// Page « Campagnes » `/campagnes` (S17) : la liste des campagnes de l'espace actif.
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { CampaignsPage } from '../../../../features/campaigns/campaigns-page';
import { isWritableStatus } from '../../../../features/shell/workspace-access';
import { loadViewer } from '../../../../features/shell/viewer';

export default async function CampaignsRoute(): Promise<ReactNode> {
  const viewer = await loadViewer();
  const workspace = viewer?.workspace ?? null;
  if (workspace === null) notFound();
  return (
    <CampaignsPage
      workspaceId={workspace.id}
      canCreate={workspace.role !== 'viewer' && isWritableStatus(workspace.status)}
    />
  );
}

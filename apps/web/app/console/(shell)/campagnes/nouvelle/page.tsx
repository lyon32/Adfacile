// Créer une campagne `/campagnes/nouvelle` (APPFLOW §8) : étapes Sources et Questions (S14).
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { CampaignWizard } from '../../../../../features/campaign-wizard/campaign-wizard';
import { loadViewer } from '../../../../../features/shell/viewer';

export default async function NewCampaignPage(): Promise<ReactNode> {
  const viewer = await loadViewer();
  if (viewer === null) notFound();
  const { workspace } = viewer;
  return (
    <CampaignWizard
      workspace={
        workspace === null
          ? null
          : { id: workspace.id, role: workspace.role, status: workspace.status }
      }
    />
  );
}

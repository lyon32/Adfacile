// Page d'une campagne `/campagnes/{id}` (S17, APPFLOW §11) : état, actions, Résultats, Pubs, Réglages, Historique.
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { CampaignPage } from '../../../../../features/campaigns/campaign-page';
import { loadViewer } from '../../../../../features/shell/viewer';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CampaignRoute({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}): Promise<ReactNode> {
  const { campaignId } = await params;
  const viewer = await loadViewer();
  const workspace = viewer?.workspace ?? null;
  if (workspace === null || !UUID.test(campaignId)) notFound();
  return (
    <CampaignPage
      workspace={{ id: workspace.id, role: workspace.role, status: workspace.status }}
      campaignId={campaignId}
    />
  );
}

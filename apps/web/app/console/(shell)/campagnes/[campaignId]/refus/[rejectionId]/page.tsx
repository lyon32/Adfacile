// Page « Voir pourquoi » `/campagnes/{id}/refus/{refus}` (S18, APPFLOW §12) : le rapport du Modérateur sur un refus de Meta.
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { RejectionPage } from '../../../../../../../features/campaigns/rejection-report';
import { loadViewer } from '../../../../../../../features/shell/viewer';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RejectionRoute({
  params,
}: {
  params: Promise<{ campaignId: string; rejectionId: string }>;
}): Promise<ReactNode> {
  const { campaignId, rejectionId } = await params;
  const viewer = await loadViewer();
  const workspace = viewer?.workspace ?? null;
  if (workspace === null || !UUID.test(campaignId) || !UUID.test(rejectionId)) notFound();
  return (
    <RejectionPage
      workspace={{ id: workspace.id, role: workspace.role, status: workspace.status }}
      campaignId={campaignId}
      rejectionId={rejectionId}
    />
  );
}

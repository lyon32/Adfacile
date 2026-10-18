import { describe, expect, it } from 'vitest';
import { inlineHandlers } from '../create-dispatcher';
import { runHandler } from '../dispatcher';
import { QUEUE_CONCURRENCY } from '../queue-limits';
import { campaignPublishHandler, campaignPublishPayloadSchema } from './campaign-publish';

const CAMPAIGN = '5f0c2f56-6a3a-4a7e-8c4f-0a8e0f0a1b2c';
const WORKSPACE = '9d8c7b6a-5f4e-4d3c-8b2a-1a0f9e8d7c6b';

describe('tâche campaign.publish (S16)', () => {
  it('porte l’identifiant campaign.publish et est enregistrée pour le mode inline', () => {
    expect(campaignPublishHandler.id).toBe('campaign.publish');
    expect(inlineHandlers.map((h) => h.id)).toContain('campaign.publish');
  });

  it('ne reçoit que des identifiants : deux UUID, aucun champ en plus (jamais un jeton ni un objet complet)', () => {
    expect(
      campaignPublishPayloadSchema.safeParse({ campaignId: CAMPAIGN, workspaceId: WORKSPACE })
        .success,
    ).toBe(true);
    for (const bad of [
      {},
      { campaignId: CAMPAIGN },
      { campaignId: 'pas-un-uuid', workspaceId: WORKSPACE },
      { campaignId: CAMPAIGN, workspaceId: WORKSPACE, token: 'secret' },
      { campaignId: CAMPAIGN, workspaceId: WORKSPACE, budget: 1_000_000 },
    ]) {
      expect(campaignPublishPayloadSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('refuse une charge invalide avant toute exécution (validation_failed)', async () => {
    await expect(
      runHandler(
        campaignPublishHandler,
        { campaignId: 'x' },
        { now: () => new Date(), runtime: 'inline' },
      ),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('a sa propre file, limitée à 5 publications simultanées', () => {
    expect(QUEUE_CONCURRENCY['meta-publish']).toBe(5);
  });
});

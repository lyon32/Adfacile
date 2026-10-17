import { describe, expect, it } from 'vitest';
import { inlineHandlers } from '../create-dispatcher';
import { runHandler } from '../dispatcher';
import {
  CAMPAIGN_RECONCILE_CRON,
  campaignReconcileHandler,
  campaignReconcilePayloadSchema,
} from './campaign-reconcile';

describe('tâche campaign.reconcile (S16)', () => {
  it('porte l’identifiant campaign.reconcile et est enregistrée pour le mode inline', () => {
    expect(campaignReconcileHandler.id).toBe('campaign.reconcile');
    expect(inlineHandlers.map((h) => h.id)).toContain('campaign.reconcile');
  });

  it('est planifiée toutes les 10 minutes', () => {
    expect(CAMPAIGN_RECONCILE_CRON).toBe('*/10 * * * *');
  });

  it('ne reçoit aucune donnée : un objet vide, rien en plus (jamais un jeton ni un identifiant)', () => {
    expect(campaignReconcilePayloadSchema.safeParse({}).success).toBe(true);
    for (const bad of [{ campaignId: 'x' }, { token: 'secret' }, null, 'x']) {
      expect(campaignReconcilePayloadSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('refuse une charge invalide avant toute exécution (validation_failed)', async () => {
    await expect(
      runHandler(
        campaignReconcileHandler,
        { campaignId: 'x' },
        { now: () => new Date(), runtime: 'inline' },
      ),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});

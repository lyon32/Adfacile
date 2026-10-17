// EC-CAMP-09 : formule inférieure, campagne d'une Page devenue hors formule : elle continue chez Meta, la modification est
// refusée (402 page_limit_reached), la pause reste permise (voir pause-resume.test.ts).
import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import { PAGE } from './campaigns.test-helper';
import { publishWorld, rowOf } from './publish/publish.test-helper';
import { updateCampaign } from './update-campaign';

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error instanceof AppError ? error.code : `autre:${String(error)}`;
  }
}

describe('EC-CAMP-09 — modification d’une campagne dont la Page est hors formule', () => {
  it('refuse en 402 page_limit_reached une campagne publiée dont la Page n’est plus active', async () => {
    const w = publishWorld();
    Object.assign(rowOf(w.db, w.campaignId), { status: 'active', editable: false });
    const page = w.db.rows('pages').find((p) => p.id === PAGE);
    if (page !== undefined) page.active = false;
    expect(await code(updateCampaign(w.ctx, w.campaignId, { name: 'Autre nom', version: 1 }))).toBe(
      'page_limit_reached',
    );
    expect(rowOf(w.db, w.campaignId).name).toBe('Promo baskets');
  });

  it('une campagne publiée dont la Page est active reste « non modifiable » (409), pas 402', async () => {
    const w = publishWorld();
    Object.assign(rowOf(w.db, w.campaignId), { status: 'active', editable: false });
    expect(await code(updateCampaign(w.ctx, w.campaignId, { name: 'Autre nom', version: 1 }))).toBe(
      'conflict',
    );
  });

  it('un brouillon dont la Page est hors formule se modifie encore (il n’est pas publié)', async () => {
    const w = publishWorld();
    const page = w.db.rows('pages').find((p) => p.id === PAGE);
    if (page !== undefined) page.active = false;
    expect(await code(updateCampaign(w.ctx, w.campaignId, { name: 'Autre nom', version: 1 }))).toBe(
      'ok',
    );
  });
});

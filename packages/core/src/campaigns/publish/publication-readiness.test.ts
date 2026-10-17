// Ce que l'écran « Aperçu » et l'écran « Publier » ont besoin de savoir avant le clic : photo (adresse signée de courte durée), clause
// de responsabilité à accepter ou non, Meta prêt ou non, Page, rayon réellement envoyé à Meta. Lecture seule, tout membre.
import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import { W, PAGE } from '../campaigns.test-helper';
import { getPublicationReadiness } from './publication-readiness';
import { PHOTO_PATH, publishWorld, rowOf } from './publish.test-helper';

describe('getPublicationReadiness', () => {
  it('un espace prêt : photo signée 15 minutes, clause à accepter, Meta prêt, Page active', async () => {
    const w = publishWorld();
    const r = await getPublicationReadiness(w.ctx, w.campaignId);
    expect(r).toEqual({
      liability_required: true,
      visual: {
        status: 'ready',
        url: `https://storage.test/sources/${PHOTO_PATH}?ttl=900`,
        expires_at: '2026-10-12T09:15:00.000Z',
      },
      meta: {
        connection: 'ok',
        ad_account: { name: 'Compte de test', currency: 'USD' },
        payment_method: 'present',
      },
      page: { id: PAGE, name: 'Ma Boutique', active: true },
      cities: [],
    });
  });

  it('la clause n’est plus demandée une fois acceptée par l’espace', async () => {
    const w = publishWorld();
    w.db
      .rows('publish_liability_acceptances')
      .push({ workspace_id: W, accepted_by: w.ctx.user.id, accepted_at: 'x' });
    expect((await getPublicationReadiness(w.ctx, w.campaignId)).liability_required).toBe(false);
  });

  it('rayon réellement envoyé à Meta : un rayon sous 17 km est relevé, et l’écran peut le dire', async () => {
    const w = publishWorld({
      draft: {
        geo: {
          cities: [
            { name: 'Douala', radius_km: 10 },
            { name: 'Yaoundé', radius_km: 30 },
          ],
        },
      },
    });
    expect((await getPublicationReadiness(w.ctx, w.campaignId)).cities).toEqual([
      { name: 'Douala', radius_km: 10, effective_radius_km: 17 },
      { name: 'Yaoundé', radius_km: 30, effective_radius_km: 30 },
    ]);
  });

  it('photo absente, expirée ou supprimée du stockage : statut dit, aucune adresse', async () => {
    const none = publishWorld();
    none.db.rows('sources').length = 0;
    expect((await getPublicationReadiness(none.ctx, none.campaignId)).visual).toEqual({
      status: 'missing',
      url: null,
      expires_at: null,
    });

    const expired = publishWorld();
    const source = expired.db.rows('sources')[0];
    if (source !== undefined) source.expires_at = '2026-10-11T00:00:00Z';
    expect((await getPublicationReadiness(expired.ctx, expired.campaignId)).visual).toEqual({
      status: 'expired',
      url: null,
      expires_at: null,
    });

    const gone = publishWorld();
    gone.db.objects.delete(`sources/${PHOTO_PATH}`);
    expect((await getPublicationReadiness(gone.ctx, gone.campaignId)).visual.status).toBe(
      'expired',
    );
  });

  it('état de Meta : aucune connexion, expirée, moyen de paiement manquant ou inconnu', async () => {
    const none = publishWorld({ draft: { ad_account_id: null } });
    expect((await getPublicationReadiness(none.ctx, none.campaignId)).meta).toEqual({
      connection: 'none',
      ad_account: null,
      payment_method: 'unknown',
    });

    const expired = publishWorld();
    const connection = expired.db.rows('meta_connections')[0];
    if (connection !== undefined) connection.status = 'expired';
    expect((await getPublicationReadiness(expired.ctx, expired.campaignId)).meta.connection).toBe(
      'expired',
    );

    const missing = publishWorld();
    const account = missing.db.rows('ad_accounts')[0];
    if (account !== undefined) account.has_payment_method = false;
    expect(
      (await getPublicationReadiness(missing.ctx, missing.campaignId)).meta.payment_method,
    ).toBe('missing');
    if (account !== undefined) account.has_payment_method = null;
    expect(
      (await getPublicationReadiness(missing.ctx, missing.campaignId)).meta.payment_method,
    ).toBe('unknown');
  });

  it('Page hors formule ou absente', async () => {
    const off = publishWorld();
    const page = off.db.rows('pages').find((p) => p.id === PAGE);
    if (page !== undefined) page.active = false;
    expect((await getPublicationReadiness(off.ctx, off.campaignId)).page).toEqual({
      id: PAGE,
      name: 'Ma Boutique',
      active: false,
    });
    const none = publishWorld({ draft: { page_id: null } });
    expect((await getPublicationReadiness(none.ctx, none.campaignId)).page).toBeNull();
  });

  it('lecture seule de l’espace, lecteur, et campagne d’un autre espace : permis / 404', async () => {
    const viewer = publishWorld({ role: 'viewer', access: 'read_only' });
    await expect(getPublicationReadiness(viewer.ctx, viewer.campaignId)).resolves.toBeDefined();
    const other = publishWorld();
    Object.assign(rowOf(other.db, other.campaignId), { workspace_id: 'autre' });
    await expect(getPublicationReadiness(other.ctx, other.campaignId)).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it('une panne de signature de l’adresse ne casse pas l’écran : la photo est dite indisponible', async () => {
    const w = publishWorld();
    w.db.failNext.add('storage:sign');
    expect((await getPublicationReadiness(w.ctx, w.campaignId)).visual).toEqual({
      status: 'expired',
      url: null,
      expires_at: null,
    });
  });
});

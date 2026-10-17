// Route `publish` : EC-CAMP-01 à 09, TR-PLA-08, TR-PLA-09, TR-PLA-10 (base en mémoire, aucun appel à Meta : la route ne
// parle jamais à Meta, elle lance la tâche).
import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import { NOW, PAGE, W } from '../campaigns.test-helper';
import { publishCampaign } from './publish-campaign';
import { publishRef, PUBLISH_TASK } from './publish-types';
import {
  KEY_A,
  KEY_B,
  PERIOD_END,
  PHOTO_PATH,
  publishWorld,
  rowOf,
  SOURCE,
} from './publish.test-helper';

async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error instanceof AppError ? error.code : `autre:${String(error)}`;
  }
}

async function failure(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('une AppError était attendue');
}

const accept = { acceptLiability: true };

describe('publishCampaign — chemin heureux', () => {
  it('passe le brouillon en publication, écrit la référence AVANT la tâche, retient le quota et lance la tâche', async () => {
    const w = publishWorld();
    const view = await publishCampaign(
      w.ctx,
      w.campaignId,
      { idempotencyKey: KEY_A, ...accept },
      w.deps,
    );
    expect(view.status).toBe('publishing');
    expect(view.editable).toBe(false);
    const row = rowOf(w.db, w.campaignId);
    expect(row).toMatchObject({
      status: 'publishing',
      publish_attempt: 1,
      publish_ref: publishRef(w.campaignId, 1),
      publish_idempotency_key: KEY_A,
      publish_phase: 'none',
      quota_state: 'held',
      editable: false,
    });
    expect(row.publish_started_at).toBe(NOW.toISOString());
    expect(w.jobs.jobs).toEqual([
      {
        taskId: PUBLISH_TASK,
        payload: { campaignId: w.campaignId, workspaceId: W },
        key: `campaign.publish:${w.campaignId}:1`,
      },
    ]);
    // Le quota est retenu (beforeSpend) mais pas encore décompté : seule l'acceptation par Meta le décompte (TR-PLA-09).
    expect(w.hooks.count('beforeSpend')).toBe(1);
    expect(w.hooks.count('afterAccepted')).toBe(0);
    expect(w.hooks.count('release')).toBe(0);
  });

  it('enregistre l’événement de publication dans l’historique de la campagne', async () => {
    const w = publishWorld();
    await publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps);
    expect(w.db.rows('campaign_status_events')).toEqual([
      expect.objectContaining({
        workspace_id: W,
        campaign_id: w.campaignId,
        status: 'publishing',
        source: 'user',
      }),
    ]);
  });
});

describe('publishCampaign — droits', () => {
  it('un lecteur ne peut pas publier (role_insufficient), et rien ne bouge', async () => {
    const w = publishWorld({ role: 'viewer' });
    expect(
      await outcome(
        publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
      ),
    ).toBe('role_insufficient');
    expect(rowOf(w.db, w.campaignId).status).toBe('draft');
    expect(w.hooks.events).toEqual([]);
    expect(w.jobs.jobs).toEqual([]);
  });

  it.each([
    ['read_only', 'workspace_read_only'],
    ['suspended', 'workspace_suspended'],
  ] as const)('un espace %s ne peut pas publier (%s)', async (access, code) => {
    const w = publishWorld({ access });
    expect(
      await outcome(
        publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
      ),
    ).toBe(code);
    expect(w.hooks.events).toEqual([]);
  });

  it('une campagne d’un autre espace est introuvable (404), sans rien confirmer', async () => {
    const w = publishWorld();
    const other = publishWorld();
    const foreign = rowOf(other.db, other.campaignId);
    w.db
      .rows('campaigns')
      .push({ ...foreign, id: '00000000-0000-4000-8000-0000000000ff', workspace_id: 'autre' });
    expect(
      await outcome(
        publishCampaign(
          w.ctx,
          '00000000-0000-4000-8000-0000000000ff',
          { idempotencyKey: KEY_A, ...accept },
          w.deps,
        ),
      ),
    ).toBe('not_found');
    expect(
      await outcome(
        publishCampaign(
          w.ctx,
          '00000000-0000-4000-8000-0000000000fe',
          { idempotencyKey: KEY_A, ...accept },
          w.deps,
        ),
      ),
    ).toBe('not_found');
  });
});

describe('EC-CAMP-01 — double clic', () => {
  it('la même clé rejoue le résultat : une seule publication, un seul quota, une seule tâche', async () => {
    const w = publishWorld();
    const first = await publishCampaign(
      w.ctx,
      w.campaignId,
      { idempotencyKey: KEY_A, ...accept },
      w.deps,
    );
    const second = await publishCampaign(
      w.ctx,
      w.campaignId,
      { idempotencyKey: KEY_A, ...accept },
      w.deps,
    );
    expect(second).toEqual(first);
    expect(w.hooks.count('beforeSpend')).toBe(1);
    expect(w.jobs.jobs).toHaveLength(1);
    expect(rowOf(w.db, w.campaignId).publish_attempt).toBe(1);
  });

  it('la même clé rejoue aussi quand la campagne est déjà chez Meta : jamais une deuxième publication', async () => {
    const w = publishWorld();
    await publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps);
    Object.assign(rowOf(w.db, w.campaignId), { status: 'in_review' });
    const replay = await publishCampaign(
      w.ctx,
      w.campaignId,
      { idempotencyKey: KEY_A, ...accept },
      w.deps,
    );
    expect(replay.status).toBe('in_review');
    expect(w.hooks.count('beforeSpend')).toBe(1);
    expect(w.jobs.jobs).toHaveLength(1);
  });

  it('une AUTRE clé sur une campagne déjà en publication est refusée (409), sans nouveau quota', async () => {
    const w = publishWorld();
    await publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps);
    const error = await failure(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_B, ...accept }, w.deps),
    );
    expect(error.code).toBe('conflict');
    expect(error.opts.meta).toMatchObject({ reason: 'publication_in_progress' });
    expect(w.hooks.count('beforeSpend')).toBe(1);
    expect(w.jobs.jobs).toHaveLength(1);
  });

  it('deux clics simultanés avec deux clés : un seul gagne, le perdant rend le quota qu’il avait retenu', async () => {
    const w = publishWorld();
    const results = await Promise.allSettled([
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_B, ...accept }, w.deps),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect((rejected[0]?.reason as AppError).code).toBe('conflict');
    expect(w.jobs.jobs).toHaveLength(1);
    expect(rowOf(w.db, w.campaignId).publish_attempt).toBe(1);
    // Ce qui a été retenu pour le perdant est rendu : retenues = rendues + 1 gardée par la publication.
    expect(w.hooks.count('beforeSpend') - w.hooks.count('release')).toBe(1);
  });
});

describe('EC-CAMP-02 — quota atteint', () => {
  it('refuse en 402 campaign_quota_reached, garde le brouillon et ne lance rien', async () => {
    const w = publishWorld();
    w.hooks.refuseWith = new AppError('campaign_quota_reached', {
      meta: { upgrade_to: 'business' },
    });
    const error = await failure(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    );
    expect(error.code).toBe('campaign_quota_reached');
    expect(error.status).toBe(402);
    const row = rowOf(w.db, w.campaignId);
    expect(row).toMatchObject({
      status: 'draft',
      editable: true,
      publish_attempt: 0,
      quota_state: 'none',
    });
    expect(w.jobs.jobs).toEqual([]);
    // Rien n'avait été retenu : rien à rendre.
    expect(w.hooks.count('release')).toBe(0);
    // Et la clause n'est pas enregistrée pour une publication qui n'a pas eu lieu.
    expect(w.db.rows('publish_liability_acceptances')).toEqual([]);
  });
});

describe('EC-CAMP-03 — Page hors de la formule', () => {
  it('une Page non active est refusée en 402 page_limit_reached, avec la date de fin de période', async () => {
    const w = publishWorld();
    const page = w.db.rows('pages').find((p) => p.id === PAGE);
    if (page !== undefined) page.active = false;
    const error = await failure(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    );
    expect(error.code).toBe('page_limit_reached');
    expect(error.opts.meta).toMatchObject({ pages_limit: 3, available_from: PERIOD_END });
    expect(w.hooks.events).toEqual([]);
    expect(rowOf(w.db, w.campaignId).status).toBe('draft');
  });

  it('sans Page choisie, la campagne n’est pas publiable (validation_failed sur page_id)', async () => {
    const w = publishWorld({ draft: { page_id: null } });
    const error = await failure(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    );
    expect(error.code).toBe('validation_failed');
    expect(error.opts.errors?.map((e) => e.field)).toContain('page_id');
  });
});

describe('EC-CAMP-04 — date de début passée', () => {
  it('ramène le début à aujourd’hui (fuseau de l’utilisateur) et l’enregistre', async () => {
    const w = publishWorld({ draft: { start_date: '2026-10-10', end_date: '2026-10-20' } });
    await publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps);
    expect(rowOf(w.db, w.campaignId)).toMatchObject({
      start_date: '2026-10-12',
      end_date: '2026-10-20',
    });
  });

  it('refuse avec la correction proposée quand la fin devient antérieure ou égale au début', async () => {
    const w = publishWorld({ draft: { start_date: '2026-10-08', end_date: '2026-10-11' } });
    const error = await failure(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    );
    expect(error.code).toBe('validation_failed');
    expect(error.opts.errors?.[0]).toMatchObject({ field: 'end_date' });
    expect(error.opts.meta).toMatchObject({
      suggested_start_date: '2026-10-12',
      suggested_end_date: '2026-10-13',
    });
    expect(rowOf(w.db, w.campaignId)).toMatchObject({ status: 'draft', start_date: '2026-10-08' });
    expect(w.hooks.events).toEqual([]);
  });

  it('un début aujourd’hui reste aujourd’hui (jamais décalé à demain)', async () => {
    const w = publishWorld({ draft: { start_date: '2026-10-12', end_date: '2026-10-15' } });
    await publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps);
    expect(rowOf(w.db, w.campaignId).start_date).toBe('2026-10-12');
  });
});

describe('EC-CAMP-05 — le taux de change a bougé', () => {
  // Taux d'essai : 600 XAF pour 1 $ ; 5 $ par jour sur 7 jours = 35 $ = 21 000 XAF.
  const confirmed = (amountMinor: number, currency = 'XAF') => ({ amountMinor, currency });

  it('accepte le total affiché quand il est exact', async () => {
    const w = publishWorld();
    const view = await publishCampaign(
      w.ctx,
      w.campaignId,
      { idempotencyKey: KEY_A, ...accept, confirmedTotal: confirmed(21_000) },
      w.deps,
    );
    expect(view.status).toBe('publishing');
  });

  it('accepte un écart de 2 % ou moins', async () => {
    const w = publishWorld();
    // 21 000 × 1,02 = 21 420 : exactement 2 % d'écart par rapport au total recalculé.
    await expect(
      publishCampaign(
        w.ctx,
        w.campaignId,
        { idempotencyKey: KEY_A, ...accept, confirmedTotal: confirmed(21_420) },
        w.deps,
      ),
    ).resolves.toBeDefined();
  });

  it('au-delà de 2 % : 409 conflict avec le nouveau total, et rien n’est retenu', async () => {
    const w = publishWorld();
    const error = await failure(
      publishCampaign(
        w.ctx,
        w.campaignId,
        { idempotencyKey: KEY_A, ...accept, confirmedTotal: confirmed(20_000) },
        w.deps,
      ),
    );
    expect(error.code).toBe('conflict');
    expect(error.opts.meta).toMatchObject({
      reason: 'fx_changed',
      new_total: { amount_minor: 21_000, currency: 'XAF', usd_cents: 3_500 },
    });
    expect(w.hooks.events).toEqual([]);
    expect(rowOf(w.db, w.campaignId).status).toBe('draft');
  });

  it('une autre monnaie que celle recalculée est aussi un conflit (le pays du propriétaire a changé)', async () => {
    const w = publishWorld();
    const error = await failure(
      publishCampaign(
        w.ctx,
        w.campaignId,
        { idempotencyKey: KEY_A, ...accept, confirmedTotal: confirmed(21_000, 'NGN') },
        w.deps,
      ),
    );
    expect(error.opts.meta).toMatchObject({ reason: 'fx_changed' });
  });

  it('un taux disparu ou périmé (plus de 48 h) alors que l’écran affichait un total : conflit sans total', async () => {
    const w = publishWorld();
    const fx = w.db.rows('exchange_rates')[0];
    if (fx !== undefined) fx.fetched_at = '2026-10-01T00:00:00Z';
    const error = await failure(
      publishCampaign(
        w.ctx,
        w.campaignId,
        { idempotencyKey: KEY_A, ...accept, confirmedTotal: confirmed(21_000) },
        w.deps,
      ),
    );
    expect(error.opts.meta).toMatchObject({ reason: 'fx_changed', new_total: null });
  });

  it('sans total confirmé, la publication n’est pas bloquée (le total n’est pas obligatoire)', async () => {
    const w = publishWorld();
    await expect(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    ).resolves.toBeDefined();
  });
});

describe('EC-CAMP-06 — visuel absent ou expiré', () => {
  it('sans aucune photo : validation_failed sur « visual »', async () => {
    const w = publishWorld();
    w.db.rows('sources').length = 0;
    const error = await failure(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    );
    expect(error.code).toBe('validation_failed');
    expect(error.opts.errors?.[0]).toMatchObject({ field: 'visual', code: 'required' });
  });

  it('une photo dont la date d’expiration est passée : 410 gone', async () => {
    const w = publishWorld();
    const source = w.db.rows('sources').find((s) => s.id === SOURCE);
    if (source !== undefined) source.expires_at = '2026-10-11T00:00:00Z';
    const error = await failure(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    );
    expect(error.code).toBe('gone');
    expect(error.opts.meta).toMatchObject({ reason: 'visual_expired' });
    expect(w.hooks.events).toEqual([]);
  });

  it('un fichier supprimé du stockage : 410 gone', async () => {
    const w = publishWorld();
    w.db.objects.delete(`sources/${PHOTO_PATH}`);
    expect(
      await outcome(
        publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
      ),
    ).toBe('gone');
  });
});

describe('EC-CAMP-07 — republication après un refus', () => {
  it('ne retient AUCUN quota et garde l’état du quota de la première publication', async () => {
    const w = publishWorld();
    Object.assign(rowOf(w.db, w.campaignId), {
      status: 'rejected',
      quota_state: 'counted',
      publish_attempt: 1,
    });
    const view = await publishCampaign(
      w.ctx,
      w.campaignId,
      { idempotencyKey: KEY_B, ...accept },
      w.deps,
    );
    expect(view.status).toBe('publishing');
    expect(w.hooks.count('beforeSpend')).toBe(0);
    expect(rowOf(w.db, w.campaignId)).toMatchObject({ quota_state: 'counted', publish_attempt: 2 });
    expect(w.jobs.jobs[0]?.key).toBe(`campaign.publish:${w.campaignId}:2`);
  });
});

describe('Après une erreur de publication', () => {
  it('une campagne en erreur repart en publication ET retient de nouveau le quota (il avait été rendu)', async () => {
    const w = publishWorld();
    Object.assign(rowOf(w.db, w.campaignId), {
      status: 'error',
      quota_state: 'released',
      publish_attempt: 1,
    });
    await publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_B, ...accept }, w.deps);
    expect(w.hooks.count('beforeSpend')).toBe(1);
    expect(rowOf(w.db, w.campaignId)).toMatchObject({
      status: 'publishing',
      quota_state: 'held',
      publish_attempt: 2,
    });
  });
});

describe('EC-CAMP-08 — clause de responsabilité', () => {
  it('première publication sans acceptation : 400 validation_failed sur accept_liability, rien ne change', async () => {
    const w = publishWorld();
    const error = await failure(
      publishCampaign(
        w.ctx,
        w.campaignId,
        { idempotencyKey: KEY_A, acceptLiability: false },
        w.deps,
      ),
    );
    expect(error.code).toBe('validation_failed');
    expect(error.opts.errors?.[0]).toMatchObject({ field: 'accept_liability', code: 'required' });
    expect(error.opts.meta).toMatchObject({ reason: 'liability_required' });
    expect(rowOf(w.db, w.campaignId).status).toBe('draft');
    expect(w.hooks.events).toEqual([]);
    expect(w.db.rows('publish_liability_acceptances')).toEqual([]);
  });

  it('l’acceptation est enregistrée une fois, avec la date et l’utilisateur', async () => {
    const w = publishWorld();
    await publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps);
    expect(w.db.rows('publish_liability_acceptances')).toEqual([
      expect.objectContaining({
        workspace_id: W,
        accepted_by: w.ctx.user.id,
        accepted_at: NOW.toISOString(),
      }),
    ]);
  });

  it('une fois acceptée, la clause n’est plus demandée (et la première acceptation est conservée)', async () => {
    const w = publishWorld();
    w.db.rows('publish_liability_acceptances').push({
      workspace_id: W,
      accepted_by: 'ancien',
      accepted_at: '2026-09-01T00:00:00.000Z',
    });
    await publishCampaign(
      w.ctx,
      w.campaignId,
      { idempotencyKey: KEY_A, acceptLiability: false },
      w.deps,
    );
    expect(w.db.rows('publish_liability_acceptances')).toEqual([
      expect.objectContaining({ accepted_by: 'ancien', accepted_at: '2026-09-01T00:00:00.000Z' }),
    ]);
  });
});

describe('TR-PLA-10 et validation des champs', () => {
  it('un budget sous 1 $ par jour : 422 budget_too_low', async () => {
    const w = publishWorld({ draft: { daily_budget_usd_cents: 99 } });
    expect(
      await outcome(
        publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
      ),
    ).toBe('budget_too_low');
    expect(w.hooks.events).toEqual([]);
  });

  it('exactement 1 $ par jour est accepté', async () => {
    const w = publishWorld({ draft: { daily_budget_usd_cents: 100 } });
    await expect(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    ).resolves.toBeDefined();
  });

  it('liste TOUS les champs manquants d’un brouillon incomplet', async () => {
    const w = publishWorld({
      draft: {
        objective: null,
        destination: null,
        daily_budget_usd_cents: null,
        start_date: null,
        end_date: null,
        geo: {},
        copy: {},
      },
    });
    const error = await failure(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    );
    expect(error.code).toBe('validation_failed');
    expect(error.opts.errors?.map((e) => e.field).sort()).toEqual(
      [
        'copy.headline',
        'copy.primary_text',
        'daily_budget_usd_cents',
        'destination',
        'end_date',
        'geo',
        'objective',
        'start_date',
      ].sort(),
    );
  });

  it('un texte trop long est refusé comme à la modification (une seule définition des limites)', async () => {
    const w = publishWorld({
      draft: {
        copy: { primary_text: 'x'.repeat(126), headline: 'Titre', cta: 'SEND_WHATSAPP_MESSAGE' },
      },
    });
    const error = await failure(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    );
    expect(error.opts.errors?.[0]).toMatchObject({ field: 'copy.primary_text', code: 'too_long' });
  });

  it('une destination non prise en charge à la publication (application, publication existante) est refusée clairement', async () => {
    for (const destination of ['APP', 'ON_POST'] as const) {
      const w = publishWorld({
        draft: {
          objective: destination === 'APP' ? 'OUTCOME_TRAFFIC' : 'OUTCOME_ENGAGEMENT',
          destination,
          optimization_goal: destination === 'APP' ? 'LINK_CLICKS' : 'POST_ENGAGEMENT',
        },
      });
      const error = await failure(
        publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
      );
      expect(error.code).toBe('validation_failed');
      expect(error.opts.errors?.[0]).toMatchObject({ field: 'destination', code: 'unsupported' });
    }
  });
});

describe('Meta : connexion, moyen de paiement, monnaie', () => {
  it('aucun compte publicitaire : 424 meta_not_connected, rien ne change', async () => {
    const w = publishWorld({ draft: { ad_account_id: null } });
    expect(
      await outcome(
        publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
      ),
    ).toBe('meta_not_connected');
    expect(w.hooks.events).toEqual([]);
  });

  it.each(['expired', 'revoked'])(
    'connexion %s : 424 meta_token_expired (« Reconnecter »)',
    async (status) => {
      const w = publishWorld();
      const connection = w.db.rows('meta_connections')[0];
      if (connection !== undefined) connection.status = status;
      expect(
        await outcome(
          publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
        ),
      ).toBe('meta_token_expired');
    },
  );

  it('jeton dont la date est passée : 424 meta_token_expired', async () => {
    const w = publishWorld();
    const connection = w.db.rows('meta_connections')[0];
    if (connection !== undefined) connection.expires_at = '2026-10-12T08:59:00Z';
    expect(
      await outcome(
        publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
      ),
    ).toBe('meta_token_expired');
  });

  it('aucun moyen de paiement : 424 meta_payment_method_missing, brouillon gardé, quota NON décompté (APPFLOW §8.6)', async () => {
    const w = publishWorld();
    const account = w.db.rows('ad_accounts')[0];
    if (account !== undefined) account.has_payment_method = false;
    const error = await failure(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    );
    expect(error.code).toBe('meta_payment_method_missing');
    expect(error.opts.meta).toMatchObject({ reason: 'no_payment_method' });
    expect(rowOf(w.db, w.campaignId).status).toBe('draft');
    expect(w.hooks.events).toEqual([]);
  });

  it('un moyen de paiement inconnu (null) ne bloque pas : Meta tranchera, avec son message', async () => {
    const w = publishWorld();
    const account = w.db.rows('ad_accounts')[0];
    if (account !== undefined) account.has_payment_method = null;
    await expect(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    ).resolves.toBeDefined();
  });

  it('EC-META-11 : un compte en naira avec un taux frais est accepté', async () => {
    const w = publishWorld();
    const account = w.db.rows('ad_accounts')[0];
    if (account !== undefined) account.currency = 'NGN';
    w.db.rows('exchange_rates').push({
      base: 'USD',
      quote: 'NGN',
      rate: 1500,
      source: 'manual',
      fetched_at: '2026-10-12T08:00:00Z',
    });
    await expect(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    ).resolves.toBeDefined();
  });

  it('EC-META-11 : un compte hors dollar sans taux frais est refusé (aucun taux inventé), sans rien retenir', async () => {
    const w = publishWorld();
    const account = w.db.rows('ad_accounts')[0];
    if (account !== undefined) account.currency = 'NGN';
    const error = await failure(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    );
    expect(error.code).toBe('conflict');
    expect(error.opts.meta).toMatchObject({ reason: 'fx_not_available', currency: 'NGN' });
    expect(w.hooks.events).toEqual([]);
  });

  it('EC-META-11 : un taux de plus de 48 h n’est pas utilisé pour convertir un budget', async () => {
    const w = publishWorld();
    const account = w.db.rows('ad_accounts')[0];
    if (account !== undefined) account.currency = 'NGN';
    w.db.rows('exchange_rates').push({
      base: 'USD',
      quote: 'NGN',
      rate: 1500,
      source: 'manual',
      fetched_at: '2026-10-08T00:00:00Z',
    });
    expect(
      await outcome(
        publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
      ),
    ).toBe('conflict');
  });

  it('EC-META-11 : une monnaie que Meta ne connaît pas (franc CFA) est refusée avec un message clair', async () => {
    const w = publishWorld();
    const account = w.db.rows('ad_accounts')[0];
    if (account !== undefined) account.currency = 'XAF';
    const error = await failure(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    );
    expect(error.code).toBe('validation_failed');
    expect(error.opts.errors?.[0]).toMatchObject({ field: 'ad_account.currency' });
  });

  it('une monnaie de compte encore inconnue (jamais lue chez Meta) : conflit explicite', async () => {
    const w = publishWorld();
    const account = w.db.rows('ad_accounts')[0];
    if (account !== undefined) account.currency = null;
    const error = await failure(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    );
    expect(error.opts.meta).toMatchObject({ reason: 'account_currency_unknown' });
  });
});

describe('États qui ne se publient pas', () => {
  it.each([
    ['in_review', 'already_published'],
    ['active', 'already_published'],
    ['paused', 'already_published'],
    ['publishing', 'conflict'],
    ['ended', 'conflict'],
    ['stopped', 'conflict'],
  ] as const)('une campagne %s répond %s', async (status, code) => {
    const w = publishWorld();
    Object.assign(rowOf(w.db, w.campaignId), { status });
    expect(
      await outcome(
        publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
      ),
    ).toBe(code);
    expect(w.hooks.events).toEqual([]);
    expect(w.jobs.jobs).toEqual([]);
  });
});

describe('Pannes pendant la publication', () => {
  it('la tâche ne peut pas être lancée : la campagne passe en erreur, le quota est rendu, 503', async () => {
    const w = publishWorld();
    w.jobs.failWith = new Error('Trigger.dev injoignable');
    const error = await failure(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    );
    expect(error.code).toBe('provider_unavailable');
    expect(rowOf(w.db, w.campaignId)).toMatchObject({
      status: 'error',
      quota_state: 'released',
      publish_error: { code: 'provider_unavailable' },
    });
    expect(w.hooks.count('release')).toBe(1);
    expect(w.hooks.count('afterAccepted')).toBe(0);
  });

  it('une modification concurrente entre la lecture et l’écriture donne un conflit et rend le quota retenu', async () => {
    const w = publishWorld();
    w.db.beforeUpdate = (table, db) => {
      if (table !== 'campaigns') return;
      db.beforeUpdate = undefined;
      const row = db.rows('campaigns').find((r) => r.id === w.campaignId);
      if (row !== undefined) row.version = Number(row.version) + 1;
    };
    const error = await failure(
      publishCampaign(w.ctx, w.campaignId, { idempotencyKey: KEY_A, ...accept }, w.deps),
    );
    expect(error.code).toBe('conflict');
    expect(rowOf(w.db, w.campaignId).status).toBe('draft');
    expect(w.hooks.count('beforeSpend')).toBe(1);
    expect(w.hooks.count('release')).toBe(1);
    expect(w.jobs.jobs).toEqual([]);
  });
});

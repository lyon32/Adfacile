// Brouillon, lecture et modification d'une campagne (base en mémoire) : règles d'accès, validation, fusion, verrou optimiste.
import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import { createDraft } from './create-draft';
import { getCampaign } from './campaign-view';
import { updateCampaign } from './update-campaign';
import { addDraft, ANALYSIS, OTHER_W, PAGE, W, world } from './campaigns.test-helper';

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error instanceof AppError ? error.code : `autre:${String(error)}`;
  }
}

describe('createDraft', () => {
  const input = { analysis_id: ANALYSIS, page_id: PAGE, platform: 'meta' as const };

  it('crée un brouillon lié à l’analyse, à la Page et au compte publicitaire actif', async () => {
    const { ctx, db } = world();
    const draft = await createDraft(ctx, input);
    expect(draft).toMatchObject({
      status: 'draft',
      version: 1,
      analysis_id: ANALYSIS,
      page_id: PAGE,
      editable: true,
    });
    expect(draft.name).toBe('Nouvelle campagne · Sneakers Cocody');
    expect(db.rows('campaigns')[0]).toMatchObject({
      ad_account_id: 'ad1',
      created_by: ctx.user.id,
    });
  });
  it('nom par défaut en anglais, ou sans nom de commerce', async () => {
    const { ctx, db } = world();
    db.rows('business_profiles')[0]!.profile = { business_name: { value: null } };
    expect((await createDraft(ctx, input)).name).toBe('Nouvelle campagne');
    const en = world();
    en.ctx.user.locale = 'en';
    en.db.rows('business_profiles')[0]!.profile = 'illisible';
    expect((await createDraft(en.ctx, input)).name).toBe('New campaign');
  });
  it('sans compte publicitaire actif : on peut préparer quand même', async () => {
    const { ctx, db } = world();
    db.rows('ad_accounts').length = 0;
    await createDraft(ctx, input);
    expect(db.rows('campaigns')[0]?.ad_account_id).toBeNull();
  });
  it('sans Page (Meta pas connecté) : le brouillon est créé, la Page reste vide', async () => {
    const { ctx, db } = world();
    const draft = await createDraft(ctx, { analysis_id: ANALYSIS, platform: 'meta' });
    expect(draft.page_id).toBeNull();
    expect(db.rows('campaigns')[0]?.page_id).toBeNull();
  });
  it('refus : viewer, lecture seule, espace suspendu', async () => {
    expect(await code(createDraft(world({ role: 'viewer' }).ctx, input))).toBe('role_insufficient');
    expect(await code(createDraft(world({ access: 'read_only' }).ctx, input))).toBe(
      'workspace_read_only',
    );
    expect(await code(createDraft(world({ access: 'suspended' }).ctx, input))).toBe(
      'workspace_suspended',
    );
  });
  it('analyse ou Page inconnue (ou d’un autre espace) : 404', async () => {
    const { ctx } = world();
    expect(
      await code(
        createDraft(ctx, { ...input, analysis_id: '00000000-0000-4000-8000-0000000000ff' }),
      ),
    ).toBe('not_found');
    expect(
      await code(createDraft(ctx, { ...input, page_id: '00000000-0000-4000-8000-0000000000fe' })),
    ).toBe('not_found');
    const other = world();
    other.db.rows('analyses')[0]!.workspace_id = OTHER_W;
    expect(await code(createDraft(other.ctx, input))).toBe('not_found');
  });
  it('analyse pas prête : 409 avec la raison', async () => {
    const { ctx } = world({ analysisStatus: 'questions' });
    await expect(createDraft(ctx, input)).rejects.toMatchObject({
      code: 'conflict',
      opts: { meta: { reason: 'analysis_not_ready' } },
    });
  });
  it('erreur de base : internal_error', async () => {
    const { ctx, db } = world();
    db.failNext.add('campaigns:insert');
    expect(await code(createDraft(ctx, input))).toBe('internal_error');
  });
});

describe('getCampaign', () => {
  it('rend le coût calculé et le statut ; autre espace : 404', async () => {
    const { ctx, db } = world();
    const id = addDraft(db, {
      daily_budget_usd_cents: 500,
      start_date: '2026-10-13',
      end_date: '2026-10-19',
    });
    const view = await getCampaign(ctx, id);
    expect(view.cost).toMatchObject({ status: 'ok', total_usd_cents: 4174 });
    expect(view.cost.total).toEqual({ xaf: 25044, usd_cents: 4174, currency: 'XAF' });
    const stranger = world();
    stranger.db.rows('campaigns').push({ ...db.rows('campaigns')[0]!, workspace_id: OTHER_W });
    expect(await code(getCampaign(stranger.ctx, id))).toBe('not_found');
  });
  it('colonnes JSON illisibles : valeurs vides, jamais d’exception ; statut inconnu : internal_error', async () => {
    const { ctx, db } = world();
    const id = addDraft(db, { geo: 'abc', targeting: 12, copy: [], tracking: 'x' });
    const view = await getCampaign(ctx, id);
    expect(view).toMatchObject({ geo: {}, targeting: {}, copy: {}, tracking: null });
    db.rows('campaigns')[0]!.status = 'inconnu';
    expect(await code(getCampaign(ctx, id))).toBe('internal_error');
  });
  it('une campagne publiée n’est pas modifiable (editable faux)', async () => {
    const { ctx, db } = world();
    const id = addDraft(db, { status: 'active' });
    expect((await getCampaign(ctx, id)).editable).toBe(false);
  });
  it('erreur de base : internal_error', async () => {
    const { ctx, db } = world();
    const id = addDraft(db);
    db.failNext.add('campaigns:select');
    expect(await code(getCampaign(ctx, id))).toBe('internal_error');
  });
});

describe('updateCampaign', () => {
  it('fusionne copy et targeting, remplace geo, dédoublonne les intérêts, augmente la version, enregistre TVA et change', async () => {
    const { ctx, db } = world();
    const id = addDraft(db, {
      copy: { primary_text: 'Ancien texte', headline: 'Ancien titre' },
      targeting: { age_min: 20, age_max: 40, interests: [{ name: 'Sport' }] },
    });
    const view = await updateCampaign(ctx, id, {
      version: 1,
      copy: { headline: 'Nouveau titre' },
      targeting: { age_max: 50, interests: [{ name: 'Mode' }, { name: 'MODE' }] },
      geo: { countries: ['CM'], cities: [{ name: 'Douala', radius_km: 10 }] },
      daily_budget_usd_cents: 500,
      start_date: '2026-10-13',
      end_date: '2026-10-19',
      objective: 'OUTCOME_ENGAGEMENT',
      destination: 'WHATSAPP',
      name: 'Ma pub',
      ab_test: true,
      tracking: { pixel_id: '123456789012' },
    });
    expect(view).toMatchObject({
      version: 2,
      name: 'Ma pub',
      ab_test: true,
      copy: { primary_text: 'Ancien texte', headline: 'Nouveau titre' },
      targeting: { age_min: 20, age_max: 50, interests: [{ name: 'Mode' }] },
      tracking: { pixel_id: '123456789012' },
    });
    expect(db.rows('campaigns')[0]).toMatchObject({
      vat_rate: 0.1925,
      fx_rate_xaf: 600,
      version: 2,
    });
  });
  it('TVA et change absents : instantané nul, jamais une valeur par défaut', async () => {
    const { ctx, db } = world();
    db.rows('vat_rates').length = 0;
    db.rows('exchange_rates').length = 0;
    const id = addDraft(db);
    const view = await updateCampaign(ctx, id, { version: 1, name: 'x' });
    expect(view.vat_rate).toBeNull();
    expect(db.rows('campaigns')[0]).toMatchObject({ vat_rate: null, fx_rate_xaf: null });
  });
  it('refus : viewer, lecture seule, campagne introuvable ou d’un autre espace', async () => {
    const id = addDraft(world().db);
    expect(
      await code(updateCampaign(world({ role: 'viewer' }).ctx, id, { version: 1, name: 'x' })),
    ).toBe('role_insufficient');
    expect(
      await code(updateCampaign(world({ access: 'read_only' }).ctx, id, { version: 1, name: 'x' })),
    ).toBe('workspace_read_only');
    expect(await code(updateCampaign(world().ctx, id, { version: 1, name: 'x' }))).toBe(
      'not_found',
    );
  });
  it('campagne qui n’est plus un brouillon : 409 campaign_not_editable', async () => {
    const { ctx, db } = world();
    const id = addDraft(db, { status: 'active' });
    await expect(updateCampaign(ctx, id, { version: 1, name: 'x' })).rejects.toMatchObject({
      code: 'conflict',
      opts: { meta: { reason: 'campaign_not_editable', current_version: 1 } },
    });
  });
  it('version périmée : 409 avec la version actuelle, rien n’est modifié', async () => {
    const { ctx, db } = world();
    const id = addDraft(db, { version: 3 });
    await expect(updateCampaign(ctx, id, { version: 2, name: 'x' })).rejects.toMatchObject({
      opts: { meta: { current_version: 3, reason: 'stale_version' } },
    });
    expect(db.rows('campaigns')[0]?.name).toBe('Brouillon');
  });
  it('écriture concurrente entre la lecture et l’écriture : la condition de version de la base refuse', async () => {
    const { ctx, db } = world();
    const id = addDraft(db);
    db.beforeUpdate = (table, memory) => {
      if (table !== 'campaigns') return;
      memory.beforeUpdate = undefined;
      // Quelqu'un d'autre écrit juste avant nous.
      const row = memory.rows('campaigns')[0]!;
      row.version = 2;
      row.name = 'Écrit par l’autre';
    };
    await expect(updateCampaign(ctx, id, { version: 1, name: 'Le mien' })).rejects.toMatchObject({
      code: 'conflict',
      opts: { meta: { current_version: 2, reason: 'stale_version' } },
    });
    expect(db.rows('campaigns')[0]?.name).toBe('Écrit par l’autre');
  });
  it('passé à « publié » entre la lecture et l’écriture : campaign_not_editable', async () => {
    const { ctx, db } = world();
    const id = addDraft(db);
    db.beforeUpdate = (table, memory) => {
      if (table !== 'campaigns') return;
      memory.beforeUpdate = undefined;
      memory.rows('campaigns')[0]!.status = 'publishing';
    };
    await expect(updateCampaign(ctx, id, { version: 1, name: 'x' })).rejects.toMatchObject({
      opts: { meta: { reason: 'campaign_not_editable' } },
    });
  });
  it('aucun champ à modifier : 400', async () => {
    const { ctx, db } = world();
    const id = addDraft(db);
    expect(await code(updateCampaign(ctx, id, { version: 1 }))).toBe('validation_failed');
  });
  it('validation : budget, dates, textes (champ par champ)', async () => {
    const { ctx, db } = world();
    const id = addDraft(db);
    expect(await code(updateCampaign(ctx, id, { version: 1, daily_budget_usd_cents: 99 }))).toBe(
      'budget_too_low',
    );
    const failure = await updateCampaign(ctx, id, {
      version: 1,
      start_date: '2026-10-01',
      copy: { headline: 'x'.repeat(41) },
    }).catch((e: unknown) => e);
    if (!(failure instanceof AppError)) throw new Error('AppError attendue');
    expect(failure.code).toBe('validation_failed');
    expect(failure.opts.errors?.map((e) => e.field).sort()).toEqual([
      'copy.headline',
      'start_date',
    ]);
    expect(db.rows('campaigns')[0]?.version).toBe(1);
  });
  it('pixel : de la Page seulement ; campagne sans Page : refusé', async () => {
    const { ctx, db } = world();
    const id = addDraft(db);
    expect(
      await code(updateCampaign(ctx, id, { version: 1, tracking: { pixel_id: '999999999999' } })),
    ).toBe('validation_failed');
    const none = addDraft(db, { page_id: null });
    expect(
      await code(updateCampaign(ctx, none, { version: 1, tracking: { pixel_id: '123456789012' } })),
    ).toBe('validation_failed');
    expect(await code(updateCampaign(ctx, id, { version: 1, tracking: null }))).toBe('ok');
  });
  it('contrainte de la base (23514) : validation_failed, jamais un 500 muet ; autre erreur : internal_error', async () => {
    const { ctx, db } = world();
    const id = addDraft(db);
    db.failNext.add('campaigns:update');
    expect(await code(updateCampaign(ctx, id, { version: 1, name: 'x' }))).toBe('internal_error');
    db.failNext.add('campaigns:update');
    db.failCodes['campaigns:update'] = '23514';
    expect(await code(updateCampaign(ctx, id, { version: 1, name: 'y' }))).toBe(
      'validation_failed',
    );
  });
  it('workspace : filtre toujours sur l’espace (autre espace = introuvable)', async () => {
    const { ctx, db } = world();
    const id = addDraft(db, { workspace_id: OTHER_W });
    expect(await code(updateCampaign(ctx, id, { version: 1, name: 'x' }))).toBe('not_found');
    expect(W).not.toBe(OTHER_W);
  });
});

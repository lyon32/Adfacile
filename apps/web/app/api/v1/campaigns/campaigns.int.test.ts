// Routes « campagnes » contre la pile Supabase locale (vraie base, vraie RLS) : brouillon, lecture, modification avec
// verrou optimiste (EC-TEAM-08), coût (sans TVA). Les 5 cas de chaque route (API_SPEC §15) + les cas propres.
import {
  describeRoute,
  na,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { beforeAll, expect } from 'vitest';
import {
  create,
  ensureTestFx,
  inDays,
  json,
  newDraft,
  patch,
  read,
  seedPage,
  seedReadyAnalysis,
  setOwnerCountry,
  type CampaignBody,
} from './int-support';

let s: SeededWorkspace;
beforeAll(async () => {
  s = await seedWorkspace();
  await ensureTestFx();
});

const asBody = async (res: Response): Promise<CampaignBody> =>
  (await json(res)) as unknown as CampaignBody;
const problemOf = async (res: Response) =>
  (await json(res)) as unknown as {
    code: string;
    status: number;
    errors?: { field: string; code: string }[];
    meta?: Record<string, unknown>;
  };

describeRoute('createCampaign', {
  success: async () => {
    const pageId = await seedPage(s);
    const analysisId = await seedReadyAnalysis(s, pageId);
    const res = await create(s, s.owner, {
      analysis_id: analysisId,
      page_id: pageId,
      platform: 'meta',
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('location')).toMatch(/\/campaigns\/[0-9a-f-]{36}$/);
    const draft = await asBody(res);
    expect(draft).toMatchObject({
      status: 'draft',
      version: 1,
      editable: true,
      analysis_id: analysisId,
      page_id: pageId,
      objective: null,
      daily_budget_usd_cents: null,
    });
    expect(draft.name).toContain('Chez Awa');
    expect(draft.cost.status).toBe('incomplete');
    // Un éditeur peut aussi créer.
    const editorRes = await create(s, s.editor, {
      analysis_id: analysisId,
      page_id: pageId,
      platform: 'meta',
    });
    expect(editorRes.status).toBe(201);
  },
  unauthenticated: async () => {
    const res = await create(s, { ...s.owner, headers: {} }, {});
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    const other = { ...s, workspace: s.strangerWorkspace };
    const res = await create(other, s.owner, {
      analysis_id: crypto.randomUUID(),
      page_id: crypto.randomUUID(),
      platform: 'meta',
    });
    expect(res.status).toBe(404);
  },
  forbiddenRole: async () => {
    const res = await create(s, s.viewer, {
      analysis_id: crypto.randomUUID(),
      page_id: crypto.randomUUID(),
      platform: 'meta',
    });
    expect(res.status).toBe(403);
    expect((await problemOf(res)).code).toBe('role_insufficient');
  },
  invalidBody: async () => {
    const good = {
      analysis_id: crypto.randomUUID(),
      page_id: crypto.randomUUID(),
      platform: 'meta',
    };
    expect((await create(s, s.owner, {})).status).toBe(400);
    expect((await create(s, s.owner, { ...good, platform: 'google' })).status).toBe(400);
    expect((await create(s, s.owner, { ...good, analysis_id: 'pas-un-uuid' })).status).toBe(400);
    expect((await create(s, s.owner, { ...good, status: 'active' })).status).toBe(400);
  },
  extra: {
    'analyse d’un autre espace ou inconnue : 404': async () => {
      const pageId = await seedPage(s);
      const res = await create(s, s.owner, {
        analysis_id: crypto.randomUUID(),
        page_id: pageId,
        platform: 'meta',
      });
      expect(res.status).toBe(404);
      const foreignPage = await seedPage({ ...s, workspace: s.strangerWorkspace });
      const analysisId = await seedReadyAnalysis(s, pageId);
      const res2 = await create(s, s.owner, {
        analysis_id: analysisId,
        page_id: foreignPage,
        platform: 'meta',
      });
      expect(res2.status).toBe(404);
    },
    'sans Page (Meta pas connecté) : 201, page_id vide': async () => {
      const pageId = await seedPage(s);
      const analysisId = await seedReadyAnalysis(s, pageId);
      const res = await create(s, s.owner, { analysis_id: analysisId, platform: 'meta' });
      expect(res.status).toBe(201);
      expect((await asBody(res)).page_id).toBeNull();
    },
    'analyse pas encore répondue : 409 conflict (analysis_not_ready)': async () => {
      const pageId = await seedPage(s);
      const analysisId = await seedReadyAnalysis(s, pageId, 'questions');
      const res = await create(s, s.owner, {
        analysis_id: analysisId,
        page_id: pageId,
        platform: 'meta',
      });
      expect(res.status).toBe(409);
      expect((await problemOf(res)).meta).toMatchObject({ reason: 'analysis_not_ready' });
    },
    'espace en lecture seule : 403 workspace_read_only': async () => {
      const ro = await seedWorkspace({ status: 'read_only' });
      const res = await create(ro, ro.owner, {
        analysis_id: crypto.randomUUID(),
        page_id: crypto.randomUUID(),
        platform: 'meta',
      });
      expect(res.status).toBe(403);
      expect((await problemOf(res)).code).toBe('workspace_read_only');
    },
  },
});

describeRoute('getCampaign', {
  success: async () => {
    const draft = await newDraft(s);
    for (const who of [s.owner, s.editor, s.viewer]) {
      const res = await read(s, who, draft.id);
      expect(res.status).toBe(200);
      expect((await asBody(res)).id).toBe(draft.id);
    }
  },
  unauthenticated: async () => {
    const draft = await newDraft(s);
    expect((await read(s, { ...s.owner, headers: {} }, draft.id)).status).toBe(401);
  },
  otherWorkspace: async () => {
    const draft = await newDraft(s);
    // Le propriétaire d'un autre espace ne la voit pas : 404, jamais 403.
    const stranger = { ...s, workspace: s.strangerWorkspace };
    expect((await read(stranger, s.owner, draft.id)).status).toBe(404);
    const strangerSelf = await seedWorkspace();
    expect((await read(strangerSelf, strangerSelf.owner, draft.id)).status).toBe(404);
  },
  forbiddenRole: na('la lecture est permise à tout membre, y compris « viewer » (API_SPEC §2.3)'),
  invalidBody: na('GET sans corps ; l’identifiant mal formé est testé ci-dessous'),
  extra: {
    'identifiant mal formé : 400': async () => {
      expect((await read(s, s.owner, 'pas-un-uuid')).status).toBe(400);
    },
    'identifiant inconnu : 404': async () => {
      expect((await read(s, s.owner, crypto.randomUUID())).status).toBe(404);
    },
  },
});

describeRoute('updateCampaign', {
  success: async () => {
    await setOwnerCountry(s, 'CM');
    const draft = await newDraft(s);
    const res = await patch(s, s.owner, draft.id, {
      version: 1,
      name: 'Ma pub',
      objective: 'OUTCOME_ENGAGEMENT',
      destination: 'WHATSAPP',
      daily_budget_usd_cents: 500,
      start_date: inDays(2),
      end_date: inDays(8),
      copy: {
        primary_text: 'Baskets à Cocody 👟',
        headline: 'Livraison 24 h',
        cta: 'SEND_WHATSAPP_MESSAGE',
      },
      geo: { countries: ['CM'], cities: [{ name: 'Douala', radius_km: 10 }] },
      targeting: {
        age_min: 18,
        age_max: 45,
      },
    });
    expect(res.status).toBe(200);
    const updated = await asBody(res);
    expect(updated).toMatchObject({
      version: 2,
      name: 'Ma pub',
      objective: 'OUTCOME_ENGAGEMENT',
      daily_budget_usd_cents: 500,
    });
    expect(updated.targeting).toMatchObject({ age_min: 18, age_max: 45 });
    // Coût : 7 jours × 500 centimes = 3 500 centimes, change lu en base, aucune TVA (retirée le 17/10/2026).
    const fx = (
      await testServiceClient()
        .from('exchange_rates')
        .select('rate')
        .eq('quote', 'XAF')
        .order('fetched_at', { ascending: false })
        .limit(1)
        .single()
    ).data?.rate;
    expect(updated.cost).toMatchObject({
      status: 'ok',
      days: 7,
      budget_usd_cents: 3500,
    });
    expect(updated.cost.total?.local_minor).toBe(Math.round((3500 * (fx ?? 0)) / 100));
    expect(updated.cost.total?.currency).toBe('XAF');
    expect(updated.cost).not.toHaveProperty('vat_rate');
    expect(updated).not.toHaveProperty('vat_rate');
    // Une seconde modification repart de la version rendue.
    const second = await patch(s, s.owner, draft.id, {
      version: 2,
      copy: { headline: 'Nouveau titre' },
    });
    expect(second.status).toBe(200);
    const after = await asBody(second);
    expect(after.version).toBe(3);
    // Fusion champ par champ : le texte principal est resté.
    expect(after.copy).toMatchObject({
      headline: 'Nouveau titre',
      primary_text: 'Baskets à Cocody 👟',
    });
  },
  unauthenticated: async () => {
    const draft = await newDraft(s);
    expect(
      (await patch(s, { ...s.owner, headers: {} }, draft.id, { version: 1, name: 'x' })).status,
    ).toBe(401);
  },
  otherWorkspace: async () => {
    const draft = await newDraft(s);
    const stranger = await seedWorkspace();
    expect(
      (await patch(stranger, stranger.owner, draft.id, { version: 1, name: 'pirate' })).status,
    ).toBe(404);
    const row = await testServiceClient()
      .from('campaigns')
      .select('name')
      .eq('id', draft.id)
      .single();
    expect(row.data?.name).not.toBe('pirate');
  },
  forbiddenRole: async () => {
    const draft = await newDraft(s);
    const res = await patch(s, s.viewer, draft.id, { version: 1, name: 'x' });
    expect(res.status).toBe(403);
    expect((await problemOf(res)).code).toBe('role_insufficient');
  },
  invalidBody: async () => {
    const draft = await newDraft(s);
    expect((await patch(s, s.owner, draft.id, { name: 'sans version' })).status).toBe(400);
    expect((await patch(s, s.owner, draft.id, { version: 0, name: 'x' })).status).toBe(400);
    expect((await patch(s, s.owner, draft.id, { version: 1, status: 'active' })).status).toBe(400);
    expect((await patch(s, s.owner, draft.id, { version: 1, vat_rate: 0 })).status).toBe(400); // plus aucun champ de TVA dans le contrat
    expect(
      (await patch(s, s.owner, draft.id, { version: 1, objective: 'OUTCOME_LEADS' })).status,
    ).toBe(400);
    expect(
      (await patch(s, s.owner, draft.id, { version: 1, daily_budget_usd_cents: 5.5 })).status,
    ).toBe(400);
    expect((await patch(s, s.owner, draft.id, { version: 1 })).status).toBe(400); // aucun champ
    expect((await patch(s, s.owner, draft.id, { version: 1, copy: { unknown: 'x' } })).status).toBe(
      400,
    );
    // Aucune de ces tentatives n'a modifié la campagne.
    expect((await asBody(await read(s, s.owner, draft.id))).version).toBe(1);
  },
  extra: {
    'EC-TEAM-08 : version périmée → 409 conflict avec meta.current_version, rien n’est modifié':
      async () => {
        const draft = await newDraft(s);
        expect((await patch(s, s.owner, draft.id, { version: 1, name: 'Première' })).status).toBe(
          200,
        );
        const stale = await patch(s, s.editor, draft.id, { version: 1, name: 'Seconde' });
        expect(stale.status).toBe(409);
        const problem = await problemOf(stale);
        expect(problem.code).toBe('conflict');
        expect(problem.meta).toMatchObject({ current_version: 2, reason: 'stale_version' });
        expect((await asBody(await read(s, s.owner, draft.id))).name).toBe('Première');
      },
    'EC-TEAM-08 : deux modifications SIMULTANÉES de la même version, une seule gagne': async () => {
      const draft = await newDraft(s);
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          patch(s, i % 2 === 0 ? s.owner : s.editor, draft.id, {
            version: 1,
            name: `Concurrent ${String(i)}`,
          }),
        ),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((x) => x === 200)).toHaveLength(1);
      expect(statuses.filter((x) => x === 409)).toHaveLength(7);
      const winner = await asBody(await read(s, s.owner, draft.id));
      expect(winner.version).toBe(2);
      const name = winner.name;
      const idx = results.findIndex((r) => r.status === 200);
      expect(name).toBe(`Concurrent ${String(idx)}`);
    },
    'budget sous 1 $ : 422 budget_too_low ; au-dessus de 10 000 $ : 400': async () => {
      const draft = await newDraft(s);
      const low = await patch(s, s.owner, draft.id, { version: 1, daily_budget_usd_cents: 99 });
      expect(low.status).toBe(422);
      const problem = await problemOf(low);
      expect(problem.code).toBe('budget_too_low');
      expect(problem.meta).toMatchObject({ min_usd_cents: 100 });
      expect(
        (await patch(s, s.owner, draft.id, { version: 1, daily_budget_usd_cents: 1_000_001 }))
          .status,
      ).toBe(400);
      expect(
        (await patch(s, s.owner, draft.id, { version: 1, daily_budget_usd_cents: 100 })).status,
      ).toBe(200);
    },
    'dates : début passé, fin avant début, plus de 365 jours : 400 champ par champ': async () => {
      const draft = await newDraft(s);
      const past = await patch(s, s.owner, draft.id, {
        version: 1,
        start_date: '2020-01-01',
        end_date: inDays(5),
      });
      expect(past.status).toBe(400);
      expect((await problemOf(past)).errors).toContainEqual(
        expect.objectContaining({ field: 'start_date' }),
      );
      const reverse = await patch(s, s.owner, draft.id, {
        version: 1,
        start_date: inDays(9),
        end_date: inDays(4),
      });
      expect(reverse.status).toBe(400);
      const long = await patch(s, s.owner, draft.id, {
        version: 1,
        start_date: inDays(2),
        end_date: inDays(400),
      });
      expect(long.status).toBe(400);
      expect((await problemOf(long)).errors?.[0]).toMatchObject({
        field: 'end_date',
        code: 'too_large',
      });
    },
    'durée : 365 jours début et fin compris acceptés, 366 et un seul jour refusés (SECURITY_NOTES §3.2)':
      async () => {
        const draft = await newDraft(s);
        const full = await patch(s, s.owner, draft.id, {
          version: 1,
          start_date: inDays(2),
          end_date: inDays(2 + 364),
        });
        expect(full.status).toBe(200);
        const tooLong = await patch(s, s.owner, draft.id, {
          version: 2,
          start_date: inDays(2),
          end_date: inDays(2 + 365),
        });
        expect(tooLong.status).toBe(400);
        expect((await problemOf(tooLong)).errors?.[0]).toMatchObject({
          field: 'end_date',
          code: 'too_large',
        });
        const oneDay = await patch(s, s.owner, draft.id, {
          version: 2,
          start_date: inDays(2),
          end_date: inDays(2),
        });
        expect(oneDay.status).toBe(400);
      },
    'DÉCISION 16/10/2026 : les centres d’intérêt ne font plus partie du contrat (ciblage automatique d’abord) : 400':
      async () => {
        const draft = await newDraft(s);
        const res = await patch(s, s.owner, draft.id, {
          version: 1,
          targeting: { interests: [{ name: 'Mode' }] },
        });
        expect(res.status).toBe(400);
        const after = await asBody(await read(s, s.owner, draft.id));
        expect(after.version).toBe(1);
      },
    'textes : trop longs, HTML, objectif et destination incompatibles : 400': async () => {
      const draft = await newDraft(s);
      const long = await patch(s, s.owner, draft.id, {
        version: 1,
        copy: { headline: 'x'.repeat(41) },
      });
      expect((await problemOf(long)).errors?.[0]).toMatchObject({
        field: 'copy.headline',
        code: 'too_long',
      });
      const html = await patch(s, s.owner, draft.id, {
        version: 1,
        copy: { primary_text: '<img src=x onerror=alert(1)>' },
      });
      expect((await problemOf(html)).errors?.[0]).toMatchObject({
        field: 'copy.primary_text',
        code: 'invalid_format',
      });
      const mismatch = await patch(s, s.owner, draft.id, {
        version: 1,
        objective: 'OUTCOME_TRAFFIC',
        destination: 'WHATSAPP',
      });
      expect((await problemOf(mismatch)).errors?.[0]).toMatchObject({ field: 'destination' });
    },
    'pixel qui n’appartient pas à la Page : 400 ; pixel de la Page : 200': async () => {
      const draft = await newDraft(s);
      const bad = await patch(s, s.owner, draft.id, {
        version: 1,
        tracking: { pixel_id: '999999999999' },
      });
      expect(bad.status).toBe(400);
      expect((await problemOf(bad)).errors?.[0]).toMatchObject({ field: 'tracking.pixel_id' });
      const good = await patch(s, s.owner, draft.id, {
        version: 1,
        tracking: { pixel_id: '123456789012' },
      });
      expect(good.status).toBe(200);
      expect((await asBody(good)).tracking).toEqual({ pixel_id: '123456789012' });
    },
    'S15b : propriétaire au Nigeria — coût en naira, en kobo (2 décimales), avec le taux de la base (valeur d’essai)': async () => {
      await ensureTestFx('NGN', 1500);
      const ng = await seedWorkspace();
      await setOwnerCountry(ng, 'NG');
      const draft = await newDraft(ng);
      const res = await patch(ng, ng.owner, draft.id, {
        version: 1,
        daily_budget_usd_cents: 500,
        start_date: inDays(2),
        end_date: inDays(8),
      });
      expect(res.status).toBe(200);
      const body = await asBody(res);
      const rate = (
        await testServiceClient()
          .from('exchange_rates')
          .select('rate')
          .eq('quote', 'NGN')
          .order('fetched_at', { ascending: false })
          .limit(1)
          .single()
      ).data?.rate;
      expect(body.cost.status).toBe('ok');
      expect(body.cost.total?.currency).toBe('NGN');
      // 3 500 centimes = 35 $ ; en kobo : 35 × taux × 100.
      expect(body.cost.total?.local_minor).toBe(Math.round((3500 * (rate ?? 0) * 100) / 100));
      expect(body.cost).not.toHaveProperty('xaf');
      const row = await testServiceClient()
        .from('campaigns')
        .select('fx_currency, fx_rate_xaf')
        .eq('id', draft.id)
        .single();
      expect(row.data?.fx_currency).toBe('NGN');
      expect(row.data?.fx_rate_xaf).toBe(rate);
    },
    'pays du propriétaire inconnu : taux de change indisponible, le coût reste en dollars, rien n’est inventé':
      async () => {
        const other = await seedWorkspace();
        await setOwnerCountry(other, null);
        const draft = await newDraft(other);
        const res = await patch(other, other.owner, draft.id, {
          version: 1,
          daily_budget_usd_cents: 500,
          start_date: inDays(2),
          end_date: inDays(8),
        });
        expect(res.status).toBe(200);
        const body = await asBody(res);
        expect(body.cost).toMatchObject({
          status: 'fx_not_available',
          days: 7,
          budget_usd_cents: 3500,
          total: null,
          daily: null,
        });
      },
    'campagne déjà publiée (statut ≠ brouillon) : 409 campaign_not_editable': async () => {
      const draft = await newDraft(s);
      const moved = await testServiceClient()
        .from('campaigns')
        .update({ status: 'publishing' })
        .eq('id', draft.id);
      expect(moved.error).toBeNull();
      const res = await patch(s, s.owner, draft.id, { version: 2, name: 'x' });
      expect(res.status).toBe(409);
      expect((await problemOf(res)).meta).toMatchObject({ reason: 'campaign_not_editable' });
    },
    'espace en lecture seule : 403 workspace_read_only, rien n’est modifié': async () => {
      const ro = await seedWorkspace();
      const draft = await newDraft(ro);
      await testServiceClient()
        .from('workspaces')
        .update({ status: 'read_only' })
        .eq('id', ro.workspace.id);
      const res = await patch(ro, ro.owner, draft.id, { version: 1, name: 'x' });
      expect(res.status).toBe(403);
      expect((await problemOf(res)).code).toBe('workspace_read_only');
    },
  },
});

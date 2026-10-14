// Pages Facebook contre la pile Supabase locale et la fausse Meta : les 5 cas de chaque route
// (API_SPEC §15), limite de la formule (TR-PLA-08), verrou de la période (APPFLOW §6.2).
import { randomUUID } from 'node:crypto';
import {
  describeRoute,
  na,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { beforeAll, expect } from 'vitest';
import { GET as listPages } from '../workspaces/[workspaceId]/pages/route';
import { PATCH as updatePage } from '../workspaces/[workspaceId]/pages/[pageId]/route';
import { call, connectWorkspace, json, ws } from './int-support';

let seeded: SeededWorkspace;

beforeAll(async () => {
  seeded = await seedWorkspace();
});

const pageParams = (workspaceId: string, pageId: string) => ({
  params: Promise.resolve({ workspaceId, pageId }),
});

/** Espace connecté à Meta (la fausse Meta renvoie une Page, choisie d'office) + Pages ajoutées. */
async function connectedWith(extraPages: number, plan?: 'pro') {
  const s = await seedWorkspace();
  await connectWorkspace(s);
  const svc = testServiceClient();
  if (plan !== undefined) {
    const now = Date.now();
    const sub = await svc.from('subscriptions').insert({
      workspace_id: s.workspace.id,
      plan_code: plan,
      status: 'active',
      period_start: new Date(now - 86_400_000).toISOString(),
      period_end: new Date(now + 29 * 86_400_000).toISOString(),
    });
    expect(sub.error).toBeNull();
  }
  for (let i = 0; i < extraPages; i += 1) {
    const r = await svc.from('pages').insert({
      workspace_id: s.workspace.id,
      meta_page_id: `20000000010${String(i)}`,
      name: `Page ${String(i)}`,
    });
    expect(r.error).toBeNull();
  }
  const { data } = await svc
    .from('pages')
    .select('id, meta_page_id, active, name')
    .eq('workspace_id', s.workspace.id)
    .order('meta_page_id');
  const pages = data ?? [];
  const first = pages.find((p) => p.active);
  const others = pages.filter((p) => !p.active);
  if (first === undefined) throw new Error('Page active attendue');
  return { s, first, others };
}

function patch(s: SeededWorkspace, user: SeededWorkspace['owner'], pageId: string, body: unknown) {
  return updatePage(
    call('PATCH', `/workspaces/${s.workspace.id}/pages/${pageId}`, user.headers, body),
    pageParams(s.workspace.id, pageId),
  );
}

describeRoute('listPages', {
  success: async () => {
    const { s, first } = await connectedWith(1);
    for (const user of [s.owner, s.editor, s.viewer]) {
      const res = await listPages(
        call('GET', `/workspaces/${s.workspace.id}/pages`, user.headers),
        ws(s.workspace.id),
      );
      expect(res.status).toBe(200);
      const body = (await json(res)) as {
        data: { id: string; active: boolean; locked_for_period: boolean; ad_address: string }[];
        quotas: { pages_active: number; pages_limit: number };
      };
      expect(body.data).toHaveLength(2);
      expect(body.data.find((p) => p.id === first.id)).toMatchObject({
        active: true,
        locked_for_period: false,
        ad_address: 'vous',
      });
      expect(body.quotas).toEqual({ pages_active: 1, pages_limit: 1 });
      expect(JSON.stringify(body)).not.toMatch(/token|sealed/i);
    }
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    expect((await listPages(call('GET', `/workspaces/${id}/pages`, {}), ws(id))).status).toBe(401);
  },
  otherWorkspace: async () => {
    const id = seeded.strangerWorkspace.id;
    const res = await listPages(
      call('GET', `/workspaces/${id}/pages`, seeded.owner.headers),
      ws(id),
    );
    expect(res.status).toBe(404);
  },
  forbiddenRole: na('tout membre voit les Pages (SECURITY_NOTES §2.3)'),
  invalidBody: na('GET sans corps'),
  extra: {
    'APPFLOW §6.2 : une Page verrouillée pour la période est signalée': async () => {
      const { s, first } = await connectedWith(0);
      const { data: sub } = await testServiceClient()
        .from('subscriptions')
        .insert({
          workspace_id: s.workspace.id,
          plan_code: 'starter',
          status: 'active',
          period_start: '2026-10-01T00:00:00Z',
          period_end: '2026-10-31T00:00:00Z',
        })
        .select('period_start')
        .single();
      await testServiceClient()
        .from('page_activations')
        .insert({
          workspace_id: s.workspace.id,
          page_id: first.id,
          period_start: sub?.period_start ?? '',
          first_campaign_at: '2026-10-05T10:00:00Z',
        });
      const res = await listPages(
        call('GET', `/workspaces/${s.workspace.id}/pages`, s.owner.headers),
        ws(s.workspace.id),
      );
      const body = (await json(res)) as { data: { id: string; locked_for_period: boolean }[] };
      expect(body.data.find((p) => p.id === first.id)?.locked_for_period).toBe(true);
    },
  },
});

describeRoute('updatePage', {
  success: async () => {
    const { s, first, others } = await connectedWith(1);
    const second = others[0]?.id ?? '';
    // Changer de Page : désactiver l'actuelle, activer l'autre (Starter : une seule Page).
    const off = await patch(s, s.owner, first.id, { active: false });
    expect(off.status).toBe(200);
    expect(await json(off)).toMatchObject({ id: first.id, active: false });
    const on = await patch(s, s.owner, second, { active: true });
    expect(on.status).toBe(200);
    expect(await json(on)).toMatchObject({ id: second, active: true });
    // L'éditeur règle la langue et le ton des pubs, pas l'activation.
    const settings = await patch(s, s.editor, second, { ad_language: 'en', ad_address: 'tu' });
    expect(settings.status).toBe(200);
    expect(await json(settings)).toMatchObject({
      ad_language: 'en',
      ad_address: 'tu',
      active: true,
    });
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    const pageId = randomUUID();
    const res = await updatePage(
      call('PATCH', `/workspaces/${id}/pages/${pageId}`, {}, { active: true }),
      pageParams(id, pageId),
    );
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    const { s, first } = await connectedWith(0);
    // Page d'un autre espace, dans mon espace ou dans le sien : toujours 404, rien ne change.
    const mine = await patch(s, s.stranger, first.id, { ad_language: 'en' });
    expect(mine.status).toBe(404);
    const res = await updatePage(
      call('PATCH', `/workspaces/${s.strangerWorkspace.id}/pages/${first.id}`, s.stranger.headers, {
        ad_language: 'en',
      }),
      pageParams(s.strangerWorkspace.id, first.id),
    );
    expect(res.status).toBe(404);
    const row = await testServiceClient()
      .from('pages')
      .select('ad_language')
      .eq('id', first.id)
      .single();
    expect(row.data?.ad_language).toBe('fr');
  },
  forbiddenRole: async () => {
    const { s, first, others } = await connectedWith(1);
    expect((await patch(s, s.viewer, first.id, { ad_language: 'en' })).status).toBe(403);
    // L'éditeur ne peut pas activer ni désactiver une Page (propriétaire seulement).
    const res = await patch(s, s.editor, others[0]?.id ?? '', { active: true });
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('role_insufficient');
    expect((await patch(s, s.editor, first.id, { active: false })).status).toBe(403);
  },
  invalidBody: async () => {
    const { s, first } = await connectedWith(0);
    for (const body of [
      {},
      { active: 'oui' },
      { ad_language: 'de' },
      { ad_address: 'on' },
      { inconnu: 1 },
    ]) {
      expect((await patch(s, s.owner, first.id, body)).status).toBe(400);
    }
    const bad = await updatePage(
      call('PATCH', `/workspaces/${s.workspace.id}/pages/pas-un-uuid`, s.owner.headers, {
        active: true,
      }),
      pageParams(s.workspace.id, 'pas-un-uuid'),
    );
    expect(bad.status).toBe(400);
  },
  extra: {
    'TR-PLA-08 : au-delà de la limite de la formule → 402 page_limit_reached avec la formule à proposer':
      async () => {
        const { s, others } = await connectedWith(1);
        const second = others[0]?.id ?? '';
        const res = await patch(s, s.owner, second, { active: true });
        expect(res.status).toBe(402);
        const body = await json(res);
        expect(body.code).toBe('page_limit_reached');
        expect(body.meta).toMatchObject({ pages_limit: 1, upgrade_to: 'pro' });
        const row = await testServiceClient()
          .from('pages')
          .select('active')
          .eq('id', second)
          .single();
        expect(row.data?.active).toBe(false);
      },
    'la formule Pro permet 3 Pages actives, pas 4': async () => {
      const { s, others } = await connectedWith(3, 'pro');
      for (const page of others.slice(0, 2)) {
        expect((await patch(s, s.owner, page.id, { active: true })).status).toBe(200);
      }
      const res = await patch(s, s.owner, others[2]?.id ?? '', { active: true });
      expect(res.status).toBe(402);
      expect((await json(res)).meta).toMatchObject({ pages_limit: 3, upgrade_to: 'business' });
    },
    'APPFLOW §6.2 : une Page verrouillée pour la période ne se désactive pas (409, page_locked)':
      async () => {
        const { s, first } = await connectedWith(0, 'pro');
        const { data: sub } = await testServiceClient()
          .from('subscriptions')
          .select('period_start')
          .eq('workspace_id', s.workspace.id)
          .single();
        await testServiceClient()
          .from('page_activations')
          .insert({
            workspace_id: s.workspace.id,
            page_id: first.id,
            period_start: sub?.period_start ?? '',
            first_campaign_at: new Date().toISOString(),
          });
        const res = await patch(s, s.owner, first.id, { active: false });
        expect(res.status).toBe(409);
        expect((await json(res)).meta).toMatchObject({ reason: 'page_locked' });
        const row = await testServiceClient()
          .from('pages')
          .select('active')
          .eq('id', first.id)
          .single();
        expect(row.data?.active).toBe(true);
      },
    'un espace en lecture seule refuse la modification (403 workspace_read_only)': async () => {
      const { s, first } = await connectedWith(0);
      await testServiceClient()
        .from('workspaces')
        .update({ status: 'read_only' })
        .eq('id', s.workspace.id);
      const res = await patch(s, s.owner, first.id, { ad_language: 'en' });
      expect(res.status).toBe(403);
      expect((await json(res)).code).toBe('workspace_read_only');
    },
    'activation refusée : la langue demandée dans la même requête n’est pas appliquée':
      async () => {
        const { s, others } = await connectedWith(1);
        const second = others[0]?.id ?? '';
        const res = await patch(s, s.owner, second, { active: true, ad_language: 'en' });
        expect(res.status).toBe(402);
        const row = await testServiceClient()
          .from('pages')
          .select('ad_language')
          .eq('id', second)
          .single();
        expect(row.data?.ad_language).toBe('fr');
      },
  },
});

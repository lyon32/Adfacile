// Routes « propositions » contre la pile Supabase locale (vraie base, vraie RLS) avec la FAUSSE passerelle IA (aucun appel
// payant) : génération idempotente (jamais deux appels pour une même clé), échecs, choix, revalidation par le serveur.
import { randomUUID } from 'node:crypto';
import {
  describeRoute,
  na,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { AppError } from '@pubeka/contracts';
import { beforeAll, beforeEach, expect, vi } from 'vitest';
import { fakeProposalDeps, type FakeProposalRun } from '@pubeka/core';
import {
  call,
  campaignParams,
  ensureTestFx,
  ensureTestVat,
  json,
  newDraft,
  patch,
  read,
  resetRateLimits,
  setOwnerCountry,
  type CampaignBody,
} from './int-support';
import {
  GET as listRoute,
  POST as generateRoute,
} from '../workspaces/[workspaceId]/campaigns/[campaignId]/proposals/route';
import { POST as chooseRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/proposals/[version]/choose/route';

const state = vi.hoisted(() => ({ current: undefined as undefined | { deps: unknown } }));
vi.mock('./services', () => ({
  proposalDeps: () => {
    if (state.current === undefined) throw new Error('fausses dépendances absentes');
    return state.current.deps;
  },
}));

let s: SeededWorkspace;
let fake: FakeProposalRun;
beforeAll(async () => {
  s = await seedWorkspace();
  await ensureTestFx();
  await ensureTestVat('CM', 0.1925);
  await setOwnerCountry(s, 'CM');
});
beforeEach(async () => {
  await resetRateLimits();
  fake = fakeProposalDeps();
  state.current = fake;
});

type Who = SeededWorkspace['owner'];
interface ProposalBody {
  version: number;
  status: string;
  chosen: boolean;
  proposal: {
    objective: string;
    destination: string;
    warnings: string[];
    budget: { daily_usd_cents: number };
    schedule: { start_date: string; end_date: string };
    copy: { angle: string; headline: string; primary_text: string };
  };
  cost: { status: string; total_usd_cents: number | null };
}
interface Problem {
  code: string;
  status: number;
  errors?: { field: string; code: string }[];
  meta?: Record<string, unknown>;
  retry_after_s?: number;
}
const asProblem = async (res: Response) => (await json(res)) as unknown as Problem;
const asProposal = async (res: Response) => (await json(res)) as unknown as ProposalBody;

function generate(
  ws: SeededWorkspace,
  who: Who,
  campaignId: string,
  key: string | null = randomUUID(),
): Promise<Response> {
  const id = ws.workspace.id;
  return generateRoute(
    call('POST', `/workspaces/${id}/campaigns/${campaignId}/proposals`, {
      ...who.headers,
      ...(key === null ? {} : { 'idempotency-key': key }),
    }),
    campaignParams(id, campaignId),
  );
}
function list(ws: SeededWorkspace, who: Who, campaignId: string): Promise<Response> {
  const id = ws.workspace.id;
  return listRoute(
    call('GET', `/workspaces/${id}/campaigns/${campaignId}/proposals`, who.headers),
    campaignParams(id, campaignId),
  );
}
function choose(
  ws: SeededWorkspace,
  who: Who,
  campaignId: string,
  version: string | number,
  body: unknown = { version: 1 },
): Promise<Response> {
  const id = ws.workspace.id;
  return chooseRoute(
    call(
      'POST',
      `/workspaces/${id}/campaigns/${campaignId}/proposals/${String(version)}/choose`,
      who.headers,
      body,
    ),
    { params: Promise.resolve({ workspaceId: id, campaignId, version: String(version) }) },
  );
}
const svc = testServiceClient;

describeRoute('generateProposal', {
  success: async () => {
    const draft = await newDraft(s);
    const key = randomUUID();
    const res = await generate(s, s.owner, draft.id, key);
    expect(res.status).toBe(201);
    const first = await asProposal(res);
    expect(first).toMatchObject({ version: 1, status: 'ready', chosen: false });
    expect(first.proposal.objective).toBe('OUTCOME_ENGAGEMENT');
    expect(first.proposal.budget.daily_usd_cents).toBeGreaterThanOrEqual(100);
    // Le coût est calculé par le serveur (4 $ × 7 jours + TVA d'essai du Cameroun), jamais par l'agent.
    expect(first.cost).toMatchObject({ status: 'ok', total_usd_cents: 2800 + 539 });
    expect(fake.gateway.calls).toHaveLength(1);
    expect(fake.gateway.calls[0]?.trace).toMatchObject({
      agent: 'stratege',
      promptVersion: 'stratege@3',
    });
    // Journal des agents (R11) : une ligne, schéma valide.
    const runs = await svc()
      .from('agent_runs')
      .select('agent, valid_schema, attempts, prompt_version')
      .eq('workspace_id', s.workspace.id)
      .eq('agent', 'stratege');
    expect(runs.data?.length).toBeGreaterThanOrEqual(1);
    expect(runs.data?.at(-1)).toMatchObject({
      valid_schema: true,
      attempts: 1,
      prompt_version: 'stratege@3',
    });
    // Le brouillon n'est PAS modifié par la génération : seul « choose » copie la proposition.
    const camp = (await json(await read(s, s.owner, draft.id))) as unknown as CampaignBody;
    expect(camp.objective).toBeNull();
    expect(camp.version).toBe(1);
  },
  unauthenticated: async () => {
    const draft = await newDraft(s);
    expect((await generate(s, { ...s.owner, headers: {} }, draft.id)).status).toBe(401);
    expect(fake.gateway.calls).toHaveLength(0);
  },
  otherWorkspace: async () => {
    const draft = await newDraft(s);
    const stranger = await seedWorkspace();
    expect((await generate(stranger, stranger.owner, draft.id)).status).toBe(404);
    expect(fake.gateway.calls).toHaveLength(0);
  },
  forbiddenRole: async () => {
    const draft = await newDraft(s);
    const res = await generate(s, s.viewer, draft.id);
    expect(res.status).toBe(403);
    expect(fake.gateway.calls).toHaveLength(0);
  },
  invalidBody: async () => {
    // Pas de corps : l'entrée invalide est la clé d'idempotence (obligatoire, UUID), ou l'identifiant.
    const draft = await newDraft(s);
    const absent = await generate(s, s.owner, draft.id, null);
    expect(absent.status).toBe(400);
    expect((await asProblem(absent)).errors?.[0]).toMatchObject({
      field: 'Idempotency-Key',
      code: 'required',
    });
    expect((await generate(s, s.owner, draft.id, 'pas-un-uuid')).status).toBe(400);
    expect((await generate(s, s.owner, 'pas-un-uuid')).status).toBe(400);
    expect(fake.gateway.calls).toHaveLength(0);
  },
  extra: {
    'même clé rejouée : la même proposition, AUCUN nouvel appel IA': async () => {
      const draft = await newDraft(s);
      const key = randomUUID();
      const first = await asProposal(await generate(s, s.owner, draft.id, key));
      const second = await generate(s, s.owner, draft.id, key);
      expect(second.status).toBe(201);
      const replay = await asProposal(second);
      expect(replay.version).toBe(first.version);
      expect(replay.proposal).toEqual(first.proposal);
      expect(fake.gateway.calls).toHaveLength(1);
      const rows = await svc().from('campaign_proposals').select('id').eq('campaign_id', draft.id);
      expect(rows.data).toHaveLength(1);
    },
    'même clé envoyée 6 fois EN MÊME TEMPS : un seul appel IA, une seule proposition': async () => {
      const draft = await newDraft(s);
      const key = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 6 }, () => generate(s, s.owner, draft.id, key)),
      );
      const statuses = results.map((r) => r.status).sort();
      // Une réponse complète au moins ; les autres : la même proposition, ou « en cours » (409).
      expect(statuses.filter((x) => x === 201).length).toBeGreaterThanOrEqual(1);
      expect(statuses.every((x) => x === 201 || x === 409)).toBe(true);
      expect(fake.gateway.calls).toHaveLength(1);
      const rows = await svc()
        .from('campaign_proposals')
        .select('id, status')
        .eq('campaign_id', draft.id);
      expect(rows.data).toHaveLength(1);
      for (const r of results.filter((x) => x.status === 409)) {
        const p = await asProblem(r);
        expect(p.code).toBe('conflict');
        expect(p.meta).toMatchObject({ reason: 'generation_in_progress' });
      }
    },
    '« autre proposition » : nouvelle clé, version 2, l’angle change, les précédentes restent':
      async () => {
        const draft = await newDraft(s);
        const one = await asProposal(await generate(s, s.owner, draft.id));
        const two = await asProposal(await generate(s, s.owner, draft.id));
        expect(two.version).toBe(2);
        expect(fake.gateway.calls).toHaveLength(2);
        // Le Stratège reçoit la proposition précédente pour varier (docs/agents/02 §5.7).
        const sent = JSON.parse(fake.gateway.calls[1]?.messages.at(-1)?.content as string) as {
          previous_proposals: unknown[];
        };
        expect(sent.previous_proposals).toHaveLength(1);
        expect(two.proposal.copy.angle).not.toBe(one.proposal.copy.angle);
        const all = (await json(await list(s, s.owner, draft.id))) as unknown as {
          data: ProposalBody[];
        };
        expect(all.data.map((p) => p.version)).toEqual([1, 2]);
      },
    'deux « autre proposition » simultanées avec des clés différentes : deux numéros distincts':
      async () => {
        const draft = await newDraft(s);
        const [a, b] = await Promise.all([
          generate(s, s.owner, draft.id),
          generate(s, s.editor, draft.id),
        ]);
        expect([a.status, b.status]).toEqual([201, 201]);
        const versions = [(await asProposal(a)).version, (await asProposal(b)).version].sort();
        expect(versions).toEqual([1, 2]);
      },
    'panne de la passerelle : 503, ligne en échec, la même clé donne la MÊME erreur sans nouvel appel':
      async () => {
        const draft = await newDraft(s);
        fake.gateway.enqueue({ fail: 'unavailable' });
        const key = randomUUID();
        const failed = await generate(s, s.owner, draft.id, key);
        expect(failed.status).toBe(503);
        expect((await asProblem(failed)).code).toBe('provider_unavailable');
        expect(fake.gateway.calls).toHaveLength(1);
        const again = await generate(s, s.owner, draft.id, key);
        expect(again.status).toBe(503);
        expect(fake.gateway.calls).toHaveLength(1); // jamais relancé automatiquement
        const rows = await svc()
          .from('campaign_proposals')
          .select('status, error_code')
          .eq('campaign_id', draft.id);
        expect(rows.data).toEqual([{ status: 'failed', error_code: 'provider_unavailable' }]);
        // Nouvelle intention = nouvelle clé : ça marche, et la proposition en échec n'apparaît pas dans la liste.
        const retry = await generate(s, s.owner, draft.id);
        expect(retry.status).toBe(201);
        const all = (await json(await list(s, s.owner, draft.id))) as unknown as {
          data: ProposalBody[];
        };
        expect(all.data).toHaveLength(1);
      },
    'limite de débit du fournisseur : 429 rate_limited': async () => {
      const draft = await newDraft(s);
      fake.gateway.enqueue({ fail: 'rate_limited' });
      const res = await generate(s, s.owner, draft.id);
      expect(res.status).toBe(429);
    },
    'TR-AGT-01 : prix inventé puis valide = 2 appels ; deux invalides = échec, jamais un 3e appel':
      async () => {
        const draft = await newDraft(s);
        const invented = withPrimaryText(await sampleOutput(), 'Baskets à 15 000 F seulement.');
        fake.gateway.enqueue({ json: invented });
        const retried = await generate(s, s.owner, draft.id);
        expect(retried.status).toBe(201);
        expect(fake.gateway.calls).toHaveLength(2);
        expect(fake.gateway.calls[1]?.messages.at(-1)?.content as string).toContain('15000');

        const draft2 = await newDraft(s);
        const before = fake.gateway.calls.length;
        fake.gateway.enqueue(
          { json: invented },
          { json: invented },
          { json: await sampleOutput() },
        );
        const failed = await generate(s, s.owner, draft2.id);
        expect(failed.status).toBe(503);
        expect(fake.gateway.calls.length - before).toBe(2);
        expect(fake.gateway.pending).toBe(1);
      },
    'quotas et crédits (point d’accroche S24) : refus avant toute dépense → 402 et aucun appel IA':
      async () => {
        fake = fakeProposalDeps({
          beforeSpend: () =>
            Promise.reject(new AppError('insufficient_credits', { meta: { credits_missing: 1 } })),
        });
        state.current = fake;
        const draft = await newDraft(s);
        const res = await generate(s, s.owner, draft.id);
        expect(res.status).toBe(402);
        expect(fake.gateway.calls).toHaveLength(0);
      },
    'génération perdue (processus arrêté) : la même clé donne 503 après le délai, sans nouvel appel':
      async () => {
        fake = fakeProposalDeps({ staleAfterMs: 0 });
        state.current = fake;
        const draft = await newDraft(s);
        const key = randomUUID();
        const claimed = await svc()
          .from('campaign_proposals')
          .insert({
            workspace_id: s.workspace.id,
            campaign_id: draft.id,
            version: 1,
            proposal: {},
            status: 'generating',
            idempotency_key: key,
            created_at: new Date(Date.now() - 600_000).toISOString(),
          });
        expect(claimed.error).toBeNull();
        const res = await generate(s, s.owner, draft.id, key);
        expect(res.status).toBe(503);
        expect(fake.gateway.calls).toHaveLength(0);
        const row = await svc()
          .from('campaign_proposals')
          .select('status')
          .eq('campaign_id', draft.id)
          .single();
        expect(row.data?.status).toBe('failed');
      },
    'génération en cours (récente) : 409 conflict avec retry_after_s': async () => {
      const draft = await newDraft(s);
      const key = randomUUID();
      await svc().from('campaign_proposals').insert({
        workspace_id: s.workspace.id,
        campaign_id: draft.id,
        version: 1,
        proposal: {},
        status: 'generating',
        idempotency_key: key,
      });
      const res = await generate(s, s.owner, draft.id, key);
      expect(res.status).toBe(409);
      expect((await asProblem(res)).retry_after_s).toBe(2);
      expect(fake.gateway.calls).toHaveLength(0);
    },
    'campagne qui n’est plus un brouillon : 409': async () => {
      const draft = await newDraft(s);
      await svc().from('campaigns').update({ status: 'publishing' }).eq('id', draft.id);
      expect((await generate(s, s.owner, draft.id)).status).toBe(409);
      expect(fake.gateway.calls).toHaveLength(0);
    },
    'campagne sans analyse : 409 analysis_missing, aucun appel': async () => {
      const draft = await newDraft(s);
      await svc().from('campaigns').update({ analysis_id: null }).eq('id', draft.id);
      const res = await generate(s, s.owner, draft.id);
      expect(res.status).toBe(409);
      expect((await asProblem(res)).meta).toMatchObject({ reason: 'analysis_missing' });
      expect(fake.gateway.calls).toHaveLength(0);
    },
    'espace en lecture seule : 403, aucun appel': async () => {
      const ro = await seedWorkspace();
      const draft = await newDraft(ro);
      await svc().from('workspaces').update({ status: 'read_only' }).eq('id', ro.workspace.id);
      const res = await generate(ro, ro.owner, draft.id);
      expect(res.status).toBe(403);
      expect(fake.gateway.calls).toHaveLength(0);
    },
    'WhatsApp non lié : la proposition passe par Messenger avec un avertissement': async () => {
      const draft = await newDraft(s);
      const res = await asProposal(await generate(s, s.owner, draft.id));
      expect(res.proposal.destination).toBe('MESSENGER');
      expect(res.proposal.warnings.length).toBeGreaterThan(0);
    },
  },
});

function withPrimaryText(output: unknown, text: string): unknown {
  const clone = structuredClone(output) as { copy: { primary_text: string } };
  clone.copy.primary_text = text;
  return clone;
}

async function sampleOutput(): Promise<unknown> {
  const { fakeStrategeOutput } = await import('@pubeka/core');
  return fakeStrategeOutput({
    model: 'x',
    temperature: 0,
    responseFormat: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          today: new Date().toISOString().slice(0, 10),
          output_language: 'fr',
          ad_address: 'vous',
          account_state: { has_whatsapp_linked: false },
          profile: { locations: [{ country: 'CM', city: 'Douala' }] },
        }),
      },
    ],
  });
}

describeRoute('listProposals', {
  success: async () => {
    const draft = await newDraft(s);
    await generate(s, s.owner, draft.id);
    for (const who of [s.owner, s.editor, s.viewer]) {
      const res = await list(s, who, draft.id);
      expect(res.status).toBe(200);
      const body = (await json(res)) as unknown as { data: ProposalBody[] };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]?.status).toBe('ready');
    }
  },
  unauthenticated: async () => {
    const draft = await newDraft(s);
    expect((await list(s, { ...s.owner, headers: {} }, draft.id)).status).toBe(401);
  },
  otherWorkspace: async () => {
    const draft = await newDraft(s);
    const stranger = await seedWorkspace();
    expect((await list(stranger, stranger.owner, draft.id)).status).toBe(404);
  },
  forbiddenRole: na('la lecture est permise à tout membre, y compris « viewer » (API_SPEC §2.3)'),
  invalidBody: na('GET sans corps ; l’identifiant mal formé est testé ci-dessous'),
  extra: {
    'identifiant mal formé : 400': async () => {
      expect((await list(s, s.owner, 'pas-un-uuid')).status).toBe(400);
    },
    'les propositions en échec ou en cours ne sont pas listées': async () => {
      const draft = await newDraft(s);
      await svc()
        .from('campaign_proposals')
        .insert([
          {
            workspace_id: s.workspace.id,
            campaign_id: draft.id,
            version: 1,
            proposal: {},
            status: 'generating',
            idempotency_key: randomUUID(),
          },
          {
            workspace_id: s.workspace.id,
            campaign_id: draft.id,
            version: 2,
            proposal: {},
            status: 'failed',
            error_code: 'provider_unavailable',
          },
        ]);
      const ok = await asProposal(await generate(s, s.owner, draft.id));
      expect(ok.version).toBe(3);
      const body = (await json(await list(s, s.owner, draft.id))) as unknown as {
        data: ProposalBody[];
      };
      expect(body.data.map((p) => p.version)).toEqual([3]);
    },
  },
});

describeRoute('chooseProposal', {
  success: async () => {
    const draft = await newDraft(s);
    const p1 = await asProposal(await generate(s, s.owner, draft.id));
    const res = await choose(s, s.owner, draft.id, p1.version);
    expect(res.status).toBe(200);
    const camp = (await json(res)) as unknown as CampaignBody & {
      chosen_proposal_version: number;
      optimization_goal: string;
    };
    expect(camp).toMatchObject({
      status: 'draft',
      version: 2,
      objective: p1.proposal.objective,
      destination: p1.proposal.destination,
      chosen_proposal_version: 1,
      daily_budget_usd_cents: p1.proposal.budget.daily_usd_cents,
      start_date: p1.proposal.schedule.start_date,
      end_date: p1.proposal.schedule.end_date,
      optimization_goal: 'CONVERSATIONS',
    });
    expect(camp.copy).toMatchObject({ headline: p1.proposal.copy.headline });
    expect(camp.cost.status).toBe('ok');
    // La liste marque la proposition retenue ; en retenir une autre déplace la marque (une seule à la fois).
    const p2 = await asProposal(await generate(s, s.owner, draft.id));
    expect((await choose(s, s.owner, draft.id, p2.version, { version: 2 })).status).toBe(200);
    const all = (await json(await list(s, s.owner, draft.id))) as unknown as {
      data: ProposalBody[];
    };
    expect(all.data.map((p) => p.chosen)).toEqual([false, true]);
    const rows = await svc()
      .from('campaign_proposals')
      .select('chosen')
      .eq('campaign_id', draft.id)
      .eq('chosen', true);
    expect(rows.data).toHaveLength(1);
  },
  unauthenticated: async () => {
    const draft = await newDraft(s);
    expect((await choose(s, { ...s.owner, headers: {} }, draft.id, 1)).status).toBe(401);
  },
  otherWorkspace: async () => {
    const draft = await newDraft(s);
    await generate(s, s.owner, draft.id);
    const stranger = await seedWorkspace();
    expect((await choose(stranger, stranger.owner, draft.id, 1)).status).toBe(404);
  },
  forbiddenRole: async () => {
    const draft = await newDraft(s);
    await generate(s, s.owner, draft.id);
    const res = await choose(s, s.viewer, draft.id, 1);
    expect(res.status).toBe(403);
    expect((await asProblem(res)).code).toBe('role_insufficient');
  },
  invalidBody: async () => {
    // Pas de corps : le numéro de version de l'adresse est l'entrée.
    const draft = await newDraft(s);
    expect((await choose(s, s.owner, draft.id, 'abc')).status).toBe(400);
    expect((await choose(s, s.owner, draft.id, 0)).status).toBe(400);
    expect((await choose(s, s.owner, draft.id, '-1')).status).toBe(400);
    expect((await choose(s, s.owner, draft.id, '1.5')).status).toBe(400);
    // Le corps est obligatoire et strict : `version` du brouillon, entier d'au moins 1, aucun champ en plus.
    await generate(s, s.owner, draft.id);
    for (const body of [
      null,
      {},
      { version: 0 },
      { version: '1' },
      { version: 1.5 },
      { version: 1, x: 1 },
    ]) {
      const res = await choose(s, s.owner, draft.id, 1, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  },
  extra: {
    'version inconnue : 404': async () => {
      const draft = await newDraft(s);
      expect((await choose(s, s.owner, draft.id, 7)).status).toBe(404);
    },
    'une proposition en échec ne peut pas être retenue : 404': async () => {
      const draft = await newDraft(s);
      await svc().from('campaign_proposals').insert({
        workspace_id: s.workspace.id,
        campaign_id: draft.id,
        version: 1,
        proposal: {},
        status: 'failed',
        error_code: 'provider_unavailable',
      });
      expect((await choose(s, s.owner, draft.id, 1)).status).toBe(404);
    },
    'le serveur revalide : une proposition aux dates devenues passées est refusée (400) et le brouillon reste intact':
      async () => {
        const draft = await newDraft(s);
        await svc()
          .from('campaign_proposals')
          .insert({
            workspace_id: s.workspace.id,
            campaign_id: draft.id,
            version: 1,
            status: 'ready',
            proposal: {
              ...((await sampleOutput()) as object),
              schedule: { start_date: '2020-01-01', end_date: '2020-01-07', reason: '' },
            },
          });
        const res = await choose(s, s.owner, draft.id, 1);
        expect(res.status).toBe(400);
        expect((await asProblem(res)).errors?.[0]).toMatchObject({ field: 'start_date' });
        const after = (await json(await read(s, s.owner, draft.id))) as unknown as CampaignBody;
        expect(after.version).toBe(1);
        expect(after.objective).toBeNull();
      },
    'campagne qui n’est plus un brouillon : 409': async () => {
      const draft = await newDraft(s);
      await generate(s, s.owner, draft.id);
      await svc().from('campaigns').update({ status: 'publishing' }).eq('id', draft.id);
      expect((await choose(s, s.owner, draft.id, 1)).status).toBe(409);
    },
    'version du brouillon périmée : 409 avec la version actuelle, rien n’est écrasé': async () => {
      const draft = await newDraft(s);
      await generate(s, s.owner, draft.id);
      expect((await patch(s, s.owner, draft.id, { version: 1, name: 'Autre nom' })).status).toBe(
        200,
      );
      const res = await choose(s, s.owner, draft.id, 1, { version: 1 });
      expect(res.status).toBe(409);
      const problem = await asProblem(res);
      expect(problem.code).toBe('conflict');
      expect(problem.meta).toMatchObject({ current_version: 2, reason: 'stale_version' });
      const after = (await json(await read(s, s.owner, draft.id))) as unknown as CampaignBody;
      expect(after).toMatchObject({ version: 2, objective: null, name: 'Autre nom' });
    },
    'EN MÊME TEMPS : une modification (A) et un choix (B) avec la même version lue : un seul gagne, aucune écriture perdue':
      async () => {
        const draft = await newDraft(s);
        await generate(s, s.owner, draft.id);
        const [a, b] = await Promise.all([
          patch(s, s.owner, draft.id, { version: 1, name: 'Nom de A' }),
          choose(s, s.editor, draft.id, 1, { version: 1 }),
        ]);
        expect([a.status, b.status].sort()).toEqual([200, 409]);
        const loser = a.status === 409 ? a : b;
        expect((await asProblem(loser)).meta).toMatchObject({ current_version: 2 });
        const after = (await json(await read(s, s.owner, draft.id))) as unknown as CampaignBody;
        expect(after.version).toBe(2);
        // Ce que le gagnant a écrit est là, et rien du perdant.
        if (a.status === 200) expect(after).toMatchObject({ name: 'Nom de A', objective: null });
        else expect(after.name).not.toBe('Nom de A');
      },
    'après le choix, une modification avec l’ancienne version est refusée (409)': async () => {
      const draft = await newDraft(s);
      await generate(s, s.owner, draft.id);
      expect((await choose(s, s.owner, draft.id, 1)).status).toBe(200);
      const stale = await patch(s, s.owner, draft.id, { version: 1, name: 'x' });
      expect(stale.status).toBe(409);
      expect((await asProblem(stale)).meta).toMatchObject({ current_version: 2 });
    },
  },
});

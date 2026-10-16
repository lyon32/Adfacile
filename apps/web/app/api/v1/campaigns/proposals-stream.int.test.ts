// Génération d'une proposition EN FLUX (SSE) contre la vraie base, avec la FAUSSE passerelle qui écrit par fragments.
// MESURE (TR-PRF-05, « premiers mots en moins de 3 s ») : elle prouve le chemin SSE du serveur (route, flux, ordre,
// découpage), PAS la latence d'un vrai modèle — la fausse passerelle écrit sans réfléchir. La mesure réelle viendra
// avec les crédits OpenRouter.
import { randomUUID } from 'node:crypto';
import { fakeProposalDeps, type FakeProposalRun } from '@pubeka/core';
import { seedWorkspace, testServiceClient, type SeededWorkspace } from '@pubeka/testing';
import { beforeAll, beforeEach, expect, vi } from 'vitest';
import {
  call,
  campaignParams,
  ensureTestFx,
  ensureTestVat,
  json,
  newDraft,
  resetRateLimits,
  setOwnerCountry,
} from './int-support';
import { POST as generateRoute } from '../workspaces/[workspaceId]/campaigns/[campaignId]/proposals/route';
import { describe, it } from 'vitest';

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
  fake = fakeProposalDeps({}, { chunkSize: 16, chunkDelayMs: 40 });
  state.current = fake;
});

interface SseData {
  path?: string;
  value?: unknown;
  code?: string;
  status?: string | number;
  request_id?: string;
  version?: number;
  proposal?: { copy: { headline: string } };
}

interface SseEvent {
  event: string;
  data: SseData;
  at: number;
}

function streamRequest(
  campaignId: string,
  key: string | null,
  accept = 'text/event-stream',
): Promise<Response> {
  const id = s.workspace.id;
  return generateRoute(
    call('POST', `/workspaces/${id}/campaigns/${campaignId}/proposals`, {
      ...s.owner.headers,
      accept,
      ...(key === null ? {} : { 'idempotency-key': key }),
    }),
    campaignParams(id, campaignId),
  );
}

/** Lit tout le flux en notant l'instant de chaque événement (depuis `t0`). */
async function readEvents(res: Response, t0: number): Promise<SseEvent[]> {
  const reader = res.body?.getReader();
  if (reader === undefined) throw new Error('pas de corps');
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let buffer = '';
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    buffer += decoder.decode(part.value, { stream: true });
    let cut = buffer.indexOf('\n\n');
    while (cut !== -1) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const event = /^event: (\w+)$/m.exec(block)?.[1] ?? '';
      const data = /^data: (.*)$/m.exec(block)?.[1] ?? '{}';
      events.push({ event, data: JSON.parse(data) as SseData, at: Date.now() - t0 });
      cut = buffer.indexOf('\n\n');
    }
  }
  return events;
}

const svc = testServiceClient;
const names = (events: SseEvent[]) => events.map((e) => e.event);

describe('POST …/proposals en flux (SSE)', () => {
  it('flux 200 text/event-stream : des événements field puis UN done, dans l’ordre ; la proposition est enregistrée', async () => {
    const draft = await newDraft(s);
    const t0 = Date.now();
    const res = await streamRequest(draft.id, randomUUID());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    const events = await readEvents(res, t0);
    const fields = events.filter((e) => e.event === 'field');
    expect(fields.length).toBeGreaterThan(5);
    expect(names(events).at(-1)).toBe('done');
    expect(names(events).filter((n) => n === 'done')).toHaveLength(1);
    // Tous les champs précèdent `done` ; chemins permis seulement, jamais de signalement ni de ciblage.
    expect(names(events).lastIndexOf('field')).toBeLessThan(names(events).indexOf('done'));
    for (const f of fields)
      expect(f.data.path).toMatch(
        /^(objective|objective_reason|destination|geo\.|budget\.|schedule\.|copy\.)/,
      );
    // L'ordre est celui de l'écriture du modèle (objective avant copy).
    const order = fields.map((f) => f.data.path ?? '');
    expect(order.indexOf('objective')).toBeLessThan(order.indexOf('copy.headline'));
    // `done` = la proposition validée, identique à ce qui est enregistré.
    const done = events.at(-1)?.data as {
      version: number;
      status: string;
      proposal: { copy: { headline: string } };
    };
    expect(done).toMatchObject({ version: 1, status: 'ready' });
    const stored = await svc()
      .from('campaign_proposals')
      .select('status, proposal')
      .eq('campaign_id', draft.id)
      .single();
    expect(stored.data?.status).toBe('ready');
    expect((stored.data?.proposal as { copy: { headline: string } }).copy.headline).toBe(
      done.proposal.copy.headline,
    );
    // Le dernier aperçu du titre est celui de la proposition finale (fausse IA : même texte).
    expect(fields.find((f) => f.data.path === 'copy.headline')?.data.value).toBe(
      done.proposal.copy.headline,
    );
    expect(fake.gateway.calls).toHaveLength(1);
    expect(fake.gateway.calls[0]?.onText).toBeDefined();
  });

  it('MESURE : premier champ affiché en moins de 3 s (fausse passerelle, 16 caractères toutes les 40 ms)', async () => {
    const draft = await newDraft(s);
    const t0 = Date.now();
    const res = await streamRequest(draft.id, randomUUID());
    const events = await readEvents(res, t0);
    const first = events.find((e) => e.event === 'field');
    const lastField = [...events].reverse().find((e) => e.event === 'field');
    const done = events.find((e) => e.event === 'done');
    process.stdout.write(
      `\n[MESURE SSE, fausse passerelle] premier champ : ${String(first?.at)} ms · dernier champ : ${String(lastField?.at)} ms · done : ${String(done?.at)} ms · ${String(events.length)} événements\n`,
    );
    expect(first?.at).toBeLessThan(3000);
    // Le flux est réellement progressif : le premier champ arrive bien avant la fin.
    expect(first?.at ?? 0).toBeLessThan((done?.at ?? 0) - 100);
  });

  it('sans Accept: text/event-stream : réponse JSON 201 comme avant', async () => {
    const draft = await newDraft(s);
    const res = await streamRequest(draft.id, randomUUID(), 'application/json');
    expect(res.status).toBe(201);
    expect((await json(res)).version).toBe(1);
    expect(fake.gateway.calls[0]?.onText).toBeUndefined();
  });

  it('erreur AVANT le flux : réponse HTTP normale en application/problem+json (clé absente, campagne inconnue, rôle)', async () => {
    const draft = await newDraft(s);
    const missing = await streamRequest(draft.id, null);
    expect(missing.status).toBe(400);
    expect(missing.headers.get('content-type')).toContain('application/problem+json');
    expect((await streamRequest(randomUUID(), randomUUID())).status).toBe(404);
    const viewer = await generateRoute(
      call('POST', `/workspaces/${s.workspace.id}/campaigns/${draft.id}/proposals`, {
        ...s.viewer.headers,
        accept: 'text/event-stream',
        'idempotency-key': randomUUID(),
      }),
      campaignParams(s.workspace.id, draft.id),
    );
    expect(viewer.status).toBe(403);
    expect(fake.gateway.calls).toHaveLength(0);
  });

  it('erreur AU MILIEU du flux : événement error (Problem Details, 503), flux fermé, ligne en échec, aucun done', async () => {
    const draft = await newDraft(s);
    fake.gateway.enqueue({ fail: 'unavailable' });
    const t0 = Date.now();
    const res = await streamRequest(draft.id, randomUUID());
    expect(res.status).toBe(200); // le statut est déjà parti : l'erreur voyage dans le flux
    const events = await readEvents(res, t0);
    expect(names(events)).toEqual(['error']);
    expect(events[0]?.data).toMatchObject({ code: 'provider_unavailable', status: 503 });
    expect(events[0]?.data.request_id).toMatch(/^req_/);
    const row = await svc()
      .from('campaign_proposals')
      .select('status')
      .eq('campaign_id', draft.id)
      .single();
    expect(row.data?.status).toBe('failed');
  });

  it('sortie invalide puis valide : un événement retry annonce que l’aperçu est remplacé ; done contient la version valide', async () => {
    const draft = await newDraft(s);
    fake.gateway.enqueue({
      text: '{"objective":"OUTCOME_ENGAGEMENT","budget":{"daily_usd_cents":5}}',
    });
    const res = await streamRequest(draft.id, randomUUID());
    const events = await readEvents(res, Date.now());
    expect(names(events)).toContain('retry');
    expect(names(events).indexOf('retry')).toBeLessThan(names(events).indexOf('done'));
    expect(names(events).at(-1)).toBe('done');
    expect(fake.gateway.calls).toHaveLength(2);
    // Le nouvel essai n'est pas diffusé : un seul appel a un flux.
    expect(fake.gateway.calls.filter((c) => c.onText !== undefined)).toHaveLength(1);
  });

  it('TR-AGT-01 en flux : deux sorties invalides = error, jamais un 3e appel', async () => {
    const draft = await newDraft(s);
    const bad = { text: '{"objective":"OUTCOME_ENGAGEMENT"}' };
    fake.gateway.enqueue(bad, bad, bad);
    const events = await readEvents(await streamRequest(draft.id, randomUUID()), Date.now());
    expect(names(events).at(-1)).toBe('error');
    expect(names(events)).not.toContain('done');
    expect(fake.gateway.calls).toHaveLength(2);
    expect(fake.gateway.pending).toBe(1);
  });

  it('l’aperçu ne montre jamais un nombre inventé (R3) ni du HTML, même si la sortie finale sera refusée', async () => {
    const draft = await newDraft(s);
    const out = JSON.parse(
      JSON.stringify({
        objective: 'OUTCOME_ENGAGEMENT',
        copy: {
          primary_text: 'Baskets à 15 000 F seulement.',
          headline: '<b>Titre</b>',
          description: null,
          cta: 'LEARN_MORE',
          angle: 'price',
        },
      }),
    ) as unknown;
    fake.gateway.enqueue({ json: out }, { json: out }, { json: out });
    const events = await readEvents(await streamRequest(draft.id, randomUUID()), Date.now());
    const paths = events.filter((e) => e.event === 'field').map((e) => e.data.path);
    expect(paths).toContain('objective');
    expect(paths).not.toContain('copy.primary_text');
    expect(paths).not.toContain('copy.headline');
    expect(paths).toContain('copy.cta');
  });

  it('même clé rejouée en flux : un seul événement done, AUCUN nouvel appel IA', async () => {
    const draft = await newDraft(s);
    const key = randomUUID();
    await readEvents(await streamRequest(draft.id, key), Date.now());
    const again = await streamRequest(draft.id, key);
    expect(again.status).toBe(200);
    const events = await readEvents(again, Date.now());
    expect(names(events)).toEqual(['done']);
    expect(fake.gateway.calls).toHaveLength(1);
  });

  it('même clé pendant la génération : 409 avant le flux (aucun second appel)', async () => {
    const draft = await newDraft(s);
    const key = randomUUID();
    const first = await streamRequest(draft.id, key); // la ligne est réservée, le flux n'est pas encore lu
    const second = await streamRequest(draft.id, key);
    expect(second.status).toBe(409);
    expect(second.headers.get('content-type')).toContain('application/problem+json');
    await readEvents(first, Date.now());
    expect(fake.gateway.calls).toHaveLength(1);
  });

  it('REPRISE : le client coupe après le premier champ ; la génération se termine, une reconnexion avec la même clé reçoit done sans nouvel appel', async () => {
    const draft = await newDraft(s);
    const key = randomUUID();
    const res = await streamRequest(draft.id, key);
    const reader = res.body?.getReader();
    expect(reader).toBeDefined();
    const first = await reader?.read();
    expect(new TextDecoder().decode(first?.value)).toContain('event: field');
    await reader?.cancel(); // déconnexion du client
    // La génération continue côté serveur et s'enregistre.
    const deadline = Date.now() + 10_000;
    let status = '';
    while (Date.now() < deadline) {
      const row = await svc()
        .from('campaign_proposals')
        .select('status')
        .eq('campaign_id', draft.id)
        .single();
      status = row.data?.status ?? '';
      if (status === 'ready') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(status).toBe('ready');
    const resumed = await readEvents(await streamRequest(draft.id, key), Date.now());
    expect(names(resumed)).toEqual(['done']);
    expect(resumed[0]?.data).toMatchObject({ version: 1, status: 'ready' });
    expect(fake.gateway.calls).toHaveLength(1); // jamais payé deux fois
  });
});

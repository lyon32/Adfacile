// @vitest-environment happy-dom
// Étape « Proposition » (APPFLOW §8.3) : écriture progressive, erreur au milieu du flux, reprise avec la même clé, TVA non
// configurée, modification avec version (conflit), onglets, FR et EN. Aucun appel réseau réel : `fetch` est simulé.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messagesFor, type Locale } from '@pubeka/i18n';
import { readProposalStream, type StreamEvent } from './proposal-api';
import { ProposalStep } from './proposal-step';

const WS = '44444444-4444-4444-8444-444444444444';
const CAMPAIGN = '55555555-5555-4555-8555-555555555555';
const ANALYSIS = '99999999-9999-4999-8999-999999999999';
const PAGE = '66666666-6666-4666-8666-666666666666';

// Seule la date est figée (les minuteries restent réelles pour waitFor) : les dates des fixtures sont dans le futur.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-12T09:00:00Z'));
});
afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const COST_OK = {
  status: 'ok',
  days: 7,
  budget_usd_cents: 2800,
  total: { xaf: 16800, usd_cents: 2800, currency: 'XAF' },
  daily: { xaf: 2400, usd_cents: 400, currency: 'XAF' },
  fx: { rate: 600 },
};
const COST_NO_FX = {
  status: 'fx_not_available',
  days: 7,
  budget_usd_cents: 2800,
  total: null,
  daily: null,
  fx: null,
};

function body(over: Record<string, unknown> = {}) {
  return {
    objective: 'OUTCOME_ENGAGEMENT',
    objective_reason: 'Vos clients peuvent vous écrire directement.',
    destination: 'WHATSAPP',
    geo: {
      countries: ['CM'],
      cities: [{ name: 'Douala', radius_km: 10 }],
      reason: 'Votre zone de vente.',
    },
    budget: { daily_usd_cents: 400, reason: 'De quoi commencer.' },
    schedule: { start_date: '2026-10-13', end_date: '2026-10-19', reason: 'Une semaine.' },
    copy: {
      primary_text: 'Nouveautés en boutique.',
      headline: 'Écrivez-nous',
      description: null,
      cta: 'SEND_WHATSAPP_MESSAGE',
      angle: 'speed',
    },
    warnings: [],
    ...over,
  };
}
const proposal = (
  version: number,
  cost: unknown = COST_OK,
  over: Record<string, unknown> = {},
) => ({
  version,
  status: 'ready',
  chosen: false,
  proposal: body(over),
  cost,
  created_at: '2026-10-12T09:00:00Z',
});
function campaign(over: Record<string, unknown> = {}) {
  return {
    id: CAMPAIGN,
    status: 'draft',
    version: 1,
    name: 'Ma pub',
    editable: true,
    objective: null,
    destination: null,
    geo: {},
    targeting: {},
    daily_budget_usd_cents: null,
    start_date: null,
    end_date: null,
    copy: {},
    chosen_proposal_version: null,
    cost: { status: 'incomplete' },
    ...over,
  };
}
const chosenCampaign = (over: Record<string, unknown> = {}) =>
  campaign({
    version: 2,
    objective: 'OUTCOME_ENGAGEMENT',
    destination: 'WHATSAPP',
    geo: { countries: ['CM'], cities: [{ name: 'Douala', radius_km: 10 }] },
    daily_budget_usd_cents: 400,
    start_date: '2026-10-13',
    end_date: '2026-10-19',
    copy: {
      primary_text: 'Nouveautés en boutique.',
      headline: 'Écrivez-nous',
      description: '',
      cta: 'SEND_WHATSAPP_MESSAGE',
    },
    chosen_proposal_version: 1,
    cost: COST_OK,
    ...over,
  });

const json =
  (b: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const problem = (code: string, status: number, meta: Record<string, unknown> = {}) =>
  json({ type: 'x', title: code, status, code, request_id: 'req_T', meta }, status);

const enc = new TextEncoder();
const sse = (event: string, data: unknown) =>
  enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

/** Flux piloté à la main : le test pousse les événements un à un. */
function controlledStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    response: () =>
      new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    send: (event: string, data: unknown) => {
      controller.enqueue(sse(event, data));
    },
    close: () => {
      controller.close();
    },
  };
}

interface Call {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}
function stubApi(routes: Record<string, (() => Response) | (() => Response)[]>): Call[] {
  const calls: Call[] = [];
  const counters = new Map<string, number>();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = url.replace('/api/v1', '').replace(`/workspaces/${WS}`, '');
      calls.push({
        method,
        path,
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : init?.body,
        headers: (init?.headers ?? {}) as Record<string, string>,
      });
      const entry = routes[`${method} ${path}`];
      const n = counters.get(`${method} ${path}`) ?? 0;
      counters.set(`${method} ${path}`, n + 1);
      const respond = Array.isArray(entry) ? entry[Math.min(n, entry.length - 1)] : entry;
      return Promise.resolve(
        respond === undefined ? new Response(null, { status: 404 }) : respond(),
      );
    }),
  );
  return calls;
}

/** Le parent garde l'identifiant de la campagne (dans l'assistant : l'adresse `?campagne=`). */
function Harness(props: Partial<Parameters<typeof ProposalStep>[0]>) {
  const [id, setId] = useState<string | null>(
    props.campaignId === undefined ? CAMPAIGN : props.campaignId,
  );
  return (
    <ProposalStep
      workspaceId={WS}
      analysisId={ANALYSIS}
      pageId={PAGE}
      onBack={() => undefined}
      {...props}
      campaignId={id}
      onCampaign={(next) => {
        setId(next);
        props.onCampaign?.(next);
      }}
    />
  );
}

function mount(
  props: Partial<Parameters<typeof ProposalStep>[0]> = {},
  opts: { locale?: Locale; search?: string } = {},
) {
  const locale = opts.locale ?? 'fr';
  const onCampaign = vi.fn();
  const onBack = vi.fn();
  const view = render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <NuqsTestingAdapter searchParams={opts.search ?? ''} hasMemory>
          <Harness {...props} onCampaign={onCampaign} onBack={onBack} />
        </NuqsTestingAdapter>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return { ...view, onCampaign, onBack };
}

/** Le bouton est désactivé tant que la campagne et ses propositions se chargent : on attend qu'il soit actif. */
async function clickGenerate(): Promise<void> {
  const button = await screen.findByRole('button', { name: 'Générer la proposition' });
  await waitFor(() => {
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
  fireEvent.click(button);
}

const PROPOSALS = `GET /campaigns/${CAMPAIGN}/proposals`;
const CAMPAIGN_GET = `GET /campaigns/${CAMPAIGN}`;
const GENERATE = `POST /campaigns/${CAMPAIGN}/proposals`;

describe('lecture du flux', () => {
  it('découpe les blocs, ignore les événements inconnus et les blocs illisibles', async () => {
    const events: StreamEvent[] = [];
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(
          enc.encode('event: field\ndata: {"path":"objective","value":"X"}\n\nevent: ping\nda'),
        );
        c.enqueue(
          enc.encode('ta: {}\n\nevent: field\ndata: pas du json\n\nevent: retry\ndata: {}\n\n'),
        );
        c.enqueue(
          enc.encode('event: error\ndata: {"code":"provider_unavailable","status":503}\n\n'),
        );
        c.close();
      },
    });
    await readProposalStream(stream, (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(['field', 'retry', 'error']);
  });
});

describe('étape Proposition', () => {
  it('sans proposition : l’action qui dépense est un clic explicite ; elle crée le brouillon puis écrit EN DIRECT', async () => {
    const live = controlledStream();
    const calls = stubApi({
      'POST /campaigns': json(campaign(), 201),
      [`GET /campaigns/${CAMPAIGN}`]: json(campaign()),
      [PROPOSALS]: [json({ data: [] }), json({ data: [proposal(1)] })],
      [GENERATE]: () => live.response(),
    });
    const { onCampaign } = mount({ campaignId: null });
    await screen.findByRole('button', { name: 'Générer la proposition' });
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0); // rien n'est dépensé avant le clic
    await clickGenerate();
    await waitFor(() => {
      expect(onCampaign).toHaveBeenCalledWith(CAMPAIGN);
    });
    const post = calls.find((c) => c.path === '/campaigns' && c.method === 'POST');
    expect(post?.body).toEqual({ analysis_id: ANALYSIS, page_id: PAGE, platform: 'meta' });
    // L'écriture démarre : ni titre, ni budget tant que le flux ne les a pas annoncés.
    await screen.findByText('J’écris ta proposition…');
    expect(screen.getByRole('status').textContent).toContain('J’écris ta proposition…');
    await act(async () => {
      live.send('field', { path: 'objective', value: 'OUTCOME_ENGAGEMENT' });
      await Promise.resolve();
    });
    await screen.findByText('Messages ou interactions');
    expect(screen.queryByText('Écrivez-nous')).toBeNull();
    // Les rangées en attente sont des emplacements masqués aux lecteurs d'écran.
    await act(async () => {
      live.send('field', { path: 'copy.headline', value: 'Écrivez-nous' });
      await Promise.resolve();
    });
    await screen.findByText('Écrivez-nous');
    // Fin : done → la proposition validée remplace l'aperçu, avec le coût calculé par le serveur.
    await act(async () => {
      live.send('done', proposal(1));
      live.close();
      await Promise.resolve();
    });
    await screen.findByText('Coût estimé');
    expect(screen.getByText(/16\s?800/)).toBeTruthy();
    const generate = calls.find((c) => c.method === 'POST' && c.path.endsWith('/proposals'));
    expect(generate?.headers.accept).toBe('text/event-stream');
    expect(generate?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('erreur AU MILIEU du flux : message clair, rien de retenu, [Réessayer] avec une NOUVELLE clé', async () => {
    const first = controlledStream();
    const second = controlledStream();
    const calls = stubApi({
      [CAMPAIGN_GET]: json(campaign()),
      [PROPOSALS]: json({ data: [] }),
      [GENERATE]: [() => first.response(), () => second.response()],
    });
    mount();
    await clickGenerate();
    await screen.findByText('J’écris ta proposition…');
    await act(async () => {
      first.send('field', { path: 'objective', value: 'OUTCOME_ENGAGEMENT' });
      first.send('error', {
        type: 'x',
        title: 'x',
        status: 503,
        code: 'provider_unavailable',
        request_id: 'req_T',
      });
      first.close();
      await Promise.resolve();
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('La proposition n’a pas pu être écrite');
    expect(screen.queryByText('Messages ou interactions')).toBeNull();
    fireEvent.click(within(alert).getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => {
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
    });
    const keys = calls.filter((c) => c.method === 'POST').map((c) => c.headers['idempotency-key']);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('connexion coupée sans fin de flux : « on reprend », et le renvoi réutilise la MÊME clé (aucun doublon)', async () => {
    const first = controlledStream();
    const calls = stubApi({
      [CAMPAIGN_GET]: json(campaign()),
      [PROPOSALS]: [json({ data: [] }), json({ data: [] }), json({ data: [proposal(1)] })],
      [GENERATE]: [() => first.response(), json(proposal(1), 201)],
    });
    mount();
    await clickGenerate();
    await screen.findByText('J’écris ta proposition…');
    await act(async () => {
      first.close(); // coupure : ni done ni error
      await Promise.resolve();
    });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('La connexion s’est coupée');
    fireEvent.click(within(alert).getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => {
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
    });
    const keys = calls.filter((c) => c.method === 'POST').map((c) => c.headers['idempotency-key']);
    expect(keys[0]).toBe(keys[1]);
  });

  it('erreur avant le flux : 429 → message de limite ; 409 en cours → message d’attente', async () => {
    stubApi({
      [CAMPAIGN_GET]: json(campaign()),
      [PROPOSALS]: json({ data: [] }),
      [GENERATE]: [
        problem('rate_limited', 429),
        problem('conflict', 409, { reason: 'generation_in_progress' }),
      ],
    });
    mount();
    await clickGenerate();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Tu as demandé beaucoup de propositions',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Générer la proposition' }));
    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('déjà en cours d’écriture');
    });
  });

  it('409 « déjà en cours » : [Réessayer] est proposé et reprend la MÊME clé (jamais une seconde dépense)', async () => {
    const calls = stubApi({
      [CAMPAIGN_GET]: json(campaign()),
      [PROPOSALS]: [json({ data: [] }), json({ data: [] }), json({ data: [proposal(1)] })],
      [GENERATE]: [
        problem('conflict', 409, { reason: 'generation_in_progress' }),
        json(proposal(1), 201),
      ],
    });
    mount();
    await clickGenerate();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('déjà en cours d’écriture');
    fireEvent.click(within(alert).getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => {
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
    });
    const keys = calls.filter((c) => c.method === 'POST').map((c) => c.headers['idempotency-key']);
    expect(keys[0]).toBe(keys[1]);
  });

  it('page rechargée pendant l’écriture : la clé est gardée pour la campagne, la reprise réutilise la MÊME clé', async () => {
    const first = controlledStream();
    const calls = stubApi({
      [CAMPAIGN_GET]: json(campaign()),
      [PROPOSALS]: json({ data: [] }),
      [GENERATE]: [() => first.response(), json(proposal(1), 201)],
    });
    const view = mount();
    await clickGenerate();
    await screen.findByText('J’écris ta proposition…');
    view.unmount(); // rechargement : l'état de la page est perdu
    const second = mount();
    expect(second.container).toBeTruthy();
    await clickGenerate();
    await waitFor(() => {
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
    });
    const keys = calls.filter((c) => c.method === 'POST').map((c) => c.headers['idempotency-key']);
    expect(keys[0]).toBe(keys[1]);
  });

  it('génération réussie : la clé gardée est effacée, la suivante sera neuve', async () => {
    const live = controlledStream();
    stubApi({
      [CAMPAIGN_GET]: json(campaign()),
      [PROPOSALS]: [json({ data: [] }), json({ data: [proposal(1)] })],
      [GENERATE]: () => live.response(),
    });
    mount();
    await clickGenerate();
    await screen.findByText('J’écris ta proposition…');
    expect(window.sessionStorage.length).toBe(1); // gardée pendant l'écriture
    await act(async () => {
      live.send('done', proposal(1));
      live.close();
      await Promise.resolve();
    });
    await screen.findByText('Coût estimé');
    expect(window.sessionStorage.length).toBe(0);
  });

  it('taux de change indisponible : le dit clairement, le coût reste en dollars, aucune monnaie locale inventée', async () => {
    stubApi({
      [CAMPAIGN_GET]: json(campaign()),
      [PROPOSALS]: json({ data: [proposal(1, COST_NO_FX)] }),
    });
    mount();
    expect(await screen.findByText(/taux de change n’est pas disponible/)).toBeTruthy();
    expect(screen.queryByText('Coût total')).toBeNull();
    expect(screen.queryByText(/FCFA/)).toBeNull();
    expect(screen.getAllByText(/28,00/).length).toBeGreaterThan(0);
  });

  it('DÉCISION 16/10/2026 : aucune estimation de portée n’est affichée (elle viendra de Meta avec la publication)', async () => {
    stubApi({
      [CAMPAIGN_GET]: json(campaign()),
      [PROPOSALS]: json({ data: [proposal(1, COST_OK)] }),
    });
    mount();
    await screen.findByText('Messages ou interactions');
    expect(screen.queryByText(/personnes touchées/i)).toBeNull();
    expect(screen.queryByText(/estimation de portée/i)).toBeNull();
    expect(screen.queryByText(/portée estimée/i)).toBeNull();
  });

  it('proposition complète : fiche lisible, justifications, coût FCFA avec dollars dessous', async () => {
    stubApi({
      [CAMPAIGN_GET]: json(campaign()),
      [PROPOSALS]: json({ data: [proposal(1, COST_OK, { warnings: ['WhatsApp non lié.'] })] }),
    });
    mount();
    await screen.findByText('Messages ou interactions');
    expect(screen.getByText('Vos clients peuvent vous écrire directement.')).toBeTruthy();
    expect(screen.getByText(/Du 13 octobre au 19 octobre/)).toBeTruthy();
    // TVA retirée pour le moment (décision du 17/10/2026) : le coût est le budget, rien n'est ajouté.
    expect(screen.getByText('Coût total')).toBeTruthy();
    expect(screen.getByText(/16\s?800\s?FCFA/)).toBeTruthy();
    expect(screen.getAllByText(/28,00/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/TVA/)).toBeNull();
    expect(screen.getByText('WhatsApp non lié.')).toBeTruthy();
    // Une seule proposition : pas d'onglets.
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('en anglais : libellés traduits et dates à l’anglaise', async () => {
    stubApi({ [CAMPAIGN_GET]: json(campaign()), [PROPOSALS]: json({ data: [proposal(1)] }) });
    mount({}, { locale: 'en' });
    expect(await screen.findByText('Messages or engagement')).toBeTruthy();
    expect(screen.getByText('Estimated cost')).toBeTruthy();
    expect(screen.getByText(/From October 13 to October 19/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Another proposal' })).toBeTruthy();
  });

  it('plusieurs propositions : onglets accessibles, un clic change de proposition', async () => {
    stubApi({
      [CAMPAIGN_GET]: json(campaign()),
      [PROPOSALS]: json({
        data: [
          proposal(1),
          proposal(2, COST_OK, {
            copy: {
              primary_text: 'Autre angle.',
              headline: 'Titre deux',
              description: null,
              cta: 'LEARN_MORE',
              angle: 'quality',
            },
          }),
        ],
      }),
    });
    mount({}, { search: '?proposition=1' });
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Proposition 1', 'Proposition 2']);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('proposal-tab-1');
    fireEvent.click(tabs[1]!);
    await screen.findByText('Titre deux');
    expect(screen.getAllByRole('tab')[1]?.getAttribute('aria-selected')).toBe('true');
  });

  it('[Autre proposition] : nouvelle clé d’idempotence et nouvelle écriture en direct', async () => {
    const live = controlledStream();
    const calls = stubApi({
      [CAMPAIGN_GET]: json(campaign()),
      [PROPOSALS]: json({ data: [proposal(1)] }),
      [GENERATE]: () => live.response(),
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Autre proposition' }));
    await screen.findByText('J’écris ta proposition…');
    expect(screen.getByText('Proposition 2 · par l’IA')).toBeTruthy();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    await act(async () => {
      live.send('retry', {});
      await Promise.resolve();
    });
    await screen.findByText('Je reprends l’écriture pour corriger un détail.');
    await act(async () => {
      live.close();
      await Promise.resolve();
    });
  });

  it('[Continuer] retient la proposition (POST choose) puis confirme', async () => {
    const calls = stubApi({
      [CAMPAIGN_GET]: json(campaign()),
      [PROPOSALS]: json({ data: [proposal(1)] }),
      [`POST /campaigns/${CAMPAIGN}/proposals/1/choose`]: json(chosenCampaign()),
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Continuer' }));
    expect(await screen.findByText('Proposition retenue', { selector: 'p' })).toBeTruthy();
    expect(calls.some((c) => c.path.endsWith('/proposals/1/choose'))).toBe(true);
  });

  it('[Continuer] envoie la version du brouillon lue (verrou optimiste) avec le choix', async () => {
    const calls = stubApi({
      [CAMPAIGN_GET]: json(campaign({ version: 4 })),
      [PROPOSALS]: json({ data: [proposal(1)] }),
      [`POST /campaigns/${CAMPAIGN}/proposals/1/choose`]: json(chosenCampaign()),
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Continuer' }));
    await screen.findByText('Proposition retenue', { selector: 'p' });
    const post = calls.find((c) => c.path.endsWith('/proposals/1/choose'));
    expect(post?.body).toEqual({ version: 4 });
  });

  it('CONFLIT au choix (409) : bandeau « a changé ailleurs », rien de retenu, [Recharger] relit le serveur', async () => {
    const calls = stubApi({
      [CAMPAIGN_GET]: json(campaign()),
      [PROPOSALS]: json({ data: [proposal(1)] }),
      [`POST /campaigns/${CAMPAIGN}/proposals/1/choose`]: problem('conflict', 409, {
        current_version: 6,
        reason: 'stale_version',
      }),
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Continuer' }));
    expect(await screen.findByText('Cette campagne a changé ailleurs')).toBeTruthy();
    expect(screen.queryByText('Proposition retenue', { selector: 'p' })).toBeNull();
    const before = calls.filter(
      (c) => c.method === 'GET' && c.path === `/campaigns/${CAMPAIGN}`,
    ).length;
    fireEvent.click(screen.getByRole('button', { name: 'Recharger la campagne' }));
    await waitFor(() => {
      expect(
        calls.filter((c) => c.method === 'GET' && c.path === `/campaigns/${CAMPAIGN}`).length,
      ).toBeGreaterThan(before);
    });
  });

  it('refus du serveur au choix : message, rien de retenu', async () => {
    stubApi({
      [CAMPAIGN_GET]: json(campaign()),
      [PROPOSALS]: json({ data: [proposal(1)] }),
      [`POST /campaigns/${CAMPAIGN}/proposals/1/choose`]: problem('validation_failed', 400),
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Continuer' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Le serveur a refusé une valeur',
    );
    expect(screen.queryByText('Proposition retenue', { selector: 'p' })).toBeNull();
  });

  it('campagne illisible : message et [Réessayer]', async () => {
    stubApi({ [CAMPAIGN_GET]: problem('internal_error', 500), [PROPOSALS]: json({ data: [] }) });
    mount();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Je n’arrive pas à charger ta campagne',
    );
  });

  it('création du brouillon refusée : message, aucune dépense', async () => {
    const calls = stubApi({ 'POST /campaigns': problem('conflict', 409) });
    mount({ campaignId: null });
    await clickGenerate();
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Le brouillon n’a pas pu être créé',
    );
    expect(calls.filter((c) => c.path.endsWith('/proposals'))).toHaveLength(0);
  });
});

describe('sans Meta connecté', () => {
  it('aucune Page : le brouillon se crée sans page_id (on prépare quand même, APPFLOW §8.0)', async () => {
    const calls = stubApi({
      'POST /campaigns': json(campaign(), 201),
      [CAMPAIGN_GET]: json(campaign()),
      [PROPOSALS]: json({ data: [] }),
      [GENERATE]: json({}, 500),
    });
    mount({ campaignId: null, pageId: null });
    await clickGenerate();
    await waitFor(() => {
      expect(calls.some((c) => c.method === 'POST' && c.path === '/campaigns')).toBe(true);
    });
    expect(calls.find((c) => c.method === 'POST' && c.path === '/campaigns')?.body).toEqual({
      analysis_id: ANALYSIS,
      platform: 'meta',
    });
  });
});

describe('modification', () => {
  function setup(patchReply: () => Response) {
    return stubApi({
      [CAMPAIGN_GET]: json(chosenCampaign()),
      [PROPOSALS]: json({ data: [proposal(1)] }),
      [`PATCH /campaigns/${CAMPAIGN}`]: patchReply,
    });
  }

  it('[Modifier] ouvre le formulaire ; les erreurs s’affichent champ par champ et rien ne part', async () => {
    const calls = setup(json(chosenCampaign({ version: 3 })));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    const title = await screen.findByLabelText('Titre');
    fireEvent.change(title, { target: { value: 'x'.repeat(41) } });
    fireEvent.change(screen.getByLabelText('Budget par jour'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer mes modifications' }));
    expect(await screen.findByText('40 caractères au maximum.')).toBeTruthy();
    expect(screen.getByText('Le budget minimum est de 1 $ par jour.')).toBeTruthy();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });

  it('enregistre seulement ce qui a changé, avec la version lue, puis referme', async () => {
    const calls = setup(json(chosenCampaign({ version: 3, daily_budget_usd_cents: 500 })));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    fireEvent.change(await screen.findByLabelText('Budget par jour'), { target: { value: '5' } });
    expect(screen.getByText(/Minimum 1 \$ par jour\. 3\s?000\s?FCFA environ\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer mes modifications' }));
    await waitFor(() => {
      expect(screen.queryByLabelText('Budget par jour')).toBeNull();
    });
    const patch = calls.find((c) => c.method === 'PATCH');
    expect(patch?.body).toEqual({ version: 2, daily_budget_usd_cents: 500 });
  });

  it('CONFLIT DE VERSION (409) : bandeau explicite et [Recharger la campagne] relit le serveur', async () => {
    const calls = setup(problem('conflict', 409, { current_version: 5, reason: 'stale_version' }));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    fireEvent.change(await screen.findByLabelText('Titre'), { target: { value: 'Nouveau titre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer mes modifications' }));
    const banner = await screen.findByText('Cette campagne a changé ailleurs');
    expect(banner).toBeTruthy();
    const before = calls.filter(
      (c) => c.method === 'GET' && c.path === `/campaigns/${CAMPAIGN}`,
    ).length;
    fireEvent.click(screen.getByRole('button', { name: 'Recharger la campagne' }));
    await waitFor(() => {
      expect(
        calls.filter((c) => c.method === 'GET' && c.path === `/campaigns/${CAMPAIGN}`).length,
      ).toBeGreaterThan(before);
    });
    await waitFor(() => {
      expect(screen.queryByText('Cette campagne a changé ailleurs')).toBeNull();
    });
  });

  it('échec d’enregistrement : message, le formulaire reste ouvert avec la saisie', async () => {
    setup(problem('internal_error', 500));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    fireEvent.change(await screen.findByLabelText('Titre'), { target: { value: 'Autre titre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer mes modifications' }));
    expect(
      await screen.findByText('Tes modifications n’ont pas été enregistrées. Réessaie.'),
    ).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('Titre').value).toBe('Autre titre');
  });

  it('changer d’objectif propose les destinations permises et corrige la destination', async () => {
    const calls = setup(json(chosenCampaign({ version: 3 })));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    fireEvent.click(await screen.findByRole('radio', { name: /Ventes en ligne/ }));
    expect(screen.getByRole('radio', { name: 'Site web' }).getAttribute('aria-checked')).toBe(
      'true',
    );
    expect(screen.queryByRole('radio', { name: 'WhatsApp' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer mes modifications' }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === 'PATCH')).toBe(true);
    });
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({
      objective: 'OUTCOME_SALES',
      destination: 'WEBSITE',
    });
  });

  it('villes : ajout et retrait ; AUCUN champ de centres d’intérêt (ciblage automatique d’abord)', async () => {
    const calls = setup(json(chosenCampaign({ version: 3 })));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ajouter une ville' }));
    const cityNames = screen.getAllByLabelText('Ville');
    fireEvent.change(cityNames[1]!, { target: { value: 'Yaoundé' } });
    expect(screen.queryByLabelText('Centre d’intérêt')).toBeNull();
    expect(screen.queryByText('Centres d’intérêt')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer Douala' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer mes modifications' }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === 'PATCH')).toBe(true);
    });
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({
      geo: { cities: [{ name: 'Yaoundé', radius_km: 10 }] },
    });
    expect(calls.find((c) => c.method === 'PATCH')?.body).not.toHaveProperty('targeting');
  });

  it('[Annuler] referme sans rien envoyer', async () => {
    const calls = setup(json(chosenCampaign()));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Annuler' }));
    expect(screen.queryByLabelText('Titre')).toBeNull();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });
});

describe('dans l’assistant', () => {
  const READY = {
    id: ANALYSIS,
    status: 'ready',
    blocked_reason: null,
    questions: [{ id: 'q1', text: 'Quel numéro ?', input: 'phone', options: null, required: true }],
    unreadable_sources: [],
    error_code: null,
    flags: [],
    answers: [{ question_id: 'q1', answer: '+237690123456' }],
    page_id: PAGE,
  };

  it('réponses enregistrées : [Continuer vers la proposition] ouvre l’étape Proposition (adresse ?etape=proposition)', async () => {
    stubApi({ [`GET /analyses/${ANALYSIS}`]: json(READY) });
    const { CampaignWizard } = await import('./campaign-wizard');
    const view = render(
      <NextIntlClientProvider locale="fr" messages={messagesFor('fr')}>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <NuqsTestingAdapter searchParams={`?analyse=${ANALYSIS}`} hasMemory>
            <CampaignWizard workspace={{ id: WS, role: 'owner', status: 'active' }} />
          </NuqsTestingAdapter>
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Continuer vers la proposition' }));
    expect(await screen.findByText('Ta proposition de campagne')).toBeTruthy();
    // Le fil d'étapes passe à « Proposition ».
    expect(view.container.querySelector('[aria-current="step"]')?.textContent).toContain(
      'Proposition',
    );
    expect(screen.getByRole('button', { name: 'Générer la proposition' })).toBeTruthy();
  });
});

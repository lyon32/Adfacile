// @vitest-environment happy-dom
// Vie de la campagne à l'écran (S17, APPFLOW §7 et §11) : bandeau, tableau de bord, page de campagne (Résultats, Pubs, Réglages,
// Historique), pause, reprise, relance, « Actualiser » (TR-PLA-06), limite de débit (EC-META-10), attribution des taux. Aucun appel
// réseau réel : `fetch` est simulé ; chiffres et taux D'ESSAI.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messagesFor, type Locale } from '@pubeka/i18n';
import { SessionProvider, type SessionValue } from '../shell/session-context';
import { TopBanner } from '../shell/top-banner';
import { CampaignPage } from './campaign-page';
import { CampaignsPage } from './campaigns-page';
import { Dashboard } from './dashboard';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/',
}));

function isDisabled(element: HTMLElement): boolean {
  return element instanceof HTMLButtonElement && element.disabled;
}

const WS = '44444444-4444-4444-8444-444444444444';
const ID = '55555555-5555-4555-8555-555555555555';
const ANALYSIS = '77777777-7777-4777-8777-777777777777';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockClear();
});

const json =
  (b: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const problem = (code: string, status: number, meta: Record<string, unknown> = {}, extra = {}) =>
  json({ type: 'x', title: code, status, code, request_id: 'req_T', meta, ...extra }, status);

interface Call {
  method: string;
  path: string;
  body: unknown;
}
type Handler = () => Response;
function stubApi(routes: Record<string, Handler | Handler[]>): Call[] {
  const calls: Call[] = [];
  const counters = new Map<string, number>();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = url
        .replace('/api/v1', '')
        .replace(`/workspaces/${WS}/campaigns/${ID}`, '/c')
        .replace(`/workspaces/${WS}`, '/w');
      calls.push({
        method,
        path,
        body: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : init?.body,
      });
      const key = `${method} ${path}`;
      const entry = routes[key];
      const n = counters.get(key) ?? 0;
      counters.set(key, n + 1);
      const respond = Array.isArray(entry) ? entry[Math.min(n, entry.length - 1)] : entry;
      return Promise.resolve(
        respond === undefined ? new Response(null, { status: 404 }) : respond(),
      );
    }),
  );
  return calls;
}

function session(role: 'owner' | 'editor' | 'viewer' = 'owner'): SessionValue {
  return {
    userId: 'u1',
    email: 'awa@exemple.test',
    firstName: 'Awa',
    lastName: null,
    locale: 'fr',
    theme: 'light',
    workspace: { id: WS, name: 'Awa', role, plan: 'pro', status: 'active' },
  };
}

function mount(
  ui: ReactNode,
  locale: Locale = 'fr',
  search = '',
  role: 'owner' | 'editor' | 'viewer' = 'owner',
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
        <NuqsTestingAdapter searchParams={search} hasMemory>
          <SessionProvider value={session(role)}>{ui}</SessionProvider>
        </NuqsTestingAdapter>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

// ---- Données d'essai ---------------------------------------------------------------------------------------------------------

const FX_OK = {
  status: 'ok',
  currency: 'XAF',
  source: 'exchangerate-api',
  fetched_at: '2026-10-24T08:00:00Z',
};
const FX_NONE = { status: 'fx_not_available', currency: null, source: null, fetched_at: null };
const money = (usd: number, local: number | null = usd * 6, currency: string | null = 'XAF') => ({
  usd_cents: usd,
  local_minor: local,
  currency: local === null ? null : currency,
});

const overview = (over: Record<string, unknown> = {}) => ({
  counts: { active: 2, in_review: 1, paused: 0, stopped: 0, other: 0 },
  month: '2026-10',
  spent_month: money(6000),
  range: 'week',
  chart: [
    { date: '2026-10-22', results: 3, spend_usd_cents: 100 },
    { date: '2026-10-23', results: 9, spend_usd_cents: 300 },
    { date: '2026-10-24', results: 20, spend_usd_cents: 500 },
  ],
  campaigns: [
    {
      id: ID,
      name: 'Promo baskets',
      status: 'active',
      paused_at: null,
      results: 42,
      result_kind: 'whatsapp_conversation',
      spend: money(15_000),
      cost_per_result: money(357, 357),
      synced_at: '2026-10-24T09:00:00Z',
      sync_error: null,
    },
    {
      id: '66666666-6666-4666-8666-666666666666',
      name: 'Soldes',
      status: 'in_review',
      paused_at: null,
      results: 0,
      result_kind: null,
      spend: money(0, 0),
      cost_per_result: null,
      synced_at: null,
      sync_error: null,
    },
  ],
  fx: FX_OK,
  ...over,
});

const cost = {
  status: 'ok',
  days: 7,
  budget_usd_cents: 2800,
  total: { local_minor: 16800, usd_cents: 2800, currency: 'XAF' },
  daily: { local_minor: 2400, usd_cents: 400, currency: 'XAF' },
  fx: { rate: 600, quote: 'XAF', source: 'exchangerate-api' },
};
const campaign = (over: Record<string, unknown> = {}) => ({
  id: ID,
  status: 'active',
  version: 4,
  name: 'Promo baskets',
  editable: true,
  analysis_id: ANALYSIS,
  paused_at: null,
  objective: 'OUTCOME_ENGAGEMENT',
  destination: 'WHATSAPP',
  geo: { countries: ['CM'], cities: [{ name: 'Douala', radius_km: 17 }] },
  targeting: {},
  daily_budget_usd_cents: 400,
  start_date: '2026-10-20',
  end_date: '2026-10-27',
  copy: { primary_text: 'Des baskets neuves à Douala.', headline: 'Baskets à prix doux' },
  cost,
  ...over,
});

const stats = (over: Record<string, unknown> = {}) => ({
  range: { from: '2026-09-25', to: '2026-10-24' },
  summary: {
    spend: money(15_000),
    results: 42,
    result_kind: 'whatsapp_conversation',
    cost_per_result: money(357, 2142),
    reach: 8000,
    impressions: 12_000,
    clicks: 300,
    ctr: 2.5,
    cpm: money(125),
    frequency: 1.5,
  },
  daily: [
    {
      date: '2026-10-23',
      spend: money(7000),
      results: 20,
      impressions: 6000,
      reach: 4000,
      clicks: 150,
    },
    {
      date: '2026-10-24',
      spend: money(8000),
      results: 22,
      impressions: 6000,
      reach: 4000,
      clicks: 150,
    },
  ],
  fx: FX_OK,
  synced_at: '2026-10-24T09:00:00Z',
  sync_error: null,
  ...over,
});

const events = {
  data: [
    {
      id: 3,
      created_at: '2026-10-24T09:00:00Z',
      status: 'active',
      source: 'poll',
      detail: { raw_status: 'ACTIVE', event: 'approve' },
    },
    { id: 2, created_at: '2026-10-23T09:00:00Z', status: 'in_review', source: 'user', detail: {} },
    { id: 1, created_at: '2026-10-23T08:00:00Z', status: 'bizarre', source: 'webhook', detail: {} },
  ],
};
const ads = {
  data: [
    {
      id: 'a1',
      format: '4:5',
      variant: null,
      status: null,
      photo_url: 'https://storage.test/p.jpg',
    },
  ],
  ab_test: false,
};

const ROUTES = (
  extra: Record<string, Handler | Handler[]> = {},
): Record<string, Handler | Handler[]> => ({
  'GET /c': json(campaign()),
  'GET /c/stats': json(stats()),
  'GET /c/events': json(events),
  'GET /c/ads': json(ads),
  'GET /w/overview?range=week': json(overview()),
  'GET /w/overview?range=month': json(overview({ range: 'month' })),
  ...extra,
});

// ---- Tableau de bord -------------------------------------------------------------------------------------------------------

describe('Tableau de bord (APPFLOW §7)', () => {
  it('phrase d’état, tableau avec le résultat traduit en argent et lien vers la campagne', async () => {
    stubApi(ROUTES());
    mount(<Dashboard workspaceId={WS} canCreate />);
    expect(
      await screen.findByText('2 campagnes en diffusion, 1 en vérification chez Meta'),
    ).toBeTruthy();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const first = within(rows[0]!);
    expect(first.getByRole('link', { name: 'Promo baskets' }).getAttribute('href')).toBe(
      `/campagnes/${ID}`,
    );
    expect(first.getByText('42 messages WhatsApp')).toBeTruthy();
    expect(first.getByText('En diffusion')).toBeTruthy();
    // Une campagne sans résultat le dit, sans chiffre inventé.
    expect(within(rows[1]!).getByText('Pas encore de résultat')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Nouvelle campagne' }).getAttribute('href')).toBe(
      '/campagnes/nouvelle',
    );
  });

  it('attribution obligatoire d’Exchange Rate API sous les montants convertis ; absente quand le dollar est seul', async () => {
    stubApi(ROUTES());
    mount(<Dashboard workspaceId={WS} canCreate />);
    const link = await screen.findByRole('link', { name: 'Taux fournis par Exchange Rate API' });
    expect(link.getAttribute('href')).toBe('https://www.exchangerate-api.com');
    expect(link.getAttribute('rel')).toContain('noopener');
    cleanup();
    stubApi(
      ROUTES({
        'GET /w/overview?range=week': json(
          overview({ fx: FX_NONE, spent_month: money(6000, null) }),
        ),
      }),
    );
    mount(<Dashboard workspaceId={WS} canCreate />);
    expect(await screen.findByText(/Taux de change indisponible/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Taux fournis par Exchange Rate API' })).toBeNull();
  });

  it('aucune campagne : invitation à créer la première (APPFLOW §7.2)', async () => {
    stubApi(
      ROUTES({
        'GET /w/overview?range=week': json(
          overview({
            campaigns: [],
            counts: { active: 0, in_review: 0, paused: 0, stopped: 0, other: 0 },
          }),
        ),
      }),
    );
    mount(<Dashboard workspaceId={WS} canCreate />);
    expect(await screen.findByText('Crée ta première pub')).toBeTruthy();
  });

  it('un lecteur ne voit pas le bouton « Nouvelle campagne »', async () => {
    stubApi(ROUTES());
    mount(<Dashboard workspaceId={WS} canCreate={false} />);
    await screen.findByText('2 campagnes en diffusion, 1 en vérification chez Meta');
    expect(screen.queryByRole('link', { name: 'Nouvelle campagne' })).toBeNull();
  });

  it('erreur de chargement : message clair et « Réessayer »', async () => {
    stubApi(
      ROUTES({ 'GET /w/overview?range=week': [problem('internal_error', 500), json(overview())] }),
    );
    mount(<Dashboard workspaceId={WS} canCreate />);
    expect(await screen.findByText(/Impossible de charger tes campagnes/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Promo baskets')).toBeTruthy();
  });

  it('semaine / mois : le graphique change de période', async () => {
    const calls = stubApi(ROUTES());
    mount(<Dashboard workspaceId={WS} canCreate />);
    await screen.findByText('Promo baskets');
    fireEvent.click(screen.getByRole('button', { name: 'Mois' }));
    await waitFor(() => {
      expect(calls.some((c) => c.path === '/w/overview?range=month')).toBe(true);
    });
    expect(screen.getByRole('button', { name: 'Mois' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('le graphique est doublé d’un tableau lisible par un lecteur d’écran', async () => {
    stubApi(ROUTES());
    mount(<Dashboard workspaceId={WS} canCreate />);
    await screen.findByText('Promo baskets');
    const table = screen.getAllByRole('table')[0]!;
    expect(within(table).getAllByRole('row')).toHaveLength(4);
  });

  it('EC-META-10 : quand Meta limite le débit, l’écran le dit et garde les derniers chiffres', async () => {
    const base = overview();
    const limited = overview({
      campaigns: [{ ...base.campaigns[0]!, sync_error: 'rate_limited' }, base.campaigns[1]!],
    });
    stubApi(ROUTES({ 'GET /w/overview?range=week': json(limited) }));
    mount(<Dashboard workspaceId={WS} canCreate />);
    expect(await screen.findByText(/Meta limite les requêtes pour le moment/)).toBeTruthy();
    expect(screen.getByText('42 messages WhatsApp')).toBeTruthy();
  });
});

describe('Page « Campagnes »', () => {
  it('liste les campagnes ; vide : invitation', async () => {
    stubApi(ROUTES());
    mount(<CampaignsPage workspaceId={WS} canCreate />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Campagnes' })).toBeTruthy();
    expect(await screen.findByText('Soldes')).toBeTruthy();
    cleanup();
    stubApi(ROUTES({ 'GET /w/overview?range=week': json(overview({ campaigns: [] })) }));
    mount(<CampaignsPage workspaceId={WS} canCreate />);
    expect(await screen.findByText('Aucune campagne pour l’instant')).toBeTruthy();
  });
});

// ---- Bandeau du haut -------------------------------------------------------------------------------------------------------

describe('Bandeau du haut (PRD §10.1)', () => {
  it('avec de l’activité : campagnes actives et dépensé ce mois (FCFA, dollars dessous)', async () => {
    stubApi(ROUTES());
    mount(<TopBanner />);
    expect(await screen.findByText('Campagnes actives')).toBeTruthy();
    expect(screen.getByText('Dépensé ce mois')).toBeTruthy();
    expect(screen.getByText(/36\s?000\s?FCFA/)).toBeTruthy();
    expect(screen.getByText(/≈\s?60,00\s?\$/)).toBeTruthy();
  });

  it('sans activité (que des brouillons) ou tant que ça charge : l’appel à l’action, jamais un faux zéro', async () => {
    stubApi(
      ROUTES({
        'GET /w/overview?range=week': json(
          overview({ campaigns: [{ ...overview().campaigns[1]!, status: 'draft' }] }),
        ),
      }),
    );
    mount(<TopBanner />);
    expect(screen.getByText('Ta première campagne t’attend')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Créer une campagne' })).toBeTruthy();
    });
    expect(screen.queryByText('Campagnes actives')).toBeNull();
  });

  it('en anglais', async () => {
    stubApi(ROUTES());
    mount(<TopBanner />, 'en');
    expect(await screen.findByText('Active campaigns')).toBeTruthy();
    expect(screen.getByText('Spent this month')).toBeTruthy();
  });
});

// ---- Page de campagne ------------------------------------------------------------------------------------------------------

const page = (role: 'owner' | 'editor' | 'viewer' = 'owner', status = 'active') => (
  <CampaignPage workspace={{ id: WS, role, status }} campaignId={ID} />
);

describe('Page de campagne — en-tête et actions (APPFLOW §11.1-11.2)', () => {
  it('état, phrase d’état et pause : Meta d’abord, puis l’écran se met à jour', async () => {
    const calls = stubApi(
      ROUTES({
        'POST /c/pause': json(campaign({ status: 'paused', paused_at: '2026-10-24T10:00:00Z' })),
        'GET /c': [
          json(campaign()),
          json(campaign({ status: 'paused', paused_at: '2026-10-24T10:00:00Z' })),
        ],
      }),
    );
    mount(page());
    expect(await screen.findByRole('heading', { level: 1, name: 'Promo baskets' })).toBeTruthy();
    expect(screen.getByText('Ta pub est visible.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mettre en pause' }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === 'POST' && c.path === '/c/pause')).toBe(true);
    });
    expect(await screen.findByText(/Mise en pause par toi le 24\/10/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reprendre' })).toBeTruthy();
  });

  it('reprendre demande confirmation (cela dépense de l’argent), puis appelle la route', async () => {
    const calls = stubApi(
      ROUTES({
        'GET /c': json(campaign({ status: 'paused', paused_at: '2026-10-24T10:00:00Z' })),
        'POST /c/resume': json(campaign()),
      }),
    );
    mount(page());
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre' }));
    expect(calls.some((c) => c.path === '/c/resume')).toBe(false);
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reprendre' }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === 'POST' && c.path === '/c/resume')).toBe(true);
    });
  });

  it('campagne arrêtée : explication du paiement et « Relancer » avec la version lue (EC-TEAM-08)', async () => {
    const calls = stubApi(
      ROUTES({
        'GET /c': json(campaign({ status: 'stopped', version: 9 })),
        'POST /c/relaunch': json(campaign()),
      }),
    );
    mount(page());
    expect(await screen.findByText('Meta a arrêté ta pub : le paiement a échoué.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Relancer' }),
    );
    await waitFor(() => {
      expect(calls.find((c) => c.path === '/c/relaunch')?.body).toEqual({
        mode: 'recover',
        version: 9,
      });
    });
  });

  it('EC-META-07 : si Meta refuse, le message de Meta s’affiche et on dit que rien n’a changé', async () => {
    stubApi(
      ROUTES({
        'GET /c': json(campaign({ status: 'stopped' })),
        'POST /c/relaunch': problem('meta_payment_method_missing', 424, {
          title: 'Paiement refusé',
          message: 'Ajoute un moyen de paiement.',
        }),
      }),
    );
    mount(page());
    fireEvent.click(await screen.findByRole('button', { name: 'Relancer' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Relancer' }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Paiement refusé');
    expect(alert.textContent).toContain('Ajoute un moyen de paiement.');
    expect(alert.textContent).toContain('Rien n’a changé sur ta campagne.');
  });

  it('interrupteur de sécurité (503 publish_disabled) : message dédié', async () => {
    stubApi(
      ROUTES({
        'GET /c': json(campaign({ status: 'paused' })),
        'POST /c/resume': problem('provider_unavailable', 503, { reason: 'publish_disabled' }),
      }),
    );
    mount(page());
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre' }));
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reprendre' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'La publication réelle est désactivée',
    );
  });

  it('terminée : « Relancer » copie la campagne puis ouvre l’aperçu de la copie (F9)', async () => {
    const calls = stubApi(
      ROUTES({
        'GET /c': json(campaign({ status: 'ended' })),
        'POST /c/relaunch': json(
          campaign({ id: '88888888-8888-4888-8888-888888888888', status: 'draft' }),
          201,
        ),
      }),
    );
    mount(page());
    expect(await screen.findByText(/Terminée le 27\/10/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Relancer' }));
    await waitFor(() => {
      expect(calls.find((c) => c.path === '/c/relaunch')?.body).toEqual({
        mode: 'copy',
        visual_mode: 'same',
      });
      expect(push).toHaveBeenCalledWith(
        `/campagnes/nouvelle?analyse=${ANALYSIS}&campagne=88888888-8888-4888-8888-888888888888&etape=apercu`,
      );
    });
  });

  it('un lecteur ne voit aucune action ; un espace en lecture seule garde la pause mais bloque reprise et duplication', async () => {
    stubApi(ROUTES());
    mount(page('viewer'));
    await screen.findByRole('heading', { level: 1, name: 'Promo baskets' });
    expect(screen.queryByRole('button', { name: 'Mettre en pause' })).toBeNull();
    cleanup();
    stubApi(ROUTES());
    mount(page('owner', 'read_only'));
    await screen.findByRole('heading', { level: 1, name: 'Promo baskets' });
    expect(isDisabled(screen.getByRole('button', { name: 'Mettre en pause' }))).toBe(false);
    expect(isDisabled(screen.getByRole('button', { name: 'Dupliquer' }))).toBe(true);
    expect(screen.getByText(/lecture seule/)).toBeTruthy();
  });

  it('campagne d’un autre espace ou inconnue : message clair, retour à la liste', async () => {
    stubApi(ROUTES({ 'GET /c': problem('not_found', 404) }));
    mount(page());
    expect(await screen.findByText('Cette campagne n’existe pas dans cet espace.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Toutes les campagnes' }).getAttribute('href')).toBe(
      '/campagnes',
    );
  });
});

describe('Page de campagne — onglet Résultats (F7, TR-PLA-06)', () => {
  it('le résultat est traduit en argent : « 42 messages WhatsApp, soit … par client potentiel »', async () => {
    stubApi(ROUTES());
    mount(page());
    const sentence = await screen.findByTestId('result-sentence');
    expect(sentence.textContent).toMatch(
      /^42 messages WhatsApp, soit .*FCFA par client potentiel$/,
    );
    expect(screen.getByText(/Mis à jour le/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Taux fournis par Exchange Rate API' })).toBeTruthy();
  });

  it('les statistiques détaillées sont repliées et complètes', async () => {
    stubApi(ROUTES());
    mount(page());
    const summary = await screen.findByText('Statistiques détaillées');
    const details = summary.closest('details');
    expect(details?.open).toBe(false);
    for (const label of [
      'Portée (somme des jours)',
      'Impressions',
      'Clics',
      'Taux de clic',
      'Coût pour 1 000 impressions',
      'Fréquence',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('en anglais', async () => {
    stubApi(ROUTES());
    mount(page(), 'en');
    const sentence = await screen.findByTestId('result-sentence');
    expect(sentence.textContent).toMatch(
      /^42 WhatsApp messages, that is .* per potential customer$/,
    );
    expect(screen.getByRole('link', { name: 'Rates By Exchange Rate API' })).toBeTruthy();
  });

  it('« Actualiser » lance la copie ; le bouton se bloque tant qu’elle n’est pas arrivée, puis l’écran se met à jour tout seul', async () => {
    const calls = stubApi(
      ROUTES({
        'POST /c/stats/refresh': json(
          { status: 'queued', requested_at: '2026-10-24T09:30:00Z' },
          202,
        ),
        'GET /c/stats': [
          json(stats()),
          json(stats()),
          json(
            stats({
              synced_at: '2026-10-24T09:31:00Z',
              summary: { ...stats().summary, results: 50 },
            }),
          ),
        ],
      }),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mount(page());
      fireEvent.click(await screen.findByRole('button', { name: 'Actualiser' }));
      await waitFor(() => {
        expect(calls.some((c) => c.method === 'POST' && c.path === '/c/stats/refresh')).toBe(true);
      });
      expect(isDisabled(await screen.findByRole('button', { name: 'Actualisation…' }))).toBe(true);
      // Interrogation rapprochée (3 s) tant que la copie n'est pas arrivée : la nouvelle valeur s'affiche sans recharger.
      await vi.advanceTimersByTimeAsync(7000);
      await waitFor(() => {
        expect(screen.getByTestId('result-sentence').textContent).toContain('50 messages WhatsApp');
      });
      expect(await screen.findByRole('button', { name: 'Actualiser' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('TR-PLA-06 : 429 → on dit combien de temps attendre', async () => {
    stubApi(
      ROUTES({ 'POST /c/stats/refresh': problem('rate_limited', 429, {}, { retry_after_s: 180 }) }),
    );
    mount(page());
    fireEvent.click(await screen.findByRole('button', { name: 'Actualiser' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Réessaie dans 3 minutes');
  });

  it('EC-META-10 : limite de débit → raison affichée, derniers chiffres gardés avec leur heure', async () => {
    stubApi(ROUTES({ 'GET /c/stats': json(stats({ sync_error: 'rate_limited' })) }));
    mount(page());
    expect(
      await screen.findByText(/Meta limite les requêtes : ces chiffres sont les derniers reçus/),
    ).toBeTruthy();
    expect(screen.getByTestId('result-sentence').textContent).toContain('42 messages WhatsApp');
  });

  it('taux de plus de 48 h : dollars seuls et phrase du taux indisponible, pas de lien d’attribution', async () => {
    stubApi(
      ROUTES({
        'GET /c/stats': json(
          stats({
            fx: FX_NONE,
            summary: {
              ...stats().summary,
              spend: money(15_000, null),
              cost_per_result: money(357, null),
            },
          }),
        ),
      }),
    );
    mount(page());
    const sentence = await screen.findByTestId('result-sentence');
    expect(sentence.textContent).toContain('≈');
    expect(sentence.textContent).not.toContain('FCFA');
    expect(screen.getByText(/Taux de change indisponible/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Taux fournis par Exchange Rate API' })).toBeNull();
  });

  it('jamais de chiffres de Meta : le dit', async () => {
    stubApi(
      ROUTES({
        'GET /c/stats': json(
          stats({
            synced_at: null,
            daily: [],
            summary: { ...stats().summary, results: 0, result_kind: null, cost_per_result: null },
          }),
        ),
      }),
    );
    mount(page());
    expect(await screen.findByText('Pas encore de chiffres de Meta.')).toBeTruthy();
    expect(screen.getByTestId('result-sentence').textContent).toBe('Pas encore de résultat');
  });
});

describe('Page de campagne — Pubs, Réglages, Historique', () => {
  it('onglets accessibles : un seul sélectionné, flèches pour changer, panneau lié', async () => {
    stubApi(ROUTES());
    mount(page());
    await screen.findByRole('heading', { level: 1, name: 'Promo baskets' });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['Résultats', 'Pubs', 'Réglages', 'Historique']);
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1);
    for (const tab of tabs) {
      const panel = document.getElementById(tab.getAttribute('aria-controls') ?? '');
      expect(panel?.getAttribute('role')).toBe('tabpanel');
    }
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Pubs' }).getAttribute('aria-selected')).toBe('true');
    });
  });

  it('Pubs : chaque pub avec son visuel', async () => {
    stubApi(ROUTES());
    mount(page(), 'fr', '?onglet=ads');
    const image = await screen.findByRole('img', { name: 'Visuel de la pub 1' });
    expect(image.getAttribute('src')).toBe('https://storage.test/p.jpg');
  });

  it('Réglages : budget par jour, dates, zone et textes publiés', async () => {
    stubApi(ROUTES());
    mount(page(), 'fr', '?onglet=settings');
    expect(await screen.findByText('Baskets à prix doux')).toBeTruthy();
    expect(screen.getByText(/2\s?400\s?FCFA par jour/)).toBeTruthy();
    expect(screen.getByText(/Douala \(17 km\)/)).toBeTruthy();
    expect(screen.getByText(/duplique-la/)).toBeTruthy();
  });

  it('Historique : événements du plus récent au plus ancien, un statut inconnu garde un libellé neutre', async () => {
    stubApi(ROUTES());
    mount(page(), 'fr', '?onglet=history');
    const items = await screen.findAllByRole('listitem');
    expect(items.map((i) => i.querySelector('p')?.textContent)).toEqual([
      'En diffusion',
      'Envoyée à Meta, en vérification',
      'Changement d’état',
    ]);
    expect(screen.getByText('Statut chez Meta : ACTIVE')).toBeTruthy();
  });
});

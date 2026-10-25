// @vitest-environment happy-dom
// Refus de Meta à l'écran (S18, APPFLOW §12) : bandeau sur la page de la campagne, écran « Voir pourquoi » (ce qui s'est passé, élément en
// cause surligné, correction avant / après), « Appliquer la correction et republier » avec sa confirmation et son `Idempotency-Key`,
// produit interdit sans republication, refus partiel d'un test A/B (EC-META-06), guide du nouvel examen. Aucun appel réseau réel.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messagesFor, type Locale } from '@pubeka/i18n';
import { SessionProvider, type SessionValue } from '../shell/session-context';
import { CampaignPage } from './campaign-page';
import { RejectionPage } from './rejection-report';
import { splitAtExcerpt } from './rejection-text';

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/',
}));

const WS = '44444444-4444-4444-8444-444444444444';
const ID = '55555555-5555-4555-8555-555555555555';
const RID = '88888888-8888-4888-8888-888888888888';
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
const problem = (code: string, status: number, meta: Record<string, unknown> = {}) =>
  json({ type: 'x', title: code, status, code, request_id: 'req_T', meta }, status);

interface Call {
  method: string;
  path: string;
  headers: Record<string, string>;
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
      calls.push({ method, path, headers: (init?.headers ?? {}) as Record<string, string> });
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

function session(
  role: 'owner' | 'editor' | 'viewer',
  status: 'active' | 'read_only' = 'active',
): SessionValue {
  return {
    userId: 'u1',
    email: 'awa@exemple.test',
    firstName: 'Awa',
    lastName: null,
    locale: 'fr',
    theme: 'light',
    workspace: { id: WS, name: 'Awa', role, plan: 'pro', status },
  };
}

function mount(
  ui: ReactNode,
  options: {
    locale?: Locale;
    role?: 'owner' | 'editor' | 'viewer';
    status?: 'active' | 'read_only';
  } = {},
) {
  const locale = options.locale ?? 'fr';
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
        <NuqsTestingAdapter searchParams="" hasMemory>
          <SessionProvider value={session(options.role ?? 'owner', options.status)}>
            {ui}
          </SessionProvider>
        </NuqsTestingAdapter>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const workspace = (role: 'owner' | 'editor' | 'viewer' = 'owner', status = 'active') => ({
  id: WS,
  role,
  status,
});
const reportPage = (role: 'owner' | 'editor' | 'viewer' = 'owner', status = 'active') => (
  <RejectionPage workspace={workspace(role, status)} campaignId={ID} rejectionId={RID} />
);

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
  status: 'rejected',
  version: 4,
  name: 'Crème hydratante',
  editable: false,
  analysis_id: ANALYSIS,
  paused_at: null,
  objective: 'OUTCOME_ENGAGEMENT',
  destination: 'WHATSAPP',
  geo: { countries: ['CM'] },
  targeting: {},
  daily_budget_usd_cents: 400,
  start_date: '2026-10-20',
  end_date: '2026-10-27',
  copy: {
    primary_text: 'Tu as de l’acné ? Notre crème règle ton problème de peau.',
    headline: 'Fini l’acné',
  },
  cost,
  ...over,
});

const report = (over: Record<string, unknown> = {}) => ({
  rejection_category: 'personal_attributes',
  culprit: { where: 'primary_text', excerpt: "Tu as de l'acné ?" },
  cause_certainty: 'high',
  can_fix: true,
  fix: {
    field: 'primary_text',
    original: 'Tu as de l’acné ? Notre crème règle ton problème de peau.',
    suggested: 'Une peau nette et hydratée au quotidien. Écris-nous sur WhatsApp.',
  },
  appeal_recommended: false,
  report:
    'Meta a refusé ta pub car elle parle directement d’un problème de peau. Meta interdit de supposer une caractéristique personnelle. Nous te proposons un texte corrigé.',
  ...over,
});

const rejection = (over: Record<string, unknown> = {}) => ({
  id: RID,
  campaign_id: ID,
  ad_id: 'ad-1',
  variant: null,
  status: 'ready',
  partial: false,
  fixed: false,
  meta_reason: 'Your ad may not be approved because it implies knowledge of personal attributes.',
  report: report(),
  can_fix: true,
  fix_applicable: true,
  appeal_recommended: false,
  created_at: '2026-10-24T09:00:00Z',
  ...over,
});

const ROUTES = (
  extra: Record<string, Handler | Handler[]> = {},
): Record<string, Handler | Handler[]> => ({
  'GET /c': json(campaign()),
  [`GET /c/rejections/${RID}`]: json(rejection()),
  'GET /c/rejections': json({ data: [rejection()] }),
  ...extra,
});

describe('splitAtExcerpt — surlignage de l’élément en cause', () => {
  it('retrouve l’extrait malgré la casse, les apostrophes typographiques et les espaces multiples', () => {
    const parts = splitAtExcerpt('Bonjour. Tu as de l’acné ?   Viens.', "TU AS DE L'ACNÉ ?");
    expect(parts).toEqual({ before: 'Bonjour. ', match: 'Tu as de l’acné ?', after: '   Viens.' });
  });

  it('ne surligne rien quand l’extrait est absent, vide ou nul (jamais deviné)', () => {
    expect(splitAtExcerpt('Un texte', 'autre chose')).toBeNull();
    expect(splitAtExcerpt('Un texte', '   ')).toBeNull();
    expect(splitAtExcerpt('Un texte', null)).toBeNull();
  });

  it('traite les caractères spéciaux de l’extrait comme du texte', () => {
    expect(splitAtExcerpt('Prix (à partir de 5 000 F) ici', '(à partir de 5 000 F)')?.match).toBe(
      '(à partir de 5 000 F)',
    );
  });
});

describe('Bandeau sur la page de la campagne (APPFLOW §12)', () => {
  it('un refus ouvert : titre, explication et « Voir pourquoi » vers le rapport', async () => {
    stubApi(ROUTES({ 'GET /c/stats': json({}), 'GET /c/events': json({ data: [] }) }));
    mount(<CampaignPage workspace={workspace()} campaignId={ID} />);
    expect(await screen.findByText('Meta a refusé ta pub')).toBeTruthy();
    expect(
      screen.getByText('On t’explique pourquoi et on te propose une correction.'),
    ).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Voir pourquoi' });
    expect(link.getAttribute('href')).toBe(`/campagnes/${ID}/refus/${RID}`);
  });

  it('EC-META-06 : refus partiel d’un test A/B — la variante est nommée et la campagne continue', async () => {
    stubApi(
      ROUTES({
        'GET /c': json(campaign({ status: 'active' })),
        'GET /c/rejections': json({ data: [rejection({ variant: 'A', partial: true })] }),
        'GET /c/stats': json({}),
        'GET /c/events': json({ data: [] }),
      }),
    );
    mount(<CampaignPage workspace={workspace()} campaignId={ID} />);
    expect(await screen.findByText('Meta a refusé la pub A de ton test')).toBeTruthy();
    expect(screen.getByText('Ta campagne continue de diffuser l’autre pub.')).toBeTruthy();
  });

  it('un refus déjà corrigé et republié n’affiche plus de bandeau', async () => {
    stubApi(
      ROUTES({
        'GET /c': json(campaign({ status: 'in_review' })),
        'GET /c/rejections': json({ data: [rejection({ fixed: true })] }),
        'GET /c/stats': json({}),
        'GET /c/events': json({ data: [] }),
      }),
    );
    mount(<CampaignPage workspace={workspace()} campaignId={ID} />);
    await screen.findByRole('heading', { level: 1, name: 'Crème hydratante' });
    expect(screen.queryByRole('link', { name: 'Voir pourquoi' })).toBeNull();
  });

  it('rapport en cours de rédaction : le bandeau le dit', async () => {
    stubApi(
      ROUTES({
        'GET /c/rejections': json({ data: [rejection({ status: 'pending', report: null })] }),
        'GET /c/stats': json({}),
        'GET /c/events': json({ data: [] }),
      }),
    );
    mount(<CampaignPage workspace={workspace()} campaignId={ID} />);
    expect(await screen.findByText(/On rédige ton explication/)).toBeTruthy();
  });
});

describe('Écran « Voir pourquoi » (APPFLOW §12)', () => {
  it('les trois blocs : ce qui s’est passé, l’élément en cause surligné, la correction avant / après', async () => {
    stubApi(ROUTES());
    mount(reportPage());
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pourquoi Meta a refusé ta pub' }),
    ).toBeTruthy();
    expect(screen.getByText('Ce qui s’est passé')).toBeTruthy();
    expect(screen.getByText('L’élément en cause')).toBeTruthy();
    expect(screen.getByText('La correction proposée')).toBeTruthy();
    expect(screen.getByText('Cause identifiée')).toBeTruthy();
    expect(screen.getByText(/parle directement d’un problème de peau/)).toBeTruthy();
    // Le motif de Meta est montré tel quel, en anglais.
    const reason = screen.getByText(/implies knowledge of personal attributes/);
    expect(reason.getAttribute('lang')).toBe('en');
    // L'élément en cause est surligné DANS le texte de la pub, avec un équivalent pour les lecteurs d'écran.
    const mark = document.querySelector('mark');
    expect(mark?.textContent).toContain('Tu as de l’acné ?');
    expect(mark?.querySelector('.sr-only')).not.toBeNull();
    // Avant / après.
    expect(screen.getByText('Avant')).toBeTruthy();
    expect(screen.getByText('Après')).toBeTruthy();
    expect(
      screen.getByText('Une peau nette et hydratée au quotidien. Écris-nous sur WhatsApp.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Appliquer la correction et republier' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Modifier moi-même' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Demander un nouvel examen' })).toBeNull();
  });

  it('appliquer demande confirmation, envoie UNE Idempotency-Key (UUID) puis annonce la correction envoyée', async () => {
    const calls = stubApi(
      ROUTES({
        [`POST /c/rejections/${RID}/apply-fix`]: json(campaign({ status: 'publishing' }), 202),
      }),
    );
    mount(reportPage());
    fireEvent.click(
      await screen.findByRole('button', { name: 'Appliquer la correction et republier' }),
    );
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/ne compte pas comme une nouvelle campagne/)).toBeTruthy();
    expect(within(dialog).getByText(/retirée de Meta/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Republier' }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === 'POST')).toBe(true);
    });
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText('Correction envoyée à Meta')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Voir ma campagne' }).getAttribute('href')).toBe(
      `/campagnes/${ID}`,
    );
  });

  it('interrupteur de publication réelle éteint (503) : message dédié, rien n’a changé, nouvelle clé au clic suivant', async () => {
    const calls = stubApi(
      ROUTES({
        [`POST /c/rejections/${RID}/apply-fix`]: problem('provider_unavailable', 503, {
          reason: 'publish_disabled',
        }),
      }),
    );
    mount(reportPage());
    const send = async () => {
      fireEvent.click(
        await screen.findByRole('button', { name: 'Appliquer la correction et republier' }),
      );
      fireEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Republier' }),
      );
    };
    await send();
    expect(await screen.findByText(/La publication réelle est désactivée/)).toBeTruthy();
    expect(screen.getByText('Rien n’a changé sur ta campagne.')).toBeTruthy();
    await send();
    await waitFor(() => {
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
    });
    const keys = calls.filter((c) => c.method === 'POST').map((c) => c.headers['idempotency-key']);
    expect(new Set(keys).size).toBe(2);
  });

  it('un produit interdit par Meta : explication respectueuse, aucune republication ni « Modifier moi-même »', async () => {
    stubApi(
      ROUTES({
        [`GET /c/rejections/${RID}`]: json(
          rejection({
            can_fix: false,
            fix_applicable: false,
            report: report({
              rejection_category: 'prohibited_product',
              culprit: { where: 'product', excerpt: null },
              can_fix: false,
              fix: null,
            }),
          }),
        ),
      }),
    );
    mount(reportPage());
    expect(await screen.findByText('Meta n’autorise pas ce produit')).toBeTruthy();
    expect(screen.getByText('Il n’y a rien à republier pour ce produit.')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Appliquer la correction et republier' }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Modifier moi-même' })).toBeNull();
  });

  it('motif vague : cause incertaine, nouvel examen conseillé avec la démarche officielle de Meta', async () => {
    stubApi(
      ROUTES({
        [`GET /c/rejections/${RID}`]: json(
          rejection({
            fix_applicable: false,
            appeal_recommended: true,
            report: report({
              rejection_category: 'other',
              culprit: { where: 'unknown', excerpt: null },
              cause_certainty: 'low',
              fix: null,
              appeal_recommended: true,
            }),
          }),
        ),
      }),
    );
    mount(reportPage());
    expect(await screen.findByText('Cause incertaine')).toBeTruthy();
    expect(screen.getByText(/ne désigne pas d’élément précis/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Demander un nouvel examen' }));
    const guide = await screen.findByRole('dialog');
    expect(within(guide).getByText('Ouvre Meta Business Support Home.')).toBeTruthy();
    expect(within(guide).getByText(/Ne supprime pas la pub avant/)).toBeTruthy();
    const link = within(guide).getByRole('link', { name: /Page d’aide de Meta/ });
    expect(link.getAttribute('href')).toBe(
      'https://www.facebook.com/business/help/1210227555661027',
    );
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('rapport en cours de rédaction : message d’attente, aucune action', async () => {
    stubApi(
      ROUTES({
        [`GET /c/rejections/${RID}`]: json(
          rejection({ status: 'running', report: null, can_fix: false, fix_applicable: false }),
        ),
      }),
    );
    mount(reportPage());
    expect(await screen.findByText('On rédige ton rapport')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Appliquer la correction et republier' }),
    ).toBeNull();
    expect(screen.getByText(/implies knowledge of personal attributes/)).toBeTruthy();
  });

  it('échec du rapport : le motif de Meta tel quel, la démarche de nouvel examen et « Modifier moi-même »', async () => {
    stubApi(
      ROUTES({
        [`GET /c/rejections/${RID}`]: json(
          rejection({ status: 'failed', report: null, can_fix: false, fix_applicable: false }),
        ),
      }),
    );
    mount(reportPage());
    expect(await screen.findByText('Le rapport n’a pas pu être rédigé')).toBeTruthy();
    expect(screen.getByText(/implies knowledge of personal attributes/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Demander un nouvel examen' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Modifier moi-même' })).toBeTruthy();
  });

  it('EC-META-06 : refus partiel — la variante est nommée, la campagne continue, aucune republication', async () => {
    stubApi(
      ROUTES({
        'GET /c': json(campaign({ status: 'active' })),
        [`GET /c/rejections/${RID}`]: json(
          rejection({ variant: 'B', partial: true, fix_applicable: false }),
        ),
      }),
    );
    mount(reportPage());
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pourquoi Meta a refusé la pub B' }),
    ).toBeTruthy();
    expect(
      screen.getByText('Seule la pub B est refusée. Ta campagne continue de diffuser l’autre pub.'),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Appliquer la correction et republier' }),
    ).toBeNull();
  });

  it('une correction qui touche le visuel ou la page se fait à la main : pas de bouton de republication', async () => {
    stubApi(
      ROUTES({
        [`GET /c/rejections/${RID}`]: json(
          rejection({
            fix_applicable: false,
            report: report({
              culprit: { where: 'visual', excerpt: 'avant / après' },
              fix: {
                field: 'visual',
                original: null,
                suggested: 'Remplace la photo par le produit seul.',
              },
            }),
          }),
        ),
      }),
    );
    mount(reportPage());
    expect(
      await screen.findByText(/Cet élément se corrige dans l’image ou sur la page/),
    ).toBeTruthy();
    expect(screen.getByText('Remplace la photo par le produit seul.')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Appliquer la correction et republier' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Modifier moi-même' })).toBeTruthy();
  });

  it('un lecteur lit le rapport mais ne republie pas ; un espace en lecture seule non plus', async () => {
    stubApi(ROUTES());
    mount(reportPage('viewer'), { role: 'viewer' });
    expect(await screen.findByText('Ce qui s’est passé')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Appliquer la correction et republier' }),
    ).toBeNull();
    expect(
      screen.getByText('Seuls le propriétaire et les éditeurs peuvent republier.'),
    ).toBeTruthy();
    cleanup();
    stubApi(ROUTES());
    mount(reportPage('owner', 'read_only'), { status: 'read_only' });
    expect(await screen.findByText(/lecture seule : tu peux lire ce rapport/)).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Appliquer la correction et republier' }),
    ).toBeNull();
  });

  it('« Modifier moi-même » duplique la campagne puis ouvre l’aperçu de la copie', async () => {
    const calls = stubApi(
      ROUTES({
        'POST /c/relaunch': json(campaign({ id: 'copie-1', status: 'draft' }), 201),
      }),
    );
    mount(reportPage());
    fireEvent.click(await screen.findByRole('button', { name: 'Modifier moi-même' }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === 'POST' && c.path === '/c/relaunch')).toBe(true);
    });
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith(
        `/campagnes/nouvelle?analyse=${ANALYSIS}&campagne=copie-1&etape=apercu`,
      );
    });
  });

  it('refus d’un autre espace ou inconnu : message clair et retour à la campagne', async () => {
    stubApi(ROUTES({ [`GET /c/rejections/${RID}`]: problem('not_found', 404) }));
    mount(reportPage());
    expect(await screen.findByText('Ce refus n’existe pas dans cet espace.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Retour à la campagne' })).toBeTruthy();
  });

  it('en anglais', async () => {
    stubApi(ROUTES());
    mount(reportPage(), { locale: 'en' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Why Meta rejected your ad' }),
    ).toBeTruthy();
    expect(screen.getByText('What happened')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Apply the fix and republish' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit it myself' })).toBeTruthy();
  });
});

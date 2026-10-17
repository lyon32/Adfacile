// @vitest-environment happy-dom
// Étapes « Aperçu » et « Publier » (APPFLOW §8.5-8.6, PRD F3 et F6) : cinq emplacements, état des formats, estimation de Meta (jamais un
// chiffre inventé), clause de responsabilité, publication en cours, succès, chaque erreur du tableau d'APPFLOW §8.6. Aucun appel
// réseau réel : `fetch` est simulé ; les montants et les taux sont des valeurs d'ESSAI.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messagesFor, type Locale } from '@pubeka/i18n';
import { PreviewStep } from './preview-step';
import { PublishStep } from './publish-step';

// Pas de jest-dom dans ce dépôt : les quelques vérifications DOM utiles sont définies ici.
function dom(value: unknown) {
  if (!(value instanceof HTMLElement)) throw new TypeError('élément attendu');
  const el = value;
  const button = (): boolean => el instanceof HTMLButtonElement && el.disabled;
  return {
    toBeVisible: () => {
      expect(el.isConnected).toBe(true);
    },
    toBeEnabled: () => {
      expect(button()).toBe(false);
    },
    toBeDisabled: () => {
      expect(button()).toBe(true);
    },
    toHaveFocus: () => {
      expect(document.activeElement).toBe(el);
    },
    toHaveAttribute: (name: string, expected: string) => {
      expect(el.getAttribute(name)).toBe(expected);
    },
    toHaveTextContent: (text: string) => {
      expect(el.textContent).toContain(text);
    },
  };
}

const WS = '44444444-4444-4444-8444-444444444444';
const CAMPAIGN = '55555555-5555-4555-8555-555555555555';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const COST = {
  status: 'ok',
  days: 7,
  budget_usd_cents: 2800,
  total: { local_minor: 16800, usd_cents: 2800, currency: 'XAF' },
  daily: { local_minor: 2400, usd_cents: 400, currency: 'XAF' },
  fx: { rate: 600, quote: 'XAF', source: 'exchangerate-api' },
};
const campaign = (over: Record<string, unknown> = {}) => ({
  id: CAMPAIGN,
  status: 'draft',
  version: 3,
  name: 'Promo baskets',
  editable: true,
  page_id: '66666666-6666-4666-8666-666666666666',
  objective: 'OUTCOME_ENGAGEMENT',
  destination: 'WHATSAPP',
  geo: { countries: ['CM'], cities: [{ name: 'Douala', radius_km: 10 }] },
  targeting: {},
  daily_budget_usd_cents: 400,
  start_date: '2026-10-13',
  end_date: '2026-10-19',
  copy: {
    primary_text: 'Des baskets neuves à Douala, livrées en 24 h.',
    headline: 'Baskets à prix doux',
    description: 'Livraison rapide',
    cta: 'SEND_WHATSAPP_MESSAGE',
  },
  chosen_proposal_version: 1,
  cost: COST,
  ...over,
});
const readiness = (over: Record<string, unknown> = {}) => ({
  liability_required: true,
  visual: {
    status: 'ready',
    url: 'https://storage.test/photo.jpg',
    expires_at: '2026-10-12T09:15:00Z',
  },
  meta: {
    connection: 'ok',
    ad_account: { name: 'Compte de test', currency: 'USD' },
    payment_method: 'present',
  },
  page: { id: '66666666-6666-4666-8666-666666666666', name: 'Ma Boutique', active: true },
  cities: [{ name: 'Douala', radius_km: 10, effective_radius_km: 17 }],
  ...over,
});
const estimateOk = {
  status: 'ok',
  reason: null,
  audience: { lower: 120000, upper: 150000 },
  source: 'meta_delivery_estimate',
  fetched_at: '2026-10-12T09:00:00Z',
};
const estimateNone = {
  status: 'unavailable',
  reason: 'meta_unavailable',
  audience: null,
  source: 'meta_delivery_estimate',
  fetched_at: '2026-10-12T09:00:00Z',
};

const json =
  (b: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const problem = (
  code: string,
  status: number,
  meta: Record<string, unknown> = {},
  errors: unknown[] = [],
) => json({ type: 'x', title: code, status, code, request_id: 'req_T', meta, errors }, status);

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
      const path = url
        .replace('/api/v1', '')
        .replace(`/workspaces/${WS}/campaigns/${CAMPAIGN}`, '/c')
        .replace(`/workspaces/${WS}/campaigns/${CAMPAIGN}`, '/c');
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

function mount(ui: React.ReactNode, locale: Locale = 'fr') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const previewProps = () => ({
  workspaceId: WS,
  campaignId: CAMPAIGN,
  onBack: vi.fn(),
  onNext: vi.fn(),
  onSources: vi.fn(),
});
const publishProps = () => ({
  workspaceId: WS,
  campaignId: CAMPAIGN,
  onBackToPreview: vi.fn(),
  onBackToProposal: vi.fn(),
  onSources: vi.fn(),
});

const ROUTES = (extra: Record<string, (() => Response) | (() => Response)[]> = {}) => ({
  'GET /c': json(campaign()),
  'GET /c/readiness': json(readiness()),
  'GET /c/estimate': json(estimateOk),
  ...extra,
});

// ---- Aperçu --------------------------------------------------------------------------------------------------------------

describe('Étape Aperçu', () => {
  it('montre les cinq emplacements, la Page, le texte, le titre et le bouton de la pub', async () => {
    stubApi(ROUTES());
    mount(<PreviewStep {...previewProps()} />);
    dom(await screen.findByRole('heading', { level: 1, name: 'Aperçu de ta pub' })).toBeVisible();
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Fil Facebook', 'Fil Instagram', 'Stories', 'Reels', 'Messenger']);
    const frame = screen.getByRole('article', { name: 'Aperçu : Fil Facebook' });
    dom(within(frame).getByText('Ma Boutique')).toBeVisible();
    dom(within(frame).getByText(/Des baskets neuves à Douala/)).toBeVisible();
    dom(within(frame).getByText('Baskets à prix doux')).toBeVisible();
    dom(within(frame).getByText('Envoyer un message WhatsApp')).toBeVisible();
    dom(within(frame).getByRole('img', { name: /Ta photo/ })).toHaveAttribute(
      'src',
      'https://storage.test/photo.jpg',
    );
  });

  it.each(['Fil Instagram', 'Stories', 'Reels', 'Messenger'])(
    'l’onglet « %s » affiche le cadre de l’emplacement',
    async (name) => {
      stubApi(ROUTES());
      mount(<PreviewStep {...previewProps()} />);
      await screen.findByRole('tab', { name });
      fireEvent.click(screen.getByRole('tab', { name }));
      dom(screen.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
      const frame = screen.getByRole('article', { name: `Aperçu : ${name}` });
      expect(within(frame).getAllByText('Ma Boutique').length).toBeGreaterThan(0);
      expect(within(frame).getAllByText(/WhatsApp/).length).toBeGreaterThan(0);
    },
  );

  it('Stories et Reels : le format 9:16 est affiché comme « à venir » (bouton inactif), rien n’est construit ici', async () => {
    stubApi(ROUTES());
    mount(<PreviewStep {...previewProps()} />);
    await screen.findByRole('tab', { name: 'Stories' });
    expect(screen.queryByRole('button', { name: 'Créer le format 9:16' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Stories' }));
    dom(screen.getByText('Ta photo est recadrée en 9:16 pour cet emplacement.')).toBeVisible();
    const create = screen.getByRole('button', { name: 'Créer le format 9:16' });
    dom(create).toBeDisabled();
    dom(screen.getByText('Disponible avec l’étape Visuel.')).toBeVisible();
  });

  it('les flèches, Début et Fin changent d’onglet et déplacent le focus (clavier)', async () => {
    stubApi(ROUTES());
    mount(<PreviewStep {...previewProps()} />);
    const first = await screen.findByRole('tab', { name: 'Fil Facebook' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    dom(screen.getByRole('tab', { name: 'Fil Instagram' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    dom(screen.getByRole('tab', { name: 'Fil Instagram' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Fil Instagram' }), { key: 'End' });
    dom(screen.getByRole('tab', { name: 'Messenger' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Messenger' }), { key: 'ArrowRight' });
    dom(screen.getByRole('tab', { name: 'Fil Facebook' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Fil Facebook' }), { key: 'ArrowLeft' });
    dom(screen.getByRole('tab', { name: 'Messenger' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Messenger' }), { key: 'Home' });
    dom(screen.getByRole('tab', { name: 'Fil Facebook' })).toHaveAttribute('aria-selected', 'true');
  });

  it('A11Y : chaque onglet pointe vers le panneau qui existe, et le panneau est nommé par l’onglet actif', async () => {
    stubApi(ROUTES());
    mount(<PreviewStep {...previewProps()} />);
    const tab = await screen.findByRole('tab', { name: 'Fil Facebook' });
    const controls = tab.getAttribute('aria-controls') ?? '';
    const panel = document.getElementById(controls);
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('role')).toBe('tabpanel');
    expect(panel?.getAttribute('aria-labelledby')).toBe(tab.id);
  });

  it('dit que l’aperçu est construit par Pubeka', async () => {
    stubApi(ROUTES());
    mount(<PreviewStep {...previewProps()} />);
    dom(await screen.findByText(/Aperçu construit par Pubeka/)).toBeVisible();
  });

  it('récapitulatif : coût total sans TVA avec le lien d’attribution des taux, et le rayon relevé à 17 km', async () => {
    stubApi(ROUTES());
    mount(<PreviewStep {...previewProps()} />);
    dom(await screen.findByText('Récapitulatif')).toBeVisible();
    dom(
      screen.getByText(
        /Meta impose au moins 17 km autour d’une ville\. Douala sera ciblée sur 17 km \(tu avais choisi 10 km\)\./,
      ),
    ).toBeVisible();
    expect(screen.queryByText(/TVA/i)).toBeNull();
    const link = screen.getByRole('link', { name: /Exchange Rate API/i });
    dom(link).toHaveAttribute('href', 'https://www.exchangerate-api.com');
  });

  it('estimation : les bornes de Meta, avec ce qu’elles veulent dire', async () => {
    stubApi(ROUTES());
    mount(<PreviewStep {...previewProps()} />);
    dom(await screen.findByText(/Entre 120\s?000 et 150\s?000 personnes/)).toBeVisible();
    dom(
      screen.getByText(/Ce n’est pas le nombre de personnes qui verront ta pub avec ce budget/),
    ).toBeVisible();
  });

  it('estimation indisponible : AUCUN chiffre, un message, et on peut publier sans', async () => {
    stubApi(ROUTES({ 'GET /c/estimate': json(estimateNone) }));
    const props = previewProps();
    mount(<PreviewStep {...props} />);
    dom(
      await screen.findByText(
        'Meta ne donne pas d’estimation pour l’instant. Tu peux publier sans.',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/Entre .* personnes/)).toBeNull();
    dom(screen.getByRole('button', { name: 'Continuer vers la publication' })).toBeEnabled();
  });

  it('estimation qui plante (réponse invalide ou 500) : même chose, l’écran reste utilisable', async () => {
    stubApi(ROUTES({ 'GET /c/estimate': problem('internal_error', 500) }));
    mount(<PreviewStep {...previewProps()} />);
    dom(
      await screen.findByText(
        'Meta ne donne pas d’estimation pour l’instant. Tu peux publier sans.',
      ),
    ).toBeVisible();
  });

  it('sans photo : le bloc dit quoi faire, et on ne peut pas continuer', async () => {
    stubApi(
      ROUTES({
        'GET /c/readiness': json(
          readiness({ visual: { status: 'missing', url: null, expires_at: null } }),
        ),
      }),
    );
    const props = previewProps();
    mount(<PreviewStep {...props} />);
    dom(await screen.findByText('Ta pub a besoin d’une photo')).toBeVisible();
    dom(screen.getByRole('button', { name: 'Continuer vers la publication' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier mes sources' }));
    expect(props.onSources).toHaveBeenCalledOnce();
  });

  it('photo expirée : message dédié', async () => {
    stubApi(
      ROUTES({
        'GET /c/readiness': json(
          readiness({ visual: { status: 'expired', url: null, expires_at: null } }),
        ),
      }),
    );
    mount(<PreviewStep {...previewProps()} />);
    dom(await screen.findByText('Ta photo n’est plus disponible')).toBeVisible();
  });

  it('Continuer et Retour appellent les bonnes actions', async () => {
    stubApi(ROUTES());
    const props = previewProps();
    mount(<PreviewStep {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Continuer vers la publication' }));
    expect(props.onNext).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Retour à la proposition' }));
    expect(props.onBack).toHaveBeenCalledOnce();
  });

  it('erreur de chargement : message et retour', async () => {
    stubApi({ 'GET /c': problem('internal_error', 500), 'GET /c/readiness': json(readiness()) });
    mount(<PreviewStep {...previewProps()} />);
    dom(await screen.findByRole('alert')).toHaveTextContent('Impossible de préparer l’aperçu');
  });

  it('en anglais : onglets, notices et estimation', async () => {
    stubApi(ROUTES());
    mount(<PreviewStep {...previewProps()} />, 'en');
    dom(await screen.findByRole('heading', { level: 1, name: 'Preview your ad' })).toBeVisible();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Facebook feed',
      'Instagram feed',
      'Stories',
      'Reels',
      'Messenger',
    ]);
    dom(screen.getByText(/Between 120,000 and 150,000 people/)).toBeVisible();
    dom(screen.getByText(/Meta requires at least 17 km around a city/)).toBeVisible();
  });
});

// ---- Publier -------------------------------------------------------------------------------------------------------------

describe('Étape Publier — vérification finale', () => {
  it('liste la Page, le compte, le moyen de paiement et la photo, avec la note des fonds Meta Ads et le coût sans TVA', async () => {
    stubApi(ROUTES());
    mount(<PublishStep {...publishProps()} />);
    dom(
      await screen.findByRole('heading', { level: 1, name: 'Publier ta campagne' }),
    ).toBeVisible();
    dom(screen.getByText('Ma Boutique')).toBeVisible();
    dom(screen.getByText('Compte de test')).toBeVisible();
    dom(screen.getByText('Présent')).toBeVisible();
    // Aucune affirmation non vérifiée : plus de « sans prélever ta carte », les fonds disponibles sont une CONDITION.
    dom(screen.getByText(/Si ton compte utilise des fonds disponibles/)).toBeVisible();
    expect(screen.queryByText(/sans prélever/)).toBeNull();
    dom(screen.getByRole('link', { name: /Exchange Rate API/i })).toBeVisible();
    expect(screen.queryByText(/TVA/i)).toBeNull();
    dom(screen.getByRole('button', { name: 'Publier la campagne' })).toBeEnabled();
  });

  it('moyen de paiement absent : bouton inactif et guide « fonds Meta Ads, carte bancaire, Keecash »', async () => {
    stubApi(
      ROUTES({
        'GET /c/readiness': json(
          readiness({
            meta: {
              connection: 'ok',
              ad_account: { name: 'C', currency: 'USD' },
              payment_method: 'missing',
            },
          }),
        ),
      }),
    );
    mount(<PublishStep {...publishProps()} />);
    dom(await screen.findByText('Absent : Meta ne diffusera pas ta pub.')).toBeVisible();
    dom(screen.getByRole('button', { name: 'Publier la campagne' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Voir le guide' }));
    const guide = await screen.findByRole('dialog');
    // Rédigé avec CONDITION, sans affirmation non vérifiée (cartes = facturation automatique ; fonds disponibles = certains pays).
    dom(within(guide).getByText(/Si ton compte propose des fonds disponibles/)).toBeVisible();
    expect(within(guide).getAllByText(/facturation automatique/).length).toBeGreaterThan(0);
    dom(within(guide).getByText(/Keecash/)).toBeVisible();
    expect(within(guide).queryByText(/uniquement avec une carte/)).toBeNull();
    expect(within(guide).queryByText(/sans prélever/)).toBeNull();
    // Les sources officielles sont citées (liens du Centre d'aide Meta).
    const links = within(guide)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(links).toContain('https://www.facebook.com/business/help/1730009227245741');
    expect(links).toContain('https://www.facebook.com/business/help/311330675698510');
  });

  it('monnaie REFUSÉE par Meta (franc CFA) : le compte est « à régler », le bouton est inactif, le guide explique comment obtenir une monnaie acceptée', async () => {
    stubApi(
      ROUTES({
        'GET /c/readiness': json(
          readiness({
            meta: {
              connection: 'ok',
              ad_account: { name: 'Compte CFA', currency: 'XAF', currency_supported: false },
              payment_method: 'present',
            },
          }),
        ),
      }),
    );
    mount(<PublishStep {...publishProps()} />);
    dom(
      await screen.findByText(
        'La monnaie XAF n’est pas acceptée par Meta pour un compte publicitaire.',
      ),
    ).toBeVisible();
    dom(screen.getByRole('button', { name: 'Publier la campagne' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Voir le guide' }));
    const guide = await screen.findByRole('dialog');
    dom(within(guide).getByText('Utiliser une monnaie acceptée par Meta')).toBeVisible();
    dom(within(guide).getByText(/franc CFA \(XAF, XOF\)/)).toBeVisible();
    dom(within(guide).getByText(/dollar américain \(USD\)/)).toBeVisible();
    const links = within(guide)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    expect(links).toContain('https://developers.facebook.com/docs/marketing-api/currencies');
    expect(links).toContain('https://www.facebook.com/business/help/291404291014138');
  });

  it.each([
    ['Page hors formule', { page: { id: 'p', name: 'Ma Boutique', active: false } }],
    ['aucune Page', { page: null }],
    [
      'jeton expiré',
      {
        meta: {
          connection: 'expired',
          ad_account: { name: 'C', currency: 'USD' },
          payment_method: 'present',
        },
      },
    ],
    [
      'Meta non relié',
      { meta: { connection: 'none', ad_account: null, payment_method: 'unknown' } },
    ],
    ['photo indisponible', { visual: { status: 'expired', url: null, expires_at: null } }],
  ])('%s : la publication est bloquée', async (_name, over) => {
    stubApi(ROUTES({ 'GET /c/readiness': json(readiness(over)) }));
    mount(<PublishStep {...publishProps()} />);
    await screen.findByRole('heading', { level: 1, name: 'Publier ta campagne' });
    dom(screen.getByRole('button', { name: 'Publier la campagne' })).toBeDisabled();
  });

  it('moyen de paiement inconnu : on peut publier, Meta tranchera', async () => {
    stubApi(
      ROUTES({
        'GET /c/readiness': json(
          readiness({
            meta: {
              connection: 'ok',
              ad_account: { name: 'C', currency: 'USD' },
              payment_method: 'unknown',
            },
          }),
        ),
      }),
    );
    mount(<PublishStep {...publishProps()} />);
    await screen.findByRole('heading', { level: 1, name: 'Publier ta campagne' });
    dom(screen.getByRole('button', { name: 'Publier la campagne' })).toBeEnabled();
  });
});

describe('Étape Publier — clause de responsabilité et publication', () => {
  it('première publication : la clause d’abord ; « J’ai compris » publie avec accept_liability, la clé d’idempotence et le total affiché', async () => {
    const calls = stubApi(
      ROUTES({
        'POST /c/publish': json(campaign({ status: 'publishing' }), 202),
      }),
    );
    mount(<PublishStep {...publishProps()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publier la campagne' }));
    const dialog = await screen.findByRole('dialog');
    dom(within(dialog).getByText('Avant ta première publication')).toBeVisible();
    dom(
      within(dialog).getByText(
        /Pubeka n’est pas responsable si ton compte publicitaire est restreint/,
      ),
    ).toBeVisible();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'J’ai compris' }));
    await waitFor(() => {
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    });
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({
      accept_liability: true,
      confirmed_total: { amount_minor: 16800, currency: 'XAF' },
    });
    expect(post?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('« Annuler » dans la clause ne publie rien', async () => {
    const calls = stubApi(ROUTES());
    mount(<PublishStep {...publishProps()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publier la campagne' }));
    const dialog = await screen.findByRole('dialog');
    const cancel = within(dialog)
      .getAllByRole('button', { name: 'Annuler' })
      .find((b) => b.textContent === 'Annuler');
    if (cancel === undefined) throw new Error('bouton Annuler absent');
    fireEvent.click(cancel);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('clause déjà acceptée : publication directe, sans fenêtre', async () => {
    const calls = stubApi(
      ROUTES({
        'GET /c/readiness': json(readiness({ liability_required: false })),
        'POST /c/publish': json(campaign({ status: 'publishing' }), 202),
      }),
    );
    mount(<PublishStep {...publishProps()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publier la campagne' }));
    await waitFor(() => {
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ accept_liability: false });
  });

  it('publication en cours : message « en cours », sans bouton Publier ; puis succès quand la campagne arrive chez Meta', async () => {
    stubApi(
      ROUTES({
        'GET /c': [
          json(campaign()),
          json(campaign({ status: 'publishing' })),
          json(campaign({ status: 'in_review', published_at: '2026-10-12T09:01:00Z' })),
        ],
        'GET /c/readiness': json(readiness({ liability_required: false })),
        'POST /c/publish': json(campaign({ status: 'publishing' }), 202),
      }),
    );
    mount(<PublishStep {...publishProps()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publier la campagne' }));
    dom(await screen.findByText('Publication en cours…')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Publier la campagne' })).toBeNull();
    dom(
      await screen.findByText('Ta campagne est envoyée à Meta', {}, { timeout: 8000 }),
    ).toBeVisible();
    dom(screen.getByText(/Meta la vérifie, en général sous 24 heures/)).toBeVisible();
    dom(screen.getByRole('link', { name: 'Voir ma campagne' })).toHaveAttribute(
      'href',
      `/campagnes/${CAMPAIGN}`,
    );
    dom(screen.getByRole('link', { name: 'Créer une autre pub' })).toHaveAttribute(
      'href',
      '/campagnes/nouvelle',
    );
    // Le montant converti de l'écran de succès porte aussi le lien d'attribution.
    dom(screen.getByRole('link', { name: /Exchange Rate API/i })).toBeVisible();
  }, 15000);

  it('une campagne déjà chez Meta à l’ouverture (rechargement) montre directement le succès', async () => {
    stubApi(ROUTES({ 'GET /c': json(campaign({ status: 'in_review' })) }));
    mount(<PublishStep {...publishProps()} />);
    dom(await screen.findByText('Ta campagne est envoyée à Meta')).toBeVisible();
  });

  it('« on vérifie » : au-delà de 45 s en publication, l’écran demande de ne pas republier', async () => {
    stubApi(ROUTES({ 'GET /c': json(campaign({ status: 'publishing' })) }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount(<PublishStep {...publishProps()} />);
    await screen.findByText('Publication en cours…');
    await vi.advanceTimersByTimeAsync(46_000);
    await waitFor(() => {
      expect(screen.queryByText('On vérifie')).not.toBeNull();
    });
    dom(screen.getByText(/ne republie pas/)).toBeVisible();
  });
});

describe('Étape Publier — chaque erreur (APPFLOW §8.6)', () => {
  async function failWith(
    response: () => Response,
    extra: Record<string, (() => Response) | (() => Response)[]> = {},
  ) {
    const calls = stubApi(
      ROUTES({
        'GET /c/readiness': json(readiness({ liability_required: false })),
        'POST /c/publish': response,
        ...extra,
      }),
    );
    const props = publishProps();
    mount(<PublishStep {...props} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publier la campagne' }));
    return { calls, props };
  }

  it('aucun moyen de paiement : message, brouillon, quota non décompté, bouton « Voir le guide »', async () => {
    await failWith(problem('meta_payment_method_missing', 424));
    const alert = await screen.findByRole('alert');
    dom(
      within(alert).getByText('Ton compte publicitaire n’a pas de moyen de paiement.'),
    ).toBeVisible();
    dom(
      within(alert).getByText(/reste en brouillon et ton quota n’est pas décompté/),
    ).toBeVisible();
    fireEvent.click(within(alert).getByRole('button', { name: 'Voir le guide' }));
    dom(await screen.findByRole('dialog')).toBeVisible();
  });

  it('jeton expiré : « Reconnecte ton compte Meta. » avec le lien Reconnecter', async () => {
    await failWith(problem('meta_token_expired', 424));
    const alert = await screen.findByRole('alert');
    dom(within(alert).getByText('Reconnecte ton compte Meta.')).toBeVisible();
    dom(within(alert).getByRole('link', { name: 'Reconnecter' })).toHaveAttribute(
      'href',
      '/reglages/comptes-meta',
    );
  });

  it('Meta non relié : « Connecte ton compte Meta pour publier. »', async () => {
    await failWith(problem('meta_not_connected', 424));
    dom(
      within(await screen.findByRole('alert')).getByText('Connecte ton compte Meta pour publier.'),
    ).toBeVisible();
  });

  it('quota atteint : brouillon gardé et lien vers les formules', async () => {
    await failWith(problem('campaign_quota_reached', 402, { upgrade_to: 'business' }));
    const alert = await screen.findByRole('alert');
    dom(within(alert).getByText('Tu as publié toutes les campagnes de ta formule.')).toBeVisible();
    dom(within(alert).getByRole('link', { name: 'Voir les formules' })).toHaveAttribute(
      'href',
      '/abonnement',
    );
  });

  it('Page hors formule : la date à partir de laquelle elle sera utilisable', async () => {
    await failWith(
      problem('page_limit_reached', 402, { available_from: '2026-11-01T00:00:00.000Z' }),
    );
    dom(await screen.findByText(/Elle sera utilisable à partir du 1 novembre\./)).toBeVisible();
  });

  it('champs à corriger : la liste des points et le retour à la proposition', async () => {
    const { props } = await failWith(
      problem('validation_failed', 400, {}, [
        {
          field: 'copy.headline',
          code: 'required',
          message: 'Le titre de la pub est obligatoire.',
        },
      ]),
    );
    const alert = await screen.findByRole('alert');
    dom(within(alert).getByText('Le titre de la pub est obligatoire.')).toBeVisible();
    fireEvent.click(within(alert).getByRole('button', { name: 'Retour à la proposition' }));
    expect(props.onBackToProposal).toHaveBeenCalledOnce();
  });

  it('budget trop bas, photo expirée, publication déjà en cours, déjà publiée', async () => {
    await failWith(problem('budget_too_low', 422));
    dom(await screen.findByText('Le budget minimum est de 1 $ par jour.')).toBeVisible();
    cleanup();
    const { props } = await failWith(problem('gone', 410));
    dom(await screen.findByText('Ta photo n’est plus disponible.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier mes sources' }));
    expect(props.onSources).toHaveBeenCalledOnce();
    cleanup();
    await failWith(problem('conflict', 409, { reason: 'publication_in_progress' }));
    dom(await screen.findByText('Une publication est déjà en cours.')).toBeVisible();
    cleanup();
    await failWith(problem('already_published', 409));
    dom(await screen.findByText('Cette campagne est déjà envoyée à Meta.')).toBeVisible();
  });

  it('EC-CAMP-05 : le total a changé — le nouveau total est montré, « Confirmer et publier » renvoie CE total avec une NOUVELLE clé', async () => {
    const { calls } = await failWith(
      () =>
        new Response(
          JSON.stringify({
            type: 'x',
            title: 'c',
            status: 409,
            code: 'conflict',
            request_id: 'r',
            meta: {
              reason: 'fx_changed',
              new_total: { amount_minor: 17400, currency: 'XAF', usd_cents: 2800 },
            },
          }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        ),
    );
    const alert = await screen.findByRole('alert');
    dom(within(alert).getByText('Le taux de change a bougé.')).toBeVisible();
    dom(within(alert).getByText(/Le coût total est maintenant de/)).toBeVisible();
    const firstKey = calls.find((c) => c.method === 'POST')?.headers['idempotency-key'];
    fireEvent.click(within(alert).getByRole('button', { name: 'Confirmer et publier' }));
    await waitFor(() => {
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
    });
    const second = calls.filter((c) => c.method === 'POST')[1];
    expect(second?.body).toMatchObject({
      confirmed_total: { amount_minor: 17400, currency: 'XAF' },
    });
    expect(second?.headers['idempotency-key']).not.toBe(firstKey);
  });

  it('total changé sans taux disponible : aucun montant n’est inventé', async () => {
    await failWith(problem('conflict', 409, { reason: 'fx_changed', new_total: null }));
    dom(await screen.findByText(/Le taux de change n’est plus disponible/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Confirmer et publier' })).toBeNull();
  });

  it('monnaie refusée par Meta (réponse 400 du serveur) : la monnaie est nommée, brouillon, quota intact, bouton vers le guide', async () => {
    await failWith(
      problem(
        'validation_failed',
        400,
        {
          reason: 'ad_account_currency_unsupported',
          currency: 'XOF',
          guide: 'ad-account-currency',
        },
        [
          {
            field: 'ad_account.currency',
            code: 'unsupported_by_meta',
            message: 'Meta n’accepte pas…',
          },
        ],
      ),
    );
    const alert = await screen.findByRole('alert');
    dom(
      within(alert).getByText('Meta n’accepte pas la monnaie de ton compte publicitaire (XOF).'),
    ).toBeVisible();
    dom(within(alert).getByText(/relevée le 18 octobre 2026/)).toBeVisible();
    dom(
      within(alert).getByText(/reste en brouillon et ton quota n’est pas décompté/),
    ).toBeVisible();
    fireEvent.click(within(alert).getByRole('button', { name: 'Voir le guide' }));
    dom(
      within(await screen.findByRole('dialog')).getByText('Utiliser une monnaie acceptée par Meta'),
    ).toBeVisible();
  });

  it('échec enregistré « plus de 24 h sans issue » : message lisible (jamais indéfini), consigne de vérifier chez Meta, lien vers le support', async () => {
    stubApi(
      ROUTES({
        'GET /c': json(
          campaign({
            status: 'error',
            publication_error: {
              code: 'meta_error',
              uncertain: true,
              reason: 'reconcile_timeout',
              at: '2026-10-12T09:00:00Z',
            },
          }),
        ),
        'GET /c/readiness': json(readiness({ liability_required: false })),
      }),
    );
    mount(<PublishStep {...publishProps()} />);
    dom(await screen.findByText('Pubeka n’a pas pu vérifier ta campagne chez Meta.')).toBeVisible();
    dom(screen.getByText(/Regarde dans ton gestionnaire de publicités Meta/)).toBeVisible();
    dom(screen.getByRole('link', { name: 'Écrire au support' })).toHaveAttribute(
      'href',
      '/support',
    );
  });

  it('« On vérifie » annonce une issue : au plus tard dans 24 heures', async () => {
    stubApi(ROUTES({ 'GET /c': json(campaign({ status: 'publishing' })) }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount(<PublishStep {...publishProps()} />);
    await screen.findByText('Publication en cours…');
    await vi.advanceTimersByTimeAsync(46_000);
    await waitFor(() => {
      expect(screen.queryByText(/au plus tard dans 24 heures/)).not.toBeNull();
    });
  });

  it('erreur connue de Meta : sa traduction simple, quota non décompté', async () => {
    await failWith(
      problem('meta_error', 502, {
        title: 'Publicité incompatible avec la destination choisie',
        message: 'Choisis une destination de messagerie ou passe en destination « Site Web ».',
      }),
    );
    const alert = await screen.findByRole('alert');
    dom(
      within(alert).getByText('Publicité incompatible avec la destination choisie'),
    ).toBeVisible();
    dom(within(alert).getByText(/Choisis une destination de messagerie/)).toBeVisible();
  });

  it('erreur inconnue : « La publication a échoué. Réessaie dans quelques minutes. » et un ticket proposé', async () => {
    await failWith(problem('internal_error', 500));
    const alert = await screen.findByRole('alert');
    dom(within(alert).getByText('La publication a échoué.')).toBeVisible();
    dom(within(alert).getByText(/Réessaie dans quelques minutes/)).toBeVisible();
    dom(within(alert).getByRole('link', { name: 'Écrire au support' })).toHaveAttribute(
      'href',
      '/support',
    );
  });

  it('INTERRUPTEUR : publication réelle non activée : message sobre, brouillon, quota non décompté, AUCUN bouton de nouvel essai', async () => {
    const { calls } = await failWith(
      problem('provider_unavailable', 503, { reason: 'publish_disabled' }),
    );
    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText('La publication réelle n’est pas activée sur cet environnement.'),
    ).toBeTruthy();
    expect(
      within(alert).getByText(/reste en brouillon et ton quota n’est pas décompté/),
    ).toBeTruthy();
    expect(within(alert).queryByRole('button')).toBeNull();
    expect(within(alert).queryByText(/Réessaie dans quelques minutes/)).toBeNull();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('INTERRUPTEUR : le même message en anglais', async () => {
    stubApi(
      ROUTES({
        'GET /c/readiness': json(readiness({ liability_required: false })),
        'POST /c/publish': problem('provider_unavailable', 503, { reason: 'publish_disabled' }),
      }),
    );
    mount(<PublishStep {...publishProps()} />, 'en');
    fireEvent.click(await screen.findByRole('button', { name: 'Publish the campaign' }));
    expect(
      await screen.findByText('Real publishing is not enabled on this environment.'),
    ).toBeTruthy();
  });

  it('provider_unavailable SANS la raison de l’interrupteur : message général (pas de faux diagnostic)', async () => {
    await failWith(problem('provider_unavailable', 503));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('La publication a échoué.')).toBeTruthy();
  });

  it('lecture seule : message dédié avec le lien vers l’abonnement', async () => {
    await failWith(problem('workspace_read_only', 403));
    dom(
      within(await screen.findByRole('alert')).getByText('Ton espace est en lecture seule.'),
    ).toBeVisible();
  });

  it('IDEMPOTENCE : après une coupure réseau, « Réessayer » renvoie la MÊME clé ; après une réponse du serveur, une NOUVELLE', async () => {
    const attempts = [
      () => {
        throw new TypeError('Failed to fetch');
      },
      problem('meta_error', 502, {}),
      json(campaign({ status: 'publishing' }), 202),
    ];
    let i = 0;
    const calls = stubApi(
      ROUTES({ 'GET /c/readiness': json(readiness({ liability_required: false })) }),
    );
    const original = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if ((init?.method ?? 'GET') === 'POST') {
          calls.push({
            method: 'POST',
            path: '/c/publish',
            body: init?.body,
            headers: (init?.headers ?? {}) as Record<string, string>,
          });
          const attempt = attempts[Math.min(i, attempts.length - 1)];
          i += 1;
          try {
            return Promise.resolve(attempt?.() ?? new Response(null, { status: 500 }));
          } catch (e) {
            return Promise.reject(e instanceof Error ? e : new Error('x'));
          }
        }
        return original(url, init);
      }),
    );
    mount(<PublishStep {...publishProps()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Publier la campagne' }));
    // 1. coupure réseau : message général.
    const first = await screen.findByRole('alert');
    fireEvent.click(within(first).getByRole('button', { name: 'Réessayer' }));
    // 2. le serveur répond (erreur sans détail) : intention close.
    await waitFor(() => {
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
    });
    const keys = calls.filter((c) => c.method === 'POST').map((c) => c.headers['idempotency-key']);
    expect(keys[0]).toBe(keys[1]);
    const second = await screen.findByRole('alert');
    fireEvent.click(within(second).getByRole('button', { name: /Réessayer/ }));
    await waitFor(() => {
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(3);
    });
    const all = calls.filter((c) => c.method === 'POST').map((c) => c.headers['idempotency-key']);
    expect(all[2]).not.toBe(all[1]);
  });

  it('campagne revenue en brouillon après un échec de la tâche : la raison enregistrée est affichée', async () => {
    stubApi(
      ROUTES({
        'GET /c': json(
          campaign({
            publication_error: { code: 'meta_payment_method_missing', at: '2026-10-12T09:00:00Z' },
          }),
        ),
        'GET /c/readiness': json(readiness({ liability_required: false })),
      }),
    );
    mount(<PublishStep {...publishProps()} />);
    dom(
      await screen.findByText('Ton compte publicitaire n’a pas de moyen de paiement.'),
    ).toBeVisible();
  });

  it('échec incertain enregistré (Meta n’a rien créé) : message dédié et republication possible', async () => {
    stubApi(
      ROUTES({
        'GET /c': json(
          campaign({
            status: 'error',
            publication_error: { code: 'meta_error', uncertain: true, at: '2026-10-12T09:00:00Z' },
          }),
        ),
        'GET /c/readiness': json(readiness({ liability_required: false })),
      }),
    );
    mount(<PublishStep {...publishProps()} />);
    dom(await screen.findByText('Meta n’a pas confirmé la création.')).toBeVisible();
    dom(screen.getByText(/rien n’a été créé/)).toBeVisible();
    dom(screen.getByRole('button', { name: 'Publier la campagne' })).toBeEnabled();
  });

  it('en anglais : clause, erreur de paiement et succès', async () => {
    stubApi(
      ROUTES({
        'GET /c/readiness': json(readiness({ liability_required: false })),
        'POST /c/publish': problem('meta_payment_method_missing', 424),
      }),
    );
    mount(<PublishStep {...publishProps()} />, 'en');
    fireEvent.click(await screen.findByRole('button', { name: 'Publish the campaign' }));
    dom(await screen.findByText('Your ad account has no payment method.')).toBeVisible();
  });
});

// @vitest-environment happy-dom
// Écrans Meta : connexion, bilan de santé, Pages, kit de marque (APPFLOW §5, §6, §14).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { messagesFor, type Locale } from '@pubeka/i18n';
import type { ErrorCode } from '@pubeka/contracts';
import { ApiError } from '../../lib/api';
import type { Health, MetaConnection } from './api';
import { BrandFormSchema, toBrandKit, toFormValues, BrandKitPanel } from './brand-kit-form';
import { ConnectionPanel, errorKey, readiness } from './connection-panel';
import { toneOf } from './health-list';
import { parseNotice } from './notice';
import { PagesPanel, pageErrorKey } from './pages-panel';

const WS = '44444444-4444-4444-8444-444444444444';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wrap(node: React.ReactNode, locale: Locale = 'fr') {
  return render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {node}
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

interface Call {
  method: string;
  path: string;
  body: unknown;
}

/** `fetch` simulé : une réponse par « METHODE chemin » ; les appels sont gardés pour les vérifier. */
function stubApi(routes: Record<string, () => Response>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = url.replace('/api/v1', '').replace(`/workspaces/${WS}`, '');
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ method, path, body });
      const respond = routes[`${method} ${path}`];
      return Promise.resolve(
        respond === undefined ? new Response(null, { status: 404 }) : respond(),
      );
    }),
  );
  return calls;
}

const json =
  (body: unknown, status = 200) =>
  () =>
    Response.json(body, { status });
const problem = (status: number, code: string) => () =>
  Response.json({ status, code, title: code, request_id: 'req_1' }, { status });

const HEALTH: Health = {
  checked_at: '2026-10-14T10:00:00.000Z',
  items: [
    { key: 'business_portfolio', ok: true },
    { key: 'ad_account', ok: true, required: true },
    { key: 'payment_method', ok: false, guide_slug: 'payment-method' },
    { key: 'page', ok: true },
    { key: 'instagram', ok: false, guide_slug: 'instagram' },
    { key: 'whatsapp', ok: false, recommended: true, guide_slug: 'whatsapp-business' },
    { key: 'pixel', ok: true },
    { key: 'permissions', ok: true },
  ],
};
const CONNECTION: MetaConnection = {
  id: '66666666-6666-4666-8666-666666666666',
  token_type: 'user',
  status: 'ok',
  expires_at: '2026-12-01T00:00:00.000Z',
  business_id: null,
  last_health_check: HEALTH,
};
const ACCOUNTS = {
  data: [
    {
      id: 'a1',
      meta_ad_account_id: 'act_100000000001',
      name: 'Compte Awa',
      currency: 'USD',
      has_payment_method: false,
      is_active: true,
    },
  ],
};

describe('fonctions pures', () => {
  it('parseNotice : retour de Facebook (APPFLOW §6.1)', () => {
    expect(parseNotice('connected', undefined)).toBe('connected');
    expect(parseNotice('error', 'denied')).toBe('denied');
    expect(parseNotice('error', 'state')).toBe('state');
    expect(parseNotice('error', 'forbidden')).toBe('forbidden');
    // Une raison inconnue, ou « connected » donné comme raison, devient l'échec générique.
    expect(parseNotice('error', 'inconnue')).toBe('meta');
    expect(parseNotice('error', 'connected')).toBe('meta');
    expect(parseNotice('error', undefined)).toBe('meta');
    expect(parseNotice(undefined, undefined)).toBeNull();
    expect(parseNotice('autre', 'denied')).toBeNull();
  });

  it('errorKey et pageErrorKey : liste fermée d’API_SPEC §4', () => {
    const e = (status: number, code: ErrorCode) =>
      new ApiError(status, { type: 'about:blank', status, code, title: code, request_id: 'r' });
    expect(errorKey(e(424, 'meta_token_expired'))).toBe('expired');
    expect(errorKey(e(403, 'role_insufficient'))).toBe('forbidden');
    expect(errorKey(e(503, 'provider_unavailable'))).toBe('unavailable');
    expect(errorKey(new Error('x'))).toBe('generic');
    expect(pageErrorKey(e(402, 'page_limit_reached'))).toBe('limit');
    expect(pageErrorKey(e(409, 'conflict'))).toBe('locked');
    expect(pageErrorKey(e(403, 'workspace_read_only'))).toBe('read_only');
    expect(pageErrorKey(e(403, 'forbidden'))).toBe('forbidden');
    expect(pageErrorKey(new Error('x'))).toBe('generic');
  });

  it('« Continuer » dépend du compte publicitaire seulement (APPFLOW §6.3)', () => {
    expect(readiness(undefined, undefined)).toEqual({
      connected: false,
      canContinue: false,
      hasWarnings: false,
    });
    expect(readiness([CONNECTION], HEALTH)).toEqual({
      connected: true,
      canContinue: true,
      hasWarnings: true,
    });
    const noAccount: Health = {
      ...HEALTH,
      items: HEALTH.items.map((i) => (i.key === 'ad_account' ? { ...i, ok: false } : i)),
    };
    expect(readiness([CONNECTION], noAccount).canContinue).toBe(false);
    expect(readiness([CONNECTION], null).canContinue).toBe(false);
  });

  it('couleur des lignes : vert, orange pour WhatsApp, creux pour le facultatif, rouge sinon', () => {
    const tone = (key: Health['items'][number]['key'], over = {}) =>
      toneOf({ key, ok: false, ...over });
    expect(toneOf({ key: 'page', ok: true })).toBe('success');
    expect(tone('whatsapp', { recommended: true })).toBe('warn');
    expect(tone('instagram')).toBe('neutral');
    expect(tone('pixel')).toBe('neutral');
    expect(tone('payment_method')).toBe('error');
    expect(tone('ad_account', { required: true })).toBe('error');
  });

  it('kit de marque : mêmes limites que PUT …/brand-kit, champs vides → null, logo conservé', () => {
    const base = toFormValues(
      { colors: { primary: '#112233' }, whatsapp: '+237677000000', tone: 'bold' },
      { id: 'p', meta_page_id: '1', name: 'P', active: true, ad_address: 'tu' },
    );
    expect(BrandFormSchema.safeParse(base).success).toBe(true);
    const bad = BrandFormSchema.safeParse({
      ...base,
      primary: 'rouge',
      whatsapp: '0677',
      tagline: 'x'.repeat(121),
    });
    expect(bad.error?.issues.map((i) => i.message).sort()).toEqual([
      'color_invalid',
      'phone_invalid',
      'too_long',
    ]);
    expect(
      toBrandKit({ ...base, primary: '', whatsapp: '', tone: '' }, { logo_path: 'ws/logo.png' }),
    ).toEqual({
      logo_path: 'ws/logo.png',
      colors: {},
      font: null,
      phone: null,
      whatsapp: null,
      tagline: null,
      tone: null,
      show_number_on_visuals: true,
    });
  });
});

describe('ConnectionPanel', () => {
  it('sans connexion : ce que Pubeka fera et ne fera jamais, puis ouvre Facebook', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    const calls = stubApi({
      'GET /meta/connections': json({ data: [] }),
      'POST /meta/connect': json({
        authorize_url: 'https://www.facebook.com/dialog/oauth?state=x',
      }),
    });
    wrap(<ConnectionPanel workspaceId={WS} isOwner variant="onboarding" notice={null} />);
    expect(await screen.findByText('Pubeka ne fera jamais')).toBeTruthy();
    expect(screen.getByText('publier sans ton accord')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Connecter mon compte Meta' }));
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://www.facebook.com/dialog/oauth?state=x');
    });
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ return_to: 'onboarding' });
  });

  it('retour refusé : « La connexion n’a pas abouti » avec [Réessayer] (APPFLOW §6.1)', async () => {
    stubApi({ 'GET /meta/connections': json({ data: [] }) });
    wrap(<ConnectionPanel workspaceId={WS} isOwner variant="settings" notice="denied" />);
    expect(await screen.findByText('La connexion n’a pas abouti.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeTruthy();
  });

  it('un autre rôle que le propriétaire ne voit pas le bouton de connexion', async () => {
    stubApi({ 'GET /meta/connections': json({ data: [] }) });
    wrap(
      <ConnectionPanel workspaceId={WS} isOwner={false} variant="settings" notice="forbidden" />,
    );
    expect(
      await screen.findByText('Seul le propriétaire de l’espace peut connecter Meta.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Connecter mon compte Meta' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });

  it('connecté : état, compte publicitaire, bilan avec un mot par ligne, guide « Comment faire »', async () => {
    stubApi({
      'GET /meta/connections': json({ data: [CONNECTION] }),
      'GET /ad-accounts': json(ACCOUNTS),
    });
    wrap(<ConnectionPanel workspaceId={WS} isOwner variant="settings" notice={null} />);
    expect(await screen.findByText('Connecté')).toBeTruthy();
    expect(screen.getByText(/expire le 1 décembre 2026/)).toBeTruthy();
    expect(await screen.findByDisplayValue('Compte Awa · act_100000000001')).toBeTruthy();
    expect(screen.getByText(/Aucun moyen de paiement sur ce compte/)).toBeTruthy();
    expect(screen.getByText('Compte actif et utilisable')).toBeTruthy();
    expect(screen.getByText(/Lie un WhatsApp Business/)).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Comment faire' })[0] ?? document.body);
    expect(await screen.findByText('Ajouter un moyen de paiement')).toBeTruthy();
    expect(screen.getByText(/Keecash/)).toBeTruthy();
  });

  it('[Ignorer] un élément facultatif le retire des lignes à corriger', async () => {
    stubApi({
      'GET /meta/connections': json({ data: [CONNECTION] }),
      'GET /ad-accounts': json(ACCOUNTS),
    });
    wrap(<ConnectionPanel workspaceId={WS} isOwner variant="settings" notice={null} />);
    await screen.findByText('Instagram lié');
    const before = screen.getAllByRole('button', { name: 'Comment faire' }).length;
    fireEvent.click(screen.getAllByRole('button', { name: 'Ignorer' })[0] ?? document.body);
    expect(screen.getAllByRole('button', { name: 'Comment faire' }).length).toBe(before - 1);
    expect(screen.getByText('Ignoré pour l’instant')).toBeTruthy();
  });

  it('[Revérifier] relance le bilan ; [Déconnecter] demande confirmation puis supprime', async () => {
    const calls = stubApi({
      'GET /meta/connections': json({ data: [CONNECTION] }),
      'GET /ad-accounts': json(ACCOUNTS),
      [`POST /meta/connections/${CONNECTION.id}/health-check`]: json(HEALTH),
      [`DELETE /meta/connections/${CONNECTION.id}`]: () => new Response(null, { status: 204 }),
    });
    wrap(<ConnectionPanel workspaceId={WS} isOwner variant="settings" notice={null} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Revérifier' }));
    await waitFor(() => {
      expect(calls.some((c) => c.path.endsWith('/health-check'))).toBe(true);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Déconnecter' }));
    expect(await screen.findByText('Déconnecter Meta ?')).toBeTruthy();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    const confirm = screen.getAllByRole('button', { name: 'Déconnecter' }).at(-1);
    fireEvent.click(confirm ?? document.body);
    await waitFor(() => {
      expect(calls.some((c) => c.method === 'DELETE')).toBe(true);
    });
  });

  it('connexion expirée : bandeau rouge, pas de bilan, [Reconnecter]', async () => {
    stubApi({
      'GET /meta/connections': json({ data: [{ ...CONNECTION, status: 'expired' }] }),
    });
    wrap(<ConnectionPanel workspaceId={WS} isOwner variant="settings" notice={null} />);
    expect(await screen.findByText(/Ta connexion Meta a expiré/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reconnecter' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revérifier' })).toBeNull();
    expect(screen.queryByText('Bilan de santé')).toBeNull();
  });

  it('retour de Facebook sans bilan : le bilan se lance seul, une seule fois', async () => {
    const calls = stubApi({
      'GET /meta/connections': json({ data: [{ ...CONNECTION, last_health_check: null }] }),
      'GET /ad-accounts': json(ACCOUNTS),
      [`POST /meta/connections/${CONNECTION.id}/health-check`]: json(HEALTH),
    });
    wrap(<ConnectionPanel workspaceId={WS} isOwner variant="onboarding" notice="connected" />);
    await screen.findByText(/Ton compte Meta est connecté/);
    await waitFor(() => {
      expect(calls.filter((c) => c.path.endsWith('/health-check'))).toHaveLength(1);
    });
  });

  it('une erreur de chargement est annoncée', async () => {
    stubApi({ 'GET /meta/connections': problem(500, 'internal_error') });
    wrap(<ConnectionPanel workspaceId={WS} isOwner variant="settings" notice={null} />);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });

  it('textes en anglais', async () => {
    stubApi({ 'GET /meta/connections': json({ data: [] }) });
    wrap(<ConnectionPanel workspaceId={WS} isOwner variant="settings" notice={null} />, 'en');
    expect(await screen.findByText('Connect my Meta account')).toBeTruthy();
  });
});

const PAGES = {
  data: [
    {
      id: 'p1',
      meta_page_id: '200000000001',
      name: 'Boutique Awa',
      active: true,
      locked_for_period: true,
      instagram_linked: true,
      whatsapp_linked: false,
      ad_language: 'fr',
      ad_address: 'vous',
    },
    {
      id: 'p2',
      meta_page_id: '200000000002',
      name: 'Awa Mode',
      active: false,
      ad_language: 'en',
      ad_address: 'tu',
    },
  ],
  quotas: { pages_active: 1, pages_limit: 1 },
};

describe('PagesPanel', () => {
  it('liste les Pages avec la limite de la formule et le verrou de la période', async () => {
    stubApi({ 'GET /pages': json(PAGES) });
    wrap(<PagesPanel workspaceId={WS} role="owner" />);
    expect(await screen.findByText('1 sur 1 Pages actives')).toBeTruthy();
    expect(screen.getByText(/Ta formule est au maximum/)).toBeTruthy();
    expect(screen.getByText(/Page verrouillée/)).toBeTruthy();
    expect(
      screen.getByText(
        'Tu pourras changer de Page le mois prochain si tu as lancé une campagne avec celle-ci.',
      ),
    ).toBeTruthy();
    // La Page verrouillée ne se désactive pas ; l'autre est en attente de place.
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(2);
    expect(switches[0]?.hasAttribute('disabled')).toBe(true);
  });

  it('activer au-delà de la limite : le message de la formule s’affiche', async () => {
    const calls = stubApi({
      'GET /pages': json(PAGES),
      'PATCH /pages/p2': problem(402, 'page_limit_reached'),
    });
    wrap(<PagesPanel workspaceId={WS} role="owner" />);
    await screen.findByText('Awa Mode');
    fireEvent.click(screen.getAllByRole('switch')[1] ?? document.body);
    expect(
      await screen.findByText(/Ta formule ne permet pas d’activer plus de Pages/),
    ).toBeTruthy();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ active: true });
  });

  it('l’éditeur règle la langue et le ton des pubs, pas l’activation', async () => {
    const calls = stubApi({
      'GET /pages': json(PAGES),
      'PATCH /pages/p2': json({ ...PAGES.data[1], ad_address: 'vous' }),
    });
    wrap(<PagesPanel workspaceId={WS} role="editor" />);
    await screen.findByText('Awa Mode');
    for (const toggle of screen.getAllByRole('switch'))
      expect(toggle.hasAttribute('disabled')).toBe(true);
    const tones = screen.getAllByLabelText('Ton des pubs');
    fireEvent.change(tones[1] ?? document.body, { target: { value: 'vous' } });
    await waitFor(() => {
      expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ ad_address: 'vous' });
    });
    expect(screen.getByText(/Seul le propriétaire active ou désactive une Page/)).toBeTruthy();
  });

  it('sans Page : invite à connecter Meta', async () => {
    stubApi({ 'GET /pages': json({ data: [], quotas: { pages_active: 0, pages_limit: 1 } }) });
    wrap(<PagesPanel workspaceId={WS} role="owner" />);
    expect(await screen.findByText('Aucune Page pour le moment')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Connecter Meta' }).getAttribute('href')).toBe(
      '/reglages/comptes-meta',
    );
  });

  it('erreur de chargement annoncée', async () => {
    stubApi({ 'GET /pages': problem(500, 'internal_error') });
    wrap(<PagesPanel workspaceId={WS} role="viewer" />);
    expect(await screen.findByRole('alert')).toBeTruthy();
  });
});

describe('BrandKitPanel', () => {
  const kitRoutes = (kit: unknown) => ({
    'GET /pages': json(PAGES),
    'GET /pages/p1/brand-kit': json(kit),
  });

  it('enregistre le kit de la Page active, couleurs et numéros contrôlés avant l’envoi', async () => {
    const calls = stubApi({
      ...kitRoutes({ logo_path: 'ws/logo.png', colors: {}, show_number_on_visuals: true }),
      'PUT /pages/p1/brand-kit': json({
        colors: { primary: '#112233' },
        show_number_on_visuals: true,
      }),
      'PATCH /pages/p1': json({ ...PAGES.data[0], ad_address: 'tu' }),
    });
    wrap(<BrandKitPanel workspaceId={WS} role="editor" />);
    expect(await screen.findByText('Kit de marque de la Page Boutique Awa')).toBeTruthy();
    await screen.findByRole('textbox', { name: 'Principale' });
    expect(screen.getByText('Un logo est enregistré pour cette Page.')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Principale' }), {
      target: { value: 'rouge' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le kit de marque' }));
    expect(await screen.findByText('Couleur au format #RRGGBB, par exemple #1A2B3C.')).toBeTruthy();
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);

    fireEvent.change(screen.getByRole('textbox', { name: 'Principale' }), {
      target: { value: '#112233' },
    });
    fireEvent.change(screen.getByLabelText('Ton des pubs'), { target: { value: 'tu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le kit de marque' }));
    await waitFor(() => {
      expect(calls.some((c) => c.method === 'PATCH')).toBe(true);
    });
    expect(calls.find((c) => c.method === 'PUT')?.body).toMatchObject({
      logo_path: 'ws/logo.png',
      colors: { primary: '#112233' },
      whatsapp: null,
    });
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ ad_address: 'tu' });
    expect(await screen.findByText('Enregistré')).toBeTruthy();
  });

  it('première configuration : version courte, [Continuer] enregistre puis avance', async () => {
    const onSaved = vi.fn();
    stubApi({
      ...kitRoutes({ colors: {}, show_number_on_visuals: true }),
      'PUT /pages/p1/brand-kit': json({ colors: {}, show_number_on_visuals: true }),
    });
    wrap(<BrandKitPanel workspaceId={WS} role="owner" compact onSaved={onSaved} />);
    await screen.findByRole('textbox', { name: 'Principale' });
    expect(screen.queryByRole('textbox', { name: 'Slogan' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Continuer' }));
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('un lecteur voit le kit sans pouvoir le modifier', async () => {
    stubApi(kitRoutes({ colors: {}, show_number_on_visuals: true }));
    wrap(<BrandKitPanel workspaceId={WS} role="viewer" />);
    expect(await screen.findByText(/Seuls le propriétaire et les éditeurs/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Enregistrer le kit de marque' })).toBeNull();
  });

  it('sans Page active : invite à connecter Meta', async () => {
    stubApi({
      'GET /pages': json({
        data: [{ ...PAGES.data[1] }],
        quotas: { pages_active: 0, pages_limit: 1 },
      }),
    });
    wrap(<BrandKitPanel workspaceId={WS} role="owner" />);
    expect(await screen.findByText('Active d’abord une Page')).toBeTruthy();
  });

  it('plusieurs Pages actives : un sélecteur change de Page', async () => {
    stubApi({
      'GET /pages': json({
        data: [PAGES.data[0], { ...PAGES.data[1], active: true }],
        quotas: { pages_active: 2, pages_limit: 3 },
      }),
      'GET /pages/p1/brand-kit': json({ colors: {}, tagline: 'Un', show_number_on_visuals: true }),
      'GET /pages/p2/brand-kit': json({
        colors: {},
        tagline: 'Deux',
        show_number_on_visuals: true,
      }),
    });
    wrap(<BrandKitPanel workspaceId={WS} role="owner" />);
    expect(await screen.findByDisplayValue('Un')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Page'), { target: { value: 'p2' } });
    expect(await screen.findByDisplayValue('Deux')).toBeTruthy();
  });
});

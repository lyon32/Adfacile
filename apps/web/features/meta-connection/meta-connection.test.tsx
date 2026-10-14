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
import { ConnectionPanel, errorKey, readiness } from './connection-panel';
import { toneOf } from './health-list';
import { parseNotice } from './notice';

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

  it('errorKey : liste fermée d’API_SPEC §4', () => {
    const e = (status: number, code: ErrorCode) =>
      new ApiError(status, { type: 'about:blank', status, code, title: code, request_id: 'r' });
    expect(errorKey(e(424, 'meta_token_expired'))).toBe('expired');
    expect(errorKey(e(403, 'role_insufficient'))).toBe('forbidden');
    expect(errorKey(e(503, 'provider_unavailable'))).toBe('unavailable');
    expect(errorKey(new Error('x'))).toBe('generic');
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

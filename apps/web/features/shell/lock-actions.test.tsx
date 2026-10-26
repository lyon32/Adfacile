// @vitest-environment happy-dom
// S19b / TR-PAY-07 / EC-PAY-11 : le bouton « Mettre toutes mes publicités en pause » de l'écran verrouillé et le bandeau « Reprendre mes
// pubs » (confirmation avant dépense). Le réseau est simulé (aucun appel réel) ; FR et EN.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messagesFor, type Locale } from '@pubeka/i18n';
import { LockedScreen } from './locked-screen';
import { ResumeBanner } from './resume-banner';
import { SessionProvider, type SessionValue } from './session-context';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Call {
  url: string;
  method: string;
  key: string | null;
  body: string | null;
}
let calls: Call[] = [];
type Reply = { status: number; body: unknown };
let replies: ((call: Call) => Reply)[] = [];

beforeEach(() => {
  calls = [];
  replies = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      url,
      method: init?.method ?? 'GET',
      key: headers.get('idempotency-key'),
      body: typeof init?.body === 'string' ? init.body : null,
    };
    calls.push(call);
    const reply = replies.shift();
    if (reply === undefined) throw new Error(`appel inattendu ${call.method} ${url}`);
    const { status, body } = reply(call);
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Workspace = NonNullable<SessionValue['workspace']>;
const ws = (over: Partial<Workspace>): Workspace => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Awa',
  role: 'owner',
  plan: 'pro',
  status: 'active',
  ...over,
});

function renderWith(node: React.ReactNode, workspace: Workspace, locale: Locale = 'fr') {
  const value: SessionValue = {
    userId: 'u1',
    email: 'awa@exemple.test',
    firstName: 'Awa',
    lastName: null,
    locale,
    theme: 'light',
    workspace,
  };
  return render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <SessionProvider value={value}>{node}</SessionProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const locked = ws({ status: 'locked', statusCause: 'subscription_ended' });
const PAUSE_ALL = 'Mettre toutes mes publicités en pause';

describe('écran verrouillé : « Mettre toutes mes publicités en pause »', () => {
  it('un clic envoie UNE demande avec une Idempotency-Key neuve, montre l’état de chargement, puis le bilan du serveur', async () => {
    let release: () => void = () => undefined;
    replies.push(() => ({ status: 200, body: { paused: 2, failed: [], rate_limited: false } }));
    const original = globalThis.fetch;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      await gate;
      return original(url, init);
    });
    renderWith(<LockedScreen />, locked);
    fireEvent.click(screen.getByRole('button', { name: PAUSE_ALL }));
    const busy = await screen.findByRole('button', { name: 'Mise en pause en cours…' });
    expect(busy.hasAttribute('disabled')).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    release();
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('2 publicités sont en pause chez Meta.');
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: '/api/v1/workspaces/11111111-1111-4111-8111-111111111111/campaigns/pause-all',
      method: 'POST',
      body: '{}',
    });
    expect(calls[0]?.key).toMatch(UUID);
    expect(screen.getByRole('button', { name: PAUSE_ALL })).toBeTruthy();
  });

  it('aucune publicité en diffusion : le dit clairement', async () => {
    replies.push(() => ({ status: 200, body: { paused: 0, failed: [], rate_limited: false } }));
    renderWith(<LockedScreen />, locked);
    fireEvent.click(screen.getByRole('button', { name: PAUSE_ALL }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('Rien à mettre en pause');
    });
  });

  it('EC-META-07 : une pause qui échoue est annoncée avec sa raison, jamais comme un succès', async () => {
    replies.push(() => ({
      status: 200,
      body: {
        paused: 1,
        failed: [{ campaign_id: 'c1', name: 'Promo', code: 'meta_token_expired' }],
        rate_limited: false,
      },
    }));
    renderWith(<LockedScreen />, locked);
    fireEvent.click(screen.getByRole('button', { name: PAUSE_ALL }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        '1 publicité n’a pas pu être mise en pause',
      );
    });
    const text = screen.getByRole('status').textContent;
    expect(text).toContain('1 publicité est en pause chez Meta.');
    expect(text).toContain('Gestionnaire de publicités de Meta');
  });

  it('erreur réseau ou serveur : message d’erreur, le bouton reste utilisable', async () => {
    replies.push(() => ({ status: 502, body: { code: 'meta_error', status: 502 } }));
    renderWith(<LockedScreen />, locked);
    fireEvent.click(screen.getByRole('button', { name: PAUSE_ALL }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        'La demande n’a pas pu être envoyée',
      );
    });
    expect(screen.getByRole('button', { name: PAUSE_ALL }).hasAttribute('disabled')).toBe(false);
  });

  it('anglais', async () => {
    replies.push(() => ({ status: 200, body: { paused: 1, failed: [], rate_limited: false } }));
    renderWith(<LockedScreen />, { ...locked, statusCause: 'trial_ended' }, 'en');
    fireEvent.click(screen.getByRole('button', { name: 'Pause all my ads' }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('1 ad is paused at Meta.');
    });
  });
});

describe('espace actif : « Reprendre mes pubs » (reprise manuelle, confirmation avant dépense)', () => {
  const listReply = (count: number, budget = 500): Reply => ({
    status: 200,
    body: {
      data: Array.from({ length: count }, (_, i) => ({
        id: `c${String(i)}`,
        daily_budget_usd_cents: budget,
      })),
      next_cursor: null,
    },
  });

  it('aucune publicité en pause pour verrouillage : aucun bandeau', async () => {
    replies.push(() => listReply(0));
    const { container } = renderWith(<ResumeBanner />, ws({}));
    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    expect(calls[0]?.url).toContain('status=paused&pause_reason=billing_lock');
    expect(container.textContent).toBe('');
  });

  it('un lecteur, ou un espace qui n’est pas actif : aucun appel, aucun bandeau', () => {
    const viewer = renderWith(<ResumeBanner />, ws({ role: 'viewer' }));
    expect(viewer.container.textContent).toBe('');
    cleanup();
    const grace = renderWith(<ResumeBanner />, ws({ status: 'grace' }));
    expect(grace.container.textContent).toBe('');
    expect(calls).toHaveLength(0);
  });

  it('le bouton ouvre une fenêtre qui dit qu’il y a dépense chez Meta ; Annuler n’envoie rien', async () => {
    replies.push(() => listReply(2, 500));
    renderWith(<ResumeBanner />, ws({}));
    expect((await screen.findByRole('heading', { level: 2 })).textContent).toBe(
      '2 publicités sont en pause',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre mes pubs' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Meta recommence à dépenser ton budget');
    expect(dialog.textContent).toContain('10,00');
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(calls).toHaveLength(1);
  });

  it('confirmer envoie UNE reprise avec une Idempotency-Key neuve et affiche le bilan', async () => {
    replies.push(() => listReply(1));
    replies.push(() => ({
      status: 200,
      body: { resumed: 1, failed: [], remaining: 0, rate_limited: false },
    }));
    replies.push(() => listReply(0));
    renderWith(<ResumeBanner />, ws({}));
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre mes pubs' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reprendre' }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('1 publicité a repris chez Meta.');
    });
    const resume = calls.find((c) => c.method === 'POST');
    expect(resume).toMatchObject({
      url: '/api/v1/workspaces/11111111-1111-4111-8111-111111111111/campaigns/resume-all',
      body: '{}',
    });
    expect(resume?.key).toMatch(UUID);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });

  it('interrupteur de publication éteint (503) : message clair, la reprise reste possible plus tard', async () => {
    replies.push(() => listReply(1));
    replies.push(() => ({
      status: 503,
      body: { code: 'provider_unavailable', status: 503, meta: { reason: 'publish_disabled' } },
    }));
    replies.push(() => listReply(1));
    renderWith(<ResumeBanner />, ws({}));
    fireEvent.click(await screen.findByRole('button', { name: 'Reprendre mes pubs' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reprendre' }));
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('pas encore activée');
    });
  });

  it('anglais', async () => {
    replies.push(() => listReply(1));
    renderWith(<ResumeBanner />, ws({}), 'en');
    expect((await screen.findByRole('heading', { level: 2 })).textContent).toBe('1 ad is paused');
    expect(screen.getByRole('button', { name: 'Resume my ads' })).toBeTruthy();
  });
});

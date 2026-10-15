// @vitest-environment happy-dom
// Assistant de campagne, étapes « Sources » et « Questions » (APPFLOW §8.0 à §8.2, TR-SEC-08 côté écran, EC-SRC-06).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { messagesFor, type Locale } from '@pubeka/i18n';
import { ApiError } from '../../lib/api';
import { useWizardStore } from '../../stores/wizard-store';
import { UploadFailedError, type Analysis } from './api';
import { CampaignWizard } from './campaign-wizard';
import { failureKey } from './outcome-panels';
import { checkAnswer, QuestionsStep } from './questions-step';
import { currentStage } from './waiting-panel';
import { startErrorKey } from './sources-step';
import { typographic } from './typography';
import {
  buildBody,
  checkFile,
  countSources,
  EMPTY_DRAFT,
  isHttpUrl,
  validateDraft,
  websiteType,
  type Draft,
} from './sources-model';

const WS = '44444444-4444-4444-8444-444444444444';
const ID = '99999999-9999-4999-8999-999999999999';

beforeEach(() => {
  useWizardStore.getState().reset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function wrap(node: React.ReactNode, opts: { locale?: Locale; search?: string } = {}) {
  const locale = opts.locale ?? 'fr';
  return render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <NuqsTestingAdapter searchParams={opts.search ?? ''} hasMemory>
          {node}
        </NuqsTestingAdapter>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

interface Call {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

/** `fetch` simulé : une réponse par « METHODE chemin » (une liste = réponses successives). */
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
      const respond = Array.isArray(entry)
        ? (entry[Math.min(n, entry.length - 1)] ?? undefined)
        : entry;
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
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const problem = (code: string, status: number, extra: Record<string, unknown> = {}) =>
  json({ type: 'x', title: code, status, code, request_id: 'req_T', ...extra }, status);

const PAGES = json({
  data: [{ id: 'p1', meta_page_id: '200000000001', name: 'Boutique Awa', active: true }],
  quotas: { pages_active: 1, pages_limit: 1 },
});
const CONNECTED = json({
  data: [{ id: 'c1', token_type: 'user', status: 'ok', expires_at: null }],
});

const QUESTIONS = [
  {
    id: 'q1',
    field: 'contacts.whatsapp',
    text: 'Sur quel numéro WhatsApp tes clients doivent-ils t’écrire ?',
    why: 'La pub enverra les clients sur ce numéro.',
    input: 'phone',
    options: null,
    required: true,
  },
  {
    id: 'q2',
    field: 'tone',
    text: 'Quel ton pour ta pub ?',
    why: '',
    input: 'single_choice',
    options: ['Amical', 'Sérieux'],
    required: false,
  },
  {
    id: 'q3',
    field: 'promos',
    text: 'Quelles offres mettre en avant ?',
    input: 'multi_choice',
    options: ['Livraison', 'Remise'],
    required: false,
  },
  {
    id: 'q4',
    field: 'price',
    text: 'Quel prix afficher ?',
    input: 'number',
    options: null,
    required: true,
  },
];
const analysis = (over: Partial<Analysis> = {}): Analysis => ({
  id: ID,
  status: 'questions',
  blocked_reason: null,
  questions: QUESTIONS as Analysis['questions'],
  unreadable_sources: [],
  error_code: null,
  flags: [],
  answers: [],
  ...over,
});

describe('règles de l’étape Sources (sources-model)', () => {
  it('TR-SEC-08 : une image de plus de 10 Mo, un PDF de plus de 20 Mo et un mauvais type sont refusés avant l’envoi', () => {
    expect(checkFile({ type: 'image/png', size: 10 * 1024 * 1024 }, 'image')).toBeNull();
    expect(checkFile({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }, 'image')).toBe(
      'file_too_large_image',
    );
    expect(checkFile({ type: 'application/pdf', size: 20 * 1024 * 1024 }, 'document')).toBeNull();
    expect(checkFile({ type: 'application/pdf', size: 20 * 1024 * 1024 + 1 }, 'document')).toBe(
      'file_too_large_document',
    );
    expect(checkFile({ type: 'image/gif', size: 10 }, 'image')).toBe('file_type');
    expect(checkFile({ type: 'application/pdf', size: 10 }, 'image')).toBe('file_type');
    expect(checkFile({ type: 'image/png', size: 0 }, 'image')).toBe('file_type');
  });

  it('adresses : http(s) avec un domaine ; les boutiques d’applications donnent « app_link »', () => {
    expect(isHttpUrl('https://boutique.example.cm')).toBe(true);
    expect(isHttpUrl('ftp://boutique.example.cm')).toBe(false);
    expect(isHttpUrl('boutique')).toBe(false);
    expect(isHttpUrl('https://localhost')).toBe(false);
    expect(websiteType('https://play.google.com/store/apps/details?id=x')).toBe('app_link');
    expect(websiteType('https://boutique.example.cm')).toBe('website');
    expect(websiteType('pas une adresse')).toBe('website');
  });

  const draft = (over: Partial<Draft>): Draft => ({ ...EMPTY_DRAFT, ...over });
  const file = (name: string, type: string, size = 100): File =>
    new File([new Uint8Array(size)], name, { type });

  it('validateDraft : au moins une source remplie ; une source choisie mais vide ne compte pas', () => {
    expect(validateDraft(draft({}))).toEqual([{ field: 'sources', code: 'need_one' }]);
    expect(validateDraft(draft({ kinds: ['website'] }))).toEqual([
      { field: 'sources', code: 'need_one' },
    ]);
    expect(validateDraft(draft({ kinds: ['text'], text: 'Baskets à Abidjan' }))).toEqual([]);
    expect(countSources(draft({ kinds: ['text', 'website'], text: 'x', websiteUrl: ' ' }))).toBe(1);
  });

  it('validateDraft : adresse invalide, description trop longue, trop de photos, fichier refusé', () => {
    expect(validateDraft(draft({ kinds: ['website'], websiteUrl: 'abc' }))).toEqual([
      { field: 'websiteUrl', code: 'url_invalid' },
    ]);
    expect(validateDraft(draft({ kinds: ['post'], postUrl: 'abc' }))).toEqual([
      { field: 'postUrl', code: 'url_invalid' },
    ]);
    expect(validateDraft(draft({ kinds: ['text'], text: 'a'.repeat(5001) }))).toEqual([
      { field: 'text', code: 'text_too_long' },
    ]);
    const eleven = Array.from({ length: 11 }, (_, i) => file(`p${String(i)}.png`, 'image/png'));
    expect(validateDraft(draft({ kinds: ['photo'], photos: eleven }))[0]).toEqual({
      field: 'photos',
      code: 'too_many_photos',
    });
    expect(
      validateDraft(draft({ kinds: ['photo'], photos: [file('a.gif', 'image/gif')] })),
    ).toEqual([{ field: 'photos', code: 'file_type' }]);
    expect(
      validateDraft(
        draft({
          kinds: ['document'],
          document: file('a.pdf', 'application/pdf', 21 * 1024 * 1024),
        }),
      ),
    ).toEqual([{ field: 'document', code: 'file_too_large_document' }]);
  });

  it('buildBody : un type par source, chemins rendus par le serveur dans l’ordre, Page et consigne facultatives', () => {
    const d = draft({
      kinds: ['website', 'photo', 'post', 'document', 'text'],
      websiteUrl: ' https://boutique.example.cm ',
      postUrl: 'https://www.facebook.com/x/posts/1',
      text: ' Baskets ',
      intent: ' Une promo ',
      pageId: 'p1',
      photos: [file('a.png', 'image/png'), file('b.jpg', 'image/jpeg')],
      document: file('c.pdf', 'application/pdf'),
    });
    expect(buildBody(d, ['f1', 'f2', 'f3'])).toEqual({
      page_id: 'p1',
      user_intent: 'Une promo',
      sources: [
        { type: 'website', url: 'https://boutique.example.cm' },
        { type: 'social_post', url: 'https://www.facebook.com/x/posts/1' },
        { type: 'image', file_path: 'f1' },
        { type: 'image', file_path: 'f2' },
        { type: 'document', file_path: 'f3' },
        { type: 'text', text: 'Baskets' },
      ],
    });
    expect(buildBody(draft({ kinds: ['text'], text: 'x' }), [])).toEqual({
      sources: [{ type: 'text', text: 'x' }],
    });
  });
});

describe('messages d’erreur', () => {
  it('startErrorKey : codes de la liste fermée vers les messages de l’écran', () => {
    const api = (code: string, status = 422) =>
      new ApiError(status, { type: 'x', title: code, status, code, request_id: 'r' } as never);
    expect(startErrorKey(api('unsafe_url'))).toBe('unsafe_url');
    expect(startErrorKey(api('unsupported_file_type', 415))).toBe('file_type');
    expect(startErrorKey(api('file_too_large', 413), 'document')).toBe('file_too_large_document');
    expect(startErrorKey(api('file_too_large', 413), 'image')).toBe('file_too_large_image');
    expect(startErrorKey(api('gone', 410))).toBe('file_gone');
    expect(startErrorKey(api('rate_limited', 429))).toBe('rate_limited');
    expect(startErrorKey(api('role_insufficient', 403))).toBe('forbidden');
    expect(startErrorKey(api('workspace_read_only', 403))).toBe('forbidden');
    expect(startErrorKey(api('maintenance', 503))).toBe('unavailable');
    expect(startErrorKey(api('internal_error', 500))).toBe('generic');
    expect(startErrorKey(new UploadFailedError())).toBe('unavailable');
    expect(startErrorKey(new Error('x'))).toBe('generic');
  });

  it('failureKey : un code d’échec, un seul message', () => {
    expect(failureKey({ error_code: 'source_unreadable', flags: [] })).toBe('source_unreadable');
    expect(failureKey({ error_code: 'unsafe_url', flags: [] })).toBe('unsafe_url');
    expect(failureKey({ error_code: 'rate_limited', flags: [] })).toBe('rate_limited');
    expect(
      failureKey({ error_code: 'provider_unavailable', flags: ['MODEL_WITHOUT_VISION'] }),
    ).toBe('model_without_vision');
    expect(failureKey({ error_code: 'provider_unavailable', flags: [] })).toBe('generic');
    expect(failureKey({ error_code: null, flags: [] })).toBe('generic');
  });

  it('currentStage : lecture, compréhension, questions', () => {
    expect([
      currentStage('queued'),
      currentStage('reading'),
      currentStage('analysing'),
      currentStage('questions'),
    ]).toEqual([0, 0, 1, 2]);
  });

  it('checkAnswer : obligatoire, téléphone, nombre', () => {
    const q = (input: string, required = true) =>
      ({ id: 'q', text: 't', input, required }) as Analysis['questions'][number];
    expect(checkAnswer(q('text'), '  ')).toBe('required');
    expect(checkAnswer(q('text', false), '  ')).toBeNull();
    expect(checkAnswer(q('phone'), '+237 690 12 34 56')).toBeNull();
    expect(checkAnswer(q('phone'), '0690123456')).toBe('phone');
    expect(checkAnswer(q('number'), '25 000')).toBeNull();
    expect(checkAnswer(q('number'), 'vingt')).toBe('number');
  });
});

describe('typographie', () => {
  it('français : espace insécable avant ? ! : ; et dans les guillemets ; apostrophe typographique', () => {
    const nbsp = ' ';
    expect(typographic("Veux-tu l'afficher ? Oui : non !", 'fr')).toBe(
      `Veux-tu l’afficher${nbsp}? Oui${nbsp}: non${nbsp}!`,
    );
    expect(typographic('dis « bonjour »', 'fr')).toBe(`dis «${nbsp}bonjour${nbsp}»`);
  });

  it('anglais : seule l’apostrophe change', () => {
    expect(typographic("Do you want it? It's ready: yes", 'en')).toBe(
      'Do you want it? It’s ready: yes',
    );
  });
});

describe('CampaignWizard : accès (APPFLOW §8.0)', () => {
  it('un lecteur, un espace en lecture seule ou suspendu, aucun espace : message à la place de l’assistant', () => {
    wrap(<CampaignWizard workspace={{ id: WS, role: 'viewer', status: 'active' }} />);
    expect(
      screen.getByText('Seuls le propriétaire et les éditeurs créent des campagnes.'),
    ).toBeTruthy();
    cleanup();
    wrap(<CampaignWizard workspace={{ id: WS, role: 'owner', status: 'read_only' }} />);
    expect(screen.getByText('Ton espace est en lecture seule.')).toBeTruthy();
    cleanup();
    wrap(<CampaignWizard workspace={{ id: WS, role: 'owner', status: 'suspended' }} />);
    expect(screen.getByText('Ton espace est suspendu.')).toBeTruthy();
    cleanup();
    wrap(<CampaignWizard workspace={null} />);
    expect(screen.getByText(/Aucun espace de travail/)).toBeTruthy();
  });

  it('Meta non connecté : bandeau « Connecte ton compte Meta », on peut préparer sans publier', async () => {
    stubApi({ 'GET /meta/connections': json({ data: [] }), 'GET /pages': PAGES });
    wrap(<CampaignWizard workspace={{ id: WS, role: 'owner', status: 'active' }} />);
    expect(await screen.findByText('Connecte ton compte Meta pour publier.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Connecter' }).getAttribute('href')).toBe(
      '/reglages/comptes-meta',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Préparer sans publier' }));
    await waitFor(() => {
      expect(screen.queryByText('Connecte ton compte Meta pour publier.')).toBeNull();
    });
    expect(screen.getByRole('heading', { level: 1, name: /Qu’as-tu sous la main/ })).toBeTruthy();
  });

  it('Meta connecté : pas de bandeau ; Google et TikTok sont « Bientôt » et inactifs', async () => {
    stubApi({ 'GET /meta/connections': CONNECTED, 'GET /pages': PAGES });
    wrap(<CampaignWizard workspace={{ id: WS, role: 'editor', status: 'active' }} />);
    expect(await screen.findByRole('combobox', { name: 'Page' })).toBeTruthy();
    expect(screen.queryByText('Connecte ton compte Meta pour publier.')).toBeNull();
    const google = screen.getByRole('radio', { name: /Google Ads/ });
    expect(google.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Meta Ads' }).getAttribute('aria-checked')).toBe(
      'true',
    );
  });
});

describe('Étape Sources : lancement de l’analyse', () => {
  async function openAndType(text = 'Je vends des baskets à Abidjan, à partir de 25 000 F.') {
    wrap(<CampaignWizard workspace={{ id: WS, role: 'owner', status: 'active' }} />);
    fireEvent.click(await screen.findByRole('button', { name: /Description/ }));
    fireEvent.change(screen.getByLabelText('Décris ton activité'), { target: { value: text } });
  }

  it('[Analyser] est inactif sans source ; avec une description il envoie une Idempotency-Key et la Page', async () => {
    const calls = stubApi({
      'GET /meta/connections': CONNECTED,
      'GET /pages': PAGES,
      'POST /analyses': json(analysis({ status: 'queued', questions: [] }), 202),
      [`GET /analyses/${ID}`]: json(analysis({ status: 'questions' })),
    });
    wrap(<CampaignWizard workspace={{ id: WS, role: 'owner', status: 'active' }} />);
    await screen.findByRole('combobox', { name: 'Page' }); // les Pages sont chargées : la Page active est choisie d'office
    const analyse = screen.getByRole('button', { name: 'Analyser' });
    expect((analyse as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Description/ }));
    fireEvent.change(screen.getByLabelText('Décris ton activité'), {
      target: { value: 'Baskets à Abidjan' },
    });
    fireEvent.change(screen.getByLabelText('Ce que tu veux comme pub (facultatif)'), {
      target: { value: 'Une promo' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }));
    await screen.findByRole('heading', { name: 'Quelques précisions' }, { timeout: 4000 });
    const post = calls.find((c) => c.method === 'POST' && c.path === '/analyses');
    expect(post?.body).toEqual({
      page_id: 'p1',
      user_intent: 'Une promo',
      sources: [{ type: 'text', text: 'Baskets à Abidjan' }],
    });
    expect(post?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('une nouvelle tentative de la même demande réutilise la même clé ; une demande modifiée en reçoit une autre', async () => {
    const calls = stubApi({
      'GET /meta/connections': CONNECTED,
      'GET /pages': PAGES,
      'POST /analyses': problem('provider_unavailable', 503),
    });
    await openAndType('Baskets à Abidjan');
    const analyse = screen.getByRole('button', { name: 'Analyser' });
    fireEvent.click(analyse);
    await screen.findByText(
      'Le service est indisponible pour le moment. Réessaie dans quelques instants.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }));
    await waitFor(() => {
      expect(calls.filter((c) => c.path === '/analyses')).toHaveLength(2);
    });
    fireEvent.change(screen.getByLabelText('Décris ton activité'), {
      target: { value: 'Baskets à Douala' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }));
    await waitFor(() => {
      expect(calls.filter((c) => c.path === '/analyses')).toHaveLength(3);
    });
    const keys = calls
      .filter((c) => c.path === '/analyses')
      .map((c) => c.headers['idempotency-key']);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('EC-SRC-01 : une adresse refusée par le serveur affiche « Ce lien ne peut pas être lu. »', async () => {
    stubApi({
      'GET /meta/connections': CONNECTED,
      'GET /pages': PAGES,
      'POST /analyses': problem('unsafe_url', 422),
    });
    wrap(<CampaignWizard workspace={{ id: WS, role: 'owner', status: 'active' }} />);
    fireEvent.click(await screen.findByRole('button', { name: /Lien de site/ }));
    fireEvent.change(screen.getByLabelText('Lien de ton site'), {
      target: { value: 'http://169.254.169.254/' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }));
    expect(await screen.findByText('Ce lien ne peut pas être lu.')).toBeTruthy();
  });

  it('une adresse mal formée est signalée avant tout envoi', async () => {
    const calls = stubApi({ 'GET /meta/connections': CONNECTED, 'GET /pages': PAGES });
    wrap(<CampaignWizard workspace={{ id: WS, role: 'owner', status: 'active' }} />);
    fireEvent.click(await screen.findByRole('button', { name: /Lien de site/ }));
    fireEvent.change(screen.getByLabelText('Lien de ton site'), { target: { value: 'boutique' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }));
    expect(await screen.findByText('Colle une adresse qui commence par https://.')).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('TR-SEC-08 : une photo trop lourde ou d’un mauvais format est refusée à l’écran, sans envoi', async () => {
    const calls = stubApi({ 'GET /meta/connections': CONNECTED, 'GET /pages': PAGES });
    wrap(<CampaignWizard workspace={{ id: WS, role: 'owner', status: 'active' }} />);
    fireEvent.click(await screen.findByRole('button', { name: /Photo du produit/ }));
    const input = document.querySelector('input[type="file"]')!;
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'grosse.png', {
      type: 'image/png',
    });
    const gif = new File([new Uint8Array(10)], 'anime.gif', { type: 'image/gif' });
    fireEvent.change(input, { target: { files: [big, gif] } });
    expect(await screen.findByText('Ce fichier dépasse 10 Mo.')).toBeTruthy();
    expect(screen.getByText('Formats acceptés : JPG, PNG, WEBP, PDF, DOCX.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }));
    await waitFor(() => {
      expect(screen.getAllByText(/Ce fichier dépasse 10 Mo\./).length).toBeGreaterThan(0);
    });
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Retirer grosse.png' }));
    expect(screen.queryByText('grosse.png')).toBeNull();
  });

  it('une photo valide est envoyée au stockage par URL signée avant l’analyse', async () => {
    const calls = stubApi({
      'GET /meta/connections': CONNECTED,
      'GET /pages': PAGES,
      'POST /uploads': json(
        {
          upload_url: 'https://storage.test/upload/sign/sources/x.png?token=t',
          file_path: `${WS}/f.png`,
          expires_at: 'x',
        },
        201,
      ),
      'PUT https://storage.test/upload/sign/sources/x.png?token=t': () =>
        new Response('{}', { status: 200 }),
      'POST /analyses': json(analysis({ status: 'queued', questions: [] }), 202),
      [`GET /analyses/${ID}`]: json(analysis({ status: 'reading', questions: [] })),
    });
    wrap(<CampaignWizard workspace={{ id: WS, role: 'owner', status: 'active' }} />);
    fireEvent.click(await screen.findByRole('button', { name: /Photo du produit/ }));
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array(50)], 'produit.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }));
    await screen.findByRole('heading', { name: 'Je lis tes sources…' });
    expect(calls.map((c) => `${c.method} ${c.path}`).slice(0, 4)).toEqual([
      'GET /meta/connections',
      'GET /pages',
      'POST /uploads',
      'PUT https://storage.test/upload/sign/sources/x.png?token=t',
    ]);
    const start = calls.find((c) => c.path === '/analyses' && c.method === 'POST');
    expect(start?.body).toEqual({
      page_id: 'p1',
      sources: [{ type: 'image', file_path: `${WS}/f.png` }],
    });
  });

  it('un envoi au stockage qui échoue donne un message clair, l’analyse n’est pas lancée', async () => {
    const calls = stubApi({
      'GET /meta/connections': CONNECTED,
      'GET /pages': PAGES,
      'POST /uploads': json(
        { upload_url: 'https://storage.test/u', file_path: `${WS}/f.png`, expires_at: 'x' },
        201,
      ),
      'PUT https://storage.test/u': () => new Response('no', { status: 500 }),
    });
    wrap(<CampaignWizard workspace={{ id: WS, role: 'owner', status: 'active' }} />);
    fireEvent.click(await screen.findByRole('button', { name: /Document/ }));
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array(50)], 'catalogue.pdf', { type: 'application/pdf' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analyser' }));
    expect(
      await screen.findByText(
        'Le service est indisponible pour le moment. Réessaie dans quelques instants.',
      ),
    ).toBeTruthy();
    expect(calls.some((c) => c.path === '/analyses')).toBe(false);
  });
});

describe('Suivi de l’analyse et fins d’analyse', () => {
  const wizard = () => <CampaignWizard workspace={{ id: WS, role: 'owner', status: 'active' }} />;

  it('attente : trois étapes cochées au fil de l’analyse', async () => {
    stubApi({ [`GET /analyses/${ID}`]: json(analysis({ status: 'analysing', questions: [] })) });
    wrap(wizard(), { search: `?analyse=${ID}` });
    expect(await screen.findByRole('heading', { name: 'Je lis tes sources…' })).toBeTruthy();
    const list = () => within(screen.getByRole('list', { name: 'Avancement de l’analyse' }));
    await waitFor(() => {
      expect(list().getAllByRole('listitem')[0]?.textContent).toContain('terminé');
    });
    const items = list().getAllByRole('listitem');
    expect(items[1]?.getAttribute('aria-current')).toBe('step');
    expect(items[2]?.textContent).toContain('à venir');
  });

  it('EC-SRC-06 : produit illégal — le refus, aucun contournement, un lien vers le support', async () => {
    stubApi({
      [`GET /analyses/${ID}`]: json(
        analysis({ status: 'blocked', blocked_reason: 'illegal_product', questions: [] }),
      ),
    });
    wrap(wizard(), { search: `?analyse=${ID}` });
    expect(
      await screen.findByText('Pubeka ne peut pas créer de publicité pour ce produit.'),
    ).toBeTruthy();
    expect(screen.getByText(/interdit par la loi et par les plateformes/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Écrire au support' }).getAttribute('href')).toBe(
      '/support',
    );
    expect(screen.queryByRole('button', { name: 'Revenir à mes sources' })).toBeNull();
  });

  it('échec : le message dépend du code ; « Revenir à mes sources » ramène à l’étape 1', async () => {
    stubApi({
      [`GET /analyses/${ID}`]: json(
        analysis({ status: 'failed', error_code: 'source_unreadable', questions: [] }),
      ),
      'GET /meta/connections': CONNECTED,
      'GET /pages': PAGES,
    });
    wrap(wizard(), { search: `?analyse=${ID}` });
    expect(
      await screen.findByText(
        'Je n’arrive pas à lire ces sources. Ajoute une description ou une photo.',
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Revenir à mes sources' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /Qu’as-tu sous la main/ }),
    ).toBeTruthy();
  });

  it('échec du suivi : message et bouton de retour', async () => {
    stubApi({ [`GET /analyses/${ID}`]: problem('internal_error', 500) });
    wrap(wizard(), { search: `?analyse=${ID}` });
    expect(await screen.findByText(/Impossible de suivre l’analyse/)).toBeTruthy();
  });
});

describe('Étape Questions', () => {
  const step = (a: Analysis = analysis()) => (
    <QuestionsStep workspaceId={WS} analysis={a} onBack={() => undefined} />
  );

  it('une carte par question ; le « Pourquoi ? » n’apparaît que pour les questions qui en ont un', () => {
    stubApi({});
    wrap(step());
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(4);
    expect(screen.getByText('La pub enverra les clients sur ce numéro.')).toBeTruthy();
    expect(screen.getAllByText(/Pourquoi/)).toHaveLength(1);
  });

  it('réponses obligatoires manquantes ou invalides : erreurs sous les champs, rien n’est envoyé', async () => {
    const calls = stubApi({});
    wrap(step());
    fireEvent.click(screen.getByRole('button', { name: 'Générer la proposition' }));
    expect((await screen.findAllByText('Cette réponse est nécessaire.')).length).toBe(2);
    const phone = screen.getAllByRole('textbox')[0] as HTMLInputElement;
    fireEvent.change(phone, { target: { value: '0690123456' } });
    expect(await screen.findByText(/Écris le numéro avec l’indicatif du pays/)).toBeTruthy();
    expect(calls).toHaveLength(0);
  });

  it('enregistre les réponses, puis affiche « Tes réponses sont enregistrées » ; « Modifier » rouvre les cartes', async () => {
    const calls = stubApi({
      [`GET /analyses/${ID}`]: json(analysis()),
      [`POST /analyses/${ID}/answers`]: json(
        analysis({
          status: 'ready',
          answers: [
            { question_id: 'q1', answer: '+237690123456' },
            { question_id: 'q4', answer: '25000' },
          ],
        }),
      ),
    });
    wrap(<CampaignWizard workspace={{ id: WS, role: 'owner', status: 'active' }} />, {
      search: `?analyse=${ID}`,
    });
    await screen.findByRole('heading', { name: 'Quelques précisions' }, { timeout: 4000 });
    const fields = screen.getAllByRole('textbox');
    fireEvent.change(fields[0] as HTMLInputElement, { target: { value: '+237 690 12 34 56' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Amical' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remise' }));
    fireEvent.change(fields.at(-1) as HTMLInputElement, { target: { value: '25000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Générer la proposition' }));
    expect(await screen.findByText('Tes réponses sont enregistrées.')).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      answers: [
        { question_id: 'q1', answer: '+237 690 12 34 56' },
        { question_id: 'q2', answer: 'Amical' },
        { question_id: 'q3', answer: 'Remise' },
        { question_id: 'q4', answer: '25000' },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Modifier mes réponses' }));
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(4);
  });

  it('les réponses déjà données reviennent pré-remplies ; les signalements sont affichés sans la couleur seule', () => {
    stubApi({});
    wrap(
      step(
        analysis({
          answers: [{ question_id: 'q1', answer: '+237690123456' }],
          unreadable_sources: [0, 2],
          flags: ['IMAGES_NOT_READ', 'IMAGE_VALUES_UNVERIFIED', 'PROMPT_INJECTION_SUSPECTED'],
        }),
      ),
    );
    expect((screen.getAllByLabelText('Ta réponse')[0] as HTMLInputElement).value).toBe(
      '+237690123456',
    );
    expect(screen.getByText(/Je n’ai pas pu lire 2 de tes sources/)).toBeTruthy();
    expect(screen.getByText(/Je n’ai pas pu lire tes photos pour le moment/)).toBeTruthy();
    expect(screen.getByText(/Vérifie les informations venues de tes photos/)).toBeTruthy();
    expect(screen.queryByText(/INJECTION/)).toBeNull();
  });

  it('une erreur du serveur sur une réponse s’affiche sous la bonne question', async () => {
    stubApi({
      [`POST /analyses/${ID}/answers`]: problem('validation_failed', 400, {
        errors: [{ field: 'answers.0.answer', code: 'invalid_format', message: 'x' }],
      }),
    });
    wrap(step());
    const fields = screen.getAllByRole('textbox');
    fireEvent.change(fields[0] as HTMLInputElement, { target: { value: '+237690123456' } });
    fireEvent.change(fields.at(-1) as HTMLInputElement, { target: { value: '25000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Générer la proposition' }));
    expect(await screen.findByText('Cette réponse n’est pas valide.')).toBeTruthy();
  });

  it('une panne à l’enregistrement affiche un message général', async () => {
    stubApi({ [`POST /analyses/${ID}/answers`]: problem('internal_error', 500) });
    wrap(step());
    const fields = screen.getAllByRole('textbox');
    fireEvent.change(fields[0] as HTMLInputElement, { target: { value: '+237690123456' } });
    fireEvent.change(fields.at(-1) as HTMLInputElement, { target: { value: '25000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Générer la proposition' }));
    expect(
      await screen.findByText('Tes réponses n’ont pas été enregistrées. Réessaie.'),
    ).toBeTruthy();
  });

  it('en anglais, aucun libellé français ne reste', () => {
    stubApi({});
    wrap(step(), { locale: 'en' });
    const text = document.body.textContent;
    expect(text).toContain('A few details');
    expect(text).toContain('Generate the proposal');
    for (const french of ['Quelques précisions', 'Générer', 'Pourquoi', 'Ta réponse']) {
      expect(text).not.toContain(french);
    }
  });
});

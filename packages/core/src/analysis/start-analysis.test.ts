// Lancement d'une analyse : rôles, validation avant toute dépense, EC-SRC-01, fichiers, quotas, tâche de fond.
import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import { ANALYSIS_RUN_TASK, type ImageProcessor, type JobEnqueuer } from './deps';
import type { DnsResolver } from './safe-url';
import { memberCtx, PNG_BYTES, TEXT, WS } from './fixtures.test-helper';
import { MemoryDb } from './memory-db.test-helper';
import {
  startAnalysis,
  type StartAnalysisInput,
  type StartAnalysisOptions,
} from './start-analysis';

const resolve: DnsResolver = () => Promise.resolve(['93.184.216.34']);
const images: ImageProcessor = {
  reencode: (_b, mime) => Promise.resolve({ bytes: PNG_BYTES, mime }),
};

function setup(over: Partial<StartAnalysisOptions> = {}) {
  const db = new MemoryDb();
  const enqueued: { task: string; payload: unknown; key: string }[] = [];
  const jobs: JobEnqueuer = {
    enqueue: (task, payload, key) => {
      enqueued.push({ task, payload, key });
      return Promise.resolve();
    },
  };
  let n = 0;
  const options: StartAnalysisOptions = {
    jobs,
    images,
    resolve,
    newId: () => `99999999-9999-4999-8999-${String((n += 1)).padStart(12, '0')}`,
    ...over,
  };
  return { db, enqueued, options };
}

const text = (t = TEXT): StartAnalysisInput => ({ sources: [{ type: 'text', text: t }] });

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error instanceof AppError ? error.code : 'autre';
  }
}

describe('startAnalysis : succès', () => {
  it('enregistre les sources et l’analyse « en file », lance la tâche avec des identifiants seulement', async () => {
    const { db, enqueued, options } = setup();
    const view = await startAnalysis(
      memberCtx(db),
      { ...text(), user_intent: '  Une pub pour Noël  ' },
      options,
    );
    expect(view.status).toBe('queued');
    const analysis = db.rows('analyses')[0];
    expect(analysis).toMatchObject({
      workspace_id: WS,
      created_by: '11111111-1111-4111-8111-111111111111',
      user_intent: 'Une pub pour Noël',
      status: 'queued',
    });
    expect(db.rows('sources')[0]).toMatchObject({
      workspace_id: WS,
      type: 'text',
      extracted_text: TEXT,
    });
    expect(enqueued).toEqual([
      {
        task: ANALYSIS_RUN_TASK,
        payload: { analysisId: analysis?.id, workspaceId: WS },
        key: `analysis:${String(analysis?.id)}`,
      },
    ]);
    expect(JSON.stringify(enqueued[0]?.payload)).not.toContain('baskets'); // jamais le contenu dans la tâche
  });

  it('plusieurs sources de types différents, dans l’ordre', async () => {
    const { db, options } = setup();
    await startAnalysis(
      memberCtx(db),
      {
        sources: [
          { type: 'website', url: 'https://shop.example.com/' },
          { type: 'app_link', url: 'https://play.google.com/store/apps/details?id=x' },
          { type: 'text', text: 'Bonjour' },
        ],
      },
      options,
    );
    expect(db.rows('sources').map((s) => s.type)).toEqual(['website', 'app_link', 'text']);
    expect(db.rows('analyses')[0]?.source_ids).toHaveLength(3);
  });

  it('une Page de l’espace peut être donnée ; un nom de domaine introuvable n’empêche pas le lancement', async () => {
    const { db, options } = setup({ resolve: () => Promise.reject(new Error('ENOTFOUND')) });
    const pageId = '77777777-7777-4777-8777-777777777777';
    db.rows('pages').push({ id: pageId, workspace_id: WS });
    const view = await startAnalysis(
      memberCtx(db),
      { page_id: pageId, sources: [{ type: 'website', url: 'https://inconnu.example.com/' }] },
      options,
    );
    expect(view.status).toBe('queued');
    expect(db.rows('analyses')[0]?.page_id).toBe(pageId);
  });
});

describe('startAnalysis : refus avant toute dépense', () => {
  it('un lecteur ne peut pas lancer d’analyse ; un espace en lecture seule ou suspendu non plus', async () => {
    const { db, options, enqueued } = setup();
    expect(await code(startAnalysis(memberCtx(db, 'viewer'), text(), options))).toBe(
      'role_insufficient',
    );
    expect(await code(startAnalysis(memberCtx(db, 'owner', 'read_only'), text(), options))).toBe(
      'workspace_read_only',
    );
    expect(await code(startAnalysis(memberCtx(db, 'owner', 'suspended'), text(), options))).toBe(
      'workspace_suspended',
    );
    expect(enqueued).toHaveLength(0);
    expect(db.rows('analyses')).toHaveLength(0);
  });

  it('EC-SRC-01 : une adresse interne est refusée (unsafe_url), rien n’est enregistré ni lancé', async () => {
    const { db, options, enqueued } = setup();
    for (const url of [
      'http://169.254.169.254/latest/',
      'http://127.0.0.1/',
      'https://shop.example.com:8080/',
    ]) {
      expect(
        await code(startAnalysis(memberCtx(db), { sources: [{ type: 'website', url }] }, options)),
      ).toBe('unsafe_url');
    }
    expect(db.rows('analyses')).toHaveLength(0);
    expect(db.rows('sources')).toHaveLength(0);
    expect(enqueued).toHaveLength(0);
  });

  it('un nom qui se résout vers une adresse privée est refusé (rebinding)', async () => {
    const { db, options } = setup({ resolve: () => Promise.resolve(['10.0.0.8']) });
    expect(
      await code(
        startAnalysis(
          memberCtx(db),
          { sources: [{ type: 'website', url: 'https://evil.example.com/' }] },
          options,
        ),
      ),
    ).toBe('unsafe_url');
  });

  it('une Page d’un autre espace ou inconnue donne 404 ; un identifiant mal formé donne 400', async () => {
    const { db, options } = setup();
    db.rows('pages').push({
      id: '88888888-8888-4888-8888-888888888888',
      workspace_id: '55555555-5555-4555-8555-555555555555',
    });
    expect(
      await code(
        startAnalysis(
          memberCtx(db),
          { ...text(), page_id: '88888888-8888-4888-8888-888888888888' },
          options,
        ),
      ),
    ).toBe('not_found');
    expect(
      await code(startAnalysis(memberCtx(db), { ...text(), page_id: 'pas-un-uuid' }, options)),
    ).toBe('validation_failed');
    db.failNext.add('pages:select');
    expect(
      await code(
        startAnalysis(
          memberCtx(db),
          { ...text(), page_id: '88888888-8888-4888-8888-888888888888' },
          options,
        ),
      ),
    ).toBe('internal_error');
  });

  it('un texte vide après nettoyage et un même fichier envoyé deux fois sont refusés (400)', async () => {
    const { db, options } = setup();
    expect(
      await code(
        startAnalysis(memberCtx(db), { sources: [{ type: 'text', text: ' \u0000 ' }] }, options),
      ),
    ).toBe('validation_failed');
    const path = `${WS}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`;
    expect(
      await code(
        startAnalysis(
          memberCtx(db),
          {
            sources: [
              { type: 'image', file_path: path },
              { type: 'image', file_path: path },
            ],
          },
          options,
        ),
      ),
    ).toBe('validation_failed');
  });

  it('un fichier absent du registre donne 404 (jamais lu)', async () => {
    const { db, options } = setup();
    const path = `${WS}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`;
    expect(
      await code(
        startAnalysis(memberCtx(db), { sources: [{ type: 'image', file_path: path }] }, options),
      ),
    ).toBe('not_found');
  });

  it('un fichier valide est vérifié avant le lancement', async () => {
    const { db, options, enqueued } = setup();
    const path = `${WS}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png`;
    db.put('sources', path, PNG_BYTES, '2026-10-15T09:59:00Z');
    db.rows('uploads').push({
      id: db.nextId(),
      workspace_id: WS,
      purpose: 'source',
      bucket: 'sources',
      file_path: path,
      declared_mime: 'image/png',
      declared_size: 12,
      status: 'pending',
      expires_at: '2026-10-15T10:04:00Z',
    });
    const view = await startAnalysis(
      memberCtx(db),
      { sources: [{ type: 'image', file_path: path }] },
      options,
    );
    expect(view.status).toBe('queued');
    expect(enqueued).toHaveLength(1);
    expect(db.rows('sources')[0]).toMatchObject({ type: 'image', file_path: path });
  });
});

describe('startAnalysis : quotas, pannes', () => {
  it('le point d’accroche des quotas (S24) est appelé avant tout enregistrement, et son refus arrête tout', async () => {
    const order: string[] = [];
    const { db, options } = setup({
      beforeSpend: () => {
        order.push(`quota:${String(db.rows('sources').length)}`);
        return Promise.reject(new AppError('insufficient_credits'));
      },
    });
    expect(await code(startAnalysis(memberCtx(db), text(), options))).toBe('insufficient_credits');
    expect(order).toEqual(['quota:0']);
    expect(db.rows('analyses')).toHaveLength(0);
  });

  it('une tâche qui ne démarre pas rend l’analyse « échouée » (provider_unavailable) au lieu de la laisser en file', async () => {
    const { db, options } = setup({
      jobs: { enqueue: () => Promise.reject(new Error('Trigger.dev indisponible')) },
    });
    expect(await code(startAnalysis(memberCtx(db), text(), options))).toBe('provider_unavailable');
    expect(db.rows('analyses')[0]).toMatchObject({
      status: 'failed',
      error_code: 'provider_unavailable',
    });
  });

  it('une erreur d’écriture en base est une erreur interne', async () => {
    for (const table of ['sources:insert', 'analyses:insert']) {
      const { db, options, enqueued } = setup();
      db.failNext.add(table);
      expect(await code(startAnalysis(memberCtx(db), text(), options))).toBe('internal_error');
      expect(enqueued).toHaveLength(0);
    }
  });
});

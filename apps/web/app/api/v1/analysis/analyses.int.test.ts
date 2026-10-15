// Routes « analyses » contre la pile Supabase locale, vrai stockage et fausse IA (aucun appel payant) :
// les 5 cas de chaque route (API_SPEC §15), TR-SEC-08 (fichiers), EC-SRC-01, idempotence, quotas.
import { randomUUID } from 'node:crypto';
import {
  describeRoute,
  na,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import sharp from 'sharp';
import { beforeAll, expect } from 'vitest';
import { GET as getAnalysis } from '../workspaces/[workspaceId]/analyses/[analysisId]/route';
import { POST as answers } from '../workspaces/[workspaceId]/analyses/[analysisId]/answers/route';
import { createAnalysisRunDeps, runAnalysis } from '@pubeka/core';
import { getEnv } from '@pubeka/shared';
import { call, json, pdf, png, queueAnalysis, start, taskCtx, uploadFile } from './int-support';

let seeded: SeededWorkspace;
beforeAll(async () => {
  seeded = await seedWorkspace();
});

const TEXT_SOURCE = {
  type: 'text',
  text: 'Je vends des baskets Nike à Abidjan, à partir de 25 000 F.',
};

const analysisParams = (workspaceId: string, analysisId: string) => ({
  params: Promise.resolve({ workspaceId, analysisId }),
});

interface AnalysisBody {
  id: string;
  status: string;
  blocked_reason?: string | null;
  profile?: Record<string, unknown> | null;
  questions: { id: string; input: string; required: boolean }[];
  flags?: string[];
  answers?: { question_id: string; answer: string }[];
  error_code?: string | null;
}

/** Analyse prête (questions posées) créée sans passer par la route, pour ne pas consommer la limite « ai » de l'espace. */
async function started(s: SeededWorkspace = seeded): Promise<AnalysisBody> {
  const queued = await queueAnalysis(s, [TEXT_SOURCE]);
  const done = await runAnalysis(taskCtx(), queued, createAnalysisRunDeps(getEnv()));
  expect(done.outcome).toBe('questions');
  const row = await testServiceClient()
    .from('analyses')
    .select('id')
    .eq('id', queued.analysisId)
    .single();
  const res = await read(s, s.owner, row.data?.id ?? '');
  return (await json(res)) as unknown as AnalysisBody;
}

function read(s: SeededWorkspace, user: SeededWorkspace['owner'], analysisId: string) {
  return getAnalysis(
    call('GET', `/workspaces/${s.workspace.id}/analyses/${analysisId}`, user.headers),
    analysisParams(s.workspace.id, analysisId),
  );
}

function answer(
  s: SeededWorkspace,
  user: SeededWorkspace['owner'],
  analysisId: string,
  body: unknown,
) {
  return answers(
    call(
      'POST',
      `/workspaces/${s.workspace.id}/analyses/${analysisId}/answers`,
      user.headers,
      body,
    ),
    analysisParams(s.workspace.id, analysisId),
  );
}

describeRoute('startAnalysis', {
  success: async () => {
    const res = await start(seeded, seeded.owner, {
      sources: [TEXT_SOURCE],
      user_intent: 'Une pub simple',
    });
    expect(res.status).toBe(202);
    const body = (await json(res)) as unknown as AnalysisBody;
    // Mode `inline` : la tâche a déjà tourné avec la fausse IA ; l'Analyste a posé 3 questions.
    expect(body.status).toBe('questions');
    expect(body.questions).toHaveLength(3);
    const again = (await json(
      await read(seeded, seeded.owner, body.id),
    )) as unknown as AnalysisBody;
    expect(again.id).toBe(body.id);
    expect(again.profile).not.toBeNull();
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    const res = await start(
      { ...seeded, owner: { ...seeded.owner, headers: {} } },
      { ...seeded.owner, headers: {} },
      { sources: [TEXT_SOURCE] },
    );
    expect(res.status).toBe(401);
    expect(id).toBeTruthy();
  },
  otherWorkspace: async () => {
    const other = { ...seeded, workspace: seeded.strangerWorkspace };
    const res = await start(other, seeded.owner, { sources: [TEXT_SOURCE] });
    expect(res.status).toBe(404);
  },
  forbiddenRole: async () => {
    const res = await start(seeded, seeded.viewer, { sources: [TEXT_SOURCE] });
    expect(res.status).toBe(403);
  },
  invalidBody: async () => {
    expect((await start(seeded, seeded.owner, { sources: [] })).status).toBe(400);
    expect((await start(seeded, seeded.owner, {})).status).toBe(400);
    expect((await start(seeded, seeded.owner, { sources: [TEXT_SOURCE], extra: 1 })).status).toBe(
      400,
    );
    // Une source `website` sans adresse, ou une `image` avec une adresse : erreurs du client.
    expect((await start(seeded, seeded.owner, { sources: [{ type: 'website' }] })).status).toBe(
      400,
    );
    expect(
      (
        await start(seeded, seeded.owner, {
          sources: [{ type: 'image', url: 'https://a.example.com/' }],
        })
      ).status,
    ).toBe(400);
    // 13 sources : au plus 12.
    const many = Array.from({ length: 13 }, () => TEXT_SOURCE);
    expect((await start(seeded, seeded.owner, { sources: many })).status).toBe(400);
  },
  extra: {
    'Idempotency-Key obligatoire (une analyse dépense) : absente → 400': async () => {
      const seeded = await seedWorkspace();
      const res = await start(seeded, seeded.owner, { sources: [TEXT_SOURCE] }, null);
      expect(res.status).toBe(400);
    },
    'Idempotency-Key : même clé et même corps → même analyse, une seule ligne ; autre corps → 409':
      async () => {
        const seeded = await seedWorkspace();
        const key = randomUUID();
        const first = await start(seeded, seeded.owner, { sources: [TEXT_SOURCE] }, key);
        const second = await start(seeded, seeded.owner, { sources: [TEXT_SOURCE] }, key);
        expect(second.headers.get('idempotent-replayed')).toBe('true');
        const a = (await json(first)) as unknown as AnalysisBody;
        const b = (await json(second)) as unknown as AnalysisBody;
        expect(b.id).toBe(a.id);
        const rows = await testServiceClient().from('analyses').select('id').eq('id', a.id);
        expect(rows.data).toHaveLength(1);
        const other = await start(
          seeded,
          seeded.owner,
          { sources: [{ type: 'text', text: 'Autre' }] },
          key,
        );
        expect(other.status).toBe(409);
      },
    'EC-SRC-01 : une adresse interne est refusée (422 unsafe_url) avant toute création':
      async () => {
        const seeded = await seedWorkspace();
        const before = await testServiceClient()
          .from('analyses')
          .select('id')
          .eq('workspace_id', seeded.workspace.id);
        for (const url of [
          'http://169.254.169.254/latest/meta-data/',
          'http://127.0.0.1/',
          'http://localhost/admin',
          'https://example.com:6379/',
        ]) {
          const res = await start(seeded, seeded.owner, { sources: [{ type: 'website', url }] });
          expect(res.status).toBe(422);
          expect(((await json(res)) as { code: string }).code).toBe('unsafe_url');
        }
        const after = await testServiceClient()
          .from('analyses')
          .select('id')
          .eq('workspace_id', seeded.workspace.id);
        expect(after.data).toHaveLength(before.data?.length ?? 0);
      },
    'TR-SEC-09 : la 21ᵉ analyse de l’heure est refusée (429, limite « ai » par espace)':
      async () => {
        const s = await seedWorkspace();
        for (let i = 0; i < 20; i += 1) {
          expect(
            (
              await start(s, s.owner, {
                sources: [{ type: 'text', text: `Boutique ${String(i)}` }],
              })
            ).status,
          ).toBe(202);
        }
        const res = await start(s, s.owner, { sources: [TEXT_SOURCE] });
        expect(res.status).toBe(429);
        expect(res.headers.get('retry-after')).not.toBeNull();
      },
    'TR-SEC-08 : une image est ré-encodée (EXIF supprimé) et remplace l’original dans le stockage':
      async () => {
        const seeded = await seedWorkspace();
        const withExif = new Uint8Array(
          await sharp({ create: { width: 80, height: 60, channels: 3, background: '#aa3300' } })
            .withExif({ IFD0: { Copyright: 'SECRET-COPYRIGHT' } })
            .jpeg()
            .toBuffer(),
        );
        const path = await uploadFile(seeded, withExif, { mime: 'image/jpeg' });
        const res = await start(seeded, seeded.owner, {
          sources: [TEXT_SOURCE, { type: 'image', file_path: path }],
        });
        expect(res.status).toBe(202);
        const stored = await testServiceClient().storage.from('sources').download(path);
        const bytes = new Uint8Array(await stored.data!.arrayBuffer());
        expect(Buffer.from(bytes).includes('SECRET-COPYRIGHT')).toBe(false);
        expect((await sharp(bytes).metadata()).exif).toBeUndefined();
        const row = await testServiceClient()
          .from('uploads')
          .select('status, verified_mime')
          .eq('file_path', path)
          .single();
        expect(row.data).toEqual({ status: 'verified', verified_mime: 'image/jpeg' });
      },
    'TR-SEC-08 : un PNG annoncé comme PDF est refusé par les premiers octets (415), fichier supprimé':
      async () => {
        const seeded = await seedWorkspace();
        const path = await uploadFile(seeded, await png(), { mime: 'application/pdf' });
        const res = await start(seeded, seeded.owner, {
          sources: [{ type: 'document', file_path: path }],
        });
        expect(res.status).toBe(415);
        const row = await testServiceClient()
          .from('uploads')
          .select('status')
          .eq('file_path', path)
          .single();
        expect(row.data?.status).toBe('rejected');
        const gone = await testServiceClient().storage.from('sources').download(path);
        expect(gone.error).not.toBeNull();
        // Réutiliser ce chemin ensuite donne 404 : un fichier refusé n'est plus jamais lu.
        const again = await start(seeded, seeded.owner, {
          sources: [{ type: 'document', file_path: path }],
        });
        expect(again.status).toBe(404);
      },
    'TR-SEC-08 : un exécutable annoncé comme image est refusé (415)': async () => {
      const seeded = await seedWorkspace();
      const exe = new TextEncoder().encode('MZ\u0090\u0000 programme');
      const path = await uploadFile(seeded, exe, { mime: 'image/png' });
      expect(
        (await start(seeded, seeded.owner, { sources: [{ type: 'image', file_path: path }] }))
          .status,
      ).toBe(415);
    },
    'TR-SEC-08 : un fichier qui n’est pas enregistré, ou d’un autre espace, donne 404 (jamais lu)':
      async () => {
        const seeded = await seedWorkspace();
        const svc = testServiceClient();
        const direct = `${seeded.workspace.id}/${randomUUID()}.png`;
        const put = await svc.storage
          .from('sources')
          .upload(direct, Uint8Array.from(await png()), { contentType: 'image/png' });
        expect(put.error).toBeNull();
        expect(
          (await start(seeded, seeded.owner, { sources: [{ type: 'image', file_path: direct }] }))
            .status,
        ).toBe(404);
        const foreign = await uploadFile(
          { ...seeded, workspace: seeded.strangerWorkspace, owner: seeded.stranger },
          await png(),
          { mime: 'image/png' },
        );
        expect(
          (await start(seeded, seeded.owner, { sources: [{ type: 'image', file_path: foreign }] }))
            .status,
        ).toBe(404);
        expect(
          (
            await start(seeded, seeded.owner, {
              sources: [{ type: 'image', file_path: '../../secret.png' }],
            })
          ).status,
        ).toBe(404);
      },
    'TR-SEC-08 : un fichier arrivé après la fenêtre de 5 minutes est refusé (410)': async () => {
      const seeded = await seedWorkspace();
      const path = await uploadFile(seeded, await png(), { mime: 'image/png' });
      await testServiceClient()
        .from('uploads')
        .update({ expires_at: new Date(Date.now() - 3600_000).toISOString() })
        .eq('file_path', path);
      expect(
        (await start(seeded, seeded.owner, { sources: [{ type: 'image', file_path: path }] }))
          .status,
      ).toBe(410);
    },
    'un PDF est accepté et son texte est lu par la tâche': async () => {
      const seeded = await seedWorkspace();
      const path = await uploadFile(seeded, pdf('Catalogue Nike 25000 F'), {
        mime: 'application/pdf',
      });
      const res = await start(seeded, seeded.owner, {
        sources: [{ type: 'document', file_path: path }],
      });
      expect(res.status).toBe(202);
      const body = (await json(res)) as unknown as AnalysisBody;
      expect(body.status).toBe('questions');
      const source = await testServiceClient()
        .from('sources')
        .select('extracted_text, status')
        .eq('file_path', path)
        .single();
      expect(source.data?.extracted_text).toContain('Catalogue Nike');
    },
    'un même fichier envoyé deux fois dans la demande est refusé (400)': async () => {
      const seeded = await seedWorkspace();
      const path = await uploadFile(seeded, await png(), { mime: 'image/png' });
      const res = await start(seeded, seeded.owner, {
        sources: [
          { type: 'image', file_path: path },
          { type: 'image', file_path: path },
        ],
      });
      expect(res.status).toBe(400);
    },
  },
});

describeRoute('getAnalysis', {
  success: async () => {
    const a = await started();
    for (const user of [seeded.owner, seeded.editor, seeded.viewer]) {
      const res = await read(seeded, user, a.id);
      expect(res.status).toBe(200);
      const body = (await json(res)) as unknown as AnalysisBody;
      expect(body.status).toBe('questions');
      // Un signalement interne (injection, valeur retirée) n'est jamais exposé à l'écran.
      expect((body.flags ?? []).join(',')).not.toMatch(/INJECTION|UNGROUNDED|ILLEGAL/);
    }
  },
  unauthenticated: async () => {
    const a = await started();
    const res = await getAnalysis(
      call('GET', `/workspaces/${seeded.workspace.id}/analyses/${a.id}`, {}),
      analysisParams(seeded.workspace.id, a.id),
    );
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    const a = await started();
    const res = await getAnalysis(
      call(
        'GET',
        `/workspaces/${seeded.strangerWorkspace.id}/analyses/${a.id}`,
        seeded.owner.headers,
      ),
      analysisParams(seeded.strangerWorkspace.id, a.id),
    );
    expect(res.status).toBe(404);
    // Un membre d'un autre espace ne voit pas non plus l'analyse par son propre espace : 404.
    const stranger = await getAnalysis(
      call(
        'GET',
        `/workspaces/${seeded.strangerWorkspace.id}/analyses/${a.id}`,
        seeded.stranger.headers,
      ),
      analysisParams(seeded.strangerWorkspace.id, a.id),
    );
    expect(stranger.status).toBe(404);
  },
  forbiddenRole: na('tout membre lit une analyse de son espace'),
  invalidBody: async () => {
    const res = await getAnalysis(
      call('GET', `/workspaces/${seeded.workspace.id}/analyses/pas-un-uuid`, seeded.owner.headers),
      analysisParams(seeded.workspace.id, 'pas-un-uuid'),
    );
    expect(res.status).toBe(400);
  },
});

describeRoute('answerQuestions', {
  success: async () => {
    const a = await started();
    const required = a.questions.filter((q) => q.required);
    expect(required.length).toBeGreaterThan(0);
    // Réponse partielle : l'analyse reste « questions ».
    const partial = await answer(seeded, seeded.owner, a.id, {
      answers: [{ question_id: 'q1', answer: '+237 690 12 34 56' }],
    });
    expect(partial.status).toBe(200);
    expect(((await json(partial)) as unknown as AnalysisBody).status).toBe('questions');
    // Toutes les réponses obligatoires : « ready ». Le téléphone est normalisé en E.164.
    const done = await answer(seeded, seeded.editor, a.id, {
      answers: [{ question_id: 'q2', answer: 'Abidjan, Cocody' }],
    });
    const body = (await json(done)) as unknown as AnalysisBody;
    expect(body.status).toBe('ready');
    expect(body.answers).toEqual(
      expect.arrayContaining([
        { question_id: 'q1', answer: '+237690123456' },
        { question_id: 'q2', answer: 'Abidjan, Cocody' },
      ]),
    );
  },
  unauthenticated: async () => {
    const a = await started();
    const res = await answers(
      call(
        'POST',
        `/workspaces/${seeded.workspace.id}/analyses/${a.id}/answers`,
        {},
        { answers: [{ question_id: 'q1', answer: 'x' }] },
      ),
      analysisParams(seeded.workspace.id, a.id),
    );
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    const a = await started();
    const res = await answers(
      call(
        'POST',
        `/workspaces/${seeded.strangerWorkspace.id}/analyses/${a.id}/answers`,
        seeded.owner.headers,
        { answers: [{ question_id: 'q1', answer: '+237690123456' }] },
      ),
      analysisParams(seeded.strangerWorkspace.id, a.id),
    );
    expect(res.status).toBe(404);
    // L'analyse de l'espace A n'est pas modifiable par le propriétaire de B, même en connaissant son identifiant.
    const stranger = await answers(
      call(
        'POST',
        `/workspaces/${seeded.strangerWorkspace.id}/analyses/${a.id}/answers`,
        seeded.stranger.headers,
        { answers: [{ question_id: 'q1', answer: '+237690123456' }] },
      ),
      analysisParams(seeded.strangerWorkspace.id, a.id),
    );
    expect(stranger.status).toBe(404);
  },
  forbiddenRole: async () => {
    const a = await started();
    expect(
      (
        await answer(seeded, seeded.viewer, a.id, {
          answers: [{ question_id: 'q1', answer: '+237690123456' }],
        })
      ).status,
    ).toBe(403);
  },
  invalidBody: async () => {
    const a = await started();
    expect((await answer(seeded, seeded.owner, a.id, { answers: [] })).status).toBe(400);
    expect((await answer(seeded, seeded.owner, a.id, {})).status).toBe(400);
    expect(
      (
        await answer(seeded, seeded.owner, a.id, {
          answers: [{ question_id: 'q1', answer: 'x'.repeat(501) }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await answer(seeded, seeded.owner, a.id, {
          answers: [{ question_id: 'q1', answer: 'x', extra: 1 }],
        })
      ).status,
    ).toBe(400);
  },
  extra: {
    'un identifiant de question qui n’existe pas dans CETTE analyse est refusé (400)': async () => {
      const a = await started();
      const b = await started();
      expect(b.id).not.toBe(a.id);
      const res = await answer(seeded, seeded.owner, a.id, {
        answers: [{ question_id: 'q9', answer: 'x' }],
      });
      expect(res.status).toBe(400);
    },
    'un numéro invalide est refusé (400) et rien n’est enregistré': async () => {
      const a = await started();
      const res = await answer(seeded, seeded.owner, a.id, {
        answers: [{ question_id: 'q1', answer: '12345' }],
      });
      expect(res.status).toBe(400);
      const stored = (await json(
        await read(seeded, seeded.owner, a.id),
      )) as unknown as AnalysisBody;
      expect(stored.answers).toEqual([]);
    },
    'une analyse qui n’attend pas de réponses (échouée) donne 409': async () => {
      const a = await started();
      await testServiceClient().from('analyses').update({ status: 'failed' }).eq('id', a.id);
      const res = await answer(seeded, seeded.owner, a.id, {
        answers: [{ question_id: 'q1', answer: '+237690123456' }],
      });
      expect(res.status).toBe(409);
    },
  },
});

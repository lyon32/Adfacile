// POST /uploads contre la pile Supabase locale (vrai stockage) : les 5 cas d'API_SPEC §15 et TR-SEC-08.
import { MIB } from '@pubeka/core';
import {
  describeRoute,
  seedWorkspace,
  testServiceClient,
  type SeededWorkspace,
} from '@pubeka/testing';
import { beforeAll, expect } from 'vitest';
import { POST as createUpload } from '../workspaces/[workspaceId]/uploads/route';
import { call, json, ws } from '../meta/int-support';

let seeded: SeededWorkspace;
beforeAll(async () => {
  seeded = await seedWorkspace();
});

const post = (s: SeededWorkspace, user: SeededWorkspace['owner'], body: unknown) =>
  createUpload(
    call('POST', `/workspaces/${s.workspace.id}/uploads`, user.headers, body),
    ws(s.workspace.id),
  );

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describeRoute('createUploadUrl', {
  success: async () => {
    const res = await post(seeded, seeded.owner, {
      purpose: 'source',
      mime: 'image/png',
      size: PNG.length,
    });
    expect(res.status).toBe(201);
    const ticket = (await json(res)) as {
      upload_url: string;
      file_path: string;
      expires_at: string;
    };
    // Le chemin est construit par le serveur : {espace}/{uuid}.png (SECURITY_NOTES §3.1 règle 7).
    expect(ticket.file_path).toMatch(new RegExp(`^${seeded.workspace.id}/[0-9a-f-]{36}\\.png$`));
    const row = await testServiceClient()
      .from('uploads')
      .select('status, bucket, workspace_id')
      .eq('file_path', ticket.file_path)
      .single();
    expect(row.data).toEqual({
      status: 'pending',
      bucket: 'sources',
      workspace_id: seeded.workspace.id,
    });
    // L'URL signée fonctionne vraiment sur le stockage local.
    const sent = await fetch(ticket.upload_url, {
      method: 'PUT',
      headers: { 'content-type': 'image/png', 'x-upsert': 'false' },
      body: PNG,
    });
    expect(sent.ok).toBe(true);
    // Une seconde écriture sur le même chemin est refusée (pas de remplacement par l'URL signée).
    const again = await fetch(ticket.upload_url, {
      method: 'PUT',
      headers: { 'content-type': 'image/png', 'x-upsert': 'false' },
      body: PNG,
    });
    expect(again.ok).toBe(false);
  },
  unauthenticated: async () => {
    const id = seeded.workspace.id;
    const res = await createUpload(
      call(
        'POST',
        `/workspaces/${id}/uploads`,
        {},
        { purpose: 'source', mime: 'image/png', size: 1 },
      ),
      ws(id),
    );
    expect(res.status).toBe(401);
  },
  otherWorkspace: async () => {
    const res = await createUpload(
      call('POST', `/workspaces/${seeded.strangerWorkspace.id}/uploads`, seeded.owner.headers, {
        purpose: 'source',
        mime: 'image/png',
        size: 1,
      }),
      ws(seeded.strangerWorkspace.id),
    );
    expect(res.status).toBe(404);
  },
  forbiddenRole: async () => {
    const res = await post(seeded, seeded.viewer, {
      purpose: 'source',
      mime: 'image/png',
      size: 1,
    });
    expect(res.status).toBe(403);
  },
  invalidBody: async () => {
    expect(
      (await post(seeded, seeded.owner, { purpose: 'source', mime: 'image/png' })).status,
    ).toBe(400);
    expect(
      (
        await post(seeded, seeded.owner, {
          purpose: 'source',
          mime: 'image/png',
          size: 1,
          path: '../x',
        })
      ).status,
    ).toBe(400);
    expect(
      (await post(seeded, seeded.owner, { purpose: 'autre', mime: 'image/png', size: 1 })).status,
    ).toBe(400);
  },
  extra: {
    'TR-SEC-08 : image de 10 Mo + 1 octet refusée (413), PDF de 20 Mo accepté': async () => {
      const big = await post(seeded, seeded.owner, {
        purpose: 'source',
        mime: 'image/png',
        size: 10 * MIB + 1,
      });
      expect(big.status).toBe(413);
      const pdf = await post(seeded, seeded.owner, {
        purpose: 'source',
        mime: 'application/pdf',
        size: 20 * MIB,
      });
      expect(pdf.status).toBe(201);
    },
    'TR-SEC-08 : un type hors liste est refusé (415)': async () => {
      const res = await post(seeded, seeded.owner, {
        purpose: 'source',
        mime: 'image/gif',
        size: 10,
      });
      expect(res.status).toBe(415);
    },
    'éditeur : autorisé': async () => {
      const res = await post(seeded, seeded.editor, {
        purpose: 'source',
        mime: 'image/jpeg',
        size: 10,
      });
      expect(res.status).toBe(201);
    },
  },
});

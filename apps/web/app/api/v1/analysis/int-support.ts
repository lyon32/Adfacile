// Aide des tests d'intégration « sources et analyse » : fichiers réellement envoyés au stockage local par URL
// signée, analyses créées par la route ou en base, contexte de tâche.
import { randomUUID } from 'node:crypto';
import type { ServiceCtx } from '@pubeka/core';
import { testServiceClient, type SeededWorkspace } from '@pubeka/testing';
import sharp from 'sharp';
import { expect } from 'vitest';
import { call, json, ws } from '../meta/int-support';
import { POST as createUpload } from '../workspaces/[workspaceId]/uploads/route';
import { POST as startRoute } from '../workspaces/[workspaceId]/analyses/route';

export { call, json, ws };

export async function png(width = 40, height = 30): Promise<Uint8Array> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 20, g: 120, b: 220 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(buffer);
}

/** PDF minimal d'une page contenant `line`. */
export function pdf(line: string): Uint8Array {
  const stream = `BT /F1 12 Tf 20 100 Td (${line}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>',
    `<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${String(i + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 6\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF`;
  return new TextEncoder().encode(body);
}

/** Annonce un fichier (POST /uploads) puis l'envoie à l'URL signée du stockage local. Rend son chemin. */
export async function uploadFile(
  s: SeededWorkspace,
  bytes: Uint8Array,
  declared: { mime: string; purpose?: string; size?: number },
): Promise<string> {
  const id = s.workspace.id;
  const res = await createUpload(
    call('POST', `/workspaces/${id}/uploads`, s.owner.headers, {
      purpose: declared.purpose ?? 'source',
      mime: declared.mime,
      size: declared.size ?? bytes.length,
    }),
    ws(id),
  );
  expect(res.status).toBe(201);
  const ticket = (await json(res)) as { upload_url: string; file_path: string };
  const sent = await fetch(ticket.upload_url, {
    method: 'PUT',
    headers: { 'content-type': declared.mime, 'x-upsert': 'false' },
    body: Uint8Array.from(bytes),
  });
  expect(sent.ok).toBe(true);
  return ticket.file_path;
}

/** Lance une analyse par la route (le lanceur `inline` l'exécute aussitôt avec la fausse IA). */
export function start(
  s: SeededWorkspace,
  user: SeededWorkspace['owner'],
  body: unknown,
  key: string | null = randomUUID(),
): Promise<Response> {
  const id = s.workspace.id;
  return startRoute(
    call(
      'POST',
      `/workspaces/${id}/analyses`,
      {
        ...user.headers,
        ...(key === null ? {} : { 'idempotency-key': key }),
      },
      body,
    ),
    ws(id),
  );
}

export const taskCtx = (): ServiceCtx => ({
  requestId: 'req_TEST',
  svc: testServiceClient(),
  now: () => new Date(),
});

/** Analyse en file, créée en base (sans passer par la route), pour tester la tâche seule. */
export async function queueAnalysis(
  s: SeededWorkspace,
  sources: { type: string; url?: string; text?: string; file_path?: string }[],
  userIntent: string | null = null,
): Promise<{ analysisId: string; workspaceId: string }> {
  const svc = testServiceClient();
  const rows = sources.map((source) => ({
    id: randomUUID(),
    workspace_id: s.workspace.id,
    type: source.type as 'website',
    url: source.url ?? null,
    file_path: source.file_path ?? null,
    extracted_text: source.text ?? null,
  }));
  const inserted = await svc.from('sources').insert(rows);
  expect(inserted.error).toBeNull();
  const analysisId = randomUUID();
  const created = await svc.from('analyses').insert({
    id: analysisId,
    workspace_id: s.workspace.id,
    created_by: s.owner.id,
    status: 'queued',
    user_intent: userIntent,
    source_ids: rows.map((r) => r.id),
  });
  expect(created.error).toBeNull();
  return { analysisId, workspaceId: s.workspace.id };
}

/** Contenu d'un message envoyé au modèle, en texte (les parties d'image restent lisibles en JSON). */
export function contentText(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

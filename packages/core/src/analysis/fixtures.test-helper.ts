// Matériel commun des tests unitaires de `analysis` : fiche de l'Analyste, fichiers, contextes.
import { strToU8, zipSync } from 'fflate';
import type { MemberCtx, MemberRole, ServiceCtx } from '../context';
import type { MemoryDb } from './memory-db.test-helper';

export const USER = '11111111-1111-4111-8111-111111111111';
export const WS = '44444444-4444-4444-8444-444444444444';
export const OTHER_WS = '55555555-5555-4555-8555-555555555555';
export const NOW = new Date('2026-10-15T10:00:00Z');
export const TEXT =
  'Boutique Awa vend des baskets Nike à Abidjan Cocody, à partir de 25 000 F. Livraison en 24h.';

export const question = (
  id: string,
  field: string,
  input = 'text',
  required = true,
  options: string[] | null = null,
) => ({
  id,
  field,
  text: `Question ${id} pour compléter la fiche ?`,
  input,
  options,
  required,
  why: 'Pour une publicité juste.',
});

export function fiche(over: Record<string, unknown> = {}, profile: Record<string, unknown> = {}) {
  return {
    profile: {
      business_name: { value: 'Boutique Awa', source: 0 },
      sector: { value: 'fashion_shoes', confidence: 0.9 },
      offer_type: 'product',
      products: [
        {
          name: 'Baskets Nike',
          price: { amount: 25000, currency: 'XOF' },
          description: '',
          source: 0,
        },
      ],
      value_props: [],
      target_audience: { description: null, age_range: null, gender: null },
      locations: [{ country: 'CI', city: 'Abidjan', area: 'Cocody', delivery: true }],
      contacts: { whatsapp: null, phone: null, website: null, instagram: null },
      tone: { value: null, confidence: 0 },
      promotions: [],
      has_ecommerce_checkout: null,
      languages_detected: ['fr'],
      ...profile,
    },
    conflicts: [],
    sensitive_signals: [],
    missing: ['contacts.whatsapp'],
    questions: [
      question('q1', 'contacts.whatsapp', 'phone'),
      question('q2', 'locations[0].area'),
      question('q3', 'products[0].price', 'text', false),
    ],
    flags: [],
    ...over,
  };
}

export function pdfBytes(line: string): Uint8Array {
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
  body += 'xref\n0 6\n0000000000 65535 f \n';
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF`;
  return strToU8(body);
}

export function docxBytes(text: string): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types/>'),
    'word/document.xml': strToU8(
      `<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    ),
  });
}

export const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);
export const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

export function taskCtx(db: MemoryDb): ServiceCtx {
  return { requestId: 'req_TEST', svc: db.asService(), now: () => NOW };
}

export function memberCtx(
  db: MemoryDb,
  role: MemberRole = 'owner',
  access: MemberCtx['workspace']['access'] = 'active',
): MemberCtx {
  return {
    requestId: 'req_TEST',
    user: { id: USER, email: 'awa@example.com', locale: 'fr', timezone: 'Africa/Douala' },
    db: db.asDb(),
    svc: db.asService(),
    now: () => NOW,
    workspace: { id: WS, role, access },
  };
}

/** Base prête : le profil du demandeur. */
export function seedProfile(db: MemoryDb, over: Record<string, unknown> = {}): void {
  db.rows('profiles').push({
    id: USER,
    ui_language: 'fr',
    country_code: 'CI',
    currency_display: 'XOF',
    ...over,
  });
}

/** Analyse en file avec ses sources (texte, site, fichier…). Rend les identifiants de la tâche. */
export function queue(
  db: MemoryDb,
  sources: { type: string; url?: string; text?: string; file_path?: string }[],
  over: Record<string, unknown> = {},
): { analysisId: string; workspaceId: string } {
  const ids = sources.map((source) => {
    const id = db.nextId();
    db.rows('sources').push({
      id,
      workspace_id: WS,
      type: source.type,
      url: source.url ?? null,
      file_path: source.file_path ?? null,
      extracted_text: source.text ?? null,
      status: 'ok',
    });
    return id;
  });
  const analysisId = db.nextId();
  db.rows('analyses').push({
    id: analysisId,
    workspace_id: WS,
    page_id: null,
    created_by: USER,
    status: 'queued',
    user_intent: null,
    source_ids: ids,
    unreadable_sources: [],
    flags: [],
    error_code: null,
    blocked_reason: null,
    business_profile_id: null,
    ...over,
  });
  return { analysisId, workspaceId: WS };
}

/** Contenu d'un message envoyé au modèle, en texte (les parties d'image restent lisibles en JSON). */
export function contentText(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

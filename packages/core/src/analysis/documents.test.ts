// Texte des PDF et DOCX, sans exécution, avec les protections de SECURITY_NOTES §3.3 (pages, entrées, taille).
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { extractDocumentText, extractDocxText, extractPdfText, MAX_PDF_PAGES } from './documents';

/** PDF minimal à `pages` pages, chacune avec une ligne de texte (xref reconstruite par pdf.js si besoin). */
function pdf(lines: string[]): Uint8Array {
  const objects: string[] = [];
  const kids = lines.map((_, i) => `${String(4 + i * 2)} 0 R`).join(' ');
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${String(lines.length)} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  lines.forEach((line, i) => {
    const stream = `BT /F1 12 Tf 20 100 Td (${line}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${String(5 + i * 2)} 0 R >>`,
    );
    objects.push(`<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`);
  });
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(body.length);
    body += `${String(i + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF`;
  return strToU8(body);
}

const CONTENT_TYPES = '<?xml version="1.0"?><Types/>';
function docx(documentXml: string, extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    'word/document.xml': strToU8(documentXml),
    ...extra,
  });
}

describe('extractPdfText', () => {
  it('lit le texte d’un PDF', async () => {
    const text = await extractPdfText(pdf(['Baskets Nike 25000 F', 'Livraison Abidjan']));
    expect(text).toContain('Baskets Nike 25000 F');
    expect(text).toContain('Livraison Abidjan');
  });

  it('TR-SEC-08 : ne lit que 50 pages au plus', async () => {
    const lines = Array.from({ length: MAX_PDF_PAGES + 5 }, (_, i) => `PAGE${String(i + 1)}END`);
    const text = await extractPdfText(pdf(lines));
    expect(text).toContain(`PAGE${String(MAX_PDF_PAGES)}END`);
    expect(text).not.toContain(`PAGE${String(MAX_PDF_PAGES + 1)}END`);
  });

  it('un PDF corrompu est refusé (unsupported_file_type), sans erreur interne', async () => {
    await expect(extractPdfText(strToU8('%PDF-1.4 pas un vrai pdf'))).rejects.toMatchObject({
      code: 'unsupported_file_type',
    });
  });
});

describe('extractDocxText', () => {
  it('lit les paragraphes, tabulations et entités', () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>Salon &amp; Spa</w:t></w:r></w:p><w:p><w:r><w:t>Tresses</w:t></w:r><w:tab/><w:r><w:t>5 000 F</w:t></w:r></w:p></w:body></w:document>';
    expect(extractDocxText(docx(xml))).toBe('Salon & Spa\nTresses 5 000 F');
  });

  it('TR-SEC-08 : plus de 1 000 entrées dans l’archive : refusé (bombe de décompression)', () => {
    const many: Record<string, Uint8Array> = {};
    for (let i = 0; i < 1100; i += 1) many[`extra/${String(i)}.txt`] = strToU8('x');
    expect(() => extractDocxText(docx('<w:p/>', many))).toThrow(
      expect.objectContaining({ code: 'unsupported_file_type' }) as Error,
    );
  });

  it('TR-SEC-08 : plus de 50 Mo décompressés : refusé sans rien décompresser', () => {
    // Une seule entrée de 51 Mo de zéros, compressée en quelques Ko : c'est le cas typique d'une bombe.
    const bomb = zipSync({
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      'word/document.xml': strToU8('<w:p/>'),
      'media/enorme.bin': new Uint8Array(51 * 1024 * 1024),
    });
    expect(bomb.length).toBeLessThan(200_000);
    expect(() => extractDocxText(bomb)).toThrow(
      expect.objectContaining({ code: 'unsupported_file_type' }) as Error,
    );
  }, 30_000);

  it('une archive ZIP qui n’est pas un DOCX, ou un ZIP corrompu, est refusée', () => {
    const notDocx = zipSync({ 'readme.txt': strToU8('bonjour') });
    expect(() => extractDocxText(notDocx)).toThrow(
      expect.objectContaining({ code: 'unsupported_file_type' }) as Error,
    );
    expect(() => extractDocxText(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toThrow(
      expect.objectContaining({ code: 'unsupported_file_type' }) as Error,
    );
  });
});

describe('extractDocumentText', () => {
  it('choisit l’extraction selon le vrai type et refuse une image', async () => {
    expect(await extractDocumentText(pdf(['Bonjour']), 'application/pdf')).toContain('Bonjour');
    await expect(extractDocumentText(new Uint8Array(), 'image/png')).rejects.toMatchObject({
      code: 'unsupported_file_type',
    });
  });
});

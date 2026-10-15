// Texte d'un document envoyé par l'utilisateur (PDF ou DOCX), SANS jamais l'exécuter (SECURITY_NOTES §3.3) :
//  - PDF : texte seulement, 50 pages au plus ; aucun script exécuté (extraction du texte par pdf.js via unpdf) ;
//  - DOCX : c'est une archive ZIP, donc protection contre les « bombes » : 1 000 entrées et 50 Mo décompressés au plus
//    (en-têtes lus sans rien décompresser), seul `word/document.xml` est décompressé, la structure DOCX est exigée.
// Le texte extrait est ensuite traité comme toute source : encadré comme donnée non fiable (R8).
import { unzipSync } from 'fflate';
import { getDocumentProxy } from 'unpdf';
import { AppError } from '@pubeka/contracts';
import { decodeEntities } from './html-text';
import type { FileMime } from '../uploads/file-types';

export const MAX_PDF_PAGES = 50;
export const MAX_ZIP_ENTRIES = 1000;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const MAX_DOCUMENT_CHARS = 200_000;

function unsupported(reason: string, cause?: unknown): AppError {
  return new AppError('unsupported_file_type', {
    meta: { reason },
    ...(cause === undefined ? {} : { cause }),
  });
}

interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const pages = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const out: string[] = [];
    let chars = 0;
    for (let n = 1; n <= pages && chars < MAX_DOCUMENT_CHARS; n += 1) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      let line = '';
      for (const item of content.items as PdfTextItem[]) {
        line += item.str ?? '';
        if (item.hasEOL === true) line += '\n';
      }
      out.push(line);
      chars += line.length;
    }
    return out
      .join('\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim()
      .slice(0, MAX_DOCUMENT_CHARS);
  } catch (cause) {
    throw unsupported('pdf_unreadable', cause);
  }
}

export function extractDocxText(bytes: Uint8Array): string {
  let entries = 0;
  let total = 0;
  const seen = { contentTypes: false };
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (file) => {
        entries += 1;
        total += file.originalSize;
        if (entries > MAX_ZIP_ENTRIES || total > MAX_ZIP_UNCOMPRESSED_BYTES) {
          throw unsupported('zip_bomb');
        }
        if (file.name === '[Content_Types].xml') seen.contentTypes = true;
        return file.name === 'word/document.xml';
      },
    });
  } catch (cause) {
    if (cause instanceof AppError) throw cause;
    throw unsupported('docx_unreadable', cause);
  }
  const document = files['word/document.xml'];
  if (!seen.contentTypes || document === undefined) throw unsupported('not_a_docx');
  const xml = new TextDecoder().decode(document);
  const text = xml
    .replace(/<w:tab\s*\/>/g, '\t')
    .replace(/<w:br\s*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]*>/g, '');
  return decodeEntities(text)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_DOCUMENT_CHARS);
}

export async function extractDocumentText(bytes: Uint8Array, mime: FileMime): Promise<string> {
  if (mime === 'application/pdf') return extractPdfText(bytes);
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return extractDocxText(bytes);
  }
  throw unsupported('not_a_document');
}

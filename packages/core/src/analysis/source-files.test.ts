// Vérification d'un fichier envoyé (TR-SEC-08) : registre, fenêtre de 5 minutes, taille, vrai type, ré-encodage.
import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import type { ImageProcessor } from './deps';
import { JPEG_BYTES, memberCtx, OTHER_WS, pdfBytes, PNG_BYTES, WS } from './fixtures.test-helper';
import { MemoryDb } from './memory-db.test-helper';
import { verifyUploadedFile } from './source-files';

const IMAGE = { purposes: ['source', 'reference'], kind: 'image' } as const;
const DOCUMENT = { purposes: ['source'], kind: 'document' } as const;
const CLEAN = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]);
const images: ImageProcessor = {
  reencode: (_bytes, mime) => Promise.resolve({ bytes: CLEAN, mime }),
};
const failing: ImageProcessor = {
  reencode: () => Promise.reject(new Error('décodage impossible')),
};
const refusing: ImageProcessor = {
  reencode: () =>
    Promise.reject(new AppError('unsupported_file_type', { meta: { reason: 'too_many_pixels' } })),
};

let counter = 0;
function register(
  db: MemoryDb,
  bytes: Uint8Array,
  over: {
    ext?: string;
    mime?: string;
    purpose?: string;
    status?: string;
    bucket?: string;
    expires?: Date;
    createdAt?: Date;
    verifiedMime?: string | null;
  } = {},
): string {
  counter += 1;
  const path = `${WS}/aaaaaaaa-aaaa-4aaa-8aaa-${String(counter).padStart(12, '0')}.${over.ext ?? 'png'}`;
  const bucket = over.bucket ?? 'sources';
  db.put(bucket, path, bytes, (over.createdAt ?? new Date('2026-10-15T09:58:00Z')).toISOString());
  db.rows('uploads').push({
    id: db.nextId(),
    workspace_id: WS,
    purpose: over.purpose ?? 'source',
    bucket,
    file_path: path,
    declared_mime: over.mime ?? 'image/png',
    declared_size: bytes.length,
    status: over.status ?? 'pending',
    verified_mime: over.verifiedMime ?? null,
    verified_size: over.status === 'verified' ? bytes.length : null,
    expires_at: (over.expires ?? new Date('2026-10-15T10:03:00Z')).toISOString(),
  });
  return path;
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'ok';
  } catch (error) {
    return error instanceof AppError ? error.code : 'autre';
  }
}

describe('verifyUploadedFile : registre', () => {
  it('un chemin hors de l’espace, absent du registre, rejeté ou d’un autre usage donne 404', async () => {
    const db = new MemoryDb();
    const ctx = memberCtx(db);
    expect(await code(verifyUploadedFile(ctx, `${OTHER_WS}/x.png`, { ...IMAGE, images }))).toBe(
      'not_found',
    );
    expect(
      await code(verifyUploadedFile(ctx, `${WS}/${db.nextId()}.png`, { ...IMAGE, images })),
    ).toBe('not_found');
    const rejected = register(db, PNG_BYTES, { status: 'rejected' });
    expect(await code(verifyUploadedFile(ctx, rejected, { ...IMAGE, images }))).toBe('not_found');
    const support = register(db, PNG_BYTES, { purpose: 'support_attachment', bucket: 'support' });
    expect(await code(verifyUploadedFile(ctx, support, { ...IMAGE, images }))).toBe('not_found');
    const weirdBucket = register(db, PNG_BYTES);
    (db.rows('uploads').at(-1) as Record<string, unknown>).bucket = 'admin';
    expect(await code(verifyUploadedFile(ctx, weirdBucket, { ...IMAGE, images }))).toBe(
      'not_found',
    );
  });

  it('un fichier annoncé mais jamais envoyé donne 404', async () => {
    const db = new MemoryDb();
    const path = register(db, PNG_BYTES);
    db.objects.clear();
    expect(await code(verifyUploadedFile(memberCtx(db), path, { ...IMAGE, images }))).toBe(
      'not_found',
    );
  });

  it('une erreur de lecture du registre est une erreur interne', async () => {
    const db = new MemoryDb();
    const path = register(db, PNG_BYTES);
    db.failNext.add('uploads:select');
    expect(await code(verifyUploadedFile(memberCtx(db), path, { ...IMAGE, images }))).toBe(
      'internal_error',
    );
  });
});

describe('verifyUploadedFile : vérification du contenu (TR-SEC-08)', () => {
  it('accepte une image vraie, la ré-encode, remplace l’original et marque le fichier « vérifié »', async () => {
    const db = new MemoryDb();
    const path = register(db, PNG_BYTES);
    const file = await verifyUploadedFile(memberCtx(db), path, { ...IMAGE, images });
    expect(file).toMatchObject({
      mime: 'image/png',
      kind: 'image',
      size: CLEAN.length,
      bucket: 'sources',
    });
    expect(db.objects.get(`sources/${path}`)?.bytes).toEqual(CLEAN);
    expect(db.rows('uploads').find((r) => r.file_path === path)).toMatchObject({
      status: 'verified',
      verified_mime: 'image/png',
      verified_size: CLEAN.length,
    });
  });

  it('un PDF est vérifié par ses premiers octets et conservé tel quel (pas de ré-encodage)', async () => {
    const db = new MemoryDb();
    const bytes = pdfBytes('Catalogue');
    const path = register(db, bytes, { ext: 'pdf', mime: 'application/pdf' });
    const file = await verifyUploadedFile(memberCtx(db), path, { ...DOCUMENT, images: failing });
    expect(file).toMatchObject({ mime: 'application/pdf', kind: 'document', size: bytes.length });
    expect(db.storageCalls.filter((c) => c.startsWith('upload:'))).toEqual([]);
  });

  it('un fichier déjà vérifié n’est ni retéléchargé ni ré-encodé', async () => {
    const db = new MemoryDb();
    const path = register(db, PNG_BYTES, { status: 'verified', verifiedMime: 'image/png' });
    db.objects.clear(); // même sans fichier : l'état « vérifié » fait foi
    const file = await verifyUploadedFile(memberCtx(db), path, { ...IMAGE, images: failing });
    expect(file).toMatchObject({ mime: 'image/png' });
  });

  it('un fichier vérifié du mauvais genre (document attendu) est refusé', async () => {
    const db = new MemoryDb();
    const path = register(db, PNG_BYTES, { status: 'verified', verifiedMime: 'image/png' });
    expect(await code(verifyUploadedFile(memberCtx(db), path, { ...DOCUMENT, images }))).toBe(
      'unsupported_file_type',
    );
  });

  it('TR-SEC-08 : un PNG annoncé comme PDF est refusé, supprimé du stockage et marqué « rejeté »', async () => {
    const db = new MemoryDb();
    const path = register(db, PNG_BYTES, { ext: 'pdf', mime: 'application/pdf' });
    expect(await code(verifyUploadedFile(memberCtx(db), path, { ...DOCUMENT, images }))).toBe(
      'unsupported_file_type',
    );
    expect(db.objects.has(`sources/${path}`)).toBe(false);
    expect(db.rows('uploads').find((r) => r.file_path === path)?.status).toBe('rejected');
  });

  it('TR-SEC-08 : un type réel différent du type annoncé est refusé (JPEG annoncé PNG)', async () => {
    const db = new MemoryDb();
    const path = register(db, JPEG_BYTES, { mime: 'image/png' });
    expect(await code(verifyUploadedFile(memberCtx(db), path, { ...IMAGE, images }))).toBe(
      'unsupported_file_type',
    );
  });

  it('TR-SEC-08 : un type inconnu (HTML, exécutable) est refusé', async () => {
    const db = new MemoryDb();
    const path = register(db, new TextEncoder().encode('<html><script>x</script></html>'));
    expect(await code(verifyUploadedFile(memberCtx(db), path, { ...IMAGE, images }))).toBe(
      'unsupported_file_type',
    );
  });

  it('un document envoyé comme image (et inversement) est refusé : le genre attendu fait foi', async () => {
    const db = new MemoryDb();
    const path = register(db, pdfBytes('x'), { ext: 'pdf', mime: 'application/pdf' });
    expect(await code(verifyUploadedFile(memberCtx(db), path, { ...IMAGE, images }))).toBe(
      'unsupported_file_type',
    );
  });

  it('un fichier vide est refusé ; plus de 20 Mo est refusé avant tout téléchargement (413)', async () => {
    const db = new MemoryDb();
    const empty = register(db, new Uint8Array());
    expect(await code(verifyUploadedFile(memberCtx(db), empty, { ...IMAGE, images }))).toBe(
      'unsupported_file_type',
    );
    const big = register(db, new Uint8Array(20 * 1024 * 1024 + 1));
    expect(await code(verifyUploadedFile(memberCtx(db), big, { ...IMAGE, images }))).toBe(
      'file_too_large',
    );
  });

  it('TR-SEC-08 : une image de 10 Mo + 1 octet est refusée (413) même avec le bon type', async () => {
    const db = new MemoryDb();
    const bytes = new Uint8Array(10 * 1024 * 1024 + 1);
    bytes.set(PNG_BYTES);
    const path = register(db, bytes);
    expect(await code(verifyUploadedFile(memberCtx(db), path, { ...IMAGE, images }))).toBe(
      'file_too_large',
    );
  });

  it('un fichier arrivé après la fenêtre de 5 minutes est refusé (410) ; quelques secondes de marge sont tolérées', async () => {
    const db = new MemoryDb();
    const late = register(db, PNG_BYTES, { createdAt: new Date('2026-10-15T10:10:00Z') });
    expect(await code(verifyUploadedFile(memberCtx(db), late, { ...IMAGE, images }))).toBe('gone');
    const edge = register(db, PNG_BYTES, { createdAt: new Date('2026-10-15T10:03:01Z') });
    expect(await code(verifyUploadedFile(memberCtx(db), edge, { ...IMAGE, images }))).toBe('ok');
  });

  it('une image que la bibliothèque ne décode pas, ou trop grande en pixels, est refusée', async () => {
    const db = new MemoryDb();
    const broken = register(db, PNG_BYTES);
    expect(
      await code(verifyUploadedFile(memberCtx(db), broken, { ...IMAGE, images: failing })),
    ).toBe('unsupported_file_type');
    const huge = register(db, PNG_BYTES);
    expect(
      await code(verifyUploadedFile(memberCtx(db), huge, { ...IMAGE, images: refusing })),
    ).toBe('unsupported_file_type');
    expect(db.rows('uploads').filter((r) => r.status === 'rejected')).toHaveLength(2);
  });
});

describe('verifyUploadedFile : pannes', () => {
  it('stockage en panne au téléchargement, à l’écriture ou à l’enregistrement : erreurs sans fuite', async () => {
    const db = new MemoryDb();
    const writeFail = register(db, PNG_BYTES);
    db.failNext.add('storage:upload');
    expect(await code(verifyUploadedFile(memberCtx(db), writeFail, { ...IMAGE, images }))).toBe(
      'provider_unavailable',
    );
    const dbFail = register(db, PNG_BYTES);
    db.failNext.add('uploads:update');
    expect(await code(verifyUploadedFile(memberCtx(db), dbFail, { ...IMAGE, images }))).toBe(
      'internal_error',
    );
  });
});

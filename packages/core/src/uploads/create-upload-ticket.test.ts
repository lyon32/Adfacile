// URL d'envoi signée (TR-SEC-08, API_SPEC §13) : limites par type, chemin construit par le serveur,
// registre `uploads`, rôle. La vraie base et le vrai stockage sont prouvés par le test d'intégration de la route.
import { AppError } from '@pubeka/contracts';
import { describe, expect, it } from 'vitest';
import { FakeClient } from '../fake-client.test-helper';
import { memberCtx, NOW, ok, WS } from '../meta/meta.test-helper';
import { MIB } from './file-types';
import { createUploadTicket, UPLOAD_WINDOW_MS } from './create-upload-ticket';

const ID = '99999999-9999-4999-8999-999999999999';

function setup(signError = false) {
  const svc = new FakeClient().reply(ok(null), ok(null));
  const storageCalls: { bucket: string; path: string }[] = [];
  Object.assign(svc, {
    storage: {
      from: (bucket: string) => ({
        createSignedUploadUrl: (path: string) => {
          storageCalls.push({ bucket, path });
          return Promise.resolve(
            signError
              ? { data: null, error: { message: 'boom' } }
              : {
                  data: { signedUrl: 'https://storage.test/upload?token=t', token: 't', path },
                  error: null,
                },
          );
        },
      }),
    },
  });
  return {
    svc,
    storageCalls,
    ctx: (role: 'owner' | 'editor' | 'viewer' = 'owner') => memberCtx(new FakeClient(), svc, role),
  };
}

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof AppError ? e.code : 'autre';
  }
};

describe('createUploadTicket', () => {
  it('TR-SEC-08 : rend une URL signée et un chemin {espace}/{uuid}.{extension} construit par le serveur', async () => {
    const { svc, ctx, storageCalls } = setup();
    const ticket = await createUploadTicket(
      ctx(),
      { purpose: 'source', mime: 'image/jpeg', size: 1000 },
      () => ID,
    );
    expect(ticket.file_path).toBe(`${WS}/${ID}.jpg`);
    expect(ticket.upload_url).toContain('token=');
    expect(ticket.expires_at).toBe(new Date(NOW.getTime() + UPLOAD_WINDOW_MS).toISOString());
    expect(storageCalls).toEqual([{ bucket: 'sources', path: `${WS}/${ID}.jpg` }]);
    const insert = svc.calls[0]?.ops.find(([op]) => op === 'insert')?.[1] as Record<
      string,
      unknown
    >;
    expect(insert).toMatchObject({
      workspace_id: WS,
      purpose: 'source',
      file_path: `${WS}/${ID}.jpg`,
    });
  });

  it('TR-SEC-08 : une image de 10 Mo passe, 10 Mo + 1 octet est refusée (413)', async () => {
    const { ctx } = setup();
    const png = (size: number) =>
      createUploadTicket(ctx(), { purpose: 'source', mime: 'image/png', size });
    expect(await code(png(10 * MIB))).toBe('ok');
    expect(await code(png(10 * MIB + 1))).toBe('file_too_large');
  });

  it('TR-SEC-08 : un PDF de 20 Mo est accepté, 20 Mo + 1 octet refusé', async () => {
    const { ctx } = setup();
    const pdf = (size: number) =>
      createUploadTicket(ctx(), { purpose: 'source', mime: 'application/pdf', size });
    expect(await code(pdf(20 * MIB))).toBe('ok');
    expect(await code(pdf(20 * MIB + 1))).toBe('file_too_large');
  });

  it('TR-SEC-08 : un type hors liste est refusé (415) ; un PDF n’est pas une image de référence ni un logo', async () => {
    const { ctx } = setup();
    const ask = (purpose: 'source' | 'reference' | 'brand_logo', mime: string) =>
      code(createUploadTicket(ctx(), { purpose, mime, size: 10 }));
    expect(await ask('source', 'image/gif')).toBe('unsupported_file_type');
    expect(await ask('source', 'text/html')).toBe('unsupported_file_type');
    expect(await ask('reference', 'application/pdf')).toBe('unsupported_file_type');
    expect(await ask('brand_logo', 'application/pdf')).toBe('unsupported_file_type');
  });

  it('un logo de plus de 5 Mo est refusé (compartiment « brand ») ; la preuve de paiement va au compartiment « support »', async () => {
    const { ctx, storageCalls } = setup();
    expect(
      await code(
        createUploadTicket(ctx(), { purpose: 'brand_logo', mime: 'image/png', size: 5 * MIB + 1 }),
      ),
    ).toBe('file_too_large');
    await createUploadTicket(
      ctx(),
      { purpose: 'payment_proof', mime: 'application/pdf', size: 100 },
      () => ID,
    );
    expect(storageCalls.at(-1)?.bucket).toBe('support');
  });

  it('SECURITY_NOTES §2 : un lecteur ne peut pas envoyer de fichier ; un espace en lecture seule non plus', async () => {
    const { ctx } = setup();
    const input = { purpose: 'source', mime: 'image/png', size: 10 } as const;
    expect(await code(createUploadTicket(ctx('viewer'), input))).toBe('role_insufficient');
    const readOnly = {
      ...ctx(),
      workspace: { id: WS, role: 'owner' as const, access: 'read_only' as const },
    };
    expect(await code(createUploadTicket(readOnly, input))).toBe('workspace_read_only');
  });

  it('une panne du stockage retire l’enregistrement et répond provider_unavailable', async () => {
    const { ctx, svc } = setup(true);
    expect(
      await code(createUploadTicket(ctx(), { purpose: 'source', mime: 'image/png', size: 10 })),
    ).toBe('provider_unavailable');
    expect(svc.calls.some((c) => c.ops.some(([op]) => op === 'delete'))).toBe(true);
  });
});

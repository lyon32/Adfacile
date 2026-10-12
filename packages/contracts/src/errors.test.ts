import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import {
  AppError,
  ERROR_CODES,
  ERROR_STATUS,
  errorTitle,
  errorTypeUrl,
  isErrorCode,
} from './errors';

const OPENAPI_PATH = fileURLToPath(new URL('../../../api/openapi.yaml', import.meta.url));

const OpenApiSchema = z.object({
  components: z.object({
    schemas: z.object({ ErrorCode: z.object({ enum: z.array(z.string()) }) }),
  }),
});

function openApiErrorCodes(): string[] {
  const doc = OpenApiSchema.parse(parse(readFileSync(OPENAPI_PATH, 'utf8')));
  return doc.components.schemas.ErrorCode.enum;
}

describe('ErrorCode (TESTING §2, API_SPEC §4)', () => {
  it("la liste du code est identique à l'énumération ErrorCode d'openapi.yaml", () => {
    expect([...ERROR_CODES].sort()).toEqual([...openApiErrorCodes()].sort());
  });

  it('compte les 36 codes de la liste fermée', () => {
    expect(ERROR_CODES).toHaveLength(36);
  });

  it("n'utilise que les statuts permis par API_SPEC §5", () => {
    const allowed = [400, 401, 402, 403, 404, 409, 410, 413, 415, 422, 424, 429, 500, 502, 503];
    for (const status of Object.values(ERROR_STATUS)) expect(allowed).toContain(status);
  });

  it('reconnaît un code connu et refuse un code inventé', () => {
    expect(isErrorCode('insufficient_credits')).toBe(true);
    expect(isErrorCode('toString')).toBe(false);
    expect(isErrorCode('payment_failed')).toBe(false);
  });
});

describe('AppError', () => {
  it('porte le code, son statut et ses options', () => {
    const err = new AppError('insufficient_credits', { meta: { credits_missing: 4 } });
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('insufficient_credits');
    expect(err.status).toBe(402);
    expect(err.opts.meta).toEqual({ credits_missing: 4 });
    expect(err.cause).toBeUndefined();
  });

  it("garde la cause d'origine sans l'exposer dans le message", () => {
    const cause = new Error('détail Postgres');
    const err = new AppError('internal_error', { cause });
    expect(err.cause).toBe(cause);
    expect(err.message).toBe('internal_error');
  });

  it('donne le type et le titre stables de Problem Details', () => {
    expect(errorTypeUrl('insufficient_credits')).toBe(
      'https://pubeka.com/errors/insufficient-credits',
    );
    expect(errorTitle('insufficient_credits')).toBe('Insufficient credits');
  });
});

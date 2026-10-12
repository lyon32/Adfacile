import { describe, expect, it } from 'vitest';
import { assertNever } from './assert-never';
import {
  addDays,
  addSeconds,
  calendarDateIn,
  diffSeconds,
  isValidTimeZone,
  parseIsoUtc,
  toIsoUtc,
} from './dates';
import { createRequestId, createUuid, isRequestId, isUuid } from './ids';
import { createLogger, isSensitiveKey, REDACTED, redact, type LogRecord } from './logger';

describe('dates', () => {
  const instant = new Date('2026-10-12T23:30:00.000Z');

  it('écrit et relit une date en UTC', () => {
    expect(toIsoUtc(instant)).toBe('2026-10-12T23:30:00.000Z');
    expect(parseIsoUtc('2026-10-12T23:30:00Z').getTime()).toBe(instant.getTime());
  });

  it('refuse une date sans fuseau UTC ou invalide', () => {
    expect(() => parseIsoUtc('2026-10-12T23:30:00+01:00')).toThrow(RangeError);
    expect(() => parseIsoUtc('2026-13-45T99:99:99Z')).toThrow(RangeError);
    expect(() => toIsoUtc(new Date('x'))).toThrow(RangeError);
  });

  it('ajoute des secondes et des jours, et mesure un écart', () => {
    expect(toIsoUtc(addSeconds(instant, 60))).toBe('2026-10-12T23:31:00.000Z');
    expect(toIsoUtc(addDays(instant, 1))).toBe('2026-10-13T23:30:00.000Z');
    expect(diffSeconds(addDays(instant, 1), instant)).toBe(86_400);
  });

  it('donne la date du calendrier dans le fuseau de l’utilisateur', () => {
    expect(calendarDateIn(instant, 'Africa/Douala')).toBe('2026-10-13');
    expect(calendarDateIn(instant, 'Africa/Abidjan')).toBe('2026-10-12');
  });

  it('refuse un fuseau inconnu', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(() => calendarDateIn(instant, 'Mars/Olympus')).toThrow(RangeError);
  });
});

describe('identifiants', () => {
  it('crée des UUID valides', () => {
    expect(isUuid(createUuid())).toBe(true);
    expect(isUuid('pas-un-uuid')).toBe(false);
  });

  it('crée des identifiants de requête req_…', () => {
    const id = createRequestId();
    expect(isRequestId(id)).toBe(true);
    expect(createRequestId()).not.toBe(id);
    expect(isRequestId('req_abc')).toBe(false);
  });
});

describe('logger (CONVENTIONS §6.10)', () => {
  const now = (): Date => new Date('2026-10-12T00:00:00.000Z');

  it('masque jetons, clés, mots de passe, téléphones et preuves, même imbriqués', () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ sink: (r) => records.push(r), now });
    logger.info('paiement', {
      request_id: 'req_1',
      access_token: 'EAAB-factice',
      user: { phone: '+237600000000', password: 'x', name: 'Awa' },
      headers: [{ authorization: 'Bearer x' }],
      SASPAY_SECRET_KEY: 'sk_test_x',
      payment_proof: 'image',
    });
    expect(records).toEqual([
      {
        level: 'info',
        msg: 'paiement',
        time: '2026-10-12T00:00:00.000Z',
        fields: {
          request_id: 'req_1',
          access_token: REDACTED,
          user: { phone: REDACTED, password: REDACTED, name: 'Awa' },
          headers: [{ authorization: REDACTED }],
          SASPAY_SECRET_KEY: REDACTED,
          payment_proof: REDACTED,
        },
      },
    ]);
  });

  it('ignore les niveaux sous le minimum et hérite des champs avec child()', () => {
    const records: LogRecord[] = [];
    const logger = createLogger({ sink: (r) => records.push(r), now, minLevel: 'warn' });
    logger.debug('a');
    logger.info('b');
    logger.child({ request_id: 'req_2' }).warn('c', { api_key: 'k' });
    logger.error('d');
    expect(records.map((r) => r.msg)).toEqual(['c', 'd']);
    expect(records[0]?.fields).toEqual({ request_id: 'req_2', api_key: REDACTED });
  });

  it('résume les erreurs et les dates, et coupe les objets trop profonds', () => {
    expect(redact(new Error('boom'))).toEqual({ name: 'Error', message: 'boom' });
    expect(redact(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01T00:00:00.000Z');
    let deep: unknown = 'fond';
    for (let i = 0; i < 12; i += 1) deep = { n: deep };
    expect(JSON.stringify(redact(deep))).toContain('[trop profond]');
  });

  it('ne masque pas les champs ordinaires', () => {
    expect(isSensitiveKey('workspace_id')).toBe(false);
    expect(isSensitiveKey('monkey')).toBe(false);
    expect(isSensitiveKey('idempotency_key')).toBe(true);
  });

  it('écrit en JSON sur la sortie standard par défaut', () => {
    const chunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: string | Uint8Array): boolean => {
      chunks.push(String(chunk));
      return true;
    };
    try {
      createLogger({ now }).debug('caché');
      createLogger({ now }).info('visible', { token: 't' });
    } finally {
      process.stdout.write = original;
    }
    expect(chunks).toHaveLength(1);
    expect(JSON.parse(chunks[0] ?? '{}')).toEqual({
      token: REDACTED,
      level: 'info',
      msg: 'visible',
      time: '2026-10-12T00:00:00.000Z',
    });
  });
});

describe('assertNever', () => {
  it('lève une erreur si un cas imprévu arrive à l’exécution', () => {
    expect(() => assertNever('inattendu' as never)).toThrow('inattendu');
  });
});

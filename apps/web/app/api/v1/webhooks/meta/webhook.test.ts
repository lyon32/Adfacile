// Webhook Meta : signature (TR-SEC-04), jeton d'abonnement, événements reconnus, anti-rejeu.
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  extractStatusEvents,
  hasStaleEntry,
  MetaWebhookSchema,
  WEBHOOK_TOLERANCE_MS,
} from './events';
import {
  safeEqualText,
  verifyMetaSignature,
  verifyTokenMatches,
  webhookEventId,
} from './signature';

// Secret factice, de la seule forme attendue (32 caractères hexadécimaux).
const SECRET = 'a1'.repeat(16);
const body = JSON.stringify({ object: 'ad_account', entry: [{ id: '1', time: 1 }] });
const sign = (raw: string, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(raw, 'utf8').digest('hex')}`;

describe('verifyMetaSignature (TR-SEC-04)', () => {
  it('accepte la bonne signature du corps brut', () => {
    expect(verifyMetaSignature(body, sign(body), SECRET)).toBe(true);
  });

  it('accepte les majuscules hexadécimales et les espaces autour', () => {
    expect(verifyMetaSignature(body, ` sha256=${sign(body).slice(7).toUpperCase()} `, SECRET)).toBe(
      true,
    );
  });

  it('refuse une signature faite avec un autre secret', () => {
    expect(verifyMetaSignature(body, sign(body, 'b2'.repeat(16)), SECRET)).toBe(false);
  });

  it('refuse un corps modifié d’un seul octet, même avec la signature d’origine', () => {
    expect(verifyMetaSignature(`${body} `, sign(body), SECRET)).toBe(false);
  });

  it.each([
    null,
    '',
    'sha256=',
    'sha1=abc',
    'abc',
    `sha256=${'0'.repeat(63)}`,
    `sha256=${'g'.repeat(64)}`,
  ])('refuse l’en-tête %j', (header) => {
    expect(verifyMetaSignature(body, header, SECRET)).toBe(false);
  });

  it('refuse tout quand le secret n’est pas configuré (jamais une signature vide valide)', () => {
    const empty = `sha256=${createHmac('sha256', '').update(body).digest('hex')}`;
    expect(verifyMetaSignature(body, empty, '')).toBe(false);
    expect(verifyMetaSignature(body, sign(body), undefined)).toBe(false);
  });
});

describe('abonnement : verifyTokenMatches', () => {
  it('compare en temps constant et refuse un jeton absent', () => {
    expect(verifyTokenMatches('jeton-de-test', 'jeton-de-test')).toBe(true);
    expect(verifyTokenMatches('jeton-de-tesT', 'jeton-de-test')).toBe(false);
    expect(verifyTokenMatches('', 'jeton-de-test')).toBe(false);
    expect(verifyTokenMatches('', '')).toBe(false);
    expect(verifyTokenMatches('x', undefined)).toBe(false);
    expect(safeEqualText('é', 'é')).toBe(true);
  });
});

describe('webhookEventId', () => {
  it('même corps, même identifiant ; autre corps, autre identifiant', () => {
    expect(webhookEventId(body)).toMatch(/^[0-9a-f]{64}$/);
    expect(webhookEventId(body)).toBe(webhookEventId(body));
    expect(webhookEventId(`${body} `)).not.toBe(webhookEventId(body));
  });
});

const payload = (changes: unknown[], over: Record<string, unknown> = {}) =>
  MetaWebhookSchema.parse({
    object: 'ad_account',
    entry: [{ id: 100000000001, time: 1_800_000_000, changes }],
    ...over,
  });

describe('extractStatusEvents', () => {
  it('lit les deux champs de statut documentés et normalise les identifiants en texte', () => {
    const { events, ignored } = extractStatusEvents(
      payload([
        {
          field: 'in_process_ad_objects',
          value: { id: 600000000001, level: 'AD', status_name: 'PENDING_REVIEW' },
        },
        {
          field: 'with_issues_ad_objects',
          value: {
            id: '600000000002',
            level: 'CAMPAIGN',
            error_code: 1815,
            error_summary: 'Problème',
            error_message: 'long texte non conservé',
          },
        },
      ]),
    );
    expect(ignored).toBe(0);
    expect(events).toEqual([
      {
        kind: 'in_process',
        adAccountId: '100000000001',
        objectId: '600000000001',
        level: 'AD',
        detail: { status_name: 'PENDING_REVIEW' },
      },
      {
        kind: 'with_issues',
        adAccountId: '100000000001',
        objectId: '600000000002',
        level: 'CAMPAIGN',
        detail: { error_code: '1815', error_summary: 'Problème' },
      },
    ]);
  });

  it('ignore les autres champs, les valeurs mal formées et les autres objets', () => {
    const odd = extractStatusEvents(
      payload([
        { field: 'creative_fatigue', value: {} },
        { field: 'in_process_ad_objects', value: { level: 'AD' } },
        { field: 'with_issues_ad_objects', value: 'texte' },
      ]),
    );
    expect(odd).toEqual({ events: [], ignored: 3 });
    expect(extractStatusEvents(payload([], { object: 'page' }))).toEqual({
      events: [],
      ignored: 1,
    });
  });

  it('une notification sans changements n’a aucun événement', () => {
    expect(
      extractStatusEvents(MetaWebhookSchema.parse({ object: 'ad_account', entry: [{ id: '1' }] })),
    ).toEqual({
      events: [],
      ignored: 0,
    });
  });
});

describe('hasStaleEntry (anti-rejeu, ±5 min)', () => {
  const now = new Date('2026-10-14T10:00:00Z');
  const at = (offsetMs: number) =>
    MetaWebhookSchema.parse({
      object: 'ad_account',
      entry: [{ id: '1', time: (now.getTime() + offsetMs) / 1000 }],
    });

  it('accepte jusqu’à 5 minutes d’écart, dans les deux sens', () => {
    expect(hasStaleEntry(at(0), now)).toBe(false);
    expect(hasStaleEntry(at(-WEBHOOK_TOLERANCE_MS), now)).toBe(false);
    expect(hasStaleEntry(at(WEBHOOK_TOLERANCE_MS), now)).toBe(false);
  });

  it('refuse au-delà', () => {
    expect(hasStaleEntry(at(-WEBHOOK_TOLERANCE_MS - 1000), now)).toBe(true);
    expect(hasStaleEntry(at(WEBHOOK_TOLERANCE_MS + 1000), now)).toBe(true);
  });

  it('sans heure d’envoi, rien à contrôler', () => {
    expect(
      hasStaleEntry(MetaWebhookSchema.parse({ object: 'ad_account', entry: [{ id: '1' }] }), now),
    ).toBe(false);
  });
});

// Statut d'une connexion Meta selon l'heure (APPFLOW §6.4) et lecture du bilan enregistré.
import { describe, expect, it } from 'vitest';
import {
  effectiveStatus,
  healthToJson,
  parseHealthCheck,
  toConnectionView,
  type HealthCheckView,
} from './view';

const NOW = new Date('2026-10-14T10:00:00Z');
const days = (n: number): string => new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe('effectiveStatus', () => {
  it('ok loin de la date, expiring à J-7, expired une fois la date passée', () => {
    expect(effectiveStatus('ok', days(30), NOW)).toBe('ok');
    expect(effectiveStatus('ok', days(7), NOW)).toBe('expiring');
    expect(effectiveStatus('ok', days(0.5), NOW)).toBe('expiring');
    expect(effectiveStatus('ok', NOW.toISOString(), NOW)).toBe('expired');
    expect(effectiveStatus('ok', days(-2), NOW)).toBe('expired');
  });

  it('sans date d’expiration, le statut enregistré vaut', () => {
    expect(effectiveStatus('ok', null, NOW)).toBe('ok');
  });

  it('expired et revoked ne reviennent jamais en arrière sans reconnexion', () => {
    expect(effectiveStatus('revoked', days(30), NOW)).toBe('revoked');
    expect(effectiveStatus('expired', days(30), NOW)).toBe('expired');
  });
});

describe('bilan enregistré', () => {
  const health: HealthCheckView = {
    checked_at: NOW.toISOString(),
    items: [
      { key: 'ad_account', ok: false, required: true, guide_slug: 'ad-account' },
      { key: 'whatsapp', ok: false, recommended: true, guide_slug: 'whatsapp-business' },
      { key: 'page', ok: true },
    ],
  };

  it('se relit tel qu’il a été écrit', () => {
    expect(parseHealthCheck(healthToJson(health))).toEqual(health);
  });

  it('ignore ce qui n’a pas la forme attendue', () => {
    expect(parseHealthCheck(null)).toBeNull();
    expect(parseHealthCheck({ items: [] })).toBeNull();
    expect(parseHealthCheck('texte')).toBeNull();
    expect(
      parseHealthCheck({
        checked_at: NOW.toISOString(),
        items: [
          { key: 'inconnu', ok: true },
          { key: 'page', ok: 'oui' },
          'x',
          { key: 'page', ok: true },
        ],
      }),
    ).toEqual({ checked_at: NOW.toISOString(), items: [{ key: 'page', ok: true }] });
  });
});

describe('toConnectionView', () => {
  it('ne renvoie que les champs publics (aucun jeton) et calcule le statut', () => {
    const view = toConnectionView(
      {
        id: 'c1',
        token_type: 'user',
        status: 'ok',
        expires_at: days(3),
        business_id: '123456',
        last_health_check: null,
      },
      NOW,
    );
    expect(view).toEqual({
      id: 'c1',
      token_type: 'user',
      status: 'expiring',
      expires_at: days(3),
      business_id: '123456',
      last_health_check: null,
    });
  });

  it('un type inconnu devient « user » et un statut inconnu « ok »', () => {
    const view = toConnectionView(
      {
        id: 'c',
        token_type: 'x',
        status: 'y',
        expires_at: null,
        business_id: null,
        last_health_check: null,
      },
      NOW,
    );
    expect(view).toMatchObject({ token_type: 'user', status: 'ok' });
  });
});

// Éléments du bilan de santé (F1, APPFLOW §6.3) à partir de ce que Meta répond.
import type { HealthCheckItem } from '@pubeka/platforms';
import { describe, expect, it } from 'vitest';
import { GUIDE_SLUGS, buildHealthItems } from './health';

const allOk: HealthCheckItem[] = [
  { key: 'ad_account', status: 'ok' },
  { key: 'payment_method', status: 'ok' },
  { key: 'page', status: 'ok' },
  { key: 'instagram', status: 'ok' },
  { key: 'whatsapp', status: 'ok' },
  { key: 'pixel', status: 'ok' },
  { key: 'permissions', status: 'ok' },
];
const without = (...keys: HealthCheckItem['key'][]): HealthCheckItem[] =>
  allOk.map((i): HealthCheckItem => (keys.includes(i.key) ? { ...i, status: 'missing' } : i));
const okKeys = (items: { key: string; ok: boolean }[]): string[] =>
  items.filter((i) => i.ok).map((i) => i.key);

describe('buildHealthItems', () => {
  it('tout est vert : aucun guide proposé', () => {
    const items = buildHealthItems({ hasAdAccount: true, hasPage: true, checks: allOk });
    expect(items.every((i) => i.ok && i.guide_slug === undefined)).toBe(true);
    expect(items.map((i) => i.key)).toEqual([
      'business_portfolio',
      'ad_account',
      'payment_method',
      'page',
      'instagram',
      'whatsapp',
      'pixel',
      'permissions',
    ]);
  });

  it('chaque ligne rouge a son guide « Comment faire »', () => {
    const items = buildHealthItems({
      hasAdAccount: true,
      hasPage: true,
      checks: without('payment_method', 'instagram', 'pixel'),
    });
    const red = items.filter((i) => !i.ok);
    expect(red.map((i) => [i.key, i.guide_slug])).toEqual([
      ['payment_method', GUIDE_SLUGS.payment_method],
      ['instagram', GUIDE_SLUGS.instagram],
      ['pixel', GUIDE_SLUGS.pixel],
    ]);
  });

  it('seul le compte publicitaire est obligatoire ; WhatsApp est « fortement recommandé »', () => {
    const items = buildHealthItems({ hasAdAccount: true, hasPage: true, checks: allOk });
    expect(items.filter((i) => i.required).map((i) => i.key)).toEqual(['ad_account']);
    expect(items.filter((i) => i.recommended).map((i) => i.key)).toEqual(['whatsapp']);
  });

  it('un compte publicitaire inutilisable (« warning ») est rouge et fait aussi rougir le portefeuille', () => {
    const checks = allOk.map((i): HealthCheckItem =>
      i.key === 'ad_account' ? { ...i, status: 'warning' } : i,
    );
    const items = buildHealthItems({ hasAdAccount: true, hasPage: true, checks });
    expect(okKeys(items)).not.toContain('ad_account');
    expect(okKeys(items)).not.toContain('business_portfolio');
  });

  it('sans compte publicitaire, rien d’autre n’est évalué (pas d’appel à Meta)', () => {
    const items = buildHealthItems({ hasAdAccount: false, hasPage: true, checks: null });
    expect(okKeys(items)).toEqual(['page']);
    expect(items.find((i) => i.key === 'ad_account')).toMatchObject({ ok: false, required: true });
    expect(items.some((i) => i.key === 'permissions')).toBe(false);
  });

  it('sans Page, la Page est rouge avec son guide', () => {
    const items = buildHealthItems({ hasAdAccount: true, hasPage: false, checks: null });
    expect(items.find((i) => i.key === 'page')).toEqual({
      key: 'page',
      ok: false,
      guide_slug: GUIDE_SLUGS.page,
    });
  });
});

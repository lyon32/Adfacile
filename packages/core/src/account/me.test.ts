import { describe, expect, it } from 'vitest';
import { FakeClient } from '../fake-client.test-helper';
import { getMe, greetingFor, updateMe } from './me';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const row = {
  id: USER_ID,
  email: 'awa@example.com',
  first_name: 'Awa',
  last_name: null,
  phone: null,
  ui_language: 'fr',
  country_code: 'CM',
  city: 'Douala',
  timezone: 'Africa/Douala',
  currency_display: 'XAF',
  theme: 'light',
};

function ctx(db: FakeClient, at = '2026-10-12T09:00:00Z') {
  return {
    requestId: 'req_TEST',
    user: {
      id: USER_ID,
      email: 'awa@example.com',
      locale: 'fr' as const,
      timezone: 'Africa/Douala',
    },
    db: db.asDb(),
    svc: new FakeClient().asService(),
    now: () => new Date(at),
  };
}

describe('greetingFor (TR-PLT-04)', () => {
  it('bonjour / bonsoir selon le fuseau, en français', () => {
    const at = new Date('2026-10-12T16:30:00Z');
    expect(greetingFor(at, 'Africa/Abidjan', 'fr')).toBe('bonjour'); // 16 h 30
    expect(greetingFor(at, 'Africa/Douala', 'fr')).toBe('bonjour'); // 17 h 30
    expect(greetingFor(at, 'Asia/Dubai', 'fr')).toBe('bonsoir'); // 20 h 30
  });

  it('hello / good_evening en anglais ; 3 h 59 est encore le soir', () => {
    expect(greetingFor(new Date('2026-10-12T10:00:00Z'), 'UTC', 'en')).toBe('hello');
    expect(greetingFor(new Date('2026-10-12T03:59:00Z'), 'UTC', 'en')).toBe('good_evening');
    expect(greetingFor(new Date('2026-10-12T04:00:00Z'), 'UTC', 'fr')).toBe('bonjour');
  });
});

describe('getMe', () => {
  it("lit le profil de l'utilisateur, filtré par son identifiant", async () => {
    const db = new FakeClient().reply({ data: row, error: null });
    const me = await getMe(ctx(db));
    expect(me).toMatchObject({
      id: USER_ID,
      first_name: 'Awa',
      greeting: 'bonjour',
      theme: 'light',
    });
    expect(db.calls[0]?.ops).toContainEqual(['eq', 'id', USER_ID]);
  });

  it('valeurs inattendues ramenées aux valeurs par défaut ; anglais le soir', async () => {
    const db = new FakeClient().reply({
      data: { ...row, ui_language: 'en', currency_display: 'XOF', theme: 'system' },
      error: null,
    });
    const me = await getMe(ctx(db, '2026-10-12T20:00:00Z'));
    expect(me).toMatchObject({
      ui_language: 'en',
      currency_display: 'XOF',
      theme: 'system',
      greeting: 'good_evening',
    });
    const odd = new FakeClient().reply({
      data: { ...row, ui_language: 'de', currency_display: '?', theme: '?' },
      error: null,
    });
    expect(await getMe(ctx(odd))).toMatchObject({
      ui_language: 'fr',
      currency_display: 'XAF',
      theme: 'light',
    });
  });

  it('profil absent → not_found', async () => {
    const db = new FakeClient().reply({ data: null, error: null });
    await expect(getMe(ctx(db))).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('updateMe', () => {
  it("modifie seulement les champs reçus, filtré par l'utilisateur", async () => {
    const db = new FakeClient().reply({ data: { ...row, city: 'Yaoundé' }, error: null });
    const me = await updateMe(ctx(db), { city: 'Yaoundé' });
    expect(me.city).toBe('Yaoundé');
    expect(db.calls[0]?.ops).toContainEqual(['update', { city: 'Yaoundé' }]);
    expect(db.calls[0]?.ops).toContainEqual(['eq', 'id', USER_ID]);
  });

  it('corps vide : simple lecture', async () => {
    const db = new FakeClient().reply({ data: row, error: null });
    await updateMe(ctx(db), {});
    expect(db.calls[0]?.ops.some(([op]) => op === 'update')).toBe(false);
  });

  it('aucune ligne → not_found ; contrainte refusée → validation_failed', async () => {
    const none = new FakeClient().reply({ data: null, error: null });
    await expect(updateMe(ctx(none), { city: 'X' })).rejects.toMatchObject({ code: 'not_found' });
    const bad = new FakeClient().reply({ data: null, error: { code: '23514', message: 'check' } });
    await expect(updateMe(ctx(bad), { city: 'X' })).rejects.toMatchObject({
      code: 'validation_failed',
    });
  });
});

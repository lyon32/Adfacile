import { describe, expect, it } from 'vitest';
import { FakeClient } from '../fake-client.test-helper';
import {
  NOTIFICATION_TYPES,
  getNotificationPreferences,
  putNotificationPreferences,
} from './notification-preferences';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function ctx(db: FakeClient) {
  return {
    requestId: 'req_TEST',
    user: { id: USER_ID, email: 'awa@example.com', locale: 'fr' as const, timezone: 'UTC' },
    db: db.asDb(),
    svc: new FakeClient().asService(),
    now: () => new Date('2026-10-14T09:00:00Z'),
  };
}

describe('préférences de notification (APPFLOW §16)', () => {
  it('il y a 12 types', () => {
    expect(NOTIFICATION_TYPES).toHaveLength(12);
  });

  it('un type jamais réglé est activé partout ; un type réglé garde son choix', async () => {
    const db = new FakeClient().reply({
      data: [{ type: 'weekly_summary', in_app: true, email: false }],
      error: null,
    });
    const prefs = await getNotificationPreferences(ctx(db));
    expect(prefs).toHaveLength(12);
    expect(prefs.find((p) => p.type === 'weekly_summary')).toEqual({
      type: 'weekly_summary',
      in_app: true,
      email: false,
    });
    expect(prefs.find((p) => p.type === 'generation_ready')).toEqual({
      type: 'generation_ready',
      in_app: true,
      email: true,
    });
    expect(db.calls[0]?.ops).toContainEqual(['eq', 'profile_id', USER_ID]);
  });

  it("enregistre pour l'utilisateur connecté seulement, ou ne fait rien si la liste est vide", async () => {
    const db = new FakeClient();
    await putNotificationPreferences(ctx(db), [
      { type: 'support_reply', in_app: false, email: true },
    ]);
    expect(db.calls[0]?.ops[0]).toEqual([
      'upsert',
      [{ profile_id: USER_ID, type: 'support_reply', in_app: false, email: true }],
      { onConflict: 'profile_id,type' },
    ]);
    const empty = new FakeClient();
    await putNotificationPreferences(ctx(empty), []);
    expect(empty.calls).toHaveLength(0);
  });

  it('une erreur de la base devient une AppError', async () => {
    const db = new FakeClient().reply({ data: null, error: { code: '42501', message: 'rls' } });
    await expect(getNotificationPreferences(ctx(db))).rejects.toMatchObject({ name: 'AppError' });
  });
});

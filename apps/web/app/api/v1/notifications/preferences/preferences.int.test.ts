// Routes GET et PUT /api/v1/notifications/preferences contre la pile Supabase locale (5 cas).
import {
  createTestUser,
  describeRoute,
  na,
  testServiceClient,
  type TestUser,
} from '@pubeka/testing';
import { beforeAll, expect } from 'vitest';
import { GET, PUT } from './route';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://app.localhost:5173';
let awa: TestUser;
let other: TestUser;

beforeAll(async () => {
  [awa, other] = await Promise.all([
    createTestUser({ label: 'prefs' }),
    createTestUser({ label: 'prefs-other' }),
  ]);
});

function call(method: 'GET' | 'PUT', headers: Record<string, string>, body?: unknown): Request {
  return new Request(`${APP}/api/v1/notifications/preferences`, {
    method,
    headers: { 'x-forwarded-for': `10.${String(Math.floor(Math.random() * 250))}.1.1`, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describeRoute('getNotificationPreferences', {
  success: async () => {
    const res = await GET(call('GET', awa.headers));
    expect(res.status).toBe(200);
    const body = (await json(res)) as { data: { type: string; in_app: boolean; email: boolean }[] };
    expect(body.data).toHaveLength(12);
    expect(body.data.every((p) => p.in_app && p.email)).toBe(true);
  },
  unauthenticated: async () => {
    const res = await GET(call('GET', {}));
    expect(res.status).toBe(401);
    expect((await json(res)).code).toBe('unauthenticated');
  },
  otherWorkspace: na(
    "les préférences sont propres à l'utilisateur, sans espace (RLS sur profile_id)",
  ),
  forbiddenRole: na('ouvert à tout utilisateur connecté, sans rôle'),
  invalidBody: na('GET sans corps'),
});

describeRoute('putNotificationPreferences', {
  success: async () => {
    const res = await PUT(
      call('PUT', awa.headers, { data: [{ type: 'weekly_summary', in_app: true, email: false }] }),
    );
    expect(res.status).toBe(204);
    const read = (await json(await GET(call('GET', awa.headers)))) as {
      data: { type: string; email: boolean }[];
    };
    expect(read.data.find((p) => p.type === 'weekly_summary')?.email).toBe(false);
    expect(read.data.find((p) => p.type === 'support_reply')?.email).toBe(true);
    // Les préférences d'un autre utilisateur n'ont pas bougé.
    const { data } = await testServiceClient()
      .from('notification_preferences')
      .select('type')
      .eq('profile_id', other.id);
    expect(data).toEqual([]);
  },
  unauthenticated: async () => {
    const res = await PUT(call('PUT', { origin: APP }, { data: [] }));
    expect(res.status).toBe(401);
  },
  otherWorkspace: na(
    "les préférences sont propres à l'utilisateur, sans espace (RLS sur profile_id)",
  ),
  forbiddenRole: na('ouvert à tout utilisateur connecté, sans rôle'),
  invalidBody: async () => {
    const res = await PUT(
      call('PUT', awa.headers, {
        data: [
          { type: 'inconnu', in_app: true, email: true },
          { type: 'support_reply', in_app: 'oui', email: true },
        ],
        extra: 1,
      }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('validation_failed');
  },
  extra: {
    '400 un type en double est refusé': async () => {
      const res = await PUT(
        call('PUT', awa.headers, {
          data: [
            { type: 'support_reply', in_app: true, email: true },
            { type: 'support_reply', in_app: false, email: false },
          ],
        }),
      );
      expect(res.status).toBe(400);
    },
  },
});

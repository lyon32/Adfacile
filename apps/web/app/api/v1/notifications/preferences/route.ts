// GET et PUT /api/v1/notifications/preferences : cloche et e-mail par type de notification.
// La liste et les envois arrivent avec S27 ; les préférences sont réglables dès S09.
import { getNotificationPreferences, putNotificationPreferences } from '@pubeka/core';
import { api } from '../../../../../server/http/routes';
import { PutPreferencesSchema } from './schemas';

export const GET = api({ auth: 'user', rateLimit: 'read' }, async (ctx) => ({
  status: 200,
  body: { data: await getNotificationPreferences(ctx) },
}));

export const PUT = api(
  { auth: 'user', rateLimit: 'write', body: PutPreferencesSchema },
  async (ctx, { body }) => {
    await putNotificationPreferences(ctx, body.data);
    return { status: 204 };
  },
);

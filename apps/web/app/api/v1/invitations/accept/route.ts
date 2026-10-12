// POST /api/v1/invitations/accept : la personne invitée, connectée avec l'e-mail invité,
// rejoint l'espace (EC-TEAM-02, EC-TEAM-03).
import { acceptInvitation } from '@pubeka/core';
import { z } from 'zod';
import { api } from '../../../../../server/http/routes';
import { invitationTokens } from '../invitation-services';

const AcceptInvitationSchema = z.strictObject({
  token: z.string().min(32).max(128),
});

export const POST = api(
  { auth: 'user', rateLimit: 'write', body: AcceptInvitationSchema },
  async (ctx, { body }) => ({
    status: 200,
    body: await acceptInvitation(ctx, body.token, invitationTokens),
  }),
);

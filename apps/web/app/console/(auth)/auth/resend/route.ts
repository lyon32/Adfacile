// POST /auth/resend : renvoyer le lien de confirmation (bouton actif après 60 s, APPFLOW §4.1).
import { resendConfirmation } from '../../../../../server/auth/actions';
import { appUrl, requestAuthDeps } from '../../../../../server/auth/deps';
import { authAction } from '../../../../../server/auth/http';
import { EmailOnlyBodySchema } from '../../../../../server/auth/schemas';

export const POST = authAction({ appUrl, schema: EmailOnlyBodySchema }, async (body) =>
  resendConfirmation(await requestAuthDeps(), {
    email: body.email,
    captchaToken: body.captcha_token,
  }),
);

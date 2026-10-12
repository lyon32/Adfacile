// POST /auth/forgot-password : même réponse et même délai, compte connu ou non (EC-AUTH-05).
import { requestPasswordReset } from '../../../../../server/auth/actions';
import { appUrl, requestAuthDeps } from '../../../../../server/auth/deps';
import { authAction } from '../../../../../server/auth/http';
import { EmailOnlyBodySchema } from '../../../../../server/auth/schemas';

export const POST = authAction({ appUrl, schema: EmailOnlyBodySchema }, async (body) =>
  requestPasswordReset(await requestAuthDeps(), {
    email: body.email,
    captchaToken: body.captcha_token,
  }),
);

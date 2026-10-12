// POST /auth/magic-link : lien de connexion par e-mail (compte existant seulement).
import { sendMagicLink } from '../../../../../server/auth/actions';
import { appUrl, requestAuthDeps } from '../../../../../server/auth/deps';
import { authAction } from '../../../../../server/auth/http';
import { EmailOnlyBodySchema } from '../../../../../server/auth/schemas';

export const POST = authAction({ appUrl, schema: EmailOnlyBodySchema }, async (body) =>
  sendMagicLink(await requestAuthDeps(), { email: body.email, captchaToken: body.captcha_token }),
);

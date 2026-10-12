// POST /auth/sign-in : e-mail + mot de passe, CAPTCHA, blocage après 5 échecs (EC-AUTH-04).
import { signIn } from '../../../../../server/auth/actions';
import { appUrl, requestAuthDeps } from '../../../../../server/auth/deps';
import { authAction, clientIp } from '../../../../../server/auth/http';
import { SignInBodySchema } from '../../../../../server/auth/schemas';

export const POST = authAction({ appUrl, schema: SignInBodySchema }, async (body, request) =>
  signIn(await requestAuthDeps(), {
    email: body.email,
    password: body.password,
    captchaToken: body.captcha_token,
    ip: clientIp(request),
  }),
);

// POST /auth/sign-up : création du compte, lien de confirmation envoyé (APPFLOW §4.1).
import { signUp } from '../../../../../server/auth/actions';
import { appUrl, requestAuthDeps } from '../../../../../server/auth/deps';
import { authAction } from '../../../../../server/auth/http';
import { SignUpBodySchema } from '../../../../../server/auth/schemas';

export const POST = authAction({ appUrl, schema: SignUpBodySchema }, async (body) =>
  signUp(await requestAuthDeps(), {
    email: body.email,
    password: body.password,
    captchaToken: body.captcha_token,
    locale: body.locale,
  }),
);

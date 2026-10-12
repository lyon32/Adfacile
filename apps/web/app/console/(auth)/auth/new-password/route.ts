// POST /auth/new-password : nouveau mot de passe après le lien de réinitialisation ; les autres
// sessions sont fermées (EC-AUTH-06) et l'utilisateur reste connecté (APPFLOW §4.3).
import { setNewPassword } from '../../../../../server/auth/actions';
import { appUrl, requestAuthDeps } from '../../../../../server/auth/deps';
import { authAction } from '../../../../../server/auth/http';
import { NewPasswordBodySchema } from '../../../../../server/auth/schemas';

export const POST = authAction({ appUrl, schema: NewPasswordBodySchema }, async (body) =>
  setNewPassword(await requestAuthDeps(), { password: body.password }),
);

// POST /auth/sign-out : déconnexion (bouton, ou inactivité de 10 minutes, TR-SEC-13).
import { signOut } from '../../../../../server/auth/actions';
import { appUrl, requestAuthDeps } from '../../../../../server/auth/deps';
import { authAction } from '../../../../../server/auth/http';
import { EmptyBodySchema } from '../../../../../server/auth/schemas';

export const POST = authAction({ appUrl, schema: EmptyBodySchema }, async () =>
  signOut(await requestAuthDeps()),
);

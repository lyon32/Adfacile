// Fabriques (`create*`, TESTING §5.2) : lignes écrites dans la base locale avec la clé secrète.
// Un utilisateur de test est créé par l'API d'administration d'Auth, puis connecté pour
// obtenir un vrai jeton (TESTING §5.3).
import { randomBytes, randomUUID } from 'node:crypto';
import {
  createServiceClient,
  createUserClient,
  type DbClient,
  type ServiceClient,
} from '@pubeka/db';
import { testEnv } from '../env';

/** Jeton factice accepté par la clé de TEST de Turnstile (supabase/config.toml). */
export const TEST_CAPTCHA_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

export interface TestUser {
  id: string;
  email: string;
  accessToken: string;
  /** Mot de passe tiré au hasard pour ce test (jamais réutilisé). */
  password: string;
  /** En-tête `cookie` de session, au format de @supabase/ssr (application web). */
  cookie: string;
  /** Client soumis à la RLS, connecté comme cet utilisateur. */
  db: DbClient;
  /** En-têtes d'une requête à l'API au nom de cet utilisateur. */
  headers: Record<string, string>;
}

let service: ServiceClient | undefined;

export function testServiceClient(): ServiceClient {
  const env = testEnv();
  service ??= createServiceClient({ url: env.supabaseUrl, secretKey: env.secretKey });
  return service;
}

export async function createTestUser(opts: { label?: string } = {}): Promise<TestUser> {
  const env = testEnv();
  const svc = testServiceClient();
  const email = `${opts.label ?? 'user'}-${randomUUID()}@example.com`;
  const password = randomBytes(24).toString('base64url');
  const created = await svc.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error !== null) throw new Error(`createUser : ${created.error.message}`);
  const anon = createUserClient({ url: env.supabaseUrl, publishableKey: env.publishableKey });
  const signed = await anon.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: TEST_CAPTCHA_TOKEN },
  });
  if (signed.error !== null) throw new Error(`signIn : ${signed.error.message}`);
  const accessToken = signed.data.session.access_token;
  return {
    id: created.data.user.id,
    email,
    accessToken,
    password,
    cookie: `sb-${new URL(env.supabaseUrl).hostname.split('.')[0] ?? 'local'}-auth-token=base64-${Buffer.from(JSON.stringify(signed.data.session)).toString('base64url')}`,
    db: createUserClient({
      url: env.supabaseUrl,
      publishableKey: env.publishableKey,
      accessToken,
    }),
    headers: { authorization: `Bearer ${accessToken}` },
  };
}

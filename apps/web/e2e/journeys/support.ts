// Aides des parcours : création d'un compte de test par l'API d'administration de la pile
// Supabase LOCALE (jamais un vrai service, TESTING §1), connexion par l'écran, mesure du
// défilement horizontal.
import { expect, type Page } from '@playwright/test';

const LOCAL_SUPABASE = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '')
    throw new Error(`Variable ${name} absente (pnpm ci:env).`);
  return value;
}

export interface TestUser {
  email: string;
  password: string;
}

/** Compte confirmé, créé sur la pile locale ; refuse toute autre adresse Supabase. */
/** `onboarded` : pays déjà choisi, donc pas de redirection vers la première configuration. */
export async function createConfirmedUser(
  firstName: string,
  options: { onboarded?: boolean } = {},
): Promise<TestUser> {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  if (!LOCAL_SUPABASE.test(url))
    throw new Error('Les parcours ne créent des comptes que sur la pile locale.');
  const secret = requireEnv('SUPABASE_SECRET_KEY');
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const user: TestUser = {
    email: `e2e-${suffix}@example.test`,
    password: `Pw-${suffix}-${Math.random().toString(36).slice(2)}`,
  };
  const response = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: secret,
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: { first_name: firstName },
    }),
  });
  if (!response.ok)
    throw new Error(`Création du compte de test refusée (${String(response.status)}).`);
  if (options.onboarded ?? true) {
    const created = (await response.json()) as { id: string };
    const profile = await fetch(`${url}/rest/v1/profiles?id=eq.${created.id}`, {
      method: 'PATCH',
      headers: {
        apikey: secret,
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ country_code: 'CM', city: 'Douala', timezone: 'Africa/Douala' }),
    });
    if (!profile.ok) throw new Error('Profil de test non préparé.');
  }
  return user;
}

export async function signIn(page: Page, user: TestUser): Promise<void> {
  await page.goto('/connexion');
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Mot de passe').fill(user.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/(bienvenue\/.*)?$/, { timeout: 20_000 });
}

/** Vrai si la page déborde en largeur (TR-PLT-01 : aucun défilement horizontal). */
export function overflowsHorizontally(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

/** Enregistre un réglage du profil par l'API de l'application, avec la session du navigateur. */
export async function patchMe(page: Page, body: Record<string, unknown>): Promise<void> {
  const status = await page.evaluate(async (payload) => {
    const response = await fetch('/api/v1/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.status;
  }, body);
  expect(status).toBe(200);
}

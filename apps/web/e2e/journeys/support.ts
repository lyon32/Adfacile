// Aides des parcours : création d'un compte de test par l'API d'administration de la pile
// Supabase LOCALE (jamais un vrai service, TESTING §1), connexion par l'écran, mesure du
// défilement horizontal.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const LOCAL_SUPABASE = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '')
    throw new Error(`Variable ${name} absente (pnpm ci:env).`);
  return value;
}

export interface TestUser {
  id: string;
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
    id: '',
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
  const created = (await response.json()) as { id: string };
  user.id = created.id;
  if (options.onboarded ?? true) {
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

// ---- Publication : espace relié à la FAUSSE Meta (PUBEKA_FAKE_PROVIDERS), base locale uniquement ---------------------------

/** Requête vers l'API REST de la pile LOCALE avec la clé de service (jamais un autre hôte). */
export async function serviceRest(path: string, init: RequestInit = {}): Promise<Response> {
  const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
  if (!LOCAL_SUPABASE.test(url)) throw new Error('Les parcours ne touchent que la pile locale.');
  const secret = requireEnv('SUPABASE_SECRET_KEY');
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: secret,
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(init.headers instanceof Headers ? Object.fromEntries(init.headers) : {}),
    },
  });
}

export async function workspaceIdOf(user: TestUser): Promise<string> {
  const response = await serviceRest(`workspaces?owner_id=eq.${user.id}&select=id`);
  const rows = (await response.json()) as { id: string }[];
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('Espace du compte de test introuvable.');
  return id;
}

/** Un taux d'ESSAI récent (valeur de test, pas une donnée du produit), pour que les montants en FCFA s'affichent. */
export async function ensureTestRate(): Promise<void> {
  const since = new Date(Date.now() - 12 * 3_600_000).toISOString();
  const have = (await (
    await serviceRest(
      `exchange_rates?quote=eq.XAF&source=eq.exchangerate-api&fetched_at=gte.${since}&select=id&limit=1`,
    )
  ).json()) as unknown[];
  if (have.length > 0) return;
  const created = await serviceRest('exchange_rates', {
    method: 'POST',
    body: JSON.stringify({
      base: 'USD',
      quote: 'XAF',
      rate: 600,
      // Même fournisseur que le produit : l'écran doit alors afficher le lien d'attribution des taux.
      source: 'exchangerate-api',
      fetched_at: new Date().toISOString(),
    }),
  });
  if (!created.ok) throw new Error('Taux de test non écrit.');
}

/**
 * Relie l'espace à la fausse Meta par la VRAIE route de connexion (jeton chiffré, compte et Page en base), puis rend la Page
 * utilisable (WhatsApp lié) et le compte prêt (dollars, moyen de paiement présent). `payment: false` : moyen de paiement absent.
 */
export async function connectFakeMeta(
  page: Page,
  user: TestUser,
  options: { payment?: boolean; currency?: string } = {},
): Promise<string> {
  const workspaceId = await workspaceIdOf(user);
  // Depuis le navigateur (qui résout `app.localhost` et porte la session), comme `patchMe`.
  const authorizeUrl = await page.evaluate(async (id) => {
    const response = await fetch(`/api/v1/workspaces/${id}/meta/connect`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { authorize_url: string };
    return body.authorize_url;
  }, workspaceId);
  expect(authorizeUrl).not.toBeNull();
  const state = new URL(authorizeUrl ?? '').searchParams.get('state');
  expect(state).not.toBeNull();
  const outcome = await page.evaluate(async (value) => {
    const response = await fetch(
      `/api/v1/meta/callback?state=${encodeURIComponent(value)}&code=code-de-test`,
      { redirect: 'manual' },
    );
    return { type: response.type, status: response.status };
  }, state ?? '');
  // Redirection vers l'application (opaque en mode manuel), jamais une erreur.
  expect(outcome.type).toBe('opaqueredirect');
  const pages = await serviceRest(`pages?workspace_id=eq.${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ active: true, whatsapp_linked: true, whatsapp_number: '+237650198196' }),
  });
  expect(pages.ok).toBe(true);
  const accounts = await serviceRest(`ad_accounts?workspace_id=eq.${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      has_payment_method: options.payment ?? true,
      currency: options.currency ?? 'USD',
      is_active: true,
    }),
  });
  expect(accounts.ok).toBe(true);
  return workspaceId;
}

// ---- Assistant jusqu'à l'aperçu (partagé par les parcours de publication et de refus) -------------------------------------

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** Compte relié à la fausse Meta, wizard jusqu'à la proposition retenue : l'écran Aperçu s'ouvre. */
export async function reachPreview(
  page: Page,
  theme: 'light' | 'dark',
  options: { payment?: boolean; currency?: string } = {},
) {
  await ensureTestRate();
  const user = await createConfirmedUser('Awa');
  await signIn(page, user);
  await patchMe(page, { theme, ui_language: 'fr' });
  await connectFakeMeta(page, user, options);
  await page.goto('/campagnes/nouvelle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  // La Page active de l'espace relié est choisie d'office : on attend que la liste soit chargée avant d'analyser.
  await expect(page.getByLabel('Page', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Photo du produit/ }).click();
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: 'produit.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await page.getByRole('button', { name: /Description/ }).click();
  await page
    .getByLabel('Décris ton activité')
    .fill('Je vends des baskets Nike à Abidjan Cocody, à partir de 25 000 F. Livraison en 24 h.');
  await page.getByRole('button', { name: 'Analyser' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Quelques précisions' })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('textbox').nth(0).fill('+237 690 12 34 56');
  await page.getByRole('textbox').nth(1).fill('Douala');
  await page.getByRole('button', { name: 'Générer la proposition' }).click();
  await expect(page.getByText('Tes réponses sont enregistrées.')).toBeVisible();
  await page.getByRole('button', { name: 'Continuer vers la proposition' }).click();
  await page.getByRole('button', { name: 'Générer la proposition' }).click();
  await expect(page.getByText('Coût estimé')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Aperçu de ta pub' })).toBeVisible({
    timeout: 20_000,
  });
}

// ---- Analyse d'accessibilité stable ------------------------------------------------------------------------------------------

/**
 * Attend la fin des animations et transitions CSS FINIES de la page (les boucles infinies, comme un indicateur de chargement,
 * sont ignorées). Sans cela, axe lit les couleurs d'un onglet PENDANT son fondu (`transition-colors`) : des gris intermédiaires
 * (ex. #adada9 sur #525250, ratio 3,47) qui n'existent pas à l'état stable. Le défaut est intermittent selon la vitesse de la
 * machine (diagnostic S18 : les 60 analyses lancées juste après un clic d'onglet en reproduisaient 89).
 */
export async function waitForAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((animation) => {
      const end = animation.effect?.getComputedTiming().endTime;
      return typeof end === 'number' && Number.isFinite(end);
    });
    await Promise.all(finite.map((animation) => animation.finished.catch(() => undefined)));
  });
}

/** Analyse axe sur un écran STABLE (animations terminées). */
export async function axeAnalyze(page: Page) {
  await waitForAnimations(page);
  return new AxeBuilder({ page }).analyze();
}

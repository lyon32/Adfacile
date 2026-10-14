// Parcours P1 (TESTING §3.4) : inscription par e-mail, lien reçu, première configuration, tableau
// de bord. Prouve : compte, langue, fuseau, salutation. Le courrier est lu dans la boîte de la
// pile Supabase LOCALE (Mailpit), jamais chez un vrai fournisseur.
import { expect, test } from '@playwright/test';
import { overflowsHorizontally } from './support';

const MAILBOX = process.env.MAILPIT_URL ?? 'http://127.0.0.1:54324';

interface MailSummary {
  ID: string;
}
interface Mail {
  Text: string;
  HTML: string;
}

/** Attend le courrier adressé à `email` et en sort le lien de confirmation. */
async function confirmationLink(email: string): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const found = (await (
      await fetch(`${MAILBOX}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)
    ).json()) as { messages?: MailSummary[] };
    const first = found.messages?.[0];
    if (first !== undefined) {
      const mail = (await (await fetch(`${MAILBOX}/api/v1/message/${first.ID}`)).json()) as Mail;
      const link = /https?:\/\/[^\s"<>]*\/auth\/v1\/verify[^\s"<>]*/.exec(
        `${mail.Text}\n${mail.HTML}`,
      );
      if (link !== null) return link[0].replaceAll('&amp;', '&');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Aucun courrier de confirmation reçu pour ${email}.`);
}

test('P1 : inscription par e-mail jusqu’au tableau de bord', async ({ page }, info) => {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const email = `p1-${suffix}@example.test`;
  const password = `Pw-${suffix}-${Math.random().toString(36).slice(2)}`;

  // 1. Inscription : conditions obligatoires, puis « Vérifie ta boîte mail ».
  await page.goto('/inscription');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  const submit = page.getByRole('button', { name: 'Créer mon compte' });
  await expect(submit).toBeDisabled();
  await page.getByRole('checkbox').check();
  expect(await overflowsHorizontally(page)).toBe(false);
  await submit.click();
  await expect(page.getByRole('heading', { name: 'Vérifie ta boîte mail' })).toBeVisible();

  // 2. Le lien reçu ouvre la session et mène à la première configuration.
  await page.goto(await confirmationLink(email));
  await expect(page).toHaveURL(/\/bienvenue\/pays$/, { timeout: 30_000 });
  await expect(page.getByText('Étape 1 sur 5')).toBeVisible();

  // 3. Les cinq étapes.
  await page.getByLabel('Pays').selectOption('CM');
  await page.getByLabel('Ville').fill('Douala');
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page).toHaveURL(/\/bienvenue\/langue$/);
  await page.getByRole('radio', { name: 'Français' }).check();
  await page.getByRole('button', { name: 'Continuer' }).click();
  await expect(page).toHaveURL(/\/bienvenue\/essai$/);
  await page.getByRole('button', { name: 'Commencer' }).click();
  await expect(page).toHaveURL(/\/bienvenue\/meta$/);
  await page.getByRole('button', { name: 'Plus tard' }).click();
  await expect(page).toHaveURL(/\/bienvenue\/marque$/);
  await page.getByRole('button', { name: 'Plus tard' }).click();

  // 4. Tableau de bord : salutation selon l'heure locale, carte « Crée ta première pub ».
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^(Bonjour|Bonsoir)/);
  await expect(page.getByText('Crée ta première pub')).toBeVisible();
  expect(await overflowsHorizontally(page)).toBe(false);
  await page.screenshot({
    path: `../../test-results/captures/p1-tableau-de-bord-${info.project.name}.png`,
  });

  // 5. Compte, langue et fuseau enregistrés (TR-PLT-04) ; pas d'essai ni d'abonnement avant S24.
  const me = await page.evaluate(
    async () => (await (await fetch('/api/v1/me')).json()) as Record<string, unknown>,
  );
  expect(me).toMatchObject({
    email,
    country_code: 'CM',
    city: 'Douala',
    timezone: 'Africa/Douala',
    ui_language: 'fr',
    currency_display: 'XAF',
  });
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Douala',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .find((part) => part.type === 'hour')?.value,
  );
  const expected = hour >= 4 && hour < 18 ? 'bonjour' : 'bonsoir';
  expect(me.greeting).toBe(expected);
});

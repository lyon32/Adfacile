// Parcours P5 (TESTING §3.4, TR-PAY-07, décision du 26/10/2026) : abonnement échu → grâce de 3 jours (lecture et pause, bandeau « Renouvelle avant le… ») → VERROUILLÉ
// (un seul écran, tout refusé sauf la pause) → renouvellement ; essai terminé sans abonnement = verrouillé tout de suite. Pile locale, FAUSSE Meta et FAUSSE IA (PUBEKA_FAKE_PROVIDERS) :
// aucune publicité réelle. L'abonnement est posé en base locale (le paiement arrive en S25) avec des dates d'ESSAI relatives à
// maintenant. Sans défilement horizontal (TR-PLT-01), accessible (axe), clair puis sombre.
import { expect, test, type Page } from '@playwright/test';
import {
  axeAnalyze,
  createConfirmedUser,
  overflowsHorizontally,
  patchMe,
  reachPreview,
  serviceRest,
  signIn,
  workspaceIdOf,
} from './support';

const DAY = 24 * 3_600_000;

async function checkScreen(
  page: Page,
  name: string,
  info: { project: { name: string } },
  theme: string,
) {
  expect(await overflowsHorizontally(page)).toBe(false);
  await page.screenshot({
    path: `../../test-results/captures/${name}-valeurs-essai-${info.project.name}-${theme}.png`,
    fullPage: true,
  });
  const results = await axeAnalyze(page);
  expect(results.violations.map((v) => `${v.id} : ${v.nodes[0]?.target.join(' ') ?? ''}`)).toEqual(
    [],
  );
}

/** Remplace l'abonnement de l'espace : `endsInDays` négatif = déjà échu. */
async function setSubscription(workspaceId: string, endsInDays: number) {
  const end = Date.now() + endsInDays * DAY;
  await serviceRest(`subscriptions?workspace_id=eq.${workspaceId}`, { method: 'DELETE' });
  const created = await serviceRest('subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      workspace_id: workspaceId,
      plan_code: 'pro',
      status: 'active',
      period_start: new Date(end - 30 * DAY).toISOString(),
      period_end: new Date(end).toISOString(),
    }),
  });
  expect(created.ok).toBe(true);
}

/** Écriture de l'espace par l'API, avec la session du navigateur : renvoie le code HTTP et le code d'erreur. */
function renameWorkspace(page: Page, workspaceId: string, name: string) {
  return page.evaluate(
    async ({ id, value }) => {
      const response = await fetch(`/api/v1/workspaces/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: value }),
      });
      const body = (await response.json()) as { code?: string };
      return { status: response.status, code: body.code ?? null };
    },
    { id: workspaceId, value: name },
  );
}

/** Lecture de l'API par la session du navigateur : code HTTP et code d'erreur. */
function readMembers(page: Page, workspaceId: string) {
  return page.evaluate(async (id) => {
    const response = await fetch(`/api/v1/workspaces/${id}/members`);
    const body = (await response.json()) as { code?: string };
    return { status: response.status, code: body.code ?? null };
  }, workspaceId);
}

test('P5 : grâce de 3 jours (lecture, pause) puis verrouillé (un seul écran, pause permise), renouvellement qui rouvre tout', async ({
  page,
}, info) => {
  const startedAt = new Date(Date.now() - 5_000).toISOString();
  await reachPreview(page, 'light');
  await page.getByRole('button', { name: 'Continuer vers la publication' }).click();
  await page.getByRole('button', { name: 'Publier la campagne' }).click();
  await page.getByRole('button', { name: 'J’ai compris' }).click();
  await expect(page.getByText('Ta campagne est envoyée à Meta')).toBeVisible({ timeout: 60_000 });
  const rows = (await (
    await serviceRest(
      `campaigns?status=eq.in_review&created_at=gte.${startedAt}&order=created_at.desc&limit=1&select=id,workspace_id`,
    )
  ).json()) as { id: string; workspace_id: string }[];
  const campaign = rows[0];
  if (campaign === undefined) throw new Error('Campagne publiée introuvable en base.');
  const workspaceId = campaign.workspace_id;
  const campaignStatus = async () =>
    (
      (await (await serviceRest(`campaigns?id=eq.${campaign.id}&select=status`)).json()) as {
        status: string;
      }[]
    )[0]?.status;

  // 1. Grâce (échue depuis 1 jour) : bandeau avec date limite, compte à rebours, promesse de pause et bouton Payer grisé ;
  //    la lecture et la pause marchent, la duplication et l'écriture sont refusées.
  await setSubscription(workspaceId, -1);
  await page.goto(`/campagnes/${campaign.id}`);
  const banner = page.getByRole('region', { name: 'État de l’abonnement' });
  await expect(banner.getByRole('heading', { name: /^Renouvelle avant le / })).toBeVisible({
    timeout: 20_000,
  });
  await expect(banner).toContainText('Il te reste 2 jours.');
  await expect(banner).toContainText('toutes tes publicités seront mises en pause');
  const pay = banner.getByRole('button', { name: 'Payer' });
  await expect(pay).toBeDisabled();
  await expect(pay).toHaveAttribute('title', 'Bientôt disponible');
  await expect(page.getByRole('button', { name: 'Dupliquer' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Mettre en pause' })).toBeEnabled();
  await checkScreen(page, 'p5-grace', info, 'light');
  expect(await renameWorkspace(page, workspaceId, 'Interdit en grâce')).toEqual({
    status: 403,
    code: 'workspace_read_only',
  });
  expect((await readMembers(page, workspaceId)).status).toBe(200);

  // La pause part chez Meta pendant la grâce.
  await page.getByRole('button', { name: 'Mettre en pause' }).click();
  await expect.poll(campaignStatus, { timeout: 30_000 }).toBe('paused');

  // 2. Verrouillé (échu depuis 5 jours), thème sombre : un seul écran, plus rien d'autre.
  await setSubscription(workspaceId, -5);
  await patchMe(page, { theme: 'dark' });
  await page.goto(`/campagnes/${campaign.id}`);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ton abonnement est terminé' }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(banner).toHaveCount(0);
  const renew = page.getByRole('button', { name: 'Renouveler' });
  await expect(renew).toBeDisabled();
  await expect(renew).toHaveAttribute('title', 'Bientôt disponible');
  await expect(page.getByRole('button', { name: 'Reprendre' })).toHaveCount(0);
  await checkScreen(page, 'p5-verrouille', info, 'dark');
  await page.goto('/campagnes/nouvelle');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ton abonnement est terminé' }),
  ).toBeVisible();

  // Côté API : écriture et lecture refusées (workspace_locked), l'état de l'espace reste lisible, la pause reste permise.
  expect(await renameWorkspace(page, workspaceId, 'Interdit')).toEqual({
    status: 403,
    code: 'workspace_locked',
  });
  expect(await readMembers(page, workspaceId)).toEqual({ status: 403, code: 'workspace_locked' });
  const state = await page.evaluate(async (id) => {
    const response = await fetch(`/api/v1/workspaces/${id}`);
    return { status: response.status, body: (await response.json()) as { status: string } };
  }, workspaceId);
  expect(state.status).toBe(200);
  expect(state.body.status).toBe('locked');
  const pauseAgain = await page.evaluate(
    async (ids) => {
      const response = await fetch(
        `/api/v1/workspaces/${ids.workspace}/campaigns/${ids.campaign}/pause`,
        { method: 'POST' },
      );
      return response.status;
    },
    { workspace: workspaceId, campaign: campaign.id },
  );
  expect(pauseAgain).toBe(200);

  // 3. Renouvellement : la période suivante rouvre tout (écran, écriture, bouton « Reprendre »).
  await setSubscription(workspaceId, 30);
  expect(await renameWorkspace(page, workspaceId, 'Boutique renouvelée')).toEqual({
    status: 200,
    code: null,
  });
  await page.goto(`/campagnes/${campaign.id}`);
  await expect(banner).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reprendre' })).toBeEnabled({ timeout: 20_000 });
});

test('essai terminé sans abonnement : verrouillé tout de suite, écran « Choisis une formule » (clair)', async ({
  page,
}, info) => {
  const user = await createConfirmedUser('Awa');
  await signIn(page, user);
  await patchMe(page, { theme: 'light', ui_language: 'fr' });
  const workspaceId = await workspaceIdOf(user);
  const end = Date.now() - 60_000;
  const created = await serviceRest('subscriptions', {
    method: 'POST',
    body: JSON.stringify({
      workspace_id: workspaceId,
      plan_code: 'starter',
      status: 'trialing',
      period_start: new Date(end - 7 * DAY).toISOString(),
      period_end: new Date(end).toISOString(),
    }),
  });
  expect(created.ok).toBe(true);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Ton essai est terminé' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('button', { name: 'Choisir une formule' })).toBeDisabled();
  await checkScreen(page, 'p5-essai-termine', info, 'light');
});

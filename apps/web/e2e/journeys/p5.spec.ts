// Parcours P5 (TESTING §3.4, TR-PAY-07) : abonnement échu → grâce (tout fonctionne, bandeau « Renouvelle avant le… ») → lecture seule
// (bandeau, création refusée, MISE EN PAUSE ACCEPTÉE) → renouvellement. Pile locale, FAUSSE Meta et FAUSSE IA (PUBEKA_FAKE_PROVIDERS) :
// aucune publicité réelle. L'abonnement est posé en base locale (le paiement arrive en S25) avec des dates d'ESSAI relatives à
// maintenant. Sans défilement horizontal (TR-PLT-01), accessible (axe), clair puis sombre.
import { expect, test, type Page } from '@playwright/test';
import { axeAnalyze, overflowsHorizontally, patchMe, reachPreview, serviceRest } from './support';

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

test('P5 : grâce de 3 jours, puis lecture seule — la pause reste permise, la création est refusée, le renouvellement rouvre tout', async ({
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

  // 1. Grâce (échue depuis 1 jour) : bandeau avec date limite et bouton Payer ; l'écriture marche encore.
  await setSubscription(workspaceId, -1);
  await page.goto(`/campagnes/${campaign.id}`);
  const banner = page.getByRole('region', { name: 'État de l’abonnement' });
  await expect(banner.getByRole('heading', { name: /^Renouvelle avant le / })).toBeVisible({
    timeout: 20_000,
  });
  await expect(banner.getByRole('link', { name: 'Payer' })).toBeVisible();
  await expect(banner).toContainText('Il te reste 2 jours.');
  await expect(page.getByRole('button', { name: 'Dupliquer' })).toBeEnabled();
  await checkScreen(page, 'p5-grace', info, 'light');
  expect(await renameWorkspace(page, workspaceId, 'Boutique en grâce')).toEqual({
    status: 200,
    code: null,
  });

  // 2. Lecture seule (échue depuis 5 jours), thème sombre.
  await setSubscription(workspaceId, -5);
  await patchMe(page, { theme: 'dark' });
  await page.goto(`/campagnes/${campaign.id}`);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(banner.getByRole('heading', { name: 'Ton abonnement est terminé' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(banner).toContainText('Tu peux toujours les mettre en pause.');
  await expect(banner.getByRole('link', { name: 'Renouveler' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dupliquer' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Mettre en pause' })).toBeEnabled();
  await checkScreen(page, 'p5-lecture-seule', info, 'dark');

  // Création refusée : à l'écran (l'assistant est fermé) et par l'API (403 workspace_read_only).
  await page.goto('/campagnes/nouvelle');
  await expect(page.getByText('Ton espace est en lecture seule.')).toBeVisible();
  expect(await renameWorkspace(page, workspaceId, 'Interdit')).toEqual({
    status: 403,
    code: 'workspace_read_only',
  });

  // La pause part chez Meta et marche en lecture seule.
  await page.goto(`/campagnes/${campaign.id}`);
  await page.getByRole('button', { name: 'Mettre en pause' }).click();
  await expect
    .poll(
      async () =>
        (
          (await (await serviceRest(`campaigns?id=eq.${campaign.id}&select=status`)).json()) as {
            status: string;
          }[]
        )[0]?.status,
      { timeout: 30_000 },
    )
    .toBe('paused');
  await expect(page.getByRole('button', { name: 'Reprendre' })).toBeDisabled();
  await checkScreen(page, 'p5-pause-lecture-seule', info, 'dark');

  // 3. Renouvellement : la période suivante rouvre l'écriture sans rien recharger côté serveur.
  await setSubscription(workspaceId, 30);
  expect(await renameWorkspace(page, workspaceId, 'Boutique renouvelée')).toEqual({
    status: 200,
    code: null,
  });
  await page.reload();
  await expect(banner).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reprendre' })).toBeEnabled();
});

// Parcours S19b (TR-PAY-07, EC-PAY-11, décision de la personne du 26/10/2026) : espace VERROUILLÉ avec une publicité en diffusion →
// « Mettre toutes mes publicités en pause » (pause chez la FAUSSE Meta, motif billing_lock en base) → renouvellement : la publicité RESTE
// en pause → bandeau « Reprendre mes pubs » → fenêtre de confirmation (dépense chez Meta) → reprise. Pile locale, FAUSSE Meta et FAUSSE IA
// (PUBEKA_FAKE_PROVIDERS) : aucune publicité réelle. Dates d'ESSAI relatives à maintenant. Sans défilement horizontal, accessible (axe).
import { expect, test, type Page } from '@playwright/test';
import {
  axeAnalyze,
  overflowsHorizontally,
  patchMe,
  reachPreview,
  serviceRest,
  waitForAnimations,
} from './support';

const DAY = 24 * 3_600_000;

async function checkScreen(
  page: Page,
  name: string,
  info: { project: { name: string } },
  theme: string,
) {
  await waitForAnimations(page);
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

test('S19b : verrouillé → pause de toutes les pubs → renouvelé, elles restent en pause → « Reprendre mes pubs » avec confirmation', async ({
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
  const state = async () =>
    (
      (await (
        await serviceRest(`campaigns?id=eq.${campaign.id}&select=status,pause_reason`)
      ).json()) as { status: string; pause_reason: string | null }[]
    )[0];

  // 1. Verrouillé (échu depuis 5 jours), thème sombre : l'écran propose d'arrêter la dépense tout de suite.
  await setSubscription(workspaceId, -5);
  await patchMe(page, { theme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ton abonnement est terminé' }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('rien ne repart tout seul')).toBeVisible();
  await checkScreen(page, 's19b-verrouille', info, 'dark');
  await page.getByRole('button', { name: 'Mettre toutes mes publicités en pause' }).click();
  await expect(page.getByRole('status')).toHaveText('1 publicité est en pause chez Meta.', {
    timeout: 30_000,
  });
  expect(await state()).toEqual({ status: 'paused', pause_reason: 'billing_lock' });
  await checkScreen(page, 's19b-verrouille-pause', info, 'dark');

  // 2. Renouvellement : la publicité RESTE en pause, aucune reprise automatique ; le bandeau propose de la reprendre.
  await setSubscription(workspaceId, 30);
  await patchMe(page, { theme: 'light' });
  await page.goto('/');
  const banner = page.getByRole('region', { name: 'Publicités en pause' });
  await expect(banner.getByRole('heading', { name: '1 publicité est en pause' })).toBeVisible({
    timeout: 20_000,
  });
  expect(await state()).toEqual({ status: 'paused', pause_reason: 'billing_lock' });
  await checkScreen(page, 's19b-renouvele', info, 'light');

  // 3. Reprise MANUELLE, avec confirmation avant dépense.
  await banner.getByRole('button', { name: 'Reprendre mes pubs' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Meta recommence à dépenser ton budget');
  await checkScreen(page, 's19b-confirmation', info, 'light');
  expect(await state()).toEqual({ status: 'paused', pause_reason: 'billing_lock' });
  await dialog.getByRole('button', { name: 'Reprendre', exact: true }).click();
  await expect(banner.getByRole('status')).toHaveText('1 publicité a repris chez Meta.', {
    timeout: 30_000,
  });
  expect(await state()).toEqual({ status: 'active', pause_reason: null });
  await expect(banner.getByRole('button', { name: 'Reprendre mes pubs' })).toHaveCount(0);
  await checkScreen(page, 's19b-reprise', info, 'light');
});

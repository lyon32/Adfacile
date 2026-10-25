// Refus de Meta et correction en un clic (S18, APPFLOW §12) : parcours réel contre la pile locale, la FAUSSE IA et la FAUSSE Meta
// (PUBEKA_FAKE_PROVIDERS) : AUCUNE publicité réelle n'est créée. La campagne est publiée par l'assistant (comme P2), puis le refus de
// Meta et le rapport du Modérateur sont posés en base locale : le serveur de test n'expose aucune commande pour faire refuser une
// pub par la fausse Meta ; l'enregistrement du refus, l'explication et la republication sont prouvés par les tests d'intégration.
// Sans défilement horizontal (TR-PLT-01), accessible (axe). Textes d'essai (le produit n'en contient aucun).
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { overflowsHorizontally, reachPreview, serviceRest } from './support';

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
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((v) => `${v.id} : ${v.nodes[0]?.target.join(' ') ?? ''}`)).toEqual(
    [],
  );
}

interface PublishedCampaign {
  id: string;
  workspaceId: string;
  adId: string | null;
  primaryText: string;
}

/** Publie la campagne par l'assistant (fausse Meta), puis la lit en base pour y poser le refus. */
async function publishThroughWizard(
  page: Page,
  theme: 'light' | 'dark',
): Promise<PublishedCampaign> {
  const startedAt = new Date(Date.now() - 5_000).toISOString();
  await reachPreview(page, theme);
  await page.getByRole('button', { name: 'Continuer vers la publication' }).click();
  await page.getByRole('button', { name: 'Publier la campagne' }).click();
  await page.getByRole('button', { name: 'J’ai compris' }).click();
  await expect(page.getByText('Ta campagne est envoyée à Meta')).toBeVisible({ timeout: 60_000 });
  const rows = (await (
    await serviceRest(
      `campaigns?status=eq.in_review&created_at=gte.${startedAt}&order=created_at.desc&limit=1&select=id,workspace_id,copy`,
    )
  ).json()) as { id: string; workspace_id: string; copy: { primary_text?: string } }[];
  const campaign = rows[0];
  if (campaign === undefined) throw new Error('Campagne publiée introuvable en base.');
  const ads = (await (
    await serviceRest(`ads?campaign_id=eq.${campaign.id}&select=id&limit=1`)
  ).json()) as { id: string }[];
  return {
    id: campaign.id,
    workspaceId: campaign.workspace_id,
    adId: ads[0]?.id ?? null,
    primaryText: campaign.copy.primary_text ?? '',
  };
}

/** Pose le refus de Meta (campagne « refusée ») et le rapport du Modérateur déjà rédigé. */
async function seedRejection(campaign: PublishedCampaign, report: Record<string, unknown>) {
  const refused = await serviceRest(`campaigns?id=eq.${campaign.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'rejected' }),
  });
  expect(refused.ok).toBe(true);
  const created = await serviceRest('rejections', {
    method: 'POST',
    body: JSON.stringify({
      workspace_id: campaign.workspaceId,
      campaign_id: campaign.id,
      ad_id: campaign.adId,
      meta_reason:
        'Your ad wasn’t approved because it makes claims that are misleading or unrealistic.',
      explain_status: 'ready',
      fixed_and_republished: false,
      report,
    }),
  });
  expect(created.ok).toBe(true);
}

test('refus de Meta : bandeau, rapport du Modérateur, confirmation, et refus de la correction quand Meta ne montre plus la campagne refusée (clair)', async ({
  page,
}, info) => {
  const campaign = await publishThroughWizard(page, 'light');
  const before = (await (
    await serviceRest(`campaigns?id=eq.${campaign.id}&select=quota_state,publish_attempt`)
  ).json()) as { quota_state: string; publish_attempt: number }[];
  const excerpt = Array.from(campaign.primaryText).slice(0, 24).join('');
  const suggested = 'Découvrez nos produits. Écrivez-nous pour trouver ce qui vous convient.';
  await seedRejection(campaign, {
    rejection_category: 'misleading_claims',
    culprit: { where: 'primary_text', excerpt },
    cause_certainty: 'medium',
    can_fix: true,
    fix: { field: 'primary_text', original: campaign.primaryText, suggested },
    appeal_recommended: false,
    report:
      'Meta a refusé cette pub car le début du texte fait une promesse qu’elle juge trompeuse. La partie concernée est surlignée plus bas. Nous te proposons un texte plus sobre. Clique sur le bouton pour l’appliquer et republier.',
    memory_pattern: 'promesse jugée trompeuse dans le texte',
    flags: [],
  });

  await page.goto(`/campagnes/${campaign.id}`);
  await expect(page.getByText('Meta a refusé ta pub').first()).toBeVisible({ timeout: 20_000 });
  await checkScreen(page, 'refus-bandeau', info, 'light');

  await page.getByRole('link', { name: 'Voir pourquoi' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Pourquoi Meta a refusé ta pub' }),
  ).toBeVisible();
  await expect(page.getByText('Cause probable')).toBeVisible();
  await expect(page.locator('mark')).toContainText(excerpt.trim());
  await expect(page.getByText('Avant', { exact: true })).toBeVisible();
  await expect(page.getByText(suggested)).toBeVisible();
  await checkScreen(page, 'refus-rapport', info, 'light');

  // Appliquer : confirmation d'abord (elle dit que corriger RECRÉE la campagne chez Meta), puis la route relit le statut chez Meta.
  // Ici le refus est posé en base alors que la fausse Meta montre la campagne « en vérification » : c'est exactement le cas d'un appel
  // gagné chez Meta. La correction est donc REFUSÉE (409) et rien ne change, ni chez Meta, ni dans Pubeka. Le chemin de succès
  // (statut refusé chez Meta → republication sans quota) est prouvé par les tests d'intégration avec la fausse Meta pilotée.
  await page.getByRole('button', { name: 'Appliquer la correction et republier' }).click();
  await expect(page.getByRole('dialog').getByText(/recrée ta campagne chez Meta/)).toBeVisible();
  await checkScreen(page, 'refus-confirmation', info, 'light');
  await page.getByRole('dialog').getByRole('button', { name: 'Republier' }).click();
  await expect(page.getByText(/ne montre plus cette campagne comme refusée/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText('Rien n’a changé sur ta campagne.')).toBeVisible();
  await checkScreen(page, 'refus-plus-refusee-chez-meta', info, 'light');

  const after = (await (
    await serviceRest(
      `campaigns?id=eq.${campaign.id}&select=status,quota_state,publish_attempt,copy`,
    )
  ).json()) as {
    status: string;
    quota_state: string;
    publish_attempt: number;
    copy: { primary_text: string };
  }[];
  expect(after[0]?.status).toBe('rejected');
  expect(after[0]?.copy.primary_text).toBe(campaign.primaryText);
  expect(after[0]?.quota_state).toBe(before[0]?.quota_state);
  expect(after[0]?.publish_attempt).toBe(before[0]?.publish_attempt);
  const fixed = (await (
    await serviceRest(`rejections?campaign_id=eq.${campaign.id}&select=fixed_and_republished`)
  ).json()) as { fixed_and_republished: boolean }[];
  expect(fixed[0]?.fixed_and_republished).toBe(false);
  expect(suggested).not.toBe('');
});

test('motif vague de Meta : cause incertaine, nouvel examen conseillé, démarche officielle de Meta (sombre)', async ({
  page,
}, info) => {
  const campaign = await publishThroughWizard(page, 'dark');
  await seedRejection(campaign, {
    rejection_category: 'other',
    culprit: { where: 'unknown', excerpt: null },
    cause_certainty: 'low',
    can_fix: true,
    fix: null,
    appeal_recommended: true,
    report:
      'Meta a refusé cette pub sans donner de raison précise. Nous ne voyons rien d’anormal dans ton texte ni dans ta photo. Meta a peut-être fait une erreur. Nous te conseillons de demander un nouvel examen.',
    memory_pattern: 'refus sans motif précis',
    flags: [],
  });
  await page.goto(`/campagnes/${campaign.id}`);
  await page.getByRole('link', { name: 'Voir pourquoi' }).click();
  await expect(page.getByText('Cause incertaine')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Appliquer la correction et republier' }),
  ).toHaveCount(0);
  await checkScreen(page, 'refus-motif-vague', info, 'dark');

  await page.getByRole('button', { name: 'Demander un nouvel examen' }).click();
  const guide = page.getByRole('dialog');
  await expect(guide.getByText('Ouvre Meta Business Support Home.')).toBeVisible();
  await expect(guide.getByRole('link', { name: /Page d’aide de Meta/ })).toHaveAttribute(
    'href',
    'https://www.facebook.com/business/help/1210227555661027',
  );
  await checkScreen(page, 'refus-guide-nouvel-examen', info, 'dark');
});

// S08, « Fait quand » : page de démonstration, axe sans erreur, captures clair/sombre 390/1280,
// « réduire les animations » respecté (TR-PRF-04, TR-PRF-09, TR-ACC-03).
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const CAPTURES = process.env.UI_CAPTURES_DIR;

for (const theme of ['light', 'dark'] as const) {
  test(`TR-ACC-03 — démonstration ${theme} : chaque composant, axe sans erreur, pas de défilement horizontal`, async ({
    page,
  }, info) => {
    await page.goto(`/?theme=${theme}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const name of [
      'Palette',
      'Boutons',
      'Champs',
      'Cartes',
      'Modale',
      'Montants',
      'Badges de statut',
      'Cartes de modèle',
      'Loader « Saisie »',
    ]) {
      await expect(page.getByRole('heading', { level: 2, name, exact: true })).toBeVisible();
    }
    await expect(page.locator('[data-status]')).toHaveCount(6);
    await page.waitForTimeout(1600); // fin du dessin du loader

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(
      results.violations.map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
      ),
    ).toEqual([]);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);

    if (CAPTURES !== undefined) {
      await page.screenshot({
        path: `${CAPTURES}/demo-${theme}-${info.project.name}.png`,
        fullPage: true,
      });
    }
  });
}

test('TR-ACC-03 — la modale est accessible au clavier et sans erreur axe', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mettre en pause' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(results.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('TR-ACC-03 — focus clavier visible sur le bouton principal', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Créer une pub' });
  await button.focus();
  const outline = await button.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe('solid');
  const height = await button.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeGreaterThanOrEqual(44);
});

test('TR-PRF-09 — « réduire les animations » coupe les animations du loader et des transitions', async ({
  browser,
}) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  const animations = await page.evaluate(() =>
    [
      '.pubeka-loader .mk',
      '.pubeka-loader .ln',
      '.pubeka-loader .tx',
      '.pubeka-loader-short .mk',
    ].map((sel) => {
      const el = document.querySelector(sel);
      return el === null ? 'absent' : getComputedStyle(el).animationName;
    }),
  );
  expect(animations).toEqual(['none', 'none', 'none', 'none']);
  const transition = await page
    .getByRole('button', { name: 'Créer une pub' })
    .evaluate((el) => getComputedStyle(el).transitionProperty);
  expect(transition).toBe('none');
  await context.close();
});

test('TR-PRF-09 — sans préférence, le loader est animé', async ({ page }) => {
  await page.goto('/');
  const name = await page
    .locator('.pubeka-loader .mk')
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(name).toBe('pubeka-draw');
});

test('TR-PRF-04 — version courte absente sous 300 ms, présente au-delà', async ({ page }) => {
  await page.goto('/');
  const slot = page.getByTestId('pending-slot');
  await page.getByRole('button', { name: 'Simuler un chargement de 200 ms' }).click();
  await page.waitForTimeout(450);
  await expect(slot.getByRole('status')).toHaveCount(0);
  await page.getByRole('button', { name: 'Simuler un chargement de 1 s' }).click();
  await expect(slot.getByRole('status')).toBeVisible();
  await expect(slot.getByRole('status')).toHaveCount(0, { timeout: 2000 });
});

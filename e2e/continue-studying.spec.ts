import { expectNoHorizontalOverflow, startedLearner } from './support/learner';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await startedLearner(page);
});

test('quiz Continue Studying card is responsive and reveals the active quiz', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto('/');
  await page.getByTestId('all-subjects-grid').getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: /^Start quiz: (?!.*Subject Test)/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await page.getByRole('radio').first().check();
  await page.goto('/');

  const region = page.getByRole('region', { name: 'Continue Studying' });
  const card = region.getByRole('button', { name: 'Continue studying Browser Test Subject' });
  await expect(card).toHaveAccessibleDescription(/^1 quiz in progress 1 of \d+ questions? answered$/);
  await expect(card.locator('.continue-study-cta')).toHaveText(/Continue/);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expectNoHorizontalOverflow(page);
  }
  const action = page.getByTestId('continue-study-card');
  await action.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Browser Test Subject', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Resume quiz: (?!.*Subject Test)/ })).toBeInViewport();
  await expect(page.getByRole('heading', { level: 4 })).toBeFocused();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Topics', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Resume quiz: (?!.*Subject Test)/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.getByTestId('all-subjects-grid').getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await expect(page.getByRole('heading', { name: 'Topics', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.getByTestId('continue-study-card').click();
  await expect(page.getByRole('button', { name: /^Resume quiz: (?!.*Subject Test)/ })).toBeInViewport();
  await expect(page.getByRole('heading', { level: 4 })).toBeFocused();
});

test('flashcard Continue Studying card shows deck activity and reveals the saved deck', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await page.getByTestId('all-subjects-grid').getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: /^Study deck/ }).click();
  await page.getByRole('button', { name: 'Save and exit deck' }).click();
  await page.getByRole('button', { name: 'Dashboard' }).click();

  const region = page.getByRole('region', { name: 'Continue Studying' });
  const card = region.getByRole('button', { name: 'Continue studying Browser Test Subject' });
  await expect(card).toHaveAccessibleDescription(/^1 deck in progress \d+ of \d+ cards? revealed$/);
  await expect(card.locator('.continue-study-cta')).toHaveText(/Continue/);
  await expect(region.getByTestId('subject-score-track')).toHaveCount(0);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expectNoHorizontalOverflow(page);
  }
  const action = page.getByTestId('continue-study-card');
  await action.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: 'Browser Test Subject', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Resume deck/ })).toBeInViewport();
  await expect(page.getByRole('heading', { level: 4 })).toBeFocused();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Topics', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.getByTestId('all-subjects-grid').getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await expect(page.getByRole('heading', { name: 'Topics', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.getByTestId('continue-study-card').click();
  await expect(page.getByRole('button', { name: /^Resume deck/ })).toBeInViewport();
  await expect(page.getByRole('heading', { level: 4 })).toBeFocused();
});

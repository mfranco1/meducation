import { expect, test } from '@playwright/test';

test('a first visit shows the landing page until the visitor starts studying', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /one good question/ })).toBeVisible();

  await page.getByRole('radio').first().focus();
  await page.keyboard.press('4');
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Case 1, correct, current case' })).toBeVisible();

  const reveal = page.getByRole('button', { name: 'Reveal answer' });
  await reveal.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('group', { name: /Answer revealed/ })).toContainText('machinery-like murmur');
  await page.keyboard.press('Space');
  await expect(page.locator('figcaption')).toContainText('Card 2 of 4');

  await page.getByRole('banner').getByRole('button', { name: 'Start studying' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /one good question/ })).toHaveCount(0);
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /one good question/ })).toHaveCount(0);
});

test('a visitor with saved progress opens the dashboard directly', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('meducation.flashcards.progress.v2', '{}'));
  await page.goto('/');
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /one good question/ })).toHaveCount(0);
});

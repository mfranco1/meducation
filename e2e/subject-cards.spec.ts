import { expect, test } from '@playwright/test';

test('quiz subject cards keep title, icon, score track, and card geometry aligned responsively', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const grid = page.getByTestId('all-subjects-grid');
  await expect
    .poll(() => grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length))
    .toBe(3);
  const card = grid.locator('.MuiCardActionArea-root');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('aria-label', 'Open Browser Test Subject');
  expect(await grid.getByRole('button').count()).toBe(1);
  await expect(card.locator('[data-subject-icon="s1"]')).toBeVisible();
  await expect(card.getByTestId('subject-score-track')).toBeVisible();
  await expect(card.getByText(/Latest Score/)).toHaveCount(0);

  const alignment = await card.evaluate((element) => {
    const icon = element.querySelector('[data-subject-icon]')!.getBoundingClientRect();
    const title = element.querySelector('h3')!.getBoundingClientRect();
    const track = element.querySelector('[data-testid="subject-score-track"]')!.getBoundingClientRect();
    return {
      iconRight: icon.right,
      titleLeft: title.left,
      iconTop: icon.top,
      titleTop: title.top,
      trackBottom: track.bottom,
    };
  });
  expect(alignment.titleLeft).toBeGreaterThanOrEqual(alignment.iconRight);
  expect(alignment.titleTop).toBeLessThan(alignment.iconTop + 40);
  await testInfo.attach('quiz-subject-grid-desktop', { body: await page.screenshot(), contentType: 'image/png' });

  await card.focus();
  await expect(card).toBeFocused();
  expect(await card.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: 'Browser Test Subject' })).toBeVisible();
  await page.goto('/');
  await expect(card).toBeVisible();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 900, height: 800 });
  await expect
    .poll(() => grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length))
    .toBe(2);
  await page.setViewportSize({ width: 320, height: 800 });
  await expect
    .poll(() => grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length))
    .toBe(1);
  await expect
    .poll(() => page.locator('main').evaluate((element) => element.getBoundingClientRect().width))
    .toBeGreaterThan(200);
  await expect(card).toBeVisible();
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .map((element) => ({
        tag: element.tagName,
        className: typeof element.className === 'string' ? element.className : '',
        right: element.getBoundingClientRect().right,
        width: element.getBoundingClientRect().width,
      }))
      .filter((element) => element.right > window.innerWidth + 1)
      .slice(0, 8),
  );
  const layout = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="all-subjects-grid"] .MuiCardActionArea-root')!;
    const grid = document.querySelector('[data-testid="all-subjects-grid"]')!;
    const title = card.querySelector('h3')!;
    return {
      grid: grid.getBoundingClientRect().toJSON(),
      card: card.getBoundingClientRect().toJSON(),
      title: title.getBoundingClientRect().toJSON(),
      titleParent: title.parentElement!.getBoundingClientRect().toJSON(),
      cardParent: card.parentElement!.getBoundingClientRect().toJSON(),
      main: document.querySelector('main')!.getBoundingClientRect().toJSON(),
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(layout.title.width).toBeGreaterThan(0);
  expect(layout.title.right).toBeLessThanOrEqual(320);
  expect(layout.documentWidth).toBeLessThanOrEqual(321);
  expect(await card.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
  await testInfo.attach('quiz-subject-grid-mobile', { body: await page.screenshot(), contentType: 'image/png' });
});

test('flashcard subject grid shares the subject header and activity style without quiz scores', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Flashcards' }).click();

  const grid = page.getByTestId('all-subjects-grid');
  const card = grid.getByRole('button', { name: 'Open Browser Test Subject' });
  await expect(card).toBeVisible();
  await expect(card.locator('[data-subject-icon="s1"]')).toBeVisible();
  await expect(card.getByTestId('subject-score-track')).toHaveCount(0);
  await expect(card.getByText(/Latest Score|in progress/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await testInfo.attach('flashcard-subject-grid-mobile', { body: await page.screenshot(), contentType: 'image/png' });

  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Browser Test Subject' })).toBeVisible();
});

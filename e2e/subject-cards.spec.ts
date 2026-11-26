import { expectNoHorizontalOverflow, startedLearner } from './support/learner';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await startedLearner(page);
});

test('subject tabs switch content and reset browsing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  const quizzes = page.getByRole('tab', { name: 'Quizzes', exact: true });
  const flashcards = page.getByRole('tab', { name: 'Flashcards', exact: true });
  await expect(quizzes).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('0 / 1 quizzes completed', { exact: true })).toHaveCount(0);
  const header = page.getByRole('heading', { name: 'Browser Test Subject', exact: true });
  const tabs = page.getByRole('tablist', { name: 'Subject content' });
  const headerNode = await header.elementHandle();
  const tabsNode = await tabs.elementHandle();
  const frame = page.getByTestId('screen-transition');
  // Wait for the subject-entry animation before monitoring subsequent tab changes.
  await frame.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
    element.addEventListener('animationstart', (event) => {
      if (event.target === element) element.setAttribute('data-entry-restarted', 'true');
    });
  });
  const quizSearch = page.getByRole('searchbox', { name: 'Search topics and quizzes' });
  await quizSearch.fill('Browser Test Quiz');
  await expect(page.getByRole('heading', { name: 'Browser Test Quiz', exact: true })).toBeVisible();

  await quizzes.focus();
  await page.keyboard.press('ArrowRight');
  await expect(flashcards).toBeFocused();
  await expect(quizzes).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');
  await expect(flashcards).toHaveAttribute('aria-selected', 'true');
  await expect(flashcards).toBeFocused();
  await expect(header).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Flashcards' })).toBeVisible();
  expect(await header.evaluate((element, original) => element === original, headerNode)).toBe(true);
  expect(await tabs.evaluate((element, original) => element === original, tabsNode)).toBe(true);
  await expect(frame).not.toHaveAttribute('data-entry-restarted');
  await expect(page.getByText('0 / 1 decks completed', { exact: true })).toHaveCount(0);
  const deckSearch = page.getByRole('searchbox', { name: 'Search topics and decks' });
  await expect(deckSearch).toHaveValue('');
  await page.getByRole('button', { name: /Browser Test Topic/ }).click();
  await expect(page.getByRole('heading', { name: 'Browser Test Deck', exact: true })).toBeVisible();

  await quizzes.click();
  await expect(quizzes).toHaveAttribute('aria-selected', 'true');
  await expect(quizzes).toBeFocused();
  await expect(quizSearch).toHaveValue('');
  expect(await tabs.evaluate((element, original) => element === original, tabsNode)).toBe(true);
  await expect(frame).not.toHaveAttribute('data-entry-restarted');
  await expect(page.getByRole('heading', { name: 'Browser Test Quiz', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Browser Test Topic/ }).click();
  await expect(page.getByRole('heading', { name: 'Browser Test Quiz', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Topics', exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await flashcards.click();
  await expect(deckSearch).toHaveValue('');
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Flashcards', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await expect(flashcards).toHaveAttribute('aria-selected', 'true');
  await quizzes.click();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Quizzes', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('dashboards and the subject screen do not overflow at the design-system widths', async ({ page }) => {
  for (const [path, ready] of [
    ['/', 'Open Browser Test Subject'],
    ['/flashcards', 'Open Browser Test Subject'],
    ['/quizzes/s1', 'Subject content'],
    ['/flashcards/s1', 'Subject content'],
  ]) {
    await page.goto(path);
    await expect(page.getByRole(path.includes('s1') ? 'tablist' : 'button', { name: ready }).first()).toBeVisible();
    for (const width of [320, 390, 1048, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expectNoHorizontalOverflow(page);
    }
  }
});

for (const destination of ['Quizzes', 'Flashcards']) {
  test(`subject frame stays steady while ${destination} loads and recovers`, async ({ page }) => {
    await page.setViewportSize({ width: 1048, height: 400 });
    const path =
      destination === 'Quizzes' ? '**/api/v1/subjects/s1/quizzes*' : '**/api/v1/flashcards/subjects/s1/catalog*';
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let fail = true;
    await page.route(path, async (route) => {
      if (!fail) {
        await route.continue();
        return;
      }
      await pending;
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/');
    if (destination === 'Quizzes') await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
    await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
    await expect(page.getByRole('searchbox')).toBeEnabled();
    const header = page.getByRole('heading', { name: 'Browser Test Subject', exact: true });
    const tabs = page.getByRole('tablist', { name: 'Subject content' });
    const headerNode = await header.elementHandle();
    await page.getByTestId('screen-transition').evaluate(async (element) => {
      await Promise.all(element.getAnimations().map((animation) => animation.finished));
    });
    await page.evaluate(() => window.scrollTo(0, 80));
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
    const tabBounds = await tabs.boundingBox();
    await page.getByRole('tab', { name: destination, exact: true }).click();
    const panel = page.getByRole('tabpanel', { name: destination });
    await expect(
      panel.getByRole('status', { name: destination === 'Quizzes' ? 'Loading quizzes' : 'Loading flashcard decks' }),
    ).toBeVisible();
    expect(await header.evaluate((element, original) => element === original, headerNode)).toBe(true);
    expect(await tabs.boundingBox()).toEqual(tabBounds);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    release();
    await expect(panel.getByRole('alert')).toBeVisible();
    expect(await tabs.boundingBox()).toEqual(tabBounds);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    fail = false;
    await panel.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(panel.getByRole('searchbox')).toBeEnabled();
    expect(await header.evaluate((element, original) => element === original, headerNode)).toBe(true);
    expect(await tabs.boundingBox()).toEqual(tabBounds);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  });
}

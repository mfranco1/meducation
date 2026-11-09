import { expectNoHorizontalOverflow, startedLearner } from './support/learner';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await startedLearner(page);
});

test('quiz subject cards keep title, icon, score track, and card geometry aligned responsively', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const grid = page.getByTestId('all-subjects-grid');
  const filterGroup = page.getByRole('group', { name: 'Filter subjects' });
  const filterHeight = await filterGroup.evaluate((element) => element.getBoundingClientRect().height);
  expect(filterHeight).toBeLessThan(40);
  const selectedFilter = filterGroup.getByRole('button', { name: 'All' });
  await expect(selectedFilter).toHaveCSS('color', 'rgb(133, 56, 18)');
  expect(await filterGroup.evaluate((element) => getComputedStyle(element, '::before').backgroundColor)).toBe(
    'rgb(247, 223, 207)',
  );
  const inactiveFilter = filterGroup.getByRole('button', { name: 'In progress' });
  const inactiveBackground = await inactiveFilter.evaluate((element) => getComputedStyle(element).backgroundColor);
  await inactiveFilter.hover();
  await expect(inactiveFilter).toHaveCSS('background-color', inactiveBackground);
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

  const title = card.locator('h3');
  await title.evaluate((element) => {
    element.style.maxWidth = '120px';
  });
  const verticalAlignment = await card.evaluate((element) => {
    const icon = element.querySelector('[data-subject-icon]')!.getBoundingClientRect();
    const titleBounds = element.querySelector('h3')!.getBoundingClientRect();
    return Math.abs(icon.top + icon.height / 2 - (titleBounds.top + titleBounds.height / 2));
  });
  expect(verticalAlignment).toBeLessThan(1);
  await title.evaluate((element) => {
    element.style.maxWidth = '';
  });

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

test('flashcard subject grid shares the subject header and progress track without quiz scores', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Flashcards' }).click();

  const grid = page.getByTestId('all-subjects-grid');
  const card = grid.getByRole('button', { name: 'Open Browser Test Subject' });
  await expect(card).toBeVisible();
  await expect(card.locator('[data-subject-icon="s1"]')).toBeVisible();
  await expect(card.getByTestId('subject-score-track')).toBeVisible();
  await expect(card.getByText(/Latest Score|Completed|in progress/)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await testInfo.attach('flashcard-subject-grid-mobile', { body: await page.screenshot(), contentType: 'image/png' });

  await card.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Browser Test Subject' })).toBeVisible();
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
  expect((await tabs.boundingBox())!.y).toBeGreaterThan((await header.boundingBox())!.y);
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
  const headerBounds = await header.boundingBox();
  const tabBounds = await tabs.boundingBox();
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
  expect(await header.boundingBox()).toEqual(headerBounds);
  expect(await tabs.boundingBox()).toEqual(tabBounds);
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

for (const width of [320, 600, 1048, 1440]) {
  test(`subject screen does not overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
    await expect(page.getByRole('tablist', { name: 'Subject content' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('tab', { name: 'Flashcards', exact: true }).click();
    await expectNoHorizontalOverflow(page);
  });
}

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
    await expect(page.getByTestId('screen-transition')).toHaveCSS('top', '0px');
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

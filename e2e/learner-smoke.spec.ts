import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, startedLearner } from './support/learner';
import { openTopicIfNeeded, showQuestion } from './support/topic';

test.beforeEach(async ({ page }) => {
  await startedLearner(page);
});

test('Help stays accessible from the desktop rail and mobile drawer', async ({ page }) => {
  await page.goto('/');
  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 800 });
    if (width === 320) await page.getByRole('button', { name: 'Expand navigation' }).click();
    const help = page.getByRole('button', { name: 'Help', exact: true });
    await help.click();
    const dialog = page.getByRole('dialog', { name: 'Help', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link', { name: 'Open Telegram' })).toHaveAttribute(
      'href',
      'https://t.me/MeducationSupport',
    );
    await expect(dialog.getByRole('link', { name: '@MeducationSupport' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Where is my progress saved?' }).click();
    await expect(dialog.getByText(/Clearing browser data deletes your progress/)).toBeVisible();
    await expect.poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(help).toBeFocused();
  }
});

test('Help preserves flashcard study and blocks study shortcuts while open', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: /^Study deck/ }).click();
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Help', exact: true });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText('Card 1 of 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Help', exact: true })).toBeFocused();
});

async function statCardBounds(firstCard: Locator) {
  const cards = firstCard.locator('..').getByRole('group');
  await expect(cards).toHaveCount(3);
  // The responsive drawer animates the available width. Read the entire row
  // in one browser task so comparisons cannot span different animation frames.
  return cards.evaluateAll((elements) =>
    elements.map((element) => {
      const { y, width, height } = element.getBoundingClientRect();
      return { y, width, height };
    }),
  );
}

async function expectStatCardsLayout(page: Page, firstCard: Locator) {
  for (const width of [1280, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const bounds = await statCardBounds(firstCard);
    expect(bounds.every(({ width, height }) => width > 0 && height > 0)).toBe(true);
    if (width >= 600) {
      expect(bounds[0]!.y).toBeCloseTo(bounds[1]!.y, 0);
      expect(bounds[1]!.y).toBeCloseTo(bounds[2]!.y, 0);
      expect(Math.abs(bounds[0]!.width - bounds[2]!.width)).toBeLessThan(2);
    } else {
      expect(bounds[1]!.y).toBeGreaterThan(bounds[0]!.y);
      expect(bounds[2]!.y).toBeGreaterThan(bounds[1]!.y);
    }
  }
}

test('dashboard stat cards stay readable across desktop and narrow layouts', async ({ page }, testInfo) => {
  await page.goto('/');
  const quizCards = [
    page.locator('[role="group"]').filter({ hasText: 'Completed' }),
    page.locator('[role="group"]').filter({ hasText: 'Average' }),
    page.locator('[role="group"]').filter({ hasText: 'Lowest' }),
  ];
  await expect(quizCards[0]).toContainText('quizzes');
  await expect(quizCards[1]).toContainText('correct');
  await expectStatCardsLayout(page, quizCards[0]!);
  await page.setViewportSize({ width: 1280, height: 800 });
  const quizDesktop = testInfo.outputPath('quiz-dashboard-stat-cards.png');
  await page.screenshot({ path: quizDesktop });
  await testInfo.attach('quiz-dashboard-stat-cards.png', { path: quizDesktop, contentType: 'image/png' });
  await page.setViewportSize({ width: 390, height: 800 });
  const quizMobile = testInfo.outputPath('quiz-dashboard-stat-cards-mobile.png');
  await page.screenshot({ path: quizMobile });
  await testInfo.attach('quiz-dashboard-stat-cards-mobile.png', { path: quizMobile, contentType: 'image/png' });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: 'Flashcards' }).click();
  const flashcardCards = [
    page.getByRole('group', { name: 'Completed', exact: true }),
    page.getByRole('group', { name: 'Average flashcard deck finishes per day' }),
    page.getByRole('group', { name: 'Highest flashcard deck finishes in a day' }),
  ];
  await expect(flashcardCards[0]).toContainText('decks');
  await expect(flashcardCards[1]).toContainText('decks / day');
  await expect(flashcardCards[2]).toContainText('decks finished in a day');
  await expectStatCardsLayout(page, flashcardCards[0]!);
  await page.setViewportSize({ width: 1280, height: 800 });
  const flashcardDesktop = testInfo.outputPath('flashcard-dashboard-stat-cards.png');
  await page.screenshot({ path: flashcardDesktop });
  await testInfo.attach('flashcard-dashboard-stat-cards.png', { path: flashcardDesktop, contentType: 'image/png' });
  await page.setViewportSize({ width: 390, height: 800 });
  const flashcardMobile = testInfo.outputPath('flashcard-dashboard-stat-cards-mobile.png');
  await page.screenshot({ path: flashcardMobile });
  await testInfo.attach('flashcard-dashboard-stat-cards-mobile.png', {
    path: flashcardMobile,
    contentType: 'image/png',
  });
});

test('abandoned flashcard loads do not reopen study or create progress', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const requestedPromise = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route('**/api/v1/flashcards/decks/d-browser/cards*', async (route) => {
    requested();
    await held;
    await route.continue().catch(() => undefined);
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: /^Study deck/ }).click();
  await requestedPromise;
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  release();
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('meducation.flashcards.progress.v2'))).toBeNull();
  await page.unroute('**/api/v1/flashcards/decks/d-browser/cards*');
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: /^Study deck/ }).click();
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
});

test('a failed flashcard deck request shows a toast and recovers through the deck action', async ({ page }) => {
  let releaseFailure!: () => void;
  const holdFailure = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });
  let requestStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });
  await page.route('**/api/v1/flashcards/decks/d-browser/cards*', async (route) => {
    requestStarted();
    await holdFailure;
    await route.fulfill({ status: 503, body: '{}' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: /^Study deck/ }).click();
  await started;
  await expect(page.getByRole('progressbar', { name: 'Loading flashcard deck' })).toBeVisible();
  releaseFailure();
  await expect(page.getByRole('progressbar', { name: 'Loading flashcard deck' })).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Unable to load deck');
  await expect(page.getByRole('heading', { name: 'Browser Test Subject' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Browser Test Deck' })).toBeVisible();
  for (const width of [320, 390, 1048, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await expect(page.getByRole('region', { name: 'Topics', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('meducation.flashcards.progress.v2'))).toBeNull();
  await page.unroute('**/api/v1/flashcards/decks/d-browser/cards*');
  const retry = page.getByRole('button', { name: /^Study deck/ });
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
});

test('flashcards browse, resume an imported fixture deck, and finish without quiz analytics', async ({
  page,
}, testInfo) => {
  await page.clock.install({ time: new Date(2026, 9, 7, 12) });
  await page.goto('/');
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Browser Test Subject' })).toBeVisible();
  const dashboardScreenshot = testInfo.outputPath('flashcards-dashboard-desktop.png');
  await expect(page.getByTestId('screen-transition')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: dashboardScreenshot });
  await testInfo.attach('flashcards-dashboard-desktop.png', {
    path: dashboardScreenshot,
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await expect(page.getByRole('heading', { name: 'Browser Test Subject' })).toBeVisible();
  await expect(page.getByText('2 cards')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Topic' })).toHaveCount(0);
  const subjectScreenshot = testInfo.outputPath('flashcard-subject-desktop.png');
  await expect(page.getByTestId('screen-transition')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: subjectScreenshot });
  await testInfo.attach('flashcard-subject-desktop.png', { path: subjectScreenshot, contentType: 'image/png' });
  await expect(page.getByRole('button', { name: /^Study deck/ })).toBeVisible();
  const studyButton = page.getByRole('button', { name: /^Study deck/ });
  await studyButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Card 1 of 2')).toBeVisible();
  const concealedFace = page.getByRole('button', { name: 'Reveal answer' });
  const hiddenAnswerFace = page.locator(
    '[aria-label="Answer revealed. Click to hide or press Space or Enter to continue."]',
  );
  const [concealedBounds, hiddenAnswerBounds] = await Promise.all([
    concealedFace.boundingBox(),
    hiddenAnswerFace.boundingBox(),
  ]);
  expect(concealedBounds).not.toBeNull();
  expect(hiddenAnswerBounds).not.toBeNull();
  expect(Math.abs(concealedBounds!.height - hiddenAnswerBounds!.height)).toBeLessThan(1);
  await expect(page.locator('.katex')).toHaveCount(2);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Card 2 of 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('Card 1 of 2')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 320, height: 780 });
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const studyScreenshot = testInfo.outputPath('flashcard-study-mobile.png');
  await page.screenshot({ path: studyScreenshot });
  await testInfo.attach('flashcard-study-mobile.png', { path: studyScreenshot, contentType: 'image/png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Card 2, unopened' }).click();
  await expect(page.getByText('Card 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Card 1, unopened' }).click();
  const firstPrompt = page.getByRole('heading', { name: /What forms the brachial plexus/ });
  await firstPrompt.click();
  await page.keyboard.press('Space');
  const revealedFace = page.getByRole('group', {
    name: 'Answer revealed. Click to hide or press Space or Enter to continue.',
  });
  await expect(revealedFace).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByText('Card 2 of 2')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('The axillary nerve, n. axillaris.')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('Card 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Card 1, opened' }).click();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page
    .getByRole('group', { name: 'Answer revealed. Click to hide or press Space or Enter to continue.' })
    .click();
  await page.getByRole('button', { name: 'Flag card' }).click();
  await expect(page.getByRole('button', { name: 'Card 1, opened, flagged' })).toBeVisible();
  await page.getByRole('button', { name: 'Hidden cards, 0' }).click();
  await expect(page.getByText('No hidden cards.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Card 1, opened, flagged' })).toHaveCount(0);
  await page.getByRole('button', { name: 'All cards, 2' }).click();
  await expect(page.getByRole('button', { name: 'Card 1, opened, flagged' })).toBeVisible();
  await page.getByRole('button', { name: 'Flagged cards, 1' }).click();
  await expect(page.getByRole('button', { name: 'Card 1, opened, flagged' })).toBeVisible();
  await page.getByRole('button', { name: 'All cards, 2' }).click();
  await page.getByRole('button', { name: 'Card 1, opened, flagged' }).click();
  const nextButton = page.getByRole('button', { name: 'Next' });
  await nextButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Card 2 of 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Card 2 of 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('Card 1 of 2')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Card 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Save and exit deck' }).click();
  await expect(page.getByRole('button', { name: /^Resume deck/ })).toBeVisible();
  await expect(page.getByText('2/2 reviewed')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Topic' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await expect(page.getByRole('region', { name: 'Continue Studying' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await expect(page.getByText('2/2 reviewed')).toBeVisible();
  await page.getByRole('button', { name: /^Resume deck/ }).click();
  await expect(page.getByText('What is the terminal nerve of the posterior cord?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Card 1, opened, flagged' })).toBeVisible();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await expect(page.getByText('The axillary nerve, n. axillaris.')).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByText('Completed 1 time')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Completed 1 time')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await expect(page.getByText('Completed 1 time')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Study deck/ })).toBeVisible();
  await page.getByRole('button', { name: /^Study deck/ }).click();
  await page.getByRole('button', { name: 'Card 2, unopened' }).click();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByText('Completed 2 times')).toBeVisible();
  await page.getByRole('button', { name: /^Study deck/ }).click();
  await page.getByRole('button', { name: 'Card 2, unopened' }).click();
  await page.getByRole('button', { name: 'Save and exit deck' }).click();
  await expect(page.getByText('Completed 2 times')).toBeVisible();
  await expect(page.getByText('0/2 reviewed')).toBeVisible();
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page.getByRole('region', { name: 'Continue Studying' })).toBeVisible();
  await expect(page.getByText('Completed', { exact: true })).toBeVisible();
  await expect(page.getByText('Average', { exact: true })).toBeVisible();
  await expect(page.getByText('Highest', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Completed', exact: true }).getByText('2', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Average flashcard deck finishes per day' }).getByText('2', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('group', { name: 'Highest flashcard deck finishes in a day' }).getByText('2', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/score|completed quizzes/i)).toHaveCount(0);
});

test('API-backed quiz survives reload and completes', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await expect(page.getByRole('heading', { name: 'Browser Test Subject' })).toBeVisible();
  await expect(page.getByText('2 questions')).toBeVisible();

  await page.getByRole('button', { name: /^Start quiz/ }).click();
  const firstQuizStart = Date.now();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await showQuestion(page, /What is/);
  await expect(page.locator('.katex')).toBeVisible();
  const questionFlag = page.getByRole('button', { name: 'Flag question' });
  const questionFlagBackground = await questionFlag.evaluate((element) => getComputedStyle(element).backgroundColor);
  await questionFlag.hover();
  await expect(questionFlag).toHaveCSS('background-color', questionFlagBackground);
  await expect(questionFlag.locator('.MuiTouchRipple-root')).toHaveCount(0);
  const firstParagraph = page.locator('h5').filter({ hasText: 'What is' }).first();
  const secondParagraph = page.getByRole('heading', { name: 'Additional context for the question.' });
  const stemList = page.getByRole('list');
  await expect(firstParagraph).toBeVisible();
  await expect(secondParagraph).toBeVisible();
  await expect(stemList).toBeVisible();
  expect((await secondParagraph.boundingBox())!.y).toBeGreaterThan((await firstParagraph.boundingBox())!.y);
  expect((await stemList.boundingBox())!.y).toBeGreaterThan((await secondParagraph.boundingBox())!.y);
  const firstQuizMs = Date.now() - firstQuizStart;
  await testInfo.attach('main-quiz-desktop.png', {
    body: await page.screenshot({ path: testInfo.outputPath('main-quiz-desktop.png') }),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(secondParagraph).toBeVisible();
  await expect(page.locator('#root')).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.MuiDrawer-modal')).not.toBeVisible();
  const mobileParagraphPositions = await page
    .locator('h5')
    .evaluateAll((headings) =>
      headings.map((heading) => ({ text: heading.textContent, y: heading.getBoundingClientRect().y })),
    );
  const mobileFirstParagraphY = mobileParagraphPositions.find(({ text }) => text?.includes('What is'))?.y;
  const mobileSecondParagraphY = mobileParagraphPositions.find(({ text }) => text?.includes('Additional context'))?.y;
  expect(mobileFirstParagraphY).toBeDefined();
  expect(mobileSecondParagraphY).toBeDefined();
  expect(mobileSecondParagraphY).toBeGreaterThan(mobileFirstParagraphY!);
  await expectNoHorizontalOverflow(page);
  await testInfo.attach('main-quiz-mobile.png', {
    body: await page.screenshot({ path: testInfo.outputPath('main-quiz-mobile.png') }),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await testInfo.attach('first-quiz-ms.txt', {
    body: String(firstQuizMs),
    contentType: 'text/plain',
  });
  console.info(`First quiz screen after Begin Quiz: ${firstQuizMs} ms (local fixture and API)`);
  await page.getByRole('radio', { name: /Four/ }).check();
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  await questionFlag.focus();
  const position = page.getByText(/^Question \d of 2$/);
  const firstPosition = (await position.textContent()) === 'Question 1 of 2';
  await page.keyboard.press(firstPosition ? 'ArrowRight' : 'ArrowLeft');
  await expect(page.getByText('What is')).toBeHidden();
  await page.keyboard.press(firstPosition ? 'ArrowLeft' : 'ArrowRight');
  await expect(page.getByText('What is')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await page.getByRole('button', { name: /^Resume quiz/ }).click();
  await expect(page.getByText('What is')).toBeVisible();
  await expect(page.getByRole('radio', { name: /Four/ })).toBeChecked();
  await showQuestion(page, /Which choice names the heart/);
  await page.getByRole('radio', { name: /Heart/ }).check();
  const celebration = page.getByRole('status').filter({ hasText: 'Perfect Test!' });
  await expect(celebration).toBeVisible();
  await expect(page.getByText('The heart pumps blood.')).toBeVisible();
  await expect(celebration).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(Continue|Finish)$/ }).first()).toBeVisible();
  if (await page.getByRole('button', { name: 'Continue' }).isVisible())
    await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Finish' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByText('2 correct · 0 incorrect · 0 unanswered')).toBeVisible();
  await page.getByRole('button', { name: 'Back to quizzes' }).click();

  await expect(page.getByRole('button', { name: /^Retake quiz/ })).toBeVisible();
});

test('left navigation switches dashboards in collapsed and mobile layouts', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Meducation, go to Quizzes' })).toBeVisible();
  const edgeToggle = page.getByTestId('drawer-edge-toggle').first();
  const aside = page.getByLabel('Meducation navigation');
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'true');
  await edgeToggle.click({ position: { x: 6, y: 96 } });
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await aside.boundingBox())?.width).toBe(64);
  await edgeToggle.click({ position: { x: 6, y: 96 } });
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await aside.boundingBox())?.width).toBe(240);
  await edgeToggle.focus();
  await page.keyboard.press('Enter');
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'true');
  await edgeToggle.click({ position: { x: 6, y: 96 } });
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'false');
  await testInfo.attach('navigation-desktop-collapsed.png', {
    body: await page.screenshot({ path: testInfo.outputPath('navigation-desktop-collapsed.png') }),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('drawer-edge-toggle').first().click();
  const navigationDialog = page.getByRole('presentation').last();
  await expect(navigationDialog).toBeVisible();
  const overlayToggle = page.getByTestId('drawer-edge-toggle').last();
  await overlayToggle.click({ position: { x: 6, y: 12 } });
  await expect(navigationDialog).toBeHidden();
  await expect(page.getByTestId('drawer-edge-toggle').first()).toHaveAttribute('aria-expanded', 'false');
  await page.getByTestId('drawer-edge-toggle').first().click();
  const reopenedDialog = page.getByRole('presentation').last();
  await expect(reopenedDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(reopenedDialog).toBeHidden();
  await page.getByTestId('drawer-edge-toggle').first().click();
  const backdropDialog = page.getByRole('presentation').last();
  await expect(backdropDialog).toBeVisible();
  await page.mouse.click(380, 40);
  await expect(backdropDialog).toBeHidden();
  await page.getByTestId('drawer-edge-toggle').first().click();
  const screenshotDialog = page.getByRole('presentation').last();
  await expect(screenshotDialog).toBeVisible();
  await testInfo.attach('navigation-mobile-expanded.png', {
    body: await page.screenshot({ path: testInfo.outputPath('navigation-mobile-expanded.png') }),
    contentType: 'image/png',
  });
  await page.keyboard.press('Escape');
  await expect(screenshotDialog).toBeHidden();
  await expect(page.getByTestId('drawer-edge-toggle').first()).toBeFocused();
  await page.getByTestId('drawer-edge-toggle').first().click();
  await page.getByRole('button', { name: 'Flashcards' }).last().click();
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Flashcards' }).first()).toHaveAttribute('aria-current', 'page');
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await openTopicIfNeeded(page);
  await page.getByRole('button', { name: /^Start quiz/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await expect(page.getByText('Question 1 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await expect(page.getByRole('dialog', { name: 'Leave or Abort this Test?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await openTopicIfNeeded(page);
  await page.getByRole('button', { name: /^Resume quiz/ }).click();
  await expect(page.getByText('Question 1 of 2')).toBeVisible();
});

test('Exam Mode submission offers a one-time read-only review', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: /^Start quiz/ }).click();
  await page.getByRole('button', { name: 'Exam Mode' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await showQuestion(page, /What is/);
  await page.getByRole('radio', { name: /Five/ }).check();
  await page.getByRole('button', { name: 'Flag question' }).click();
  await showQuestion(page, /Which choice names the heart/);
  await page.getByRole('radio', { name: /Heart/ }).check();
  await expect(page.getByRole('button', { name: /^(Next|Submit)$/ }).first()).toBeVisible();
  if (await page.getByRole('button', { name: 'Next' }).isVisible())
    await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Submit' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByRole('button', { name: 'Review results' }).click();
  await expect(page.getByLabel(/Final time:/)).toBeVisible();
  await testInfo.attach('review-desktop.png', {
    body: await page.screenshot({ path: testInfo.outputPath('review-desktop.png') }),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await testInfo.attach('review-mobile.png', {
    body: await page.screenshot({ path: testInfo.outputPath('review-mobile.png') }),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole('button', { name: 'Wrong questions, 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Flagged questions, 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Wrong questions, 1' }).click();
  await expect(page.getByRole('button', { name: /^Question \d, answered incorrectly, flagged/ })).toBeVisible();
  await page.getByRole('button', { name: 'Flagged questions, 1' }).click();
  await expect(page.getByRole('button', { name: /^Question \d, answered incorrectly, flagged/ })).toBeVisible();
  await showQuestion(page, /What is/);
  await expect(page.getByText('Four is the sum of two and two.')).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Correct answer', exact: true })).toBeVisible();
  await showQuestion(page, 'Which choice names the heart?');
  await expect(page.getByText('The heart pumps blood.')).toBeVisible();
  await showQuestion(page, /What is/);
  await page.getByRole('button', { name: 'Leave review' }).click();
  const leaveDialog = page.getByRole('dialog', { name: 'Leave review?' });
  await expect(leaveDialog).toBeVisible();
  await leaveDialog.getByRole('button', { name: 'Keep reviewing', exact: true }).click();
  await expect(leaveDialog).toBeHidden();
  await expect(page.getByRole('heading', { name: /What is/ })).toBeVisible();
  await page.getByRole('button', { name: 'Leave review' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Retake quiz/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review results' })).toHaveCount(0);
});

test('failed catalog request recovers by keyboard Retry on a narrow reduced-motion screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let failures = 0;
  let releaseRetry!: () => void;
  const retryResponse = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  await page.route('**/api/v1/subjects', async (route) => {
    if (failures++ === 0)
      await route.fulfill({
        // Isolate keyboard Retry from the build's automatic retry policy.
        status: 400,
        contentType: 'application/json',
        body: '{"detail":"manual retry fixture"}',
      });
    else {
      await retryResponse;
      await route.continue();
    }
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('We can’t load your stats and subjects right now.');
  const retry = page.getByRole('button', { name: 'Retry' }).first();
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press('Enter');
  releaseRetry();
  await expect(page.getByRole('button', { name: 'Open Browser Test Subject' })).toBeVisible();
  expect(failures).toBe(2);
  await expectNoHorizontalOverflow(page);
});

test('subject quiz failure stays below the tabs with shimmer placeholders through recovery', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let failures = 0;
  let releaseRetry!: () => void;
  const retryResponse = new Promise<void>((resolve) => {
    releaseRetry = resolve;
  });
  await page.route(/\/api\/v1\/subjects\/[^/]+\/quizzes/, async (route) => {
    if (failures++ === 0)
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: '{"detail":"private backend detail"}',
      });
    else {
      await retryResponse;
      await route.continue();
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();

  const banner = page.getByTestId('content-recovery-banner');
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('alert')).toContainText('We can’t load quizzes for Browser Test Subject right now.');
  await expect(banner).not.toContainText('private backend detail');
  await expect(page.locator('.MuiSkeleton-wave').first()).toBeVisible();
  await expect(page.getByTestId('screen-transition')).toHaveCSS('top', '0px');
  const bounds = await page.evaluate(() => {
    const panel = document.querySelector('[role="tabpanel"]')!.getBoundingClientRect();
    const recovery = document.querySelector('[data-testid="content-recovery-banner"]')!.getBoundingClientRect();
    return {
      panelTop: panel.top,
      panelLeft: panel.left,
      panelRight: panel.right,
      top: recovery.top,
      left: recovery.left,
      right: recovery.right,
    };
  });
  expect(bounds.top).toBe(bounds.panelTop);
  expect(bounds.left).toBe(bounds.panelLeft);
  expect(bounds.right).toBe(bounds.panelRight);

  const retry = banner.getByRole('button', { name: 'Retry' });
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect(banner.getByRole('button', { name: 'Retrying...' })).toBeDisabled();
  releaseRetry();
  await openTopicIfNeeded(page);
  await expect(page.getByRole('button', { name: /^Start quiz/ })).toBeVisible();
  expect(failures).toBe(2);
  await expectNoHorizontalOverflow(page);
});

test('failed question loading shows a persistent bottom-right toast that can be closed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route(/\/api\/v1\/quizzes\/[^/]+\/questions/, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"detail":"private backend detail"}',
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await openTopicIfNeeded(page);
  await page.getByRole('button', { name: /^Start quiz/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();

  const toast = page.getByRole('alert');
  await expect(toast).toContainText('Unable to load questions');
  await expect(toast).toContainText('Browser Test Quiz');
  await expect(toast).not.toContainText('private backend detail');
  await expect(page.getByRole('button', { name: /^Start quiz/ })).toBeEnabled();
  const box = await toast.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeGreaterThan(370);
  expect(box!.y + box!.height).toBeGreaterThan(800);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(toast).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await openTopicIfNeeded(page);
  await page.getByRole('button', { name: /^Start quiz/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('pending catalog stays accessible and static with reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/subjects', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/');
  const loading = page.getByRole('status', { name: 'Loading subjects' });
  await expect(loading).toBeVisible();
  await expect(loading).toHaveAttribute('aria-busy', 'true');
  release();
  await expect(page.getByRole('button', { name: 'Open Browser Test Subject' })).toBeVisible();
  await expect(loading).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await openTopicIfNeeded(page);
  await page.getByRole('button', { name: /^Start quiz/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await showQuestion(page, /What is/);
  await expect(page.locator('.katex')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('nginx learner image hides the editor and sends security headers', async ({ request }) => {
  const origin = process.env.MEDUCATION_E2E_NGINX_URL;
  test.skip(!origin, 'Set MEDUCATION_E2E_NGINX_URL to a running learner image');
  expect((await request.get(`${origin}/admin.html`)).status()).toBe(404);
  const headers = (await request.get(`${origin}/`)).headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
});

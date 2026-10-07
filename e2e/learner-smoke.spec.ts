import { expect, test } from '@playwright/test';

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
  await page.getByRole('button', { name: 'Study deck' }).click();
  await requestedPromise;
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  release();
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('meducation.flashcards.progress.v2'))).toBeNull();
  await page.unroute('**/api/v1/flashcards/decks/d-browser/cards*');
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: 'Study deck' }).click();
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
  await page.getByRole('button', { name: 'Study deck' }).click();
  await started;
  await expect(page.getByRole('progressbar', { name: 'Loading flashcard deck' })).toBeVisible();
  releaseFailure();
  await expect(page.getByRole('progressbar', { name: 'Loading flashcard deck' })).toHaveCount(0);
  await expect(page.getByRole('alert')).toContainText('Unable to load deck');
  await expect(page.getByRole('heading', { name: 'Browser Test Subject' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Browser Test Deck' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('meducation.flashcards.progress.v2'))).toBeNull();
  await page.unroute('**/api/v1/flashcards/decks/d-browser/cards*');
  const retry = page.getByRole('button', { name: 'Study deck', exact: true });
  await retry.focus();
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
  await expect(page.getByRole('button', { name: 'Study deck' })).toBeVisible();
  const studyButton = page.getByRole('button', { name: 'Study deck' });
  await studyButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Card 1 of 2')).toBeVisible();
  await expect(page.locator('.katex')).toHaveCount(2);
  const cardFlag = page.getByRole('button', { name: 'Flag card' });
  const cardFlagBackground = await cardFlag.evaluate((element) => getComputedStyle(element).backgroundColor);
  await cardFlag.hover();
  await expect(cardFlag).toHaveCSS('background-color', cardFlagBackground);
  await expect(cardFlag.locator('.MuiTouchRipple-root')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
  const studyScreenshot = testInfo.outputPath('flashcard-study-mobile.png');
  await page.screenshot({ path: studyScreenshot });
  await testInfo.attach('flashcard-study-mobile.png', { path: studyScreenshot, contentType: 'image/png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Card 2, unopened' }).click();
  await expect(page.getByText('Card 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Card 1, unopened' }).click();
  await page.getByRole('heading', { name: /What forms the brachial plexus/ }).click();
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await expect(page.getByText('Card 2 of 2')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('The axillary nerve, n. axillaris.')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.getByText('Card 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Card 1, opened' }).click();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await page.getByRole('group', { name: 'Answer revealed. Click to hide or press Space to continue.' }).click();
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
  await expect(page.getByRole('button', { name: 'Finish deck' })).toBeFocused();
  await page.getByRole('button', { name: 'Save and exit deck' }).click();
  await expect(page.getByRole('button', { name: 'Resume deck' })).toBeVisible();
  await expect(page.getByText('Card 2 of 2')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Topic' })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await expect(page.getByRole('heading', { name: 'Continue Studying' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await expect(page.getByText('Card 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Resume deck' }).click();
  await expect(page.getByText('What is the terminal nerve of the posterior cord?')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Card 1, opened, flagged' })).toBeVisible();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await expect(page.getByText('The axillary nerve, n. axillaris.')).toBeVisible();
  await page.getByRole('button', { name: 'Finish deck' }).click();
  await expect(page.getByText('Completed 1 time')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Completed 1 time')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.reload();
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await expect(page.getByText('Completed 1 time')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Study deck' })).toBeVisible();
  await page.getByRole('button', { name: 'Study deck' }).click();
  await page.getByRole('button', { name: 'Card 2, unopened' }).click();
  await page.getByRole('button', { name: 'Finish deck' }).click();
  await expect(page.getByText('Completed 2 times')).toBeVisible();
  await page.getByRole('button', { name: 'Study deck' }).click();
  await page.getByRole('button', { name: 'Card 2, unopened' }).click();
  await page.getByRole('button', { name: 'Save and exit deck' }).click();
  await expect(page.getByText('Completed 2 times')).toBeVisible();
  await expect(page.getByText('Card 2 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'All subjects' }).click();
  await expect(page.getByRole('heading', { name: 'Continue Studying' })).toBeVisible();
  await expect(page.getByText('Completed decks')).toBeVisible();
  await expect(page.getByText('Average')).toBeVisible();
  await expect(page.getByText('Highest')).toBeVisible();
  const dashboardStats = page.locator('.MuiCard-root');
  await expect(dashboardStats.filter({ hasText: 'Completed decks' }).getByText('2', { exact: true })).toBeVisible();
  await expect(dashboardStats.filter({ hasText: 'Average' }).getByText('2.0', { exact: true })).toBeVisible();
  await expect(dashboardStats.filter({ hasText: 'Highest' }).getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByText(/score|completed quizzes/i)).toHaveCount(0);
});

test('API-backed quiz survives reload, completes, and opens Browse Answers', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await expect(page.getByRole('heading', { name: 'Browser Test Subject' })).toBeVisible();
  await expect(page.getByText('2 questions')).toBeVisible();

  await page.getByRole('button', { name: 'Start quiz' }).click();
  const firstQuizStart = Date.now();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await expect(page.getByText('What is')).toBeVisible();
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
  expect((await secondParagraph.boundingBox())!.y).toBeGreaterThan((await firstParagraph.boundingBox())!.y);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
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
  await page.getByRole('radio', { name: /A\. Four/ }).check();
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await page.getByRole('button', { name: 'Resume quiz' }).click();
  await expect(page.getByText('Question 1 of 2')).toBeVisible();
  await expect(page.getByRole('radio', { name: /A\. Four/ })).toBeChecked();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: /B\. Heart/ }).check();
  await page.getByRole('button', { name: 'Finish' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByText('2 correct · 0 incorrect · 0 unanswered')).toBeVisible();
  await page.getByRole('button', { name: 'Back to quizzes' }).click();

  await page.getByRole('button', { name: 'Retake quiz' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Browse Answers' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Open quiz' }).click();
  await expect(page.getByText('Four is the sum of two and two.')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await testInfo.attach('browse-desktop.png', {
    body: await page.screenshot({ path: testInfo.outputPath('browse-desktop.png') }),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await testInfo.attach('browse-mobile.png', {
    body: await page.screenshot({ path: testInfo.outputPath('browse-mobile.png') }),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Retake quiz' })).toBeVisible();
});

test('left navigation switches dashboards in collapsed and mobile layouts', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  const brand = page.getByRole('button', { name: 'Meducation, go to Quizzes' });
  await expect(brand).toBeVisible();
  const quizzesButton = page.getByRole('button', { name: 'Quizzes', exact: true });
  const quizzesTopExpanded = (await quizzesButton.boundingBox())!.y;
  const separator = page.getByTestId('drawer-brand-separator');
  const brandBounds = (await brand.boundingBox())!;
  const expandedSeparatorBounds = (await separator.boundingBox())!;
  expect(expandedSeparatorBounds.y + expandedSeparatorBounds.height / 2).toBeCloseTo(
    (brandBounds.y + brandBounds.height + quizzesTopExpanded) / 2,
  );
  const brandRadius = await brand.evaluate((element) => getComputedStyle(element).borderRadius);
  expect(await quizzesButton.evaluate((element) => getComputedStyle(element).borderRadius)).toBe(brandRadius);
  const edgeToggle = page.getByTestId('drawer-edge-toggle').first();
  const arrow = edgeToggle.locator('.drawer-edge-toggle-arrow');
  const orientation = async () =>
    arrow.evaluate((element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return { a: matrix.a, d: matrix.d };
    });
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(orientation).toEqual({ a: 1, d: 1 });
  const hoverEdge = async (y: number) => {
    const bounds = (await edgeToggle.boundingBox())!;
    await edgeToggle.hover({ position: { x: bounds.width / 2, y } });
    await expect
      .poll(() => edgeToggle.evaluate((element) => getComputedStyle(element, '::before').opacity))
      .toBe('0.55');
  };
  await hoverEdge(12);
  const edgeBounds = (await edgeToggle.boundingBox())!;
  await hoverEdge(edgeBounds.height - 12);
  await page.mouse.move(300, 300);
  await expect.poll(() => edgeToggle.evaluate((element) => getComputedStyle(element, '::before').opacity)).toBe('0');
  const noHoverChange = async (button: typeof brand) => {
    const before = await button.evaluate((element) => getComputedStyle(element).backgroundColor);
    await button.hover();
    const after = await button.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(after).toBe(before);
  };
  await noHoverChange(brand);
  await noHoverChange(edgeToggle);
  await noHoverChange(quizzesButton);
  await edgeToggle.click({ position: { x: 6, y: 96 } });
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(orientation).toEqual({ a: -1, d: -1 });
  const aside = page.getByLabel('Meducation navigation');
  await expect.poll(async () => (await aside.boundingBox())?.width).toBe(64);
  expect((await quizzesButton.boundingBox())!.y).toBe(quizzesTopExpanded);
  const collapsedSeparatorBounds = (await separator.boundingBox())!;
  expect(collapsedSeparatorBounds.y + collapsedSeparatorBounds.height / 2).toBeCloseTo(
    (brandBounds.y + brandBounds.height + quizzesTopExpanded) / 2,
  );
  expect(collapsedSeparatorBounds.width).toBeLessThan(expandedSeparatorBounds.width);
  expect(await quizzesButton.evaluate((element) => getComputedStyle(element).borderRadius)).toBe(brandRadius);
  await noHoverChange(brand);
  await noHoverChange(quizzesButton);
  await noHoverChange(edgeToggle);
  await edgeToggle.click({ position: { x: 6, y: 12 } });
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(async () => (await aside.boundingBox())?.width).toBe(240);
  await edgeToggle.click({ position: { x: 6, y: edgeBounds.height - 12 } });
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await aside.boundingBox())?.width).toBe(64);
  await expect.poll(orientation).toEqual({ a: -1, d: -1 });
  await edgeToggle.focus();
  await page.keyboard.press('Enter');
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Space');
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'false');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await edgeToggle.click({ position: { x: 6, y: 96 } });
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(orientation).toEqual({ a: 1, d: 1 });
  expect(await arrow.evaluate((element) => getComputedStyle(element).transitionProperty)).toBe('none');
  await edgeToggle.click({ position: { x: 6, y: 96 } });
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'false');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
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
  const mobileDrawer = page.locator('.MuiDrawer-paper').last();
  await expect(mobileDrawer).toHaveCSS('width', '240px');
  await expect.poll(async () => (await mobileDrawer.boundingBox())?.x).toBe(0);
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
  await expect.poll(async () => (await page.locator('.MuiDrawer-paper').last().boundingBox())?.x).toBe(0);
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
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await expect(page.getByText('Question 1 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await expect(page.getByRole('dialog', { name: 'Leave or Abort this Test?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await page.getByRole('button', { name: 'Resume quiz' }).click();
  await expect(page.getByText('Question 1 of 2')).toBeVisible();
});

test('Exam Mode submission offers a one-time read-only review', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await page.getByRole('button', { name: 'Exam Mode' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await page.getByRole('radio', { name: /B\. Five/ }).check();
  await page.getByRole('button', { name: 'Flag question' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: /B\. Heart/ }).check();
  await page.getByRole('button', { name: 'Submit' }).click();
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
  await expect(
    page.getByRole('button', { name: 'Question 1, answered incorrectly, flagged, current question' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Flagged questions, 1' }).click();
  await expect(
    page.getByRole('button', { name: 'Question 1, answered incorrectly, flagged, current question' }),
  ).toBeVisible();
  await expect(page.getByRole('listitem', { name: 'Correct answer', exact: true })).toBeVisible();
  await expect(page.getByText('Four is the sum of two and two.')).toBeVisible();
  await page.getByRole('button', { name: 'Leave review' }).click();
  await expect(page.getByRole('dialog', { name: 'Leave review?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep reviewing', exact: true }).last().click();
  await expect(page.getByText('What is')).toBeVisible();
  await page.getByRole('button', { name: 'Leave review' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retake quiz' })).toBeVisible();
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
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"temporary"}',
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
  await expect(page.getByRole('button', { name: 'Retrying...' })).toBeDisabled();
  releaseRetry();
  await expect(page.getByRole('button', { name: 'Open Browser Test Subject' })).toBeVisible();
  expect(failures).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('subject quiz failure keeps the full-width banner and original shimmer placeholders through recovery', async ({
  page,
}) => {
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
  await expect(page.locator('.MuiSkeleton-wave')).toHaveCount(4);
  await page.waitForTimeout(200);
  const bounds = await page.evaluate(() => {
    const main = document.querySelector('main')!.getBoundingClientRect();
    const recovery = document.querySelector('[data-testid="content-recovery-banner"]')!.getBoundingClientRect();
    return {
      mainTop: main.top,
      mainLeft: main.left,
      mainRight: main.right,
      top: recovery.top,
      left: recovery.left,
      right: recovery.right,
    };
  });
  expect(bounds.top).toBe(bounds.mainTop);
  expect(bounds.left).toBe(bounds.mainLeft);
  expect(bounds.right).toBe(bounds.mainRight);

  const retry = banner.getByRole('button', { name: 'Retry' });
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect(banner.getByRole('button', { name: 'Retrying...' })).toBeDisabled();
  releaseRetry();
  await expect(page.getByRole('button', { name: 'Start quiz' })).toBeVisible();
  expect(failures).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
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
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();

  const toast = page.getByRole('alert');
  await expect(toast).toContainText('Unable to load questions');
  await expect(toast).toContainText('Browser Test Quiz');
  await expect(toast).not.toContainText('private backend detail');
  await expect(page.getByRole('button', { name: 'Start quiz' })).toBeEnabled();
  const box = await toast.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeGreaterThan(370);
  expect(box!.y + box!.height).toBeGreaterThan(800);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'All subjects' }).click();
  await expect(toast).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: 'Start quiz' }).click();
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
  const skeleton = loading.locator('.MuiSkeleton-root').first();
  await expect(skeleton).toBeVisible();
  expect(await skeleton.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  release();
  await expect(page.getByRole('button', { name: 'Open Browser Test Subject' })).toBeVisible();
  await expect(loading).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Browse Answers' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Open quiz' }).click();
  await expect(page.locator('.katex')).toBeVisible();
  expect(
    await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].some((font) => font.family.includes('KaTeX_Main') && font.status === 'loaded');
    }),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('records first-quiz latency from the production build under throttled network', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(60_000);
  const devtools = await context.newCDPSession(page);
  await devtools.send('Network.enable');
  await devtools.send('Network.emulateNetworkConditionsByRule', {
    matchedNetworkConditions: [
      { urlPattern: '', latency: 150, downloadThroughput: 200_000, uploadThroughput: 200_000 },
    ],
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: 'Start quiz' }).click();
  const started = Date.now();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await expect(page.getByText('What is')).toBeVisible();
  const durationMs = Date.now() - started;
  await testInfo.attach('throttled-first-quiz-ms.txt', { body: String(durationMs), contentType: 'text/plain' });
  console.info(`First quiz screen after Begin Quiz: ${durationMs} ms (production build, 150 ms latency, 200 kB/s)`);
});

import { expect, test } from '@playwright/test';
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

test('flashcards browse, resume an imported fixture deck, and finish without quiz analytics', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 7, 12) });
  await page.goto('/');
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await expect(page.getByRole('heading', { name: 'Browser Test Subject', exact: true })).toBeVisible();
  await expect(page.getByText('2 cards')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Topic' })).toHaveCount(0);
  const studyButton = page.getByRole('button', { name: /^Study deck/ });
  await studyButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Card 1 of 2')).toBeVisible();
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

test('API-backed quiz survives reload and completes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await expect(page.getByRole('heading', { name: 'Browser Test Subject', exact: true })).toBeVisible();
  await expect(page.getByText('2 questions').first()).toBeVisible();

  await page.getByRole('button', { name: /^Start quiz: (?!.*Subject Test)/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await showQuestion(page, /What is/);
  await expect(page.locator('.katex')).toBeVisible();
  const questionFlag = page.getByRole('button', { name: 'Flag question' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#root')).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.MuiDrawer-modal')).not.toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.setViewportSize({ width: 1280, height: 720 });
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

  await expect(page.getByRole('button', { name: /^Retake quiz: (?!.*Subject Test)/ })).toBeVisible();
});

test('addresses follow navigation and work with reload, Back, Forward and links', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await expect(page).toHaveURL(/^[^?#]*\/quizzes\/[^/]+$/);
  await expect(page).toHaveTitle('Browser Test Subject quizzes | Meducation');
  const subjectUrl = page.url();
  await page.goBack();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Browser Test Subject', exact: true })).toBeVisible();

  await page.getByRole('button', { name: /^Start quiz: (?!.*Subject Test)/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await expect(page.getByText(/^Question 1 of 2$/)).toBeVisible();
  expect(page.url().startsWith(`${subjectUrl}/`)).toBe(true);
  await page.goBack();
  const exit = page.getByRole('dialog');
  await expect(exit).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText(/^Question 1 of 2$/)).toBeVisible();
  await page.goBack();
  await exit.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page).toHaveURL(subjectUrl);
  await expect(page.getByRole('button', { name: /^Resume quiz: (?!.*Subject Test)/ })).toBeVisible();

  await page.getByRole('tab', { name: 'Flashcards', exact: true }).click();
  await page.getByRole('button', { name: /^Study deck/ }).click();
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
  await expect(page).toHaveURL(/\/flashcards\/[^/]+\/[^/]+$/);
  const deckUrl = page.url();
  await page.goto('/');
  await page.goto(deckUrl);
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
  // A link to a deck leaves its subject page behind it.
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Browser Test Subject', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/flashcards\/[^/]+$/);
  await page.goForward();
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
  // Forward into a deck adds no second subject entry.
  await page.goBack();
  await expect(page).toHaveURL(/\/flashcards\/[^/]+$/);
  await page.goBack();
  await expect(page).toHaveURL('/');

  // On a phone, the open topic adds no extra Back step after studying.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.getByRole('button', { name: 'Expand navigation' }).click();
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await openTopicIfNeeded(page);
  await page.getByRole('button', { name: /^Resume deck/ }).click();
  await expect(page.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/flashcards\/[^/]+$/);
  await page.goBack();
  await expect(page).toHaveURL('/flashcards');
  await page.goto('/quizzes/missing-subject');
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
});

test('navigating right after leaving a deck lands on the chosen page when Back is slow', async ({ page }) => {
  // A slow device finishes the Back step that leaving a deck takes after the next click.
  await page.addInitScript(() => {
    const back = History.prototype.back;
    History.prototype.back = function () {
      setTimeout(() => back.call(this), 500);
    };
  });
  await page.goto('/flashcards');
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await page.getByRole('button', { name: /^Study deck/ }).click();
  await page.getByRole('button', { name: 'Save and exit deck' }).click();
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await page.waitForTimeout(1_000);
  await expect(page.getByRole('region', { name: 'Continue Studying' })).toBeVisible();
  await expect(page).toHaveURL('/flashcards');
});

test('left navigation switches dashboards in collapsed and mobile layouts', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Meducation, go to Quizzes' })).toBeVisible();
  const edgeToggle = page.getByTestId('drawer-edge-toggle').first();
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'true');
  await edgeToggle.click({ position: { x: 6, y: 96 } });
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'false');
  await edgeToggle.click({ position: { x: 6, y: 96 } });
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'true');
  await edgeToggle.focus();
  await page.keyboard.press('Enter');
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'true');
  await edgeToggle.click({ position: { x: 6, y: 96 } });
  await expect(edgeToggle).toHaveAttribute('aria-expanded', 'false');
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
  const dialog = page.getByRole('presentation').last();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('drawer-edge-toggle').first()).toBeFocused();
  await page.getByTestId('drawer-edge-toggle').first().click();
  await page.getByRole('button', { name: 'Flashcards' }).last().click();
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Flashcards' }).first()).toHaveAttribute('aria-current', 'page');
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await openTopicIfNeeded(page);
  await page.getByRole('button', { name: /^Start quiz: (?!.*Subject Test)/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await expect(page.getByText('Question 1 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await expect(page.getByRole('dialog', { name: 'Leave or Abort this Test?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await openTopicIfNeeded(page);
  await page.getByRole('button', { name: /^Resume quiz: (?!.*Subject Test)/ }).click();
  await expect(page.getByText('Question 1 of 2')).toBeVisible();
});

test('Exam Mode submission offers a one-time read-only review', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: /^Start quiz: (?!.*Subject Test)/ }).click();
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
  await expect(page.getByRole('button', { name: /^Retake quiz: (?!.*Subject Test)/ })).toBeVisible();
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

test('failed question loading shows a toast that clears on navigation and reload', async ({ page }) => {
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
  await page.getByRole('button', { name: /^Start quiz: (?!.*Subject Test)/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();

  const toast = page.getByRole('alert');
  await expect(toast).toContainText('Unable to load questions');
  await expect(toast).toContainText('Browser Test Quiz');
  await expect(toast).not.toContainText('private backend detail');
  await expect(page.getByRole('button', { name: /^Start quiz: (?!.*Subject Test)/ })).toBeEnabled();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(toast).toHaveCount(0);
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await openTopicIfNeeded(page);
  await page.getByRole('button', { name: /^Start quiz: (?!.*Subject Test)/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a Subject Test resumes from its address and a Mixed Test starts from the dashboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
  await page.getByRole('button', { name: 'Subject Test', exact: true }).click();
  await page.getByRole('button', { name: 'Start quiz: Browser Test Subject Subject Test' }).click();
  const setup = page.getByRole('dialog');
  await expect(setup.getByRole('button', { name: 'Browse Answers' })).toHaveCount(0);
  await setup.getByRole('button', { name: 'Begin Quiz' }).click();
  await expect(page).toHaveURL(/\/quizzes\/s1\/test$/);
  await expect(page.getByText(/^Question 1 of 2$/)).toBeVisible();
  await page.getByRole('radio').first().check();

  await page.reload();
  await expect(page.getByText(/^Question 1 of 2$/)).toBeVisible();
  await page.goBack();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume quiz: Browser Test Subject Subject Test' })).toBeVisible();
  await page.goto('/quizzes/s1/test');
  await expect(page.getByText(/^Question 1 of 2$/)).toBeVisible();

  await page.getByRole('button', { name: 'Finish' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByRole('button', { name: 'Review results' }).click();
  await expect(page.getByText(/^Question 1 of 2$/)).toBeVisible();

  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Completed quizzes' })).toContainText('1');
  await page.getByRole('button', { name: 'Start quiz: Mixed Test' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await expect(page).toHaveURL(/\/quizzes\/mixed-test$/);
  await expect(page.getByText(/^Question 1 of 2$/)).toBeVisible();
});

import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { expectNoHorizontalOverflow } from './support/learner';

const heroTitle = 'Practice for your medical boards';

async function enterSection(page: Page, name: string) {
  await page.getByRole('region', { name, exact: true }).evaluate(async (element) => {
    element.scrollIntoView({ block: 'start' });
    // Let the scroll event and React update which sample owns the shortcuts.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

test('the reveal hint opens on hover and click without flipping the card', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const hint = page.getByRole('button', { name: 'Hint for Reveal the answer' });
  const tooltip = page.getByRole('tooltip');
  await hint.hover();
  await expect(tooltip).toHaveText('Click the card or press Space to reveal the answer');
  await page.keyboard.press('Escape');
  await expect(tooltip).toBeHidden();
  await hint.click();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press('Space');
  await expect(
    page.getByRole('region', { name: 'Sample Flashcards' }).getByRole('button', { name: 'Reveal answer' }),
  ).toBeVisible();
  await page.getByRole('heading', { name: 'High-yield Flashcards', exact: true }).click();
  await expect(tooltip).toBeHidden();
});

test("scrolling activates only the current sample's shortcuts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const quiz = page.getByRole('region', { name: 'Sample Quizzes' });
  const flashcards = page.getByRole('region', { name: 'Sample Flashcards' });
  await enterSection(page, 'Board-style Questions');
  await page.keyboard.press('3');
  await expect(quiz.getByText('Correct', { exact: true })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(quiz.getByRole('button', { name: 'Case 2, unanswered, current case' })).toBeVisible();
  await expect(flashcards.getByRole('button', { name: 'Card 1, unopened, current card' })).toBeVisible();

  await enterSection(page, 'High-yield Flashcards');
  await page.keyboard.press('4');
  await expect(quiz.getByRole('button', { name: 'Case 2, unanswered, current case' })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(flashcards.getByRole('group', { name: /Answer revealed/ })).toBeVisible();
  await page.keyboard.press('Space');
  await expect(flashcards.getByRole('button', { name: 'Card 2, unopened, current card' })).toBeVisible();

  await enterSection(page, 'Twelve Subjects');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('4');
  await expect(quiz.getByRole('button', { name: 'Case 2, unanswered, current case' })).toBeVisible();
  await expect(flashcards.getByRole('button', { name: 'Card 2, unopened, current card' })).toBeVisible();
  await expect(flashcards.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
});

test('header and hero links jump to the quiz, flashcard and subject sections', async ({ page }) => {
  await page.goto('/');
  const links = page.getByRole('banner').getByRole('navigation', { name: 'Sections' });
  for (const [label, heading, hash] of [
    ['Quizzes', 'Board-style Questions', 'quizzes'],
    ['Flashcards', 'High-yield Flashcards', 'flashcards'],
    ['Subjects', 'Twelve Subjects', 'subjects'],
  ]) {
    await links.getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeInViewport();
    await expect(page).toHaveURL(new RegExp(`#${hash}$`));
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('link', { name: 'Try a question' }).click();
  await expect(page).toHaveURL(/#quizzes$/);
});

test('a slow start keeps the pressed button busy until the app opens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/subjects', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto('/');
  const hero = page.getByRole('region', { name: heroTitle });
  const start = hero.getByRole('button', { name: 'Start studying' });
  await start.click();
  await expect(start).toBeDisabled();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Start studying' })).toBeEnabled();
  release();
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
});

test('flashcard steps track revealing and navigating independently', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const steps = page.getByRole('list', { name: 'How flashcards work' }).getByRole('listitem');
  const sample = page.getByRole('region', { name: 'Sample Flashcards' });
  await expect(sample.getByText('What is the classic murmur of patent ductus arteriosus?')).toBeVisible();
  await expect(steps.filter({ hasText: '(done)' })).toHaveCount(0);

  const cards = sample.getByRole('navigation', { name: 'Cards' }).getByRole('button');
  await expect(cards).toHaveCount(3);
  await cards.nth(0).click();
  await expect(steps.nth(2)).not.toContainText('(done)');
  await cards.nth(2).click();
  await expect(sample.getByText('Doctrine of last clear chance.')).toBeVisible();
  await expect(steps.nth(2)).toContainText('See the next card (done)');
  await expect(steps.nth(1)).not.toContainText('(done)');
  await expect(steps.nth(0)).not.toContainText('(done)');
  await sample.getByRole('button', { name: 'Reveal answer' }).click();
  await expect(steps.nth(0)).toContainText('Read the question (done)');
  await expect(steps.nth(1)).toContainText('Reveal the answer (done)');
  await cards.nth(1).click();
  await expect(steps.filter({ hasText: '(done)' })).toHaveCount(3);
});

test('on phones the header offers Start studying only while the page buttons are out of view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const headerCta = page.getByRole('banner').getByRole('button', { name: 'Start studying' });
  await expect(headerCta).toBeHidden();
  await page.getByRole('heading', { name: 'High-yield Flashcards' }).scrollIntoViewIfNeeded();
  await expect(headerCta).toBeVisible();
  await page.getByRole('button', { name: 'Start studying' }).last().scrollIntoViewIfNeeded();
  await expect(headerCta).toBeHidden();
  await page.getByRole('heading', { name: 'Twelve Subjects' }).scrollIntoViewIfNeeded();
  await headerCta.click();
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
});

test('a first visit shows the landing page until the visitor starts studying', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: heroTitle })).toBeVisible();
  for (const width of [320, 390, 1048, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalOverflow(page);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole('heading', { name: 'Sample Quizzes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sample Flashcards' })).toBeVisible();
  const steps = page.getByRole('list', { name: 'How it works' });
  await expect(steps).toContainText('Read the explanation');
  await expect(steps).toContainText('Celebrate your progress');

  await enterSection(page, 'Board-style Questions');
  await page.getByRole('radio').first().focus();
  await page.keyboard.press('3');
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Case 1, correct, current case' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'How it works' })).toContainText('Choose an answer (done)');
  await expect(steps.getByRole('listitem').first()).not.toContainText('1');
  await expect(steps.getByRole('listitem').nth(1)).toContainText('2');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Case 2, unanswered, current case' })).toBeVisible();

  await enterSection(page, 'High-yield Flashcards');
  const reveal = page.getByRole('button', { name: 'Reveal answer' });
  await reveal.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('group', { name: /Answer revealed/ })).toContainText('machinery-like murmur');
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Card 2, unopened, current card' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Card 3, unopened, current card' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Case 2, unanswered, current case' })).toBeVisible();

  await page.getByRole('banner').getByRole('button', { name: 'Start studying' }).click();
  await expect(page.getByRole('heading', { level: 1, name: heroTitle })).toHaveCount(0);
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: heroTitle })).toHaveCount(0);
});

test('About opens from both dashboards and preserves saved progress through browser navigation', async ({ page }) => {
  const progress = JSON.parse(await readFile('tests/fixtures/progress-backups/populated-v1.json', 'utf8'));
  await page.goto('/');
  await page.evaluate(({ quiz, flashcards }) => {
    localStorage.setItem('meducation.started.v1', '1');
    localStorage.setItem(
      'meducation.progress.v2',
      JSON.stringify({ ...quiz, revision: '00000000-0000-4000-8000-000000000001' }),
    );
    localStorage.setItem(
      'meducation.flashcards.progress.v2',
      JSON.stringify({ ...flashcards, revision: '00000000-0000-4000-8000-000000000002' }),
    );
  }, progress);
  await page.reload();
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
  const storedProgress = () =>
    page.evaluate(() => ({
      started: localStorage.getItem('meducation.started.v1'),
      quiz: localStorage.getItem('meducation.progress.v2'),
      flashcards: localStorage.getItem('meducation.flashcards.progress.v2'),
    }));
  const before = await storedProgress();
  const about = page.locator('footer').getByRole('link', { name: 'About', exact: true });
  const landing = page.getByRole('heading', { level: 1, name: heroTitle });
  await expect(about).toHaveAttribute('href', '/?about=1');
  await about.click();
  await expect(landing).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await about.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/?about=1');
  await expect(landing).toBeVisible();
  await expect(about).toHaveCount(0);
  expect(await storedProgress()).toEqual(before);
  await page.goBack();
  await expect(page).toHaveURL('/flashcards');
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
  await page.goForward();
  await expect(landing).toBeVisible();
  await page.reload();
  await expect(landing).toBeVisible();
  await page.getByRole('banner').getByRole('button', { name: 'Start studying' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('button', { name: 'Quizzes', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
  expect(await storedProgress()).toEqual(before);
  // Start studying replaces About rather than leaving it as a redundant Back destination.
  await page.goBack();
  await expect(page).toHaveURL('/flashcards');
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
});

test('a link into the app opens it without the landing page', async ({ page }) => {
  await page.goto('/flashcards');
  await expect(page.getByRole('button', { name: 'Flashcards', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: heroTitle })).toHaveCount(0);
});

test('a direct About visit saves nothing until Start studying', async ({ page }) => {
  await page.goto('/?about=1');
  await expect(page.getByRole('heading', { level: 1, name: heroTitle })).toBeVisible();
  await expect(page.locator('footer').getByRole('link', { name: 'About', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Start studying' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole('banner').getByRole('button', { name: 'Start studying' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('meducation.started.v1'))).toBe('1');
});

test('a visitor with saved progress opens the dashboard directly', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('meducation.flashcards.progress.v2', '{}'));
  await page.goto('/');
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: heroTitle })).toHaveCount(0);
});

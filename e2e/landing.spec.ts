import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

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

for (const width of [390, 1440]) {
  test(`scrolling activates only the current sample's shortcuts at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const quiz = page.getByRole('region', { name: 'Sample Quizzes' });
    const flashcards = page.getByRole('region', { name: 'Sample Flashcards' });
    await enterSection(page, 'Board-style Questions');
    await page.keyboard.press('4');
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
}

test('samples follow the hero with copy beside them on desktop and above them on phones', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  for (const width of [320, 390, 1048, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const quizzes = page.getByRole('region', { name: 'Board-style Questions', exact: true });
    await expect
      .poll(async () => {
        const hero = await page.getByRole('region', { name: 'Study medicine one question at a time' }).boundingBox();
        const quizSection = await quizzes.boundingBox();
        return quizSection!.y - (hero!.y + hero!.height);
      })
      .toBeGreaterThanOrEqual(-0.5);
    await expect(quizzes.getByRole('list', { name: 'How it works' })).toBeVisible();

    for (const [copyName, sampleName] of [
      ['Board-style Questions', 'Sample Quizzes'],
      ['High-yield Flashcards', 'Sample Flashcards'],
    ]) {
      const copy = await page.getByRole('heading', { name: copyName, exact: true }).boundingBox();
      const sample = await page.getByRole('region', { name: sampleName }).boundingBox();
      if (width >= 900) expect(copy!.x + copy!.width).toBeLessThan(sample!.x);
      else expect(copy!.y + copy!.height).toBeLessThan(sample!.y);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

for (const [sampleName, navName] of [
  ['Sample Quizzes', 'Cases'],
  ['Sample Flashcards', 'Cards'],
]) {
  test(`${sampleName} navigation stays in place across all sample items at each width`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const sample = page.getByRole('region', { name: sampleName });
    const nav = sample.getByRole('navigation', { name: navName });
    for (const width of [320, 390, 820, 1048, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await nav.getByRole('button').first().click();
      const header = await sample.getByRole('heading', { name: sampleName }).boundingBox();
      const initial = await nav.boundingBox();
      const initialSample = await sample.boundingBox();
      if (width <= 390) expect(initial!.y).toBeGreaterThan(header!.y + header!.height);
      if (width === 820 || width === 1440) expect(initial!.y).toBeLessThan(header!.y + header!.height);
      for (const card of await nav.getByRole('button').all()) {
        await card.click();
        const bounds = await nav.boundingBox();
        const sampleBounds = await sample.boundingBox();
        expect(Math.abs(bounds!.x - sampleBounds!.x - (initial!.x - initialSample!.x))).toBeLessThan(1);
        expect(Math.abs(bounds!.y - sampleBounds!.y - (initial!.y - initialSample!.y))).toBeLessThan(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  });
}

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
    await expect
      .poll(async () => {
        const bounds = await page.getByRole('region', { name: heading, exact: true }).boundingBox();
        return Math.abs(bounds!.y - 96);
      })
      .toBeLessThan(2);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('link', { name: 'Try a question' }).click();
  await expect(page).toHaveURL(/#quizzes$/);
});

test('hero photo fades behind the copy on desktop and sits below the actions on smaller screens', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const hero = page.getByRole('region', { name: 'Study medicine one question at a time' });
  const photo = hero.locator('img');
  await expect
    .poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
    .toBe(true);
  for (const width of [320, 390, 820, 1048, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const heading = await hero.getByRole('heading').boundingBox();
    const actions = await hero.getByRole('link', { name: 'Try a question' }).boundingBox();
    const image = await photo.boundingBox();
    // The left 40% of the photo fades into the background on desktop.
    if (width >= 900) expect(heading!.x + heading!.width).toBeLessThanOrEqual(image!.x + image!.width * 0.4);
    else expect(image!.y).toBeGreaterThanOrEqual(actions!.y + actions!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await hero.getByRole('button', { name: 'Start studying' }).click();
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
});

test('a slow start keeps the pressed button busy until the app opens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/api/v1/subjects', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.continue();
  });
  await page.goto('/');
  const hero = page.getByRole('region', { name: 'Study medicine one question at a time' });
  const start = hero.getByRole('button', { name: 'Start studying' });
  await start.click();
  await expect(start).toBeDisabled();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Start studying' })).toBeEnabled();
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
});

test('flashcard steps track revealing and navigating independently', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const steps = page.getByRole('list', { name: 'How flashcards work' }).getByRole('listitem');
  const sample = page.getByRole('region', { name: 'Sample Flashcards' });
  const question = sample.getByText('What is the classic murmur of patent ductus arteriosus?');
  await question.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await expect(question).toBeInViewport();
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
  await expect(page.getByRole('heading', { level: 1, name: /one question at a time/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sample Quizzes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sample Flashcards' })).toBeVisible();
  const steps = page.getByRole('list', { name: 'How it works' });
  await expect(steps).toContainText('Read the explanation');
  await expect(steps).toContainText('Celebrate your progress');

  await enterSection(page, 'Board-style Questions');
  await page.getByRole('radio').first().focus();
  await page.keyboard.press('4');
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
  await expect(page.getByRole('heading', { level: 1, name: /one question at a time/ })).toHaveCount(0);
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /one question at a time/ })).toHaveCount(0);
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
  const landing = page.getByRole('heading', { level: 1, name: /one question at a time/ });
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
  await expect(page).toHaveURL('/');
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
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
});

test('a direct About visit saves nothing until Start studying', async ({ page }) => {
  await page.goto('/?about=1');
  await expect(page.getByRole('heading', { level: 1, name: /one question at a time/ })).toBeVisible();
  await expect(page.locator('footer').getByRole('link', { name: 'About', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('banner').getByRole('button', { name: 'Start studying' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.getByRole('banner').getByRole('button', { name: 'Start studying' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('meducation.started.v1'))).toBe('1');
});

test('the sample streak stays centered in the viewport vertically and the quiz horizontally', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const sample = page.getByRole('region', { name: 'Sample Quizzes' });
  await sample.getByRole('radio', { name: /BTK mutation/ }).click();
  await sample.getByRole('button', { name: 'Continue', exact: true }).click();
  await sample.getByRole('radio', { name: /Birefringent calcium oxalate/ }).click();
  await sample.getByRole('button', { name: 'Continue', exact: true }).click();
  await sample.getByRole('radio', { name: /8\/10/ }).click();
  const celebration = page.getByRole('status').filter({ has: page.getByTestId('celebration-card') });
  await expect(celebration).toBeVisible();
  // Keep the reward visible while checking scroll and breakpoint changes.
  await page.getByTestId('celebration-card').evaluate((element) => {
    element.getAnimations().forEach((animation) => animation.pause());
  });
  const steps = page.getByRole('list', { name: 'How it works' }).getByRole('listitem');
  await expect(steps.filter({ hasText: '(done)' })).toHaveCount(3);
  for (let index = 0; index < 3; index++) await expect(steps.nth(index)).not.toContainText(String(index + 1));

  const expectCentered = async () => {
    await expect
      .poll(async () => {
        const quiz = await sample.boundingBox();
        const overlay = await celebration.boundingBox();
        if (!quiz || !overlay) return Infinity;
        return Math.max(
          Math.abs(overlay.x + overlay.width / 2 - (quiz.x + quiz.width / 2)),
          Math.abs(overlay.y + overlay.height / 2 - page.viewportSize()!.height / 2),
        );
      })
      .toBeLessThan(2);
  };
  await expectCentered();
  await page.evaluate(() => window.scrollBy(0, 150));
  await expectCentered();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectCentered();
  await page.evaluate(() => window.scrollBy(0, 150));
  await expectCentered();
});

test('a visitor with saved progress opens the dashboard directly', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('meducation.flashcards.progress.v2', '{}'));
  await page.goto('/');
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /one question at a time/ })).toHaveCount(0);
});

import { expect, test } from '@playwright/test';

test('the reveal hint opens on hover and click without flipping the card', async ({ page }) => {
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
  await page.getByRole('heading', { name: 'Flashcards', exact: true }).click();
  await expect(tooltip).toBeHidden();
});

for (const width of [390, 1440]) {
  test(`scrolling activates only the current sample's shortcuts at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const quiz = page.getByRole('region', { name: 'Sample Quizzes' });
    const flashcards = page.getByRole('region', { name: 'Sample Flashcards' });
    const enterSection = async (name: string) => {
      await page.getByRole('region', { name, exact: true }).evaluate(async (element) => {
        element.scrollIntoView({ block: 'start' });
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      });
    };

    await enterSection('Quizzes');
    await page.keyboard.press('4');
    await expect(quiz.getByText('Correct', { exact: true })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(quiz.getByRole('button', { name: 'Case 2, unanswered, current case' })).toBeVisible();
    await expect(flashcards.getByRole('button', { name: 'Card 1, unopened, current card' })).toBeVisible();

    await enterSection('Flashcards');
    await page.keyboard.press('4');
    await expect(quiz.getByRole('button', { name: 'Case 2, unanswered, current case' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(flashcards.getByRole('group', { name: /Answer revealed/ })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(flashcards.getByRole('button', { name: 'Card 2, unopened, current card' })).toBeVisible();

    await enterSection('Twelve subjects');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('4');
    await expect(quiz.getByRole('button', { name: 'Case 2, unanswered, current case' })).toBeVisible();
    await expect(flashcards.getByRole('button', { name: 'Card 2, unopened, current card' })).toBeVisible();
    await expect(flashcards.getByRole('button', { name: 'Reveal answer' })).toBeVisible();
  });
}

test('samples follow the hero with copy beside them on desktop and above them on phones', async ({ page }) => {
  await page.goto('/');
  for (const width of [320, 390, 1048, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const hero = await page.getByRole('region', { name: 'Study medicine one question at a time' }).boundingBox();
    const quizzes = page.getByRole('region', { name: 'Quizzes', exact: true });
    const quizSection = await quizzes.boundingBox();
    expect(quizSection!.y).toBeGreaterThanOrEqual(hero!.y + hero!.height);
    await expect(quizzes.getByRole('list', { name: 'How it works' })).toBeVisible();

    for (const [copyName, sampleName] of [
      ['Quizzes', 'Sample Quizzes'],
      ['Flashcards', 'Sample Flashcards'],
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

test('hero links jump to the quiz and flashcard sections', async ({ page }) => {
  await page.goto('/');
  const hero = page.getByRole('region', { name: 'Study medicine one question at a time' });
  for (const name of ['Quizzes', 'Flashcards']) {
    await hero.getByRole('link', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeInViewport();
    await expect(page).toHaveURL(new RegExp(`#${name.toLowerCase()}$`));
  }
});

test('flashcard steps track the visible question, revealing and navigating independently', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const steps = page.getByRole('list', { name: 'How flashcards work' }).getByRole('listitem');
  await expect(steps.filter({ hasText: '(done)' })).toHaveCount(0);
  const sample = page.getByRole('region', { name: 'Sample Flashcards' });
  const question = sample.getByText('What is the classic murmur of patent ductus arteriosus?');
  await page.evaluate(() => document.fonts.ready);
  await question.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    window.scrollTo(0, window.scrollY + bounds.top - window.innerHeight + bounds.height / 2);
  });
  await expect(question).toBeInViewport({ ratio: 0.4 });
  await expect(steps.nth(0)).not.toContainText('(done)');
  await question.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await expect(steps.nth(0)).toContainText('Read the question (done)');
  await expect(steps.nth(1)).not.toContainText('(done)');
  await expect(steps.nth(2)).not.toContainText('(done)');

  const cards = sample.getByRole('navigation', { name: 'Cards' }).getByRole('button');
  await expect(cards).toHaveCount(3);
  await cards.nth(0).click();
  await expect(steps.nth(2)).not.toContainText('(done)');
  await cards.nth(2).click();
  await expect(sample.getByText('Doctrine of last clear chance.')).toBeVisible();
  await expect(steps.nth(2)).toContainText('See the next card (done)');
  await expect(steps.nth(1)).not.toContainText('(done)');
  await sample.getByRole('button', { name: 'Reveal answer' }).click();
  await expect(steps.nth(1)).toContainText('Reveal the answer (done)');
  await cards.nth(1).click();
  await expect(steps.filter({ hasText: '(done)' })).toHaveCount(3);
});

test('a first visit shows the landing page until the visitor starts studying', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /one question at a time/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sample Quizzes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sample Flashcards' })).toBeVisible();
  const steps = page.getByRole('list', { name: 'How it works' });
  await expect(steps).toContainText('Read the explanation');
  await expect(steps).toContainText('Celebrate your progress');

  await page.getByRole('radio').first().focus();
  await page.keyboard.press('4');
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Case 1, correct, current case' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'How it works' })).toContainText('Choose an answer (done)');
  await expect(steps.getByRole('listitem').first()).not.toContainText('1');
  await expect(steps.getByRole('listitem').nth(1)).toContainText('2');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Case 2, unanswered, current case' })).toBeVisible();

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

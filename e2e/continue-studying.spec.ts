import { expect, test } from '@playwright/test';

async function attachScreenshot(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  name: string,
) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function expectCardFitsViewport(
  page: import('@playwright/test').Page,
  width: number,
  dashboard: 'Quizzes' | 'Flashcards' = 'Quizzes',
) {
  await page.setViewportSize({ width, height: 844 });
  await page.reload();
  if (dashboard === 'Flashcards') await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  const card = page.getByTestId('continue-study-card');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('aria-label', 'Continue studying Browser Test Subject');
  const bounds = await card.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
  const overflow = await page.evaluate(() => ({
    fits: document.documentElement.scrollWidth <= window.innerWidth + 1,
    geometry: {
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      card: document.querySelector('[data-testid="continue-study-card"]')?.getBoundingClientRect().toJSON(),
      cardRoot: document
        .querySelector('[data-testid="continue-study-card"]')
        ?.parentElement?.getBoundingClientRect()
        .toJSON(),
      art: document
        .querySelector('[data-testid="continue-study-card"]')
        ?.parentElement?.firstElementChild?.getBoundingClientRect()
        .toJSON(),
      svg: document
        .querySelector('[data-testid="continue-study-card"] svg[viewBox="0 0 360 270"]')
        ?.getBoundingClientRect()
        .toJSON(),
      main: document.querySelector('main')?.getBoundingClientRect().toJSON(),
    },
    offenders: [...document.querySelectorAll('body *')]
      .map((element) => ({
        tag: element.tagName,
        className: typeof element.className === 'string' ? element.className : '',
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
      }))
      .filter(({ left, right }) => left < -1 || right > window.innerWidth + 1)
      .slice(0, 6),
  }));
  expect(overflow.fits, JSON.stringify({ geometry: overflow.geometry, offenders: overflow.offenders })).toBe(true);
}

async function expectSingleCardAtAllWidths(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  screenshotName: string,
  carouselId: string,
) {
  const measurements = await page.evaluate((carouselId) => {
    const carousel = document.querySelector<HTMLElement>(`[data-carousel-id="${carouselId}"]`)!;
    const track = carousel.querySelector<HTMLElement>('[data-testid="study-carousel-track"]')!;
    const original = track.querySelector<HTMLElement>('[data-testid="study-carousel-slide"]')!;
    const secondCard = original.cloneNode(true) as HTMLElement;
    track.append(secondCard);
    const measure = (width: number) => {
      carousel.style.width = `${width}px`;
      const bounds = carousel.getBoundingClientRect();
      const slides = [...track.children].map((slide) => slide.getBoundingClientRect().toJSON());
      return { bounds: bounds.toJSON(), slides };
    };
    const measurements = [measure(320), measure(975), measure(976), measure(1280)];
    track.lastElementChild?.remove();
    carousel.style.removeProperty('width');
    return measurements;
  }, carouselId);
  for (const { bounds, slides } of measurements) {
    expect(slides[0]!.width).toBeCloseTo(bounds.width, 0);
    expect(slides[1]!.left).toBeGreaterThanOrEqual(bounds.right + 15);
  }
  await page.evaluate((carouselId) => {
    document.querySelector<HTMLElement>(`[data-carousel-id="${carouselId}"]`)!.style.width = '976px';
  }, carouselId);
  await attachScreenshot(page, testInfo, screenshotName);
  await page.evaluate((carouselId) => {
    document.querySelector<HTMLElement>(`[data-carousel-id="${carouselId}"]`)!.style.removeProperty('width');
  }, carouselId);
}

test('quiz Continue Studying card is responsive and opens the active subject', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto('/');
  await page.getByTestId('all-subjects-grid').getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await page.getByRole('radio', { name: /A\. Four/ }).check();
  await page.reload();

  const region = page.getByRole('region', { name: 'Continue Studying' });
  const card = region.getByRole('button', { name: 'Continue studying Browser Test Subject' });
  await expect(card).toHaveAccessibleDescription('1 quiz in progress');
  await expect(card.locator('.continue-study-cta')).toHaveText(/Continue/);
  await expectSingleCardAtAllWidths(
    page,
    testInfo,
    'quiz-continue-card-single-at-976px.png',
    'continue-studying-subjects',
  );
  await attachScreenshot(page, testInfo, 'quiz-continue-card-wide.png');
  await expectCardFitsViewport(page, 390);
  await attachScreenshot(page, testInfo, 'quiz-continue-card-mobile.png');
  await expectCardFitsViewport(page, 320);
  await attachScreenshot(page, testInfo, 'quiz-continue-card-narrow.png');
  const action = page.getByTestId('continue-study-card');
  await action.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Browser Test Subject' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume quiz' })).toBeVisible();
});

test('flashcard Continue Studying card shows deck activity and opens the saved subject', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await page.getByTestId('all-subjects-grid').getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: 'Study deck' }).click();
  await page.getByRole('button', { name: 'Save and exit deck' }).click();
  await page.getByRole('button', { name: 'All subjects' }).click();

  const region = page.getByRole('region', { name: 'Continue Studying' });
  const card = region.getByRole('button', { name: 'Continue studying Browser Test Subject' });
  await expect(card).toHaveAccessibleDescription('1 deck in progress');
  await expect(card.locator('.continue-study-cta')).toHaveText(/Continue/);
  await expect(region.getByTestId('subject-score-track')).toHaveCount(0);
  await expectSingleCardAtAllWidths(
    page,
    testInfo,
    'flashcards-continue-card-single-at-976px.png',
    'continue-studying-flashcards',
  );
  await attachScreenshot(page, testInfo, 'flashcards-continue-card-wide.png');
  await expectCardFitsViewport(page, 390, 'Flashcards');
  await attachScreenshot(page, testInfo, 'flashcards-continue-card-mobile.png');
  await expectCardFitsViewport(page, 320, 'Flashcards');
  await attachScreenshot(page, testInfo, 'flashcards-continue-card-narrow.png');
  const action = page.getByTestId('continue-study-card');
  await action.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: 'Browser Test Subject' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume deck' })).toBeVisible();
});

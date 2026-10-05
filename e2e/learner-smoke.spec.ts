import { expect, test } from '@playwright/test';

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
  const firstQuizMs = Date.now() - firstQuizStart;
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
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Retake quiz' })).toBeVisible();
});

test('Exam Mode submission offers a one-time read-only review', async ({ page }) => {
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
  await expect(page.getByText('Correct answer')).toBeVisible();
  await expect(page.getByText('Four is the sum of two and two.')).toBeVisible();
  await page.getByRole('button', { name: 'Leave review' }).click();
  await expect(page.getByRole('dialog', { name: 'Leave review?' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep reviewing', exact: true }).last().click();
  await expect(page.getByText('What is')).toBeVisible();
  await page.getByRole('button', { name: 'Leave review' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave review' }).click();
  await expect(page.getByRole('button', { name: 'Retake quiz' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review results' })).toHaveCount(0);
});

test('failed catalog request recovers by keyboard Retry on a narrow reduced-motion screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let failures = 0;
  await page.route('**/api/v1/subjects', async (route) => {
    if (failures++ === 0)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: '{"detail":"temporary"}',
      });
    else await route.continue();
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Unable to load subjects' })).toBeVisible();
  const retry = page.getByRole('button', { name: 'Retry' }).first();
  await retry.focus();
  await expect(retry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Open Browser Test Subject' })).toBeVisible();
  expect(failures).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
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

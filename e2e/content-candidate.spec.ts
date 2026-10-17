import { expect, test } from '@playwright/test';
import { contentCases } from './support/contentCases';

for (const candidate of contentCases()) {
  test(`L6 learner content acceptance ${candidate.label}`, async ({ page }, testInfo) => {
    const { item, subject, topic } = candidate;
    const quiz = { ...candidate.quiz, subjectId: subject.id };
    const revision = 'sha256-synthetic-content-acceptance';
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const body =
        path === '/api/v1/subjects'
          ? { revision, subjects: [{ ...subject, quizCount: 1, quizIds: [quiz.id] }] }
          : path === `/api/v1/subjects/${subject.id}/quizzes`
            ? {
                revision,
                topics: [topic],
                quizzes: [{ ...quiz, questionCount: 1, questionIds: [item.id] }],
              }
            : path === `/api/v1/quizzes/${quiz.id}/questions`
              ? { revision, questions: [item] }
              : path === `/api/v1/quizzes/${quiz.id}`
                ? { revision, quiz: { ...quiz, questionCount: 1, questionIds: [item.id] } }
                : { revision, subjects: [] };
      await route.fulfill({ json: body });
    });
    await page.setViewportSize({ width: 390, height: 850 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.addStyleTag({ content: 'html {font-size:20px}' });
    await page
      .getByRole('button', { name: `Open ${subject.name}`, exact: true })
      .last()
      .click();
    await page.getByRole('button', { name: /^Start quiz/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Browse Answers' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Open quiz' }).click();
    await expect(page.getByRole('list', { name: 'Answer choices' })).toBeVisible();
    expect(await page.evaluate(() => (window as Window & { __rcExecuted?: boolean }).__rcExecuted)).toBeUndefined();
    await expect(page.locator('a[href^="javascript:"], img[src^="javascript:"], [onerror]')).toHaveCount(0);
    if (candidate.label === 'synthetic-rich') {
      await expect(page.getByRole('table')).toBeVisible();
      await expect(page.locator('.katex-display')).toBeVisible();
      await expect(page.locator('sub')).toHaveText('2');
      expect(await page.locator('.katex').count()).toBeGreaterThanOrEqual(3);
      expect(
        await page.evaluate(async () => {
          await document.fonts.ready;
          return [...document.fonts].some((f) => f.family.includes('KaTeX_Main') && f.status === 'loaded');
        }),
      ).toBe(true);
    }
    for (const width of [390, 1048, 1440]) {
      await page.setViewportSize({ width, height: 850 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const actions = page.getByRole('button', { name: 'Leave answer browser', exact: true });
      await expect(actions).toBeVisible();
      await actions.focus();
      await expect(actions).toBeFocused();
      const done = page.getByRole('button', { name: 'Done', exact: true });
      await done.scrollIntoViewIfNeeded();
      await expect(done).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`content-${width}.png`), fullPage: true });
    }
  });
}

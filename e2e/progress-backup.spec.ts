import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const quizKey = 'meducation.progress.v2';
const flashcardsKey = 'meducation.flashcards.progress.v2';
const populatedPath = 'tests/fixtures/progress-backups/populated-v1.json';

async function seedProgress(page: Page) {
  const populated = JSON.parse(await readFile(populatedPath, 'utf8')) as { quiz: object; flashcards: object };
  await page.addInitScript(
    ({ quiz, flashcards, quizKey, flashcardsKey }) => {
      if (localStorage.getItem(quizKey) === null) {
        localStorage.setItem(quizKey, JSON.stringify({ ...quiz, revision: '00000000-0000-4000-8000-000000000001' }));
        localStorage.setItem(
          flashcardsKey,
          JSON.stringify({ ...flashcards, revision: '00000000-0000-4000-8000-000000000002' }),
        );
      }
    },
    { quiz: populated.quiz, flashcards: populated.flashcards, quizKey, flashcardsKey },
  );
}

const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

async function portableProgress(page: Page) {
  return page.evaluate(
    ({ quizKey, flashcardsKey }) => {
      const quiz = JSON.parse(localStorage.getItem(quizKey)!);
      const flashcards = JSON.parse(localStorage.getItem(flashcardsKey)!);
      delete quiz.revision;
      delete flashcards.revision;
      return { quiz, flashcards };
    },
    { quizKey, flashcardsKey },
  );
}

test('downloads a backup and restores it into a fresh browser context', async ({ page, browser, baseURL }) => {
  await seedProgress(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await page.getByRole('button', { name: 'Progress backup' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^meducation-progress-\d{4}-\d{2}-\d{2}\.json$/);
  const downloadPath = await download.path();
  const exported = JSON.parse(await readFile(downloadPath!, 'utf8')) as {
    format: string;
    quiz: object;
    flashcards: object;
  };
  expect(exported.format).toBe('meducation-progress-backup');

  const fresh = await browser.newContext({ baseURL });
  try {
    const target = await fresh.newPage();
    await target.goto('/');
    await expect(target.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
    expect(await stored(target, quizKey)).toBeNull();
    await target.getByRole('button', { name: 'Progress backup' }).click();
    await target.getByLabel('Choose progress backup file').setInputFiles(downloadPath!);
    await expect(target.getByRole('table', { name: 'Backup comparison' })).toBeVisible();
    const reload = target.waitForNavigation({ waitUntil: 'load' });
    await target.getByRole('button', { name: 'Replace my progress' }).click();
    await reload;
    await expect(target.getByRole('heading', { name: 'All Subjects' })).toBeFocused();
    await expect(target.getByText('Progress restored.', { exact: true })).toBeVisible();
    expect(await portableProgress(target)).toEqual({ quiz: exported.quiz, flashcards: exported.flashcards });
  } finally {
    await fresh.close();
  }
});

test('rejects an invalid backup file without changing progress', async ({ page }) => {
  await seedProgress(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  const before = [await stored(page, quizKey), await stored(page, flashcardsKey)];
  await page.getByRole('button', { name: 'Progress backup' }).click();
  await page.getByLabel('Choose progress backup file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"something-else"}'),
  });
  await expect(page.getByRole('alert').filter({ hasText: 'not a Meducation progress backup' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Backup comparison' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Replace my progress' })).toHaveCount(0);
  expect([await stored(page, quizKey), await stored(page, flashcardsKey)]).toEqual(before);
});

test('cancelling at the preview leaves progress intact', async ({ page }) => {
  await seedProgress(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  const before = [await stored(page, quizKey), await stored(page, flashcardsKey)];
  await page.getByRole('button', { name: 'Progress backup' }).click();
  await page.getByLabel('Choose progress backup file').setInputFiles('tests/fixtures/progress-backups/empty-v1.json');
  await expect(page.getByRole('table', { name: 'Backup comparison' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog', { name: 'Progress backup' })).toHaveCount(0);
  expect([await stored(page, quizKey), await stored(page, flashcardsKey)]).toEqual(before);
});

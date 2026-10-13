import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const quizKey = 'meducation.progress.v2';
const flashcardsKey = 'meducation.flashcards.progress.v2';
const journalKey = 'meducation.progress.restore.v1';

async function seedProgress(page: import('@playwright/test').Page) {
  const populated = JSON.parse(await readFile('tests/fixtures/progress-backups/populated-v1.json', 'utf8')) as {
    quiz: object;
    flashcards: object;
  };
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

test('downloads, previews, and explicitly restores a paired synthetic backup', async ({ page }) => {
  await seedProgress(page);
  const backupRequests: string[] = [];
  page.on('request', (request) => {
    if (request.postData()?.includes('meducation-progress-backup')) backupRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await page.getByRole('button', { name: 'Progress backup' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^meducation-progress-\d{4}-\d{2}-\d{2}\.json$/);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const exported = JSON.parse(await readFile(downloadPath!, 'utf8')) as {
    format: string;
    quiz: { completedIds: Record<string, true> };
    flashcards: { dailyStats: { trackedCompletions: number } };
  };
  expect(exported.format).toBe('meducation-progress-backup');
  expect(exported.quiz.completedIds['pruned-completion']).toBe(true);
  expect(exported.flashcards.dailyStats.trackedCompletions).toBe(2);

  await page.getByRole('button', { name: 'Choose backup file' }).click();
  await page.getByLabel('Choose progress backup file').setInputFiles('tests/fixtures/progress-backups/empty-v1.json');
  await expect(page.getByRole('heading', { name: 'Backup preview' })).toBeVisible();
  await expect(
    page.getByText(
      'This backup contains no saved progress. Restoring it clears all quiz and flashcard progress in this browser.',
    ),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), quizKey)).not.toBeNull();
  const reload = page.waitForNavigation({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Restore backup' }).click();
  await reload;
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), journalKey)).toBeNull();
  const restoredQuiz = (await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), quizKey)) as {
    completed: unknown[];
    revision: string;
  };
  const restoredFlashcards = (await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null'),
    flashcardsKey,
  )) as { checkpoints: object; revision: string };
  expect(restoredQuiz.completed).toEqual([]);
  expect(restoredQuiz.revision).not.toBe('initial');
  expect(restoredFlashcards.checkpoints).toEqual({});
  expect(backupRequests).toEqual([]);
});

test('refuses paired capture while another same-origin page holds participation', async ({ page, context }) => {
  await seedProgress(page);
  await page.goto('/');
  const second = await context.newPage();
  await second.goto('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  const original = await page.evaluate((key) => localStorage.getItem(key), quizKey);
  await page.getByRole('button', { name: 'Progress backup' }).click();
  await page.getByRole('button', { name: 'Download backup' }).click();
  await expect(page.getByRole('alert')).toContainText('Another Meducation tab is open');
  expect(await page.evaluate((key) => localStorage.getItem(key), quizKey)).toBe(original);
  await second.close();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^meducation-progress-/);
});

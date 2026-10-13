import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const quizKey = 'meducation.progress.v2';
const flashcardsKey = 'meducation.flashcards.progress.v2';
const journalKey = 'meducation.progress.restore.v1';
const rawRecoveryFormat = 'meducation-progress-recovery-raw';

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
  await page.route('**/api/**', (route) => route.abort());
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
    active?: Record<string, { elapsedMs: number; timerStartedAt?: string }>;
    flashcards: { dailyStats: { trackedCompletions: number } };
  };
  expect(exported.format).toBe('meducation-progress-backup');
  expect(exported.quiz.completedIds['pruned-completion']).toBe(true);
  expect(exported.flashcards.dailyStats.trackedCompletions).toBe(2);
  const exportedActive = (
    exported as unknown as { quiz: { active: Record<string, { elapsedMs: number; timerStartedAt?: string }> } }
  ).quiz.active['deleted-quiz'];
  expect(exportedActive.elapsedMs).toBe(1200.5);
  expect(exportedActive).not.toHaveProperty('timerStartedAt');

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
  await expect(page.getByRole('alert').filter({ hasText: 'Another Meducation tab is open' })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), quizKey)).toBe(original);
  await second.close();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^meducation-progress-/);
});

test('blocks a restore after preview when another page joins participation, then allows retry', async ({
  page,
  context,
}) => {
  await seedProgress(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  const originalQuiz = await page.evaluate((key) => localStorage.getItem(key), quizKey);
  await page.getByRole('button', { name: 'Progress backup' }).click();
  await page.getByRole('button', { name: 'Choose backup file' }).click();
  await page.getByLabel('Choose progress backup file').setInputFiles('tests/fixtures/progress-backups/empty-v1.json');
  await expect(page.getByRole('heading', { name: 'Backup preview' })).toBeVisible();

  const second = await context.newPage();
  await second.goto('/');
  await expect(second.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore backup' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Another Meducation tab is open' })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), quizKey)).toBe(originalQuiz);
  expect(await page.evaluate((key) => localStorage.getItem(key), journalKey)).toBeNull();

  await second.close();
  const reload = page.waitForNavigation({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Restore backup' }).click();
  await reload;
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), quizKey)).completed).toEqual(
    [],
  );
});

test('boot recovery preserves readable raw values in a clearly separate download', async ({ page }) => {
  await page.addInitScript(
    ({ quizKey, flashcardsKey, journalKey }) => {
      localStorage.setItem(quizKey, '{corrupt quiz bytes');
      localStorage.setItem(flashcardsKey, '{corrupt flashcard bytes');
      localStorage.setItem(journalKey, '{invalid restore journal');
    },
    { quizKey, flashcardsKey, journalKey },
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('previous progress operation needs recovery');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download raw recovery copy' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^meducation-progress-recovery-raw-\d{4}-\d{2}-\d{2}\.json$/);
  const raw = JSON.parse(await readFile((await download.path())!, 'utf8')) as Record<string, unknown>;
  expect(raw).toMatchObject({
    format: rawRecoveryFormat,
    mayBeInconsistent: true,
    quizRaw: '{corrupt quiz bytes',
    flashcardsRaw: '{corrupt flashcard bytes',
    journalRaw: '{invalid restore journal',
  });
  expect(await page.evaluate((key) => localStorage.getItem(key), journalKey)).toBe('{invalid restore journal');
});

test('without Web Locks, keeps saved bytes, permits read-only browsing, and disables progress actions', async ({
  page,
}) => {
  await seedProgress(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  const originalQuiz = await page.evaluate((key) => localStorage.getItem(key), quizKey);
  const backupAction = page.getByRole('button', { name: 'Progress backup' });
  await expect(backupAction).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('browse content');
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: 'Browse quiz' }).click();
  const setup = page.getByRole('dialog');
  await expect(setup.getByRole('button', { name: 'Begin Quiz' })).toBeDisabled();
  await setup.getByRole('button', { name: 'Browse Answers' }).click();
  await setup.getByRole('button', { name: 'Open quiz' }).click();
  await expect(page.getByText('Four is the sum of two and two.')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), quizKey)).toBe(originalQuiz);
  await expect(page.getByRole('radio')).toHaveCount(0);
});

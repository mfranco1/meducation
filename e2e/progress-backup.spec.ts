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
    if (
      /meducation-progress|pruned-completion|paused-attempt|populated-v1|empty-v1/.test(
        request.url() + (request.postData() ?? ''),
      )
    )
      backupRequests.push(request.url());
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
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeFocused();
  await expect(page.getByText('Progress restored.', { exact: true })).toBeVisible();
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
  // Re-import the genuine download and compare every portable field after reload.
  await page.getByRole('button', { name: 'Progress backup' }).click();
  await page.getByLabel('Choose progress backup file').setInputFiles(downloadPath!);
  await expect(page.getByRole('heading', { name: 'Backup preview' })).toBeVisible();
  const populatedReload = page.waitForNavigation({ waitUntil: 'load' });
  await page.getByRole('button', { name: 'Restore backup' }).click();
  await populatedReload;
  const pair = await page.evaluate(
    ({ quizKey, flashcardsKey }) => {
      const quiz = JSON.parse(localStorage.getItem(quizKey)!);
      const flashcards = JSON.parse(localStorage.getItem(flashcardsKey)!);
      delete quiz.revision;
      delete flashcards.revision;
      return { quiz, flashcards };
    },
    { quizKey, flashcardsKey },
  );
  expect(pair).toEqual({ quiz: exported.quiz, flashcards: exported.flashcards });
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

for (const denied of ['locks', 'reads', 'writes', 'files'] as const) {
  test(`capability failure: ${denied} preserves progress and exposes safe actions`, async ({ page }) => {
    await seedProgress(page);
    await page.addInitScript((denied) => {
      const get = Storage.prototype.getItem;
      const read = () => [
        get.call(localStorage, 'meducation.progress.v2'),
        get.call(localStorage, 'meducation.flashcards.progress.v2'),
      ];
      (window as unknown as { testSaved: string | null; testRead: typeof read }).testSaved = JSON.stringify(read());
      (window as unknown as { testRead: typeof read }).testRead = read;
      if (denied === 'locks') navigator.locks.request = () => Promise.reject(new Error('denied'));
      if (denied === 'reads')
        Storage.prototype.getItem = () => {
          throw new DOMException('Denied', 'SecurityError');
        };
      if (denied === 'writes')
        Storage.prototype.setItem = () => {
          throw new DOMException('Full', 'QuotaExceededError');
        };
      if (denied === 'files') URL.createObjectURL = undefined as unknown as typeof URL.createObjectURL;
    }, denied);
    await page.goto('/');
    if (denied === 'locks' || denied === 'reads') {
      await expect(page.getByRole('alert').first()).toContainText('could not be safely opened');
      await expect(page.getByRole('button', { name: 'Progress backup' })).toBeDisabled();
    } else {
      await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
      if (denied === 'writes') {
        await expect(page.getByRole('button', { name: 'Progress backup' })).toBeDisabled();
        await expect(page.getByRole('alert')).toContainText('browse content');
      } else {
        await page.getByRole('button', { name: 'Progress backup' }).click();
        await expect(page.getByRole('button', { name: 'Download backup', exact: true })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Choose backup file' })).toBeEnabled();
      }
    }
    expect(
      await page.evaluate(() => {
        const probe = window as unknown as { testSaved: string; testRead: () => (string | null)[] };
        return JSON.stringify(probe.testRead()) === probe.testSaved;
      }),
    ).toBe(true);
  });
}

test('cancellation, same-file reselection and keyboard focus work at 390px with reduced motion', async ({ page }) => {
  await seedProgress(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const action = page.getByRole('button', { name: 'Progress backup' });
  await action.click();
  await page.setViewportSize({ width: 390, height: 600 });
  await page.addStyleTag({ content: 'html { font-size: 20px }' });
  const dialog = page.getByRole('dialog', { name: 'Progress backup' });
  const input = page.getByLabel('Choose progress backup file');
  await input.setInputFiles('tests/fixtures/progress-backups/empty-v1.json');
  await expect(page.getByRole('heading', { name: 'Backup preview' })).toBeVisible();
  await input.setInputFiles([]); // Empty selection represents returning from a cancelled picker.
  await expect(page.getByRole('heading', { name: 'Backup preview' })).toBeVisible();
  await input.setInputFiles({ name: 'wrong.txt', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.getByRole('alert').filter({ hasText: 'not a Meducation progress backup' })).toBeVisible();
  await input.setInputFiles('tests/fixtures/progress-backups/empty-v1.json');
  await expect(page.getByRole('button', { name: 'Restore backup' })).toBeEnabled();
  await expect(dialog).toHaveAttribute('aria-busy', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  await cancel.focus();
  for (const direction of ['Tab', 'Shift+Tab'])
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press(direction);
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(action).toBeFocused();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).completedIds, quizKey);
  expect(saved['pruned-completion']).toBe(true);
});

test('closing while file text is pending disposes the late preview and reads the same file again', async ({ page }) => {
  await seedProgress(page);
  await page.addInitScript(() => {
    const nativeText = File.prototype.text;
    File.prototype.text = async function () {
      const text = await nativeText.call(this);
      return new Promise<string>((resolve) => {
        (window as unknown as { finishRead: () => void }).finishRead = () => resolve(text);
      });
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Progress backup' }).click();
  await page.getByLabel('Choose progress backup file').setInputFiles('tests/fixtures/progress-backups/empty-v1.json');
  await expect(page.getByRole('status')).toContainText('Reading backup');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => (window as unknown as { finishRead: () => void }).finishRead());
  await page.getByRole('button', { name: 'Progress backup' }).click();
  await expect(page.getByRole('heading', { name: 'Backup preview' })).toHaveCount(0);
  await page.getByLabel('Choose progress backup file').setInputFiles('tests/fixtures/progress-backups/empty-v1.json');
  await expect(page.getByRole('status')).toContainText('Reading backup');
  await page.evaluate(() => (window as unknown as { finishRead: () => void }).finishRead());
  await expect(page.getByRole('heading', { name: 'Backup preview' })).toBeVisible();
});

for (const decision of ['original', 'imported'] as const) {
  test(`fresh readers wait for an exclusive owner and recover the ${decision} pair`, async ({ page, context }) => {
    const payload = JSON.parse(await readFile('tests/fixtures/progress-backups/populated-v1.json', 'utf8'));
    const targets = {
      quiz: JSON.stringify({ ...payload.quiz, revision: '00000000-0000-4000-8000-000000000001' }),
      flashcards: JSON.stringify({ ...payload.flashcards, revision: '00000000-0000-4000-8000-000000000002' }),
    };
    // A blank same-origin document holds native exclusivity around a deliberately interrupted pair.
    await page.route('**/lock-owner', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>Isolated lock owner</title>' }),
    );
    await page.goto('/lock-owner');
    await page.evaluate(
      async ({ targets, decision, quizKey, journalKey }) => {
        await new Promise<void>((acquired) => {
          void navigator.locks.request('meducation.progress.coordination.v1', { mode: 'exclusive' }, async () => {
            localStorage.setItem(
              journalKey,
              JSON.stringify({
                format: 'meducation-progress-restore-journal',
                version: 1,
                operationId: '00000000-0000-4000-8000-000000000003',
                decision,
                original: { quiz: null, flashcards: null },
                imported: targets,
              }),
            );
            localStorage.setItem(quizKey, targets.quiz);
            acquired();
            await new Promise<void>((release) => {
              (window as unknown as { releaseOwner: () => void }).releaseOwner = release;
            });
          });
        });
      },
      { targets, decision, quizKey, journalKey },
    );
    const readers = await Promise.all([context.newPage(), context.newPage()]);
    for (const reader of readers) {
      await reader.addInitScript(() => {
        const nativeGet = Storage.prototype.getItem;
        (window as unknown as { progressReads: string[] }).progressReads = [];
        Storage.prototype.getItem = function (key) {
          (window as unknown as { progressReads: string[] }).progressReads.push(key);
          return nativeGet.call(this, key);
        };
      });
      await reader.goto('/');
      await expect(reader.getByRole('heading', { name: 'All Subjects' })).toHaveCount(0);
      expect(await reader.evaluate(() => (window as unknown as { progressReads: string[] }).progressReads)).toEqual([]);
    }
    await page.close(); // Closing/crashing an owner releases its native lock.
    for (const reader of readers) {
      await expect(reader.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
      const actual = await reader.evaluate(
        ({ quizKey, flashcardsKey, journalKey }) => ({
          quiz: localStorage.getItem(quizKey),
          flashcards: localStorage.getItem(flashcardsKey),
          journal: localStorage.getItem(journalKey),
        }),
        { quizKey, flashcardsKey, journalKey },
      );
      expect(actual).toEqual({
        ...(decision === 'original' ? { quiz: null, flashcards: null } : targets),
        journal: null,
      });
      await reader.reload();
      expect(await reader.evaluate((key) => localStorage.getItem(key), journalKey)).toBeNull();
    }
  });
}

test('real origin quota exhaustion preserves the exact pair and leaves no fabricated success', async ({
  page,
}, testInfo) => {
  await seedProgress(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Progress backup' }).click();
  await page.getByLabel('Choose progress backup file').setInputFiles('tests/fixtures/progress-backups/empty-v1.json');
  await expect(page.getByRole('button', { name: 'Restore backup' })).toBeEnabled();
  const filled = await page.evaluate(
    ({ quizKey, flashcardsKey }) => {
      const original = [localStorage.getItem(quizKey), localStorage.getItem(flashcardsKey)];
      let written = 0;
      let quotaObserved = false;
      for (const size of [256 * 1024, 1024, 1]) {
        for (let i = 0; i < 1024; i++) {
          try {
            localStorage.setItem(`l1-quota-${size}-${i}`, 'x'.repeat(size));
            written += size;
          } catch (error) {
            quotaObserved = error instanceof DOMException && error.name === 'QuotaExceededError';
            break;
          }
          if (written > 64 * 1024 * 1024) throw new Error('Disposable quota probe exceeded its bound');
        }
      }
      return { original, quotaObserved, written };
    },
    { quizKey, flashcardsKey },
  );
  expect(filled.quotaObserved).toBe(true);
  await page.getByRole('button', { name: 'Restore backup' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'current progress was preserved' })).toBeVisible();
  expect(
    await page.evaluate(
      ({ quizKey, flashcardsKey }) => [localStorage.getItem(quizKey), localStorage.getItem(flashcardsKey)],
      { quizKey, flashcardsKey },
    ),
  ).toEqual(filled.original);
  expect(await page.evaluate((key) => localStorage.getItem(key), journalKey)).toBeNull();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  console.info(`L1 ${testInfo.project.name} quota: ${filled.written} payload bytes, actual QuotaExceededError`);
  await testInfo.attach('quota-observation.json', {
    body: JSON.stringify({
      browser: testInfo.project.name,
      origin: new URL(page.url()).origin,
      writtenBytes: filled.written,
      mode: 'isolated nonpersistent context',
      quotaObserved: true,
    }),
    contentType: 'application/json',
  });
});

test('pagehide pauses an active quiz and real back navigation re-enters admitted progress safely', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    window.addEventListener('pageshow', (event) => {
      const events = JSON.parse(sessionStorage.getItem('l1-test-pageshow') ?? '[]') as boolean[];
      sessionStorage.setItem('l1-test-pageshow', JSON.stringify([...events, event.persisted]));
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await expect(page.getByRole('radio').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Progress backup' })).toBeDisabled();
  await page.goto('about:blank');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  const observed = await page.evaluate(
    ({ quizKey, journalKey }) => ({
      active: Object.values(JSON.parse(localStorage.getItem(quizKey)!).active) as Array<{
        elapsedMs: number;
        timerStartedAt?: string;
      }>,
      journal: localStorage.getItem(journalKey),
      pageshows: JSON.parse(sessionStorage.getItem('l1-test-pageshow') ?? '[]') as boolean[],
    }),
    { quizKey, journalKey },
  );
  expect(observed.active).toHaveLength(1);
  expect(observed.active[0].elapsedMs).toBeGreaterThan(0);
  expect(observed.active[0]).not.toHaveProperty('timerStartedAt');
  expect(observed.journal).toBeNull();
  expect(observed.pageshows.at(-1)).toBe(false); // Initial load or controlled reload after a persisted return.
  const held = await page.evaluate(async () => (await navigator.locks.query()).held ?? []);
  expect(
    held.filter((lock) => lock.name === 'meducation.progress.coordination.v1' && lock.mode === 'shared'),
  ).toHaveLength(1);
  console.info(`L1 ${testInfo.project.name} real navigation pageshows: ${JSON.stringify(observed.pageshows)}`);
  await testInfo.attach('navigation-observation.json', {
    body: JSON.stringify({
      browser: testInfo.project.name,
      pageshows: observed.pageshows,
      path: observed.pageshows.includes(true)
        ? 'persisted return followed by controlled reload'
        : 'fresh load on back navigation',
    }),
    contentType: 'application/json',
  });
});

test('oversized browser files are rejected before reading and raw recovery remains non-importable', async ({
  page,
}) => {
  await seedProgress(page);
  await page.addInitScript(() => {
    const text = File.prototype.text;
    (window as unknown as { fileReads: number }).fileReads = 0;
    File.prototype.text = function () {
      (window as unknown as { fileReads: number }).fileReads++;
      return text.call(this);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Progress backup' }).click();
  const input = page.getByLabel('Choose progress backup file');
  await input.setInputFiles({
    name: 'large.json',
    mimeType: 'application/json',
    buffer: Buffer.alloc(4 * 1024 * 1024 + 1, ' '),
  });
  await expect(page.getByRole('alert')).toContainText('4 MiB');
  expect(await page.evaluate(() => (window as unknown as { fileReads: number }).fileReads)).toBe(0);
  await input.setInputFiles({
    name: 'recovery.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"meducation-progress-recovery-raw","version":1}'),
  });
  await expect(page.getByRole('alert')).toContainText('not a Meducation progress backup');
  expect(
    await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).completedIds['pruned-completion'], quizKey),
  ).toBe(true);
});

test('a stale preview requires a new review and preserves a newer external value', async ({ page }) => {
  await seedProgress(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Progress backup' }).click();
  await page.getByLabel('Choose progress backup file').setInputFiles('tests/fixtures/progress-backups/empty-v1.json');
  await expect(page.getByRole('button', { name: 'Restore backup' })).toBeEnabled();
  const changed = await page.evaluate((key) => {
    const progress = JSON.parse(localStorage.getItem(key)!);
    progress.revision = '00000000-0000-4000-8000-000000000009';
    const raw = JSON.stringify(progress);
    localStorage.setItem(key, raw); // Models a legacy/external writer; it is not fenced by Web Locks.
    return raw;
  }, quizKey);
  await page.getByRole('button', { name: 'Restore backup' }).click();
  await expect(page.getByRole('alert')).toContainText('progress changed');
  await expect(page.getByRole('heading', { name: 'Backup preview' })).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), quizKey)).toBe(changed);
  expect(await page.evaluate((key) => localStorage.getItem(key), journalKey)).toBeNull();
});

test('duplicate restore clicks cannot dismiss recovery and retry returns to an unlocked dialog', async ({ page }) => {
  await seedProgress(page);
  await page.addInitScript(() => {
    const remove = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      if (key === 'meducation.progress.restore.v1' && (window as unknown as { denyCleanup: boolean }).denyCleanup)
        throw new DOMException('Denied', 'SecurityError');
      return remove.call(this, key);
    };
    const set = Storage.prototype.setItem;
    (window as unknown as { journalWrites: number }).journalWrites = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'meducation.progress.restore.v1') (window as unknown as { journalWrites: number }).journalWrites++;
      return set.call(this, key, value);
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Progress backup' }).click();
  await page.getByLabel('Choose progress backup file').setInputFiles('tests/fixtures/progress-backups/empty-v1.json');
  await expect(page.getByRole('button', { name: 'Restore backup' })).toBeEnabled();
  await page.evaluate(() => {
    (window as unknown as { denyCleanup: boolean }).denyCleanup = true;
  });
  await page.getByRole('button', { name: 'Restore backup' }).evaluate((button) => {
    button.click();
    button.click();
  });
  await expect(page.getByRole('alert').filter({ hasText: 'needs recovery' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Progress backup' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { journalWrites: number }).journalWrites)).toBe(2);
  await page.evaluate(() => {
    (window as unknown as { denyCleanup: boolean }).denyCleanup = false;
  });
  await page.getByRole('button', { name: 'Retry recovery' }).click();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Backup preview' })).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), journalKey)).toBeNull();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('backup from results review requires leave confirmation and cancelled confirmation keeps review', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await page.getByRole('button', { name: 'Exam Mode' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
  await page.getByRole('button', { name: 'Progress backup' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review results' })).toBeVisible();
  await page.getByRole('button', { name: 'Review results' }).click();
  const saved = await page.evaluate((key) => localStorage.getItem(key), quizKey);
  await page.getByRole('button', { name: 'Progress backup' }).click();
  await expect(page.getByRole('dialog', { name: 'Leave review?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep reviewing' }).click();
  await expect(page.getByLabel(/Final time:/)).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Progress backup' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Progress backup' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Progress backup' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: 'Retake quiz' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Browse Answers' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Open quiz' }).click();
  await page.getByRole('button', { name: 'Progress backup' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Four is the sum of two and two.')).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), quizKey)).toBe(saved);
});

test('active flashcard study disables backup with save-and-leave guidance', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Flashcards' }).click();
  await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
  await page.getByRole('button', { name: 'Study deck' }).click();
  await expect(page.getByText('Card 1 of 2')).toBeVisible();
  const backup = page.getByRole('button', { name: 'Progress backup' });
  await expect(backup).toBeDisabled();
  const description = await backup.getAttribute('aria-describedby');
  expect(await page.locator(`[id="${description}"]`).textContent()).toContain('Save and leave');
});

for (const feature of ['quiz', 'flashcards'] as const) {
  test(`opening backup cancels a pending ${feature} launch without reopening study`, async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested!: () => void;
    const requestStarted = new Promise<void>((resolve) => {
      requested = resolve;
    });
    let completed!: () => void;
    const requestDone = new Promise<void>((resolve) => {
      completed = resolve;
    });
    const pattern =
      feature === 'quiz' ? /\/api\/v1\/quizzes\/[^/]+\/questions/ : /\/api\/v1\/flashcards\/decks\/[^/]+\/cards/;
    await page.route(pattern, async (route) => {
      requested();
      await held;
      await route.continue().catch(() => undefined);
      completed();
    });
    await page.goto('/');
    if (feature === 'flashcards') await page.getByRole('button', { name: 'Flashcards' }).click();
    await page.getByRole('button', { name: 'Open Browser Test Subject' }).click();
    await page.getByRole('button', { name: feature === 'quiz' ? 'Start quiz' : 'Study deck' }).click();
    if (feature === 'quiz') await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
    await requestStarted;
    await page.getByRole('button', { name: 'Progress backup' }).click();
    release();
    await requestDone;
    await expect(page.getByRole('dialog', { name: 'Progress backup' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Browser Test Subject' })).toBeVisible();
    await expect(page.getByRole('radio')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reveal answer' })).toHaveCount(0);
    expect(
      await page.evaluate(
        ({ quizKey, flashcardsKey }) => [localStorage.getItem(quizKey), localStorage.getItem(flashcardsKey)],
        { quizKey, flashcardsKey },
      ),
    ).toEqual([null, null]);
  });
}

for (const conflict of [false, true]) {
  test(`boot recovery ${conflict ? 'preserves a conflicting third value' : 'restores corrupt originals without pretending export succeeded'}`, async ({
    page,
  }) => {
    const source = JSON.parse(await readFile('tests/fixtures/progress-backups/empty-v1.json', 'utf8'));
    const imported = {
      quiz: JSON.stringify({ ...source.quiz, revision: '00000000-0000-4000-8000-000000000001' }),
      flashcards: JSON.stringify({ ...source.flashcards, revision: '00000000-0000-4000-8000-000000000002' }),
    };
    await page.addInitScript(
      ({ conflict, imported, quizKey, flashcardsKey, journalKey }) => {
        if (sessionStorage.getItem('l1-journal-seeded')) return;
        sessionStorage.setItem('l1-journal-seeded', 'yes');
        localStorage.setItem(
          journalKey,
          JSON.stringify({
            format: 'meducation-progress-restore-journal',
            version: 1,
            operationId: '00000000-0000-4000-8000-000000000003',
            decision: 'original',
            original: { quiz: '{corrupt original', flashcards: null },
            imported,
          }),
        );
        localStorage.setItem(quizKey, conflict ? 'external third value' : imported.quiz);
        localStorage.setItem(flashcardsKey, imported.flashcards);
      },
      { conflict, imported, quizKey, flashcardsKey, journalKey },
    );
    await page.goto('/');
    if (conflict) {
      await expect(page.getByRole('alert')).toContainText('needs recovery');
      expect(await page.evaluate((key) => localStorage.getItem(key), quizKey)).toBe('external third value');
      expect(await page.evaluate((key) => localStorage.getItem(key), journalKey)).not.toBeNull();
    } else {
      await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
      expect(await page.evaluate((key) => localStorage.getItem(key), quizKey)).toBe('{corrupt original');
      expect(await page.evaluate((key) => localStorage.getItem(key), flashcardsKey)).toBeNull();
      expect(await page.evaluate((key) => localStorage.getItem(key), journalKey)).toBeNull();
      await page.getByRole('button', { name: 'Progress backup' }).click();
      await page.getByRole('button', { name: 'Download backup', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('could not be backed up');
    }
  });
}

test('competing utilities keep both snapshots gated while one tab may commit', async ({ page, context }) => {
  await seedProgress(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Progress backup' }).click();
  await page.getByLabel('Choose progress backup file').setInputFiles('tests/fixtures/progress-backups/empty-v1.json');
  await expect(page.getByRole('button', { name: 'Restore backup' })).toBeEnabled();
  const second = await context.newPage();
  const errors: string[] = [];
  for (const current of [page, second]) current.on('pageerror', (error) => errors.push(error.name));
  await second.goto('/');
  await second.getByRole('button', { name: 'Progress backup' }).click();
  await Promise.all([
    page.getByRole('button', { name: 'Restore backup' }).click(),
    second.getByLabel('Choose progress backup file').setInputFiles('tests/fixtures/progress-backups/empty-v1.json'),
  ]);
  for (const current of [page, second]) {
    await expect(current.getByRole('status')).toHaveCount(0);
    const cancel = current.getByRole('button', { name: 'Cancel', exact: true });
    if (await cancel.count()) {
      await expect(cancel).toBeEnabled();
      await cancel.click();
    }
    await expect(current.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  }
  expect(errors).toEqual([]);
  const actual = await second.evaluate(
    ({ quizKey, flashcardsKey, journalKey }) => ({
      quiz: JSON.parse(localStorage.getItem(quizKey)!),
      flashcards: JSON.parse(localStorage.getItem(flashcardsKey)!),
      journal: localStorage.getItem(journalKey),
    }),
    { quizKey, flashcardsKey, journalKey },
  );
  expect(actual.journal).toBeNull();
  expect([0, 1]).toContain(actual.quiz.completed.length);
  expect(Object.keys(actual.flashcards.checkpoints)).toHaveLength(actual.quiz.completed.length);
});

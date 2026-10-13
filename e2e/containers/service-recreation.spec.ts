import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('paired browser progress survives frontend service recreation at the same origin', async ({ page }) => {
  test.setTimeout(90_000);
  const populated = JSON.parse(await readFile('tests/fixtures/progress-backups/populated-v1.json', 'utf8'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await page.evaluate(({ quiz, flashcards }) => {
    localStorage.setItem('meducation.progress.v2', JSON.stringify({ ...quiz, revision: 'recreation-quiz' }));
    localStorage.setItem(
      'meducation.flashcards.progress.v2',
      JSON.stringify({ ...flashcards, revision: 'recreation-flashcards' }),
    );
  }, populated);
  const capture = () =>
    page.evaluate(() => [
      localStorage.getItem('meducation.progress.v2'),
      localStorage.getItem('meducation.flashcards.progress.v2'),
    ]);
  const original = await capture();
  expect(original.every(Boolean)).toBe(true);
  const origin = new URL(page.url()).origin;
  const container = process.env.MEDUCATION_SMOKE_FRONTEND;
  const runId = process.env.MEDUCATION_SMOKE_RUN_ID;
  const python = process.env.MEDUCATION_SMOKE_PYTHON;
  expect(container).toBeTruthy();
  expect(runId).toBeTruthy();
  expect(python).toBeTruthy();
  const previous = execFileSync('docker', ['inspect', '--format', '{{.Id}}', container!], {
    encoding: 'utf8',
    timeout: 15_000,
  }).trim();
  const replacement = execFileSync(
    python!,
    ['scripts/containers/recreate-smoke-frontend.py', '--container', container!, '--run-id', runId!],
    { encoding: 'utf8', timeout: 60_000 },
  ).trim();
  expect(replacement).not.toBe(previous);
  await expect
    .poll(
      async () => {
        try {
          return (await page.request.get('/health/frontend')).status();
        } catch {
          return 0;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(200);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  expect(new URL(page.url()).origin).toBe(origin);
  expect(await capture()).toEqual(original);
  expect(await page.evaluate(() => isSecureContext && !!navigator.locks)).toBe(true);
});

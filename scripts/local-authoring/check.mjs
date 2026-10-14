import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ baseURL: 'http://127.0.0.1:5173' });
  await page.goto('http://127.0.0.1:5173/admin.html');
  const refused = await page.request.get('/api/admin/draft');
  assert.equal(refused.status(), 401);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const popup = await popupPromise;
  await popup.getByRole('button', { name: 'Continue as local editor (development only)' }).click();
  await page.getByRole('button', { name: 'Quizzes', exact: true }).waitFor({ timeout: 120_000 });
  const response = await page.request.get('/api/admin/draft');
  assert.equal(response.status(), 200);
  const draft = await response.json();
  const expected = {
    quizzes: JSON.parse(await readFile('src/content/questionBank.generated.json', 'utf8')),
    flashcards: JSON.parse(await readFile('src/content/flashcardBank.generated.json', 'utf8')),
  };
  assert.ok(
    JSON.stringify(draft.pair) === JSON.stringify(expected),
    'Current paired draft differs from frozen cutover export',
  );
  const health = await page.request.get('http://127.0.0.1:8001/health/ready');
  assert.equal(health.status(), 200);
  assert.deepEqual(await health.json(), { status: 'ready' });
  const session = await (await page.request.get('/api/admin/session')).json();
  assert.equal(session.fresh, true);
  assert.equal(session.authenticated, true);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
  assert.equal((await page.request.get('/api/admin/draft')).status(), 401);
  console.log(
    'Actual local authority: unauthenticated denial, explicit development sign-in, exact paired draft, fresh session, health and logout passed. No content write performed.',
  );
} finally {
  await browser.close();
}

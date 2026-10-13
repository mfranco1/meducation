import { expect, test } from '@playwright/test';

test('production learner keeps QA/admin absent and uses the same-origin API with Web Locks', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url());
  });
  await page.goto('/#content-qa');
  await expect(page.getByRole('heading', { name: 'All Subjects' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Flashcards', exact: true })).toBeVisible();
  expect(await page.evaluate(() => ({ secure: isSecureContext, locks: !!navigator.locks }))).toEqual({
    secure: true,
    locks: true,
  });
  expect(apiRequests.length).toBeGreaterThan(0);
  const origin = new URL(page.url()).origin;
  expect(apiRequests.every((url) => new URL(url).origin === origin)).toBe(true);
  for (const path of ['/admin.html', '/src/content/questionBank.generated.json', '/.vite/manifest.json']) {
    expect((await page.request.get(path)).status()).toBe(404);
  }
});

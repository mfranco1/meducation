import { expect, test as base, type Page } from '@playwright/test';
import type { DraftSnapshot } from '../../src/admin/data/DraftStore';

export { expect } from '@playwright/test';

// Tests share one disposable database and run serially. Browser contexts alone
// do not isolate the database-wide authentication rate bucket.
export const test = base.extend<{ authRateIsolation: void }>({
  authRateIsolation: [
    async ({ request }, use) => {
      const response = await request.post('/fixture/reset-auth-rate-limits');
      expect(response.status()).toBe(200);
      await use();
    },
    { auto: true },
  ],
});

export async function login(page: Page) {
  await page.goto('/admin.html');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Quizzes', exact: true })).toBeVisible();
  page.on('dialog', (dialog) => void dialog.accept());
  // Tests share one database: every test starts from the published content, not another test's draft.
  const reset = await adminApi(page, 'POST', '/draft/discard', {});
  expect(reset.ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Quizzes', exact: true })).toBeVisible();
}

/** The draft as the server holds it right now, read with the page's session. */
export async function draft(page: Page): Promise<DraftSnapshot> {
  const response = await page.request.get('/api/admin/draft');
  expect(response.ok()).toBe(true);
  return response.json();
}

/** A protected editor call made directly with the page's session, Origin and CSRF token. */
export async function adminApi(page: Page, method: 'POST' | 'PUT' | 'DELETE', path: string, data: unknown = {}) {
  const session = await (await page.request.get('/api/admin/session')).json();
  return page.request.fetch('/api/admin' + path, {
    method,
    data,
    headers: { Origin: new URL(page.url()).origin, 'X-CSRF-Token': session.csrfToken },
  });
}

export const quizEditor = (page: Page) => page.getByRole('region', { name: 'Quiz editor' });
export const flashcardEditor = (page: Page) => page.getByRole('region', { name: 'Flashcard editor' });

export async function selectQuiz(page: Page) {
  const nav = page.getByRole('region', { name: 'Quiz navigator' });
  await nav.getByRole('combobox', { name: 'Subject', exact: true }).fill('Anatomía');
  await page.getByRole('option', { name: 'Anatomía · s1', exact: true }).click();
  await nav.getByRole('combobox', { name: 'Quiz', exact: true }).click();
  await page.getByRole('listbox').getByRole('option').first().click();
  return nav;
}
export async function selectFlashcards(page: Page) {
  await page.getByRole('tab', { name: 'Flashcards', exact: true }).click();
  await page.getByRole('combobox', { name: 'Subject', exact: true }).fill('Anatomía');
  await page.getByRole('option', { name: 'Anatomía', exact: true }).click();
  await page.getByRole('combobox', { name: 'Deck', exact: true }).click();
  await page.getByRole('listbox').getByRole('option').first().click();
  return page.getByRole('region', { name: 'Flashcard navigator' });
}
/** Opens the first question of the seeded quiz and returns its JSON text box. */
export async function openQuestion(page: Page) {
  const nav = await selectQuiz(page);
  await nav.getByRole('button', { name: /1\. i1/ }).click();
  await quizEditor(page).getByRole('tab', { name: 'JSON', exact: true }).click();
  return quizEditor(page).getByRole('textbox', { name: 'JSON', exact: true });
}
export const saveButton = (region: ReturnType<typeof quizEditor>) =>
  region.getByRole('button', { name: 'Save', exact: true });

export async function refreshAuthentication(page: Page) {
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Refresh authentication' }).click();
  const popup = await opened;
  // Session probes can set/clear cookies. Do not race them against the OIDC
  // callback; closure means the editor received completion and refreshed context.
  await expect.poll(() => popup.isClosed()).toBe(true);
}
export async function moreMenu(page: Page, item: string) {
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
}
/** Reverts the most recent change from the Changes dialog. */
export async function revertLatest(page: Page) {
  const latest = (await draft(page)).latestChangeId;
  await moreMenu(page, 'Changes…');
  const dialog = page.getByRole('dialog', { name: 'Changes', exact: true });
  await dialog.getByRole('button', { name: `Revert change ${latest}`, exact: true }).click();
  await expect.poll(async () => (await draft(page)).latestChangeId).toBeGreaterThan(latest);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
}

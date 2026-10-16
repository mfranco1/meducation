import { expect, test } from './fixtures';
import { contentCases } from '../support/contentCases';

for (const candidate of contentCases()) {
  test(`L6 HTTP editor exact content display ${candidate.label}`, async ({ page }, testInfo) => {
    const { item, subject, quiz } = candidate;
    await page.route('**/api/admin/draft', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.pair = {
        quizzes: { schemaVersion: 4, subjects: [subject], quizzes: [quiz], questions: [item] },
        flashcards: { schemaVersion: 2, decks: [], cards: [] },
      };
      await route.fulfill({ response, json: body });
    });
    let writes = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && /\/api\/admin\/(draft|publish|ids)/.test(request.url())) writes++;
    });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/admin.html');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Quizzes', exact: true })).toBeVisible();
    await page.addStyleTag({ content: 'html {font-size:20px}' });
    const nav = page.getByRole('region', { name: 'Quiz navigator' });
    await nav.getByRole('combobox', { name: 'Subject', exact: true }).click();
    await page.getByRole('listbox').getByRole('option').first().click();
    await nav.getByRole('combobox', { name: 'Quiz', exact: true }).click();
    await page.getByRole('listbox').getByRole('option').first().click();
    await nav.getByRole('button', { name: new RegExp(`^1\\. ${item.id}\\b`) }).click();
    await page.getByRole('region', { name: 'Quiz editor' }).getByRole('tab', { name: 'JSON', exact: true }).click();
    const editor = page
      .getByRole('region', { name: 'Quiz editor' })
      .getByRole('textbox', { name: 'JSON', exact: true });
    expect(JSON.parse(await editor.inputValue())).toEqual(item);
    expect(await page.evaluate(() => (window as Window & { __rcExecuted?: boolean }).__rcExecuted)).toBeUndefined();
    for (const width of [390, 1048, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await editor.focus();
      await expect(editor).toBeFocused();
      const save = page
        .getByRole('region', { name: 'Quiz editor' })
        .getByRole('button', { name: 'Review save', exact: true });
      await save.scrollIntoViewIfNeeded();
      await expect(save).toBeInViewport();
      await page.screenshot({ path: testInfo.outputPath(`editor-content-${width}.png`), fullPage: true });
    }
    expect(writes).toBe(0);
  });
}

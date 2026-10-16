import type { Page } from '@playwright/test';
import type { PairedSnapshot } from '../../src/admin/data/PairedHttpClient';
import { expect, test } from './fixtures';

async function login(page: Page) {
  await page.goto('/admin.html');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Quizzes', exact: true })).toBeVisible();
  page.on('dialog', (dialog) => void dialog.accept());
}
async function draft(page: Page): Promise<PairedSnapshot> {
  const response = await page.request.get('/api/admin/draft');
  expect(response.ok()).toBe(true);
  return response.json();
}
async function selectQuiz(page: Page) {
  const nav = page.getByRole('region', { name: 'Quiz navigator' });
  await nav.getByRole('combobox', { name: 'Subject', exact: true }).fill('Anatomía');
  await page.getByRole('option', { name: 'Anatomía · s1', exact: true }).click();
  await nav.getByRole('combobox', { name: 'Quiz', exact: true }).click();
  await page.getByRole('listbox').getByRole('option').first().click();
  return nav;
}
async function selectFlashcards(page: Page) {
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await page.getByRole('combobox', { name: 'Subject', exact: true }).fill('Anatomía');
  await page.getByRole('option', { name: 'Anatomía', exact: true }).click();
  await page.getByRole('combobox', { name: 'Deck', exact: true }).click();
  await page.getByRole('listbox').getByRole('option').first().click();
  return page.getByRole('region', { name: 'Flashcard navigator' });
}

test('selected quiz deletion can be cancelled and one server undo restores the entire pair', async ({ page }) => {
  await login(page);
  const nav = await selectQuiz(page);
  // Ensure a non-empty quiz remains after the selected batch is deleted.
  await nav.getByRole('button', { name: 'Add', exact: true }).last().click();
  const editor = page.getByRole('region', { name: 'Quiz editor' });
  await editor.getByRole('textbox', { name: 'JSON', exact: true }).fill(
    JSON.stringify({
      items: [
        {
          stem: 'Batch deletion first',
          choices: ['Alpha', 'Beta'],
          answer: 'A',
          verifiedAnswer: 'B',
          rationale: 'Reviewed reason.',
        },
        { stem: 'Batch deletion second', choices: ['Alpha', 'Beta'], answer: 'A', rationale: 'Reviewed reason.' },
      ],
    }),
  );
  await editor.getByRole('button', { name: 'Preview', exact: true }).click();
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect
    .poll(async () => (await draft(page)).pair.quizzes.questions.some((row) => row.stem === 'Batch deletion second'))
    .toBe(true);
  const before = await draft(page);
  const rows = nav.getByRole('button').filter({ has: page.locator('.MuiListItemText-root') });
  const count = await rows.count();
  expect(count).toBeGreaterThan(2);
  await nav.getByRole('button', { name: 'Select', exact: true }).click();
  await nav.getByRole('button', { name: 'Select this page' }).click();
  await nav.getByRole('checkbox').last().uncheck();
  await nav.getByRole('button', { name: 'Delete selected…' }).click();
  const review = page.getByRole('dialog', { name: 'Delete selected items?' });
  await expect(review).toContainText(`${count - 1} items`);
  await expect(review.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await draft(page)).draft.revision).toBe(before.draft.revision);
  await expect(rows).toHaveCount(count);
  await nav.getByRole('button', { name: 'Delete selected…' }).click();
  await review.getByRole('button', { name: 'Save selected items deletion' }).click();
  await expect(rows).toHaveCount(1);
  expect((await draft(page)).publication).toEqual(before.publication);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Undo last saved change…' }).click();
  await expect(rows).toHaveCount(count);
  expect((await draft(page)).pair).toEqual(before.pair);
});

test('selected flashcard deletion saves to PostgreSQL and one server undo restores every card', async ({ page }) => {
  await login(page);
  const nav = await selectFlashcards(page);
  const before = await draft(page);
  const rows = nav.getByRole('button').filter({ has: page.locator('.MuiListItemText-root') });
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  await nav.getByRole('button', { name: 'Select', exact: true }).click();
  await nav.getByRole('button', { name: 'Select this page' }).click();
  await nav.getByRole('button', { name: 'Delete selected…' }).click();
  const review = page.getByRole('dialog', { name: 'Delete selected cards?' });
  await expect(review).toContainText(`${count} cards`);
  await review.getByRole('button', { name: 'Save selected cards deletion' }).click();
  await expect(rows).toHaveCount(0);
  expect((await draft(page)).publication).toEqual(before.publication);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Undo last saved change…' }).click();
  await expect(rows).toHaveCount(count);
  expect((await draft(page)).pair).toEqual(before.pair);
});

test('declining a shared subject deletion preserves hidden unsaved flashcard text', async ({ page }) => {
  await login(page);
  const nav = await selectFlashcards(page);
  await nav
    .getByRole('button')
    .filter({ has: page.locator('.MuiListItemText-root') })
    .first()
    .click();
  const editor = page
    .getByRole('region', { name: 'Flashcard editor' })
    .getByRole('textbox', { name: 'JSON', exact: true });
  const text = JSON.stringify({ ...JSON.parse(await editor.inputValue()), front: 'Hidden unsaved flashcard text' });
  await editor.fill(text);
  const before = await draft(page);
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Workspace status: Unsaved edits', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review & publish', exact: true })).toBeDisabled();
  await expect(page.getByText('Save or discard unsaved edits in Flashcards before publishing.')).toBeVisible();
  const quizNav = await selectQuiz(page);
  await quizNav.getByRole('button', { name: 'Delete', exact: true }).first().click();
  page.removeAllListeners('dialog');
  let discarded = false;
  page.on('dialog', async (dialog) => {
    discarded = true;
    expect(dialog.message()).toContain('unstaged flashcard drafts');
    await dialog.dismiss();
  });
  const review = page.getByRole('dialog', { name: 'Delete subject?' });
  await review.getByRole('button', { name: 'Save subject deletion' }).click();
  await expect.poll(() => discarded).toBe(true);
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await expect(editor).toHaveValue(text);
  expect((await draft(page)).pair).toEqual(before.pair);
  expect((await draft(page)).draft.revision).toBe(before.draft.revision);
});

for (const width of [390, 1048, 1440]) {
  test(`both PostgreSQL editor panels use available width at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    for (const [section, prefix] of [
      ['Quizzes', 'Quiz'],
      ['Flashcards', 'Flashcard'],
    ]) {
      await page.getByRole('button', { name: section, exact: true }).click();
      const navigator = page.getByRole('region', { name: `${prefix} navigator` });
      const editor = page.getByRole('region', { name: `${prefix} editor` });
      await expect(editor).toBeVisible();
      const nav = (await navigator.boundingBox())!;
      const edit = (await editor.boundingBox())!;
      const parentWidth = await navigator.evaluate((el) => el.parentElement!.getBoundingClientRect().width);
      if (width < 1200) {
        expect(Math.abs(nav.width - parentWidth)).toBeLessThan(2);
        expect(Math.abs(edit.width - parentWidth)).toBeLessThan(2);
        expect(edit.y).toBeGreaterThan(nav.y + nav.height);
      } else {
        expect(Math.abs(edit.y - nav.y)).toBeLessThan(2);
        expect(edit.x).toBeGreaterThan(nav.x + nav.width);
      }
      expect(nav.height).toBeLessThan(edit.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect.poll(() => navigator.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('14px');
    }
  });
}

test('saves deck and card CRUD, order, and cross-deck moves through paired drafts', async ({ page }) => {
  await login(page);
  await selectFlashcards(page);
  const initial = await draft(page);
  const nav = page.getByRole('region', { name: 'Flashcard navigator' });
  await nav.getByRole('button', { name: 'Add', exact: true }).first().click();
  const add = page.getByRole('dialog', { name: 'Add Decks' });
  await add.getByRole('textbox', { name: 'JSON' }).fill(
    JSON.stringify({
      decks: [
        {
          name: 'CRUD source deck',
          cards: [
            { front: 'CRUD first', back: 'First back' },
            { front: 'CRUD second', back: 'Second back' },
          ],
        },
        { name: 'CRUD destination deck' },
      ],
    }),
  );
  await add.getByRole('button', { name: 'Preview', exact: true }).click();
  await add.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(add).not.toBeVisible();
  const created = (await draft(page)).pair.flashcards;
  const source = created.decks.find((row) => row.name === 'CRUD source deck')!;
  const destination = created.decks.find((row) => row.name === 'CRUD destination deck')!;
  const second = created.cards.find((row) => row.front === 'CRUD second')!;
  const first = created.cards.find((row) => row.front === 'CRUD first')!;
  await nav.getByRole('button', { name: /CRUD second/ }).click();
  const editor = page.getByRole('region', { name: 'Flashcard editor' });
  await editor
    .getByRole('textbox', { name: 'JSON', exact: true })
    .fill(JSON.stringify({ ...second, back: 'Updated exact back\n' }));
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect
    .poll(async () => (await draft(page)).pair.flashcards.cards.find((row) => row.id === second.id)?.back)
    .toBe('Updated exact back\n');
  await editor.getByRole('button', { name: 'Record actions' }).click();
  await page.getByRole('menuitem', { name: 'Move up', exact: true }).click();
  await expect
    .poll(async () =>
      (await draft(page)).pair.flashcards.cards.filter((row) => row.deckId === source.id).map((row) => row.id),
    )
    .toEqual([second.id, first.id]);
  await editor
    .getByRole('textbox', { name: 'JSON', exact: true })
    .fill(JSON.stringify({ ...second, deckId: destination.id, back: 'Updated exact back\n' }));
  await editor.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect
    .poll(async () => (await draft(page)).pair.flashcards.cards.find((row) => row.id === second.id)?.deckId)
    .toBe(destination.id);
  const picker = nav.getByRole('combobox', { name: 'Deck' });
  await picker.fill(source.name);
  await page.getByRole('option', { name: 'CRUD source deck · 1 cards', exact: true }).click();
  const beforeDelete = await draft(page);
  await nav.getByRole('button', { name: 'Delete', exact: true }).last().click();
  const review = page.getByRole('dialog', { name: 'Delete deck?' });
  await expect(review).toContainText('1 cards');
  await review.getByRole('button', { name: 'Save deck deletion' }).click();
  await expect
    .poll(async () => (await draft(page)).pair.flashcards.decks.some((row) => row.id === source.id))
    .toBe(false);
  expect((await draft(page)).pair.flashcards.cards.some((row) => row.id === first.id)).toBe(false);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Undo last saved change…' }).click();
  await expect.poll(async () => (await draft(page)).pair).toEqual(beforeDelete.pair);
  const final = await draft(page);
  expect(final.publication).toEqual(initial.publication);
  for (const original of initial.pair.flashcards.cards)
    expect(final.pair.flashcards.cards.find((row) => row.id === original.id)).toEqual(original);
});

test('cancelled quiz context changes restore picker text and preserve the unsaved record', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Add subject', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Quiz editor' }).getByRole('textbox', { name: 'JSON', exact: true });
  await editor.fill(JSON.stringify({ ...JSON.parse(await editor.inputValue()), name: 'Context destination subject' }));
  await page
    .getByRole('region', { name: 'Quiz editor' })
    .getByRole('button', { name: 'Save draft', exact: true })
    .click();
  await expect
    .poll(async () =>
      (await draft(page)).pair.quizzes.subjects.some((row) => row.name === 'Context destination subject'),
    )
    .toBe(true);
  const nav = await selectQuiz(page);
  await nav.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const text = JSON.stringify({ ...JSON.parse(await editor.inputValue()), name: 'Unsaved subject name' });
  await editor.fill(text);
  const before = await draft(page);
  page.removeAllListeners('dialog');
  page.on('dialog', (dialog) => void dialog.dismiss());
  const picker = nav.getByRole('combobox', { name: 'Subject', exact: true });
  await picker.fill('Context destination subject');
  await page.getByRole('option', { name: /Context destination subject/ }).click();
  await expect(picker).toHaveValue('Anatomía · s1');
  await expect(editor).toHaveValue(text);
  expect((await draft(page)).draft.revision).toBe(before.draft.revision);
});

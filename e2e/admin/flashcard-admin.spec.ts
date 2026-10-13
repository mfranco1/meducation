import { expect, test } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StoredFlashcardBank, StoredQuestionBank } from '../../src/content/schema/schema';

const questionFixture = JSON.parse(
  await readFile(new URL('../../tests/fixtures/question-bank.json', import.meta.url), 'utf8'),
) as StoredQuestionBank;

const flashcardFixture = JSON.parse(
  await readFile(new URL('../../tests/fixtures/flashcard-bank-contract.json', import.meta.url), 'utf8'),
) as { bank: StoredFlashcardBank };

// Keep authoring flows independent of the size and ordering of authored content.
// Serve the same populated baseline to every importer, including reset/replay.
test.beforeEach(async ({ page }) => {
  await page.route(/\/src\/content\/questionBank\.generated\.json(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export default ${JSON.stringify(questionFixture)};`,
    }),
  );
  await page.route(/\/src\/content\/flashcardBank\.generated\.json(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export default ${JSON.stringify(flashcardFixture.bank)};`,
    }),
  );
});

test('keeps the admin controls themed, keyboard accessible, and within a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin.html');
  await expect(page.getByRole('button', { name: 'Quizzes', exact: true })).toBeVisible({ timeout: 30_000 });

  const navigator = page.locator('main .MuiPaper-root').first();
  await expect.poll(() => navigator.evaluate((element) => getComputedStyle(element).borderRadius)).toBe('14px');
  await page.getByRole('button', { name: 'Add subject', exact: true }).click();

  const stage = page.getByRole('button', { name: 'Stage', exact: true });
  await expect(stage).toBeEnabled();
  await expect
    .poll(() => stage.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe('rgb(185, 81, 27)');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await stage.focus();
  await expect(stage).toBeFocused();
});

async function selectSubject(page: import('@playwright/test').Page, id = 's1') {
  const label = questionFixture.subjects.find((subject) => subject.id === id)?.name ?? id;
  await page.getByRole('combobox', { name: 'Subject' }).fill(label);
  await page.getByRole('option', { name: label, exact: true }).click();
}

async function selectDeck(page: import('@playwright/test').Page, name: string) {
  const picker = page.getByRole('combobox', { name: 'Deck' });
  await picker.fill(name);
  await page.getByRole('option', { name: new RegExp(`^${name} ·`) }).click();
}

async function expectSelectedDeck(page: import('@playwright/test').Page, name: string, cardCount: number) {
  await expect(page.getByRole('combobox', { name: 'Deck' })).toHaveValue(`${name} · ${cardCount} cards`);
}

test('stages deck and card CRUD and previews an exported replay', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const downloads: import('@playwright/test').Download[] = [];
  page.on('download', (download) => {
    if (['flashcardBank.generated.json', 'flashcard-bank-change-set.json'].includes(download.suggestedFilename())) {
      downloads.push(download);
    }
  });
  await page.goto('/admin.html');
  await expect(page.getByText('Admin', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Flashcards' }).click();

  await selectSubject(page);
  await selectDeck(page, 'No cards yet');
  await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
  const deckEditor = page.getByRole('textbox', { name: 'JSON' });
  const deck = JSON.parse(await deckEditor.inputValue()) as { id: string; subjectId: string; name: string };
  expect(deck.subjectId).toBe('s1');
  await deckEditor.fill(JSON.stringify({ ...deck, name: 'Admin browser deck' }, null, 2));
  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  await expectSelectedDeck(page, 'Admin browser deck', 0);

  await page.getByRole('button', { name: 'Add', exact: true }).last().click();
  await expect(page.getByRole('dialog', { name: 'Add Cards' })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'JSON' })
    .fill(JSON.stringify({ cards: [{ front: 'Admin front', back: 'Admin back' }] }));
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  await expect(page.getByRole('button', { name: /Admin front/ })).toBeVisible();
  await page.getByRole('button', { name: /Admin front/ }).click();
  const editor = page.getByRole('textbox', { name: 'JSON' });
  const card = JSON.parse(await editor.inputValue()) as { id: string; deckId: string; front: string; back: string };

  await page.getByRole('button', { name: 'Export flashcards' }).click();
  await expect.poll(() => downloads.length).toBe(2);
  const changeSetDownload = downloads.find((item) => item.suggestedFilename() === 'flashcard-bank-change-set.json');
  expect(changeSetDownload).toBeDefined();
  const changeSetPath = testInfo.outputPath('flashcard-bank-change-set.json');
  await mkdir(dirname(changeSetPath), { recursive: true });
  await changeSetDownload!.saveAs(changeSetPath);
  const exported = JSON.parse(await readFile(changeSetPath, 'utf8')) as {
    reason: string;
    operations: Array<{ op: string }>;
  };
  expect(exported.reason).toBe('Local flashcard content edit');
  expect(exported.operations.map((operation) => operation.op)).toEqual(['deck.update', 'card.create']);

  await page.getByRole('button', { name: 'Workspace' }).click();
  await page.getByRole('menuitem', { name: 'Reset flashcards' }).click();
  await page.getByRole('button', { name: 'Workspace' }).click();
  await page.getByRole('menuitem', { name: 'Import change set' }).click();
  await page.locator('input[type="file"]').last().setInputFiles(changeSetPath);
  await expect(page.getByText('Import preview')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Resulting flashcard bank' })).toContainText('Admin back');
  await page.getByRole('button', { name: 'Stage import' }).click();
  await expect(page.getByRole('button', { name: 'Export flashcards' })).toBeEnabled();

  await selectSubject(page);
  await selectDeck(page, 'Admin browser deck');
  await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
  await page.getByRole('button', { name: /Admin front/ }).click();
  await editor.fill(JSON.stringify({ ...card, front: 'Admin front', back: 'Updated admin back' }, null, 2));
  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).last().click();
  await expect(page.getByRole('dialog', { name: 'Add Cards' })).toBeVisible();
  await page
    .getByRole('textbox', { name: 'JSON' })
    .fill(JSON.stringify({ cards: [{ front: 'Second front', back: 'Second back' }] }));
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  await page.getByRole('button', { name: /Second front/ }).click();
  const secondCard = JSON.parse(await editor.inputValue()) as typeof card;
  await page.getByRole('button', { name: 'Record actions' }).click();
  await page.getByRole('menuitem', { name: 'Move up' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Add Decks' })).toBeVisible();
  await page.getByRole('textbox', { name: 'JSON' }).fill(JSON.stringify({ decks: [{ name: 'Destination deck' }] }));
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  await selectDeck(page, 'Destination deck');
  await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
  const secondDeck = JSON.parse(await editor.inputValue()) as typeof deck;
  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  await selectDeck(page, 'Admin browser deck');
  await page.getByRole('button', { name: /Second front/ }).click();
  await editor.fill(
    JSON.stringify({ ...secondCard, deckId: secondDeck.id, front: 'Second front', back: 'Second back' }, null, 2),
  );
  await page.getByRole('button', { name: 'Stage' }).click();
  await expectSelectedDeck(page, 'Destination deck', 1);

  await selectDeck(page, 'Admin browser deck');
  await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
  const deletion = page.getByRole('dialog', { name: 'Delete deck?' });
  await expect(deletion).toContainText('1 cards');
  await expect(deletion.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await deletion.getByRole('button', { name: 'Stage deck deletion' }).click();
  await expect(page.getByRole('button', { name: /Admin front/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: /Admin front/ })).toBeVisible();
  await page.getByRole('button', { name: 'Export flashcards' }).click();
  await expect.poll(() => downloads.length).toBe(4);
  const finalBank = downloads.filter((item) => item.suggestedFilename() === 'flashcardBank.generated.json').at(-1)!;
  const finalBankPath = testInfo.outputPath('final-flashcard-bank.json');
  await finalBank.saveAs(finalBankPath);
  const content = JSON.parse(await readFile(finalBankPath, 'utf8')) as {
    cards: Array<{ id: string; deckId: string; back: string }>;
  };
  expect(content.cards.find((item) => item.id === card.id)?.back).toBe('Updated admin back');
  expect(content.cards.find((item) => item.id === secondCard.id)?.deckId).toBe(secondDeck.id);
  for (const fixtureCard of flashcardFixture.bank.cards) {
    expect(content.cards.find((item) => item.id === fixtureCard.id)).toEqual(fixtureCard);
  }

  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await page.getByRole('button', { name: 'Add subject', exact: true }).click();
  const quizEditor = page.getByRole('textbox', { name: 'JSON', exact: true });
  const newSubject = JSON.parse(await quizEditor.inputValue()) as { id: string; name: string; accent: string };
  await quizEditor.fill(JSON.stringify({ ...newSubject, name: 'Temporary shared subject' }));
  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await page.getByRole('combobox', { name: 'Subject' }).fill('Temporary shared subject');
  await expect(page.getByRole('option', { name: 'Temporary shared subject', exact: true })).toBeVisible();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('BOTH Quizzes and Flashcards');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Workspace' }).click();
  await page.getByRole('menuitem', { name: 'Reset both banks' }).click();
  await expect(page.getByText('Temporary shared subject', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('quiz Add requires a successful preview before staging', async ({ page }) => {
  await page.goto('/admin.html');
  await expect(page.getByText('Admin', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: 'Add', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'JSON', exact: true });
  await editor.fill(
    JSON.stringify({
      subject: { name: 'Previewed subject' },
      quizzes: [
        {
          name: 'Previewed quiz',
          items: [
            {
              stem: 'Previewed item',
              choices: ['First', 'Second'],
              answer: 'A',
              rationale: 'Static rationale',
            },
          ],
        },
      ],
    }),
  );
  const action = page.getByRole('button', { name: 'Preview', exact: true });
  await action.click();
  await expect(page.getByText(/generated IDs\. First IDs/)).toBeVisible();
  const stage = page.getByRole('button', { name: 'Stage', exact: true });
  await expect(stage).toBeVisible();
  await expect(stage).toBeFocused();
  await stage.click();
  await expect(page.getByText('Bulk add staged. Export the updated bank and change set.')).toBeVisible();
});

test('bulk adds cards, decks, and nested cards through preview, one-step undo, and change-set replay', async ({
  page,
}, testInfo) => {
  const downloads: import('@playwright/test').Download[] = [];
  page.on('download', (download) => downloads.push(download));
  await page.goto('/admin.html');
  await expect(page.getByText('Admin', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Flashcards' }).click();

  await selectSubject(page);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('textbox', { name: 'JSON' }).fill(
    JSON.stringify({
      decks: [
        { name: 'Empty bulk deck' },
        {
          name: 'Nested bulk deck',
          cards: [
            { front: 'Nested question one', back: 'Nested answer one' },
            { front: 'Nested question two', back: 'Nested answer two' },
          ],
        },
      ],
    }),
  );
  await page.getByRole('button', { name: 'Preview' }).click();
  const preview = page.getByRole('region', { name: 'Bulk add preview' });
  await expect(preview).toContainText('2 deck(s)');
  await page.getByRole('button', { name: 'Next deck' }).click();
  await expect(preview).toContainText('Nested question two');
  await page.getByRole('button', { name: 'Stage' }).click();
  await expectSelectedDeck(page, 'Empty bulk deck', 0);
  await selectDeck(page, 'Nested bulk deck');
  await page.getByRole('button', { name: 'Add', exact: true }).last().click();
  const cardBatch = JSON.stringify({
    cards: [{ front: 'Appended question', back: 'Appended answer', reviewNote: 'Reviewed' }],
  });
  await page
    .locator('input[type="file"]')
    .last()
    .setInputFiles({
      name: 'cards.json',
      mimeType: 'application/json',
      buffer: Buffer.from(cardBatch),
    });
  await expect(page.getByRole('textbox', { name: 'JSON' })).toHaveValue(cardBatch);
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('region', { name: 'Bulk add preview' })).toContainText('Appended question');
  await page.getByRole('button', { name: 'Stage' }).click();
  await expectSelectedDeck(page, 'Nested bulk deck', 3);

  await page.getByRole('button', { name: 'Export flashcards' }).click();
  await expect.poll(() => downloads.length).toBe(2);
  const changeSetDownload = downloads.find((item) => item.suggestedFilename() === 'flashcard-bank-change-set.json');
  expect(changeSetDownload).toBeDefined();
  const changeSetPath = testInfo.outputPath('flashcard-bulk-change-set.json');
  await mkdir(dirname(changeSetPath), { recursive: true });
  await changeSetDownload!.saveAs(changeSetPath);
  const exported = JSON.parse(await readFile(changeSetPath, 'utf8')) as { operations: Array<{ op: string }> };
  expect(exported.operations.map((operation) => operation.op)).toEqual([
    'deck.create',
    'deck.create',
    'card.create',
    'card.create',
    'card.create',
  ]);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expectSelectedDeck(page, 'Nested bulk deck', 2);
  await page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Discard every staged');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Workspace' }).click();
  await page.getByRole('menuitem', { name: 'Reset flashcards' }).click();
  await page.getByRole('button', { name: 'Workspace' }).click();
  await page.getByRole('menuitem', { name: 'Import change set' }).click();
  await page.locator('input[type="file"]').last().setInputFiles(changeSetPath);
  await expect(page.getByText('Import preview')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Resulting flashcard bank' })).toContainText('Appended answer');
  await page.getByRole('button', { name: 'Stage import' }).click();
  await selectSubject(page);
  await selectDeck(page, 'Empty bulk deck');
  await expectSelectedDeck(page, 'Empty bulk deck', 0);
  await selectDeck(page, 'Nested bulk deck');
  await expectSelectedDeck(page, 'Nested bulk deck', 3);

  await page.getByRole('button', { name: 'Add', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'JSON' }).fill(
    JSON.stringify({
      decks: [
        { name: 'Valid draft deck' },
        { name: 'Invalid nested deck', cards: [{ front: '<script>bad</script>', back: 'Safe' }] },
      ],
    }),
  );
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByText(/\$\.decks\[1\]\.cards\[0\].*unsupported HTML/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview' })).toBeEnabled();
  await page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Discard the unstaged bulk JSON draft');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await selectDeck(page, 'Empty bulk deck');
  await expectSelectedDeck(page, 'Empty bulk deck', 0);
  await expect(page.getByRole('button', { name: /Valid draft deck/ })).toHaveCount(0);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1048, height: 739 },
  { width: 1440, height: 900 },
]) {
  test(`both admin panels use the available width at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/admin.html');
    for (const [section, prefix] of [
      ['Quizzes', 'Quiz'],
      ['Flashcards', 'Flashcard'],
    ]) {
      await page.getByRole('button', { name: section, exact: true }).click();
      const navigator = page.getByRole('region', { name: `${prefix} navigator` });
      const editor = page.getByRole('region', { name: `${prefix} editor` });
      await expect(editor).toBeVisible();
      const navBounds = (await navigator.boundingBox())!;
      const editorBounds = (await editor.boundingBox())!;
      const parentWidth = await navigator.evaluate((element) => element.parentElement!.getBoundingClientRect().width);
      if (viewport.width < 1200) {
        expect(Math.abs(navBounds.width - parentWidth)).toBeLessThan(2);
        expect(Math.abs(editorBounds.width - parentWidth)).toBeLessThan(2);
        expect(editorBounds.y).toBeGreaterThan(navBounds.y + navBounds.height);
      } else {
        expect(Math.abs(editorBounds.y - navBounds.y)).toBeLessThan(2);
        expect(editorBounds.x).toBeGreaterThan(navBounds.x + navBounds.width);
      }
      if (viewport.width === 1048 && section === 'Quizzes')
        await testInfo.attach('admin-width-1048-quizzes', {
          body: await page.screenshot({ path: testInfo.outputPath('admin-width-1048-quizzes.png'), fullPage: true }),
          contentType: 'image/png',
        });
      expect(navBounds.height).toBeLessThan(editorBounds.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

test('reviews selected quiz items, cancels safely, and deletes them in one undoable batch', async ({ page }) => {
  await page.goto('/admin.html');
  const navigator = page.getByRole('region', { name: 'Quiz navigator' });
  await navigator.getByRole('combobox', { name: 'Subject' }).fill('Subject One');
  await page.getByRole('option', { name: 'Subject One · s1', exact: true }).click();
  await navigator.getByRole('combobox', { name: 'Quiz' }).fill('First quiz');
  await page.getByRole('option', { name: 'First quiz · q1', exact: true }).click();
  const rows = navigator.getByRole('button').filter({ has: page.locator('.MuiListItemText-root') });
  const originalCount = await rows.count();
  await navigator.getByRole('button', { name: 'Select', exact: true }).click();
  await navigator.getByRole('button', { name: 'Select this page' }).click();
  await navigator.getByRole('checkbox').last().uncheck();
  await navigator.getByRole('button', { name: 'Delete selected…' }).click();
  const review = page.getByRole('dialog', { name: 'Delete selected items?' });
  await expect(review).toContainText(`${originalCount - 1} items`);
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(rows).toHaveCount(originalCount);
  await navigator.getByRole('button', { name: 'Delete selected…' }).click();
  await review.getByRole('button', { name: 'Stage selected items deletion' }).click();
  await expect(page.getByText('Deletion staged. Export the updated bank and change set.')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(rows).toHaveCount(originalCount);
});

test('reviews selected flashcards and restores the complete batch with one Undo', async ({ page }) => {
  await page.goto('/admin.html');
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  const sourceCard = flashcardFixture.bank.cards[0];
  const sourceDeck = flashcardFixture.bank.decks.find((deck) => deck.id === sourceCard.deckId)!;
  await selectSubject(page, sourceDeck.subjectId);
  await selectDeck(page, sourceDeck.name);
  const navigator = page.getByRole('region', { name: 'Flashcard navigator' });
  const rows = navigator.getByRole('button').filter({ has: page.locator('.MuiListItemText-root') });
  const originalCount = await rows.count();
  expect(originalCount).toBeGreaterThan(0);
  await navigator.getByRole('button', { name: 'Select', exact: true }).click();
  await navigator.getByRole('button', { name: 'Select this page' }).click();
  await navigator.getByRole('button', { name: 'Delete selected…' }).click();
  const review = page.getByRole('dialog', { name: 'Delete selected cards?' });
  await expect(review).toContainText(`${originalCount} cards`);
  await review.getByRole('button', { name: 'Stage selected cards deletion' }).click();
  await expect(rows).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(rows).toHaveCount(originalCount);
});

test('paired subject deletion guards later quiz edits and restores both banks with Undo', async ({ page }) => {
  await page.goto('/admin.html');
  const navigator = page.getByRole('region', { name: 'Quiz navigator' });
  await navigator.getByRole('combobox', { name: 'Subject' }).fill('Subject One');
  await page.getByRole('option', { name: 'Subject One · s1', exact: true }).click();
  await navigator.getByRole('button', { name: 'Delete', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Delete subject?' })
    .getByRole('button', { name: 'Stage subject deletion' })
    .click();
  await page.getByRole('button', { name: 'Add subject', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'JSON', exact: true });
  const subject = JSON.parse(await editor.inputValue());
  await editor.fill(JSON.stringify({ ...subject, name: 'Later subject' }));
  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByText('Undo later quiz edits before undoing the paired transaction.')).toBeVisible();
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Export quizzes', exact: true })).toBeHidden();
  await selectSubject(page, 's1');
  const sourceDeck = flashcardFixture.bank.decks.find((deck) => deck.subjectId === 's1')!;
  await selectDeck(page, sourceDeck.name);
  await expectSelectedDeck(
    page,
    sourceDeck.name,
    flashcardFixture.bank.cards.filter((card) => card.deckId === sourceDeck.id).length,
  );
});

test('keeps an unstaged flashcard draft when a paired subject deletion is declined', async ({ page }) => {
  await page.goto('/admin.html');
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  const sourceCard = flashcardFixture.bank.cards[0];
  const sourceDeck = flashcardFixture.bank.decks.find((deck) => deck.id === sourceCard.deckId)!;
  await selectSubject(page, sourceDeck.subjectId);
  await selectDeck(page, sourceDeck.name);
  await page
    .getByRole('region', { name: 'Flashcard navigator' })
    .getByRole('button')
    .filter({ has: page.locator('.MuiListItemText-root') })
    .first()
    .click();
  const editor = page.getByRole('textbox', { name: 'JSON', exact: true });
  const card = JSON.parse(await editor.inputValue());
  const draft = JSON.stringify({ ...card, front: 'Unstaged card draft' });
  await editor.fill(draft);
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  const subject = questionFixture.subjects.find((subject) => subject.id === sourceDeck.subjectId)!;
  await page.getByRole('combobox', { name: 'Subject' }).fill(subject.name);
  await page.getByRole('option', { name: `${subject.name} · ${subject.id}`, exact: true }).click();
  await page
    .getByRole('region', { name: 'Quiz navigator' })
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('unstaged flashcard drafts');
    await dialog.dismiss();
  });
  const review = page.getByRole('dialog', { name: 'Delete subject?' });
  await review.getByRole('button', { name: 'Stage subject deletion' }).click();
  await expect(review).toBeVisible();
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'JSON', exact: true })).toHaveValue(draft);
  await expectSelectedDeck(
    page,
    sourceDeck.name,
    flashcardFixture.bank.cards.filter((card) => card.deckId === sourceDeck.id).length,
  );
});

test('restores quiz picker text and keeps the editor when a context change is cancelled', async ({ page }) => {
  await page.goto('/admin.html');
  const navigator = page.getByRole('region', { name: 'Quiz navigator' });
  const picker = navigator.getByRole('combobox', { name: 'Subject' });
  await picker.fill('Subject One');
  await page.getByRole('option', { name: 'Subject One · s1', exact: true }).click();
  await navigator.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'JSON', exact: true });
  const subject = JSON.parse(await editor.inputValue());
  const draft = JSON.stringify({ ...subject, name: 'Unstaged subject name' });
  await editor.fill(draft);
  await picker.fill('Subject Two');
  page.once('dialog', async (dialog) => {
    await dialog.dismiss();
  });
  await page.getByRole('option', { name: 'Subject Two · s2', exact: true }).click();
  await expect(picker).toHaveValue('Subject One · s1');
  await expect(editor).toHaveValue(draft);
});

import { expect, test } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { StoredFlashcardBank } from '../../src/content/schema/schema';

const flashcardFixture = JSON.parse(
  await readFile(new URL('../../tests/fixtures/flashcard-bank-contract.json', import.meta.url), 'utf8'),
) as { bank: StoredFlashcardBank };

// Keep authoring flows independent of the size and ordering of authored content.
// Serve the same populated baseline to every importer, including reset/replay.
test.beforeEach(async ({ page }) => {
  await page.route(/\/src\/content\/flashcardBank\.generated\.json(?:\?.*)?$/, (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: `export default ${JSON.stringify(flashcardFixture.bank)};`,
    }),
  );
});

function deckRow(page: import('@playwright/test').Page, name: string) {
  return page.getByRole('button', { name: new RegExp(`^${name} \\d+ cards$`) }).locator('..');
}

test('stages deck and card CRUD and previews an exported replay', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const downloads: import('@playwright/test').Download[] = [];
  page.on('download', (download) => downloads.push(download));
  await page.goto('/admin.html');
  await expect(page.getByText('Admin', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Flashcards' }).click();

  await page.getByRole('button', { name: 'Add deck' }).first().click();
  const editor = page.getByRole('textbox', { name: 'Record JSON' });
  const deckEditor = page.getByRole('textbox', { name: 'Record JSON' });
  const deck = JSON.parse(await deckEditor.inputValue()) as { id: string; subjectId: string; name: string };
  expect(deck.subjectId).toBe('s1');
  await deckEditor.fill(JSON.stringify({ ...deck, name: 'Admin browser deck' }, null, 2));
  await page.getByRole('button', { name: 'Stage record' }).click();
  await expect(page.getByRole('button', { name: /Admin browser deck/ })).toBeVisible();

  await deckRow(page, 'Admin browser deck').getByRole('button', { name: 'Add card', exact: true }).click();
  const cardEditor = page.getByRole('textbox', { name: 'Record JSON' });
  const card = JSON.parse(await cardEditor.inputValue()) as { id: string; deckId: string; front: string; back: string };
  expect(card.deckId).toBe(deck.id);
  await cardEditor.fill(JSON.stringify({ ...card, front: 'Admin front', back: 'Admin back' }, null, 2));
  await page.getByRole('button', { name: 'Stage record' }).click();
  await expect(page.getByRole('button', { name: /Admin front Card/ })).toBeVisible();

  await page.getByRole('button', { name: 'Export flashcard JSON and change set' }).click();
  await expect.poll(() => downloads.length).toBe(2);
  const changeSetDownload = downloads.find((item) => item.suggestedFilename() === 'flashcard-bank-change-set.json');
  expect(changeSetDownload).toBeDefined();
  const changeSetPath = testInfo.outputPath('flashcard-bank-change-set.json');
  await mkdir(dirname(changeSetPath), { recursive: true });
  await changeSetDownload!.saveAs(changeSetPath);
  const exported = JSON.parse(await readFile(changeSetPath, 'utf8')) as { operations: Array<{ op: string }> };
  expect(exported.operations.map((operation) => operation.op)).toEqual(['deck.create', 'card.create']);

  await expect(page.getByRole('button', { name: 'Reset' })).toBeEnabled();
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByRole('button', { name: 'Import change set' }).click();
  await page.locator('input[type="file"]').last().setInputFiles(changeSetPath);
  await expect(page.getByText('Import preview')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Resulting flashcard bank' })).toContainText('Admin back');
  await page.getByRole('button', { name: 'Stage import' }).click();
  await expect(page.getByRole('button', { name: 'Export flashcard JSON and change set' })).toBeEnabled();

  await page.getByRole('button', { name: /Admin front Card/ }).click();
  await editor.fill(JSON.stringify({ ...card, front: 'Admin front', back: 'Updated admin back' }, null, 2));
  await page.getByRole('button', { name: 'Stage record' }).click();
  await deckRow(page, 'Admin browser deck').getByRole('button', { name: 'Add card', exact: true }).click();
  const secondCard = JSON.parse(await editor.inputValue()) as typeof card;
  await editor.fill(JSON.stringify({ ...secondCard, front: 'Second front', back: 'Second back' }, null, 2));
  await page.getByRole('button', { name: 'Stage record' }).click();
  await page.getByRole('button', { name: 'Move up' }).click();
  await page.getByRole('button', { name: 'Add deck' }).first().click();
  const secondDeck = JSON.parse(await editor.inputValue()) as typeof deck;
  await editor.fill(JSON.stringify({ ...secondDeck, name: 'Destination deck' }, null, 2));
  await page.getByRole('button', { name: 'Stage record' }).click();
  await page.getByRole('button', { name: /Second front Card/ }).click();
  await editor.fill(
    JSON.stringify({ ...secondCard, deckId: secondDeck.id, front: 'Second front', back: 'Second back' }, null, 2),
  );
  await page.getByRole('button', { name: 'Stage record' }).click();
  await expect(page.getByRole('button', { name: 'Destination deck 1 cards' })).toBeVisible();

  await page.getByRole('button', { name: /Admin browser deck/ }).click();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('1 card(s)');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('button', { name: /Admin front Card/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('button', { name: /Admin front Card/ })).toBeVisible();
  await page.getByRole('button', { name: 'Export flashcard JSON and change set' }).click();
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
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Subject', exact: true }).click();
  const quizEditor = page.getByRole('textbox', { name: 'JSON', exact: true });
  const newSubject = JSON.parse(await quizEditor.inputValue()) as { id: string; name: string; accent: string };
  await quizEditor.fill(JSON.stringify({ ...newSubject, name: 'Temporary shared subject' }));
  await page.getByRole('button', { name: 'Stage', exact: true }).click();
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await expect(page.getByText('Temporary shared subject', { exact: true })).toBeVisible();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('BOTH Quizzes and Flashcards');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Reset both banks' }).click();
  await expect(page.getByText('Temporary shared subject', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('bulk adds cards, decks, and nested cards through preview, one-step undo, and change-set replay', async ({
  page,
}, testInfo) => {
  const downloads: import('@playwright/test').Download[] = [];
  page.on('download', (download) => downloads.push(download));
  await page.goto('/admin.html');
  await expect(page.getByText('Admin', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Flashcards' }).click();

  await page.getByRole('button', { name: 'Bulk add decks' }).first().click();
  await page.getByRole('textbox', { name: 'Bulk JSON' }).fill(
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
  await expect(preview).toContainText('Nested question two');
  await page.getByRole('button', { name: 'Stage batch' }).click();
  await expect(page.getByRole('button', { name: 'Empty bulk deck 0 cards' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nested bulk deck 2 cards' })).toBeVisible();

  await deckRow(page, 'Nested bulk deck').getByRole('button', { name: 'Bulk add cards', exact: true }).click();
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
  await expect(page.getByRole('textbox', { name: 'Bulk JSON' })).toHaveValue(cardBatch);
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('region', { name: 'Bulk add preview' })).toContainText('Appended question');
  await page.getByRole('button', { name: 'Stage batch' }).click();
  await expect(page.getByRole('button', { name: 'Nested bulk deck 3 cards' })).toBeVisible();

  await page.getByRole('button', { name: 'Export flashcard JSON and change set' }).click();
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
  await expect(page.getByRole('button', { name: 'Nested bulk deck 2 cards' })).toBeVisible();
  await page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Discard every staged');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.getByRole('button', { name: 'Import change set' }).click();
  await page.locator('input[type="file"]').last().setInputFiles(changeSetPath);
  await expect(page.getByText('Import preview')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Resulting flashcard bank' })).toContainText('Appended answer');
  await page.getByRole('button', { name: 'Stage import' }).click();
  await expect(page.getByRole('button', { name: 'Empty bulk deck 0 cards' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nested bulk deck 3 cards' })).toBeVisible();

  await page.getByRole('button', { name: 'Bulk add decks' }).first().click();
  await page.getByRole('textbox', { name: 'Bulk JSON' }).fill(
    JSON.stringify({
      decks: [
        { name: 'Valid draft deck' },
        { name: 'Invalid nested deck', cards: [{ front: '<script>bad</script>', back: 'Safe' }] },
      ],
    }),
  );
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByText(/\$\.decks\[1\]\.cards\[0\].*unsupported HTML/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stage batch' })).toBeDisabled();
  await page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Discard the unstaged bulk JSON draft');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Empty bulk deck 0 cards' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Valid draft deck/ })).toHaveCount(0);
});

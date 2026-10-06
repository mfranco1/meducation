import { expect, test } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

test('stages topic, deck, and card CRUD and previews an exported replay', async ({ page }, testInfo) => {
  const downloads: import('@playwright/test').Download[] = [];
  page.on('download', (download) => downloads.push(download));
  await page.goto('/admin.html');
  await expect(page.getByText('Admin', { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Flashcards' }).click();

  await page.getByRole('button', { name: 'Add topic' }).first().click();
  const editor = page.getByRole('textbox', { name: 'Record JSON' });
  const topic = JSON.parse(await editor.inputValue()) as { id: string; subjectId: string; name: string };
  expect(topic.subjectId).toBe('s1');
  await editor.fill(JSON.stringify({ ...topic, name: 'Admin browser topic' }, null, 2));
  await page.getByRole('button', { name: 'Stage record' }).click();
  await expect(page.getByRole('button', { name: 'Admin browser topic Topic' })).toBeVisible();

  await page.getByRole('button', { name: 'Add deck' }).first().click();
  const deckEditor = page.getByRole('textbox', { name: 'Record JSON' });
  const deck = JSON.parse(await deckEditor.inputValue()) as { id: string; topicId: string; name: string };
  expect(deck.topicId).toBe(topic.id);
  await deckEditor.fill(JSON.stringify({ ...deck, name: 'Admin browser deck' }, null, 2));
  await page.getByRole('button', { name: 'Stage record' }).click();
  await expect(page.getByRole('button', { name: /Admin browser deck/ })).toBeVisible();

  await page.getByRole('button', { name: 'Add card' }).first().click();
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
  expect(exported.operations.map((operation) => operation.op)).toEqual(['topic.create', 'deck.create', 'card.create']);

  await page.getByRole('button', { name: 'Import change set' }).click();
  await page.locator('input[type="file"]').last().setInputFiles(changeSetPath);
  await expect(page.getByText('Import preview')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Resulting flashcard bank' })).toContainText('Admin back');
  await page.getByRole('button', { name: 'Stage import' }).click();
  await expect(page.getByRole('button', { name: 'Export flashcard JSON and change set' })).toBeEnabled();
});

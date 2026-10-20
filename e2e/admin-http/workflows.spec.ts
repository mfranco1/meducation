import {
  draft,
  expect,
  flashcardEditor,
  login,
  moreMenu,
  quizEditor,
  revertLatest,
  saveButton,
  selectFlashcards,
  selectQuiz,
  test,
} from './fixtures';

test('adds a topic, quiz and questions in bulk, then decks and cards; deletes the topic with its cascade and reverts it', async ({
  page,
}) => {
  await login(page);
  const original = await draft(page);
  const nav = await selectQuiz(page);
  await nav.getByRole('button', { name: 'Add quizzes', exact: true }).click();
  const editor = quizEditor(page).getByRole('textbox', { name: 'JSON', exact: true });
  await page.getByLabel('Destination', { exact: true }).click();
  await page.getByRole('option', { name: 'Create topics and quizzes' }).click();
  await editor.fill(
    JSON.stringify({
      topics: [
        {
          name: 'HTTP grouped topic',
          quizzes: [
            {
              name: 'HTTP grouped quiz',
              items: [
                {
                  stem: 'Grouped source stem',
                  choices: ['Alpha', 'Beta'],
                  answer: 'B',
                  rationale: 'Static reviewed rationale',
                },
                {
                  stem: 'Grouped second stem',
                  choices: ['Gamma', 'Delta'],
                  answer: 'B',
                  rationale: 'Second rationale',
                },
              ],
            },
          ],
        },
      ],
    }),
  );
  await saveButton(quizEditor(page)).click();
  await expect
    .poll(async () => (await draft(page)).questions.some((row) => row.stem === 'Grouped second stem'))
    .toBe(true);
  const saved = await draft(page);
  const topic = saved.topics.find((row) => row.name === 'HTTP grouped topic')!;
  const quiz = saved.quizzes.find((row) => row.name === 'HTTP grouped quiz')!;
  const items = saved.questions.filter((row) => row.quizId === quiz.id);
  expect(quiz.topicId).toBe(topic.id);
  expect(topic.subjectId).toBe(original.subjects[0].id);
  expect(items.map((row) => row.stem)).toEqual(['Grouped source stem', 'Grouped second stem']);
  expect(items[0]).toMatchObject({ answer: 'B' });
  expect(items[0].choices).toEqual([
    { id: 'A', text: 'Alpha' },
    { id: 'B', text: 'Beta' },
  ]);
  // IDs are the server's: they continue the existing numbering.
  expect(topic.id).not.toBe('t1');
  expect(saved.changed).toBe(true);
  await page.getByRole('tab', { name: 'Flashcards', exact: true }).click();
  const flashNav = page.getByRole('region', { name: 'Flashcard navigator' });
  await flashNav.getByRole('combobox', { name: 'Subject', exact: true }).click();
  await page.getByRole('listbox').getByRole('option').first().click();
  await flashNav.getByRole('combobox', { name: 'Topic', exact: true }).click();
  await page.getByRole('listbox').getByRole('option', { name: 'HTTP grouped topic', exact: true }).click();
  await flashNav.getByRole('button', { name: 'Add decks', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add Decks' });
  await add.getByRole('textbox', { name: 'JSON' }).fill(
    JSON.stringify({
      decks: [
        {
          name: 'Bulk deck',
          cards: [{ front: 'Exact grouped front $x^2$', back: 'Exact grouped back\n', sources: 'Static source' }],
        },
      ],
    }),
  );
  await add.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(add).not.toBeVisible();
  const paired = await draft(page);
  const deck = paired.decks.find((row) => row.name === 'Bulk deck')!;
  const card = paired.cards.find((row) => row.front === 'Exact grouped front $x^2$')!;
  expect(deck.topicId).toBe(topic.id);
  expect(card).toMatchObject({ deckId: deck.id, back: 'Exact grouped back\n', sources: 'Static source' });
  // Cancel keeps everything; confirming deletes the topic with its quizzes, items, decks and cards.
  await page.getByRole('tab', { name: 'Quizzes', exact: true }).click();
  await nav.getByRole('combobox', { name: 'Topic', exact: true }).click();
  await page
    .getByRole('listbox')
    .getByRole('option', { name: /HTTP grouped topic/ })
    .click();
  await nav.getByRole('button', { name: 'Topic actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete topic…', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Delete topic?' });
  await expect(review).toContainText('1 topics · 1 quizzes · 2 items · 1 decks · 1 cards');
  await expect(review.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await draft(page)).latestChangeId).toBe(paired.latestChangeId);
  await nav.getByRole('button', { name: 'Topic actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete topic…', exact: true }).click();
  await review.getByRole('button', { name: 'Delete topic', exact: true }).click();
  await expect.poll(async () => (await draft(page)).topics.some((row) => row.id === topic.id)).toBe(false);
  const deleted = await draft(page);
  for (const [rows, id] of [
    [deleted.quizzes, quiz.id],
    [deleted.decks, deck.id],
    [deleted.cards, card.id],
  ] as const)
    expect((rows as { id: string }[]).some((row) => row.id === id)).toBe(false);
  expect(deleted.questions.some((row) => row.quizId === quiz.id)).toBe(false);
  // Revert is per record: the topic comes back; its deleted children are separate changes.
  await revertLatest(page);
  const restored = await draft(page);
  expect(restored.topics.find((row) => row.id === topic.id)).toMatchObject({ name: 'HTTP grouped topic' });
  expect(restored.topics.map((row) => row.id)).toEqual([...original.topics.map((row) => row.id), topic.id]);
});

test('selected question deletion can be canceled, deletes only the selection, and one revert restores a question', async ({
  page,
}) => {
  await login(page);
  const nav = await selectQuiz(page);
  await nav.getByRole('button', { name: 'Add questions', exact: true }).click();
  await quizEditor(page)
    .getByRole('textbox', { name: 'JSON', exact: true })
    .fill(
      JSON.stringify({
        items: [
          { stem: 'Batch deletion first', choices: ['Alpha', 'Beta'], answer: 'A', rationale: 'Reviewed reason.' },
          { stem: 'Batch deletion second', choices: ['Alpha', 'Beta'], answer: 'A', rationale: 'Reviewed reason.' },
        ],
      }),
    );
  await saveButton(quizEditor(page)).click();
  await expect
    .poll(async () => (await draft(page)).questions.some((row) => row.stem === 'Batch deletion second'))
    .toBe(true);
  const before = await draft(page);
  await quizEditor(page).getByRole('tab', { name: 'Record', exact: true }).click();
  const rows = nav.getByRole('button').filter({ has: page.locator('.MuiListItemText-root') });
  await expect(rows).toHaveCount(3);
  await nav.getByRole('button', { name: 'Select', exact: true }).click();
  await nav.getByRole('button', { name: 'Select this page' }).click();
  await nav.getByRole('checkbox').first().uncheck();
  await nav.getByRole('button', { name: 'Delete selected…' }).click();
  const review = page.getByRole('dialog', { name: 'Delete selected items?' });
  await expect(review).toContainText('2 items');
  await expect(review.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await draft(page)).latestChangeId).toBe(before.latestChangeId);
  await nav.getByRole('button', { name: 'Delete selected…' }).click();
  await review.getByRole('button', { name: 'Delete selected items', exact: true }).click();
  await expect(rows).toHaveCount(1);
  const after = await draft(page);
  expect(after.questions.map((row) => row.id)).toEqual([before.questions[0].id]);
  expect(after.publicationSequence).toBe(before.publicationSequence);
  await revertLatest(page);
  await expect(rows).toHaveCount(2);
  expect((await draft(page)).questions.map((row) => row.stem)).toContain('Batch deletion second');
});

test('selected card deletion saves to PostgreSQL and a revert restores a card', async ({ page }) => {
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
  await review.getByRole('button', { name: 'Delete selected cards', exact: true }).click();
  await expect(review).not.toBeVisible();
  await expect(rows).toHaveCount(0);
  expect((await draft(page)).cards).toEqual([]);
  await revertLatest(page);
  await expect(rows).toHaveCount(1);
  expect((await draft(page)).cards[0]).toMatchObject({
    id: before.cards.at(-1)!.id,
    front: before.cards.at(-1)!.front,
  });
});

test('discard replaces unpublished changes with the published version', async ({ page }) => {
  await login(page);
  const before = await draft(page);
  const nav = await selectQuiz(page);
  await nav.getByRole('button', { name: /1\. i1/ }).click();
  await quizEditor(page).getByRole('tab', { name: 'JSON', exact: true }).click();
  const editor = quizEditor(page).getByRole('textbox', { name: 'JSON', exact: true });
  await editor.fill(JSON.stringify({ ...JSON.parse(await editor.inputValue()), stem: 'To be discarded' }));
  await saveButton(quizEditor(page)).click();
  await expect.poll(async () => (await draft(page)).changed).toBe(true);
  await moreMenu(page, 'Discard unpublished changes…');
  const dialog = page.getByRole('dialog', { name: 'Discard unpublished changes', exact: true });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await draft(page)).questions[0].stem).toBe('To be discarded');
  await moreMenu(page, 'Discard unpublished changes…');
  await dialog.getByRole('button', { name: 'Discard unpublished changes', exact: true }).click();
  await expect(page.getByText(/Unpublished changes discarded/)).toBeVisible();
  const after = await draft(page);
  expect(after.changed).toBe(false);
  // Discard writes the published records back; their concurrency versions move on, their content does not.
  const content = (rows: Array<{ version: number }>) => rows.map(({ version: _version, ...row }) => row);
  expect(content(after.questions)).toEqual(content(before.questions));
  expect(after.publicationSequence).toBe(before.publicationSequence);
  // The open editor followed the server back to the published record.
  expect(JSON.parse(await editor.inputValue()).stem).toBe(before.questions[0].stem);
  await expect(page.getByRole('button', { name: 'Review & publish', exact: true })).toBeDisabled();
});

for (const width of [390, 1048, 1440]) {
  test(`both PostgreSQL editor panels use available width at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    for (const [section, prefix] of [
      ['Quizzes', 'Quiz'],
      ['Flashcards', 'Flashcard'],
    ]) {
      await page.getByRole('tab', { name: section, exact: true }).click();
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
      // Empty editors are compact; navigator height is determined by its own content.
      expect(nav.width).toBeGreaterThan(0);
      await expect(editor.getByRole('textbox', { name: 'JSON', exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect.poll(() => navigator.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('14px');
      await page.screenshot({ path: testInfo.outputPath(`workspace-${prefix}-${width}.png`), fullPage: true });
    }
  });
}

test('saves deck and card CRUD, order, and cross-deck moves through record calls', async ({ page }) => {
  await login(page);
  await selectFlashcards(page);
  const initial = await draft(page);
  const nav = page.getByRole('region', { name: 'Flashcard navigator' });
  await nav.getByRole('button', { name: 'Add decks', exact: true }).click();
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
  await add.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(add).not.toBeVisible();
  const created = await draft(page);
  const source = created.decks.find((row) => row.name === 'CRUD source deck')!;
  const destination = created.decks.find((row) => row.name === 'CRUD destination deck')!;
  const first = created.cards.find((row) => row.front === 'CRUD first')!;
  const second = created.cards.find((row) => row.front === 'CRUD second')!;
  await nav.getByRole('button', { name: /CRUD second/ }).click();
  const editor = flashcardEditor(page);
  await editor.getByRole('tab', { name: 'JSON', exact: true }).click();
  await editor
    .getByRole('textbox', { name: 'JSON', exact: true })
    .fill(JSON.stringify({ ...second, back: 'Updated exact back\n' }));
  await saveButton(editor).click();
  await expect
    .poll(async () => (await draft(page)).cards.find((row) => row.id === second.id)?.back)
    .toBe('Updated exact back\n');
  await editor.getByRole('button', { name: 'Record actions' }).click();
  await page.getByRole('menuitem', { name: 'Move up', exact: true }).click();
  await expect
    .poll(async () => (await draft(page)).cards.filter((row) => row.deckId === source.id).map((row) => row.id))
    .toEqual([second.id, first.id]);
  await editor.getByRole('textbox', { name: 'JSON', exact: true }).fill(
    JSON.stringify({
      ...(await draft(page)).cards.find((row) => row.id === second.id),
      deckId: destination.id,
      version: undefined,
    }),
  );
  await saveButton(editor).click();
  await expect
    .poll(async () => (await draft(page)).cards.find((row) => row.id === second.id)?.deckId)
    .toBe(destination.id);
  await nav.getByRole('combobox', { name: 'Deck' }).fill(source.name);
  await page.getByRole('option', { name: 'CRUD source deck · 1 cards', exact: true }).click();
  await nav.getByRole('button', { name: 'Deck actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete deck…', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Delete deck?' });
  await expect(review).toContainText('1 cards');
  await review.getByRole('button', { name: 'Delete deck', exact: true }).click();
  await expect.poll(async () => (await draft(page)).decks.some((row) => row.id === source.id)).toBe(false);
  expect((await draft(page)).cards.some((row) => row.id === first.id)).toBe(false);
  const final = await draft(page);
  expect(final.publicationSequence).toBe(initial.publicationSequence);
  for (const original of initial.cards)
    expect(final.cards.find((row) => row.id === original.id)).toMatchObject({ front: original.front });
});

test('canceled quiz context changes restore picker text and preserve the unsaved record', async ({ page }) => {
  await login(page);
  await page
    .getByRole('region', { name: 'Quiz navigator' })
    .getByRole('button', { name: 'Add subject', exact: true })
    .click();
  const subjectDialog = page.getByRole('dialog', { name: 'Manage subjects', exact: true });
  await subjectDialog.getByRole('tab', { name: 'JSON', exact: true }).click();
  const subjectEditor = subjectDialog.getByRole('textbox', { name: 'JSON', exact: true });
  await expect(subjectEditor).not.toHaveValue('');
  await subjectEditor.fill(
    JSON.stringify({ ...JSON.parse(await subjectEditor.inputValue()), name: 'Context destination subject' }),
  );
  await subjectDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(subjectDialog).not.toBeVisible();
  await expect
    .poll(async () => (await draft(page)).subjects.some((row) => row.name === 'Context destination subject'))
    .toBe(true);
  const nav = await selectQuiz(page);
  await nav.getByRole('button', { name: 'Quiz actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Edit quiz', exact: true }).click();
  await quizEditor(page).getByRole('tab', { name: 'JSON', exact: true }).click();
  const editor = quizEditor(page).getByRole('textbox', { name: 'JSON', exact: true });
  const text = JSON.stringify({ ...JSON.parse(await editor.inputValue()), name: 'Unsaved quiz name' });
  await editor.fill(text);
  const before = await draft(page);
  const picker = nav.getByRole('combobox', { name: 'Subject', exact: true });
  await picker.fill('Context destination subject');
  await page.getByRole('option', { name: /Context destination subject/ }).click();
  await page
    .getByRole('dialog', { name: 'Discard unsaved edits?', exact: true })
    .getByRole('button', { name: 'Keep editing' })
    .click();
  await expect(picker).toHaveValue('Anatomía · s1');
  await expect(editor).toHaveValue(text);
  expect((await draft(page)).latestChangeId).toBe(before.latestChangeId);
});

test('flashcard batch close preserves exact JSON until explicit discard', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  const nav = await selectFlashcards(page);
  const before = await draft(page);
  await nav.getByRole('button', { name: 'Add decks', exact: true }).click();
  const batch = page.getByRole('dialog', { name: 'Add Decks', exact: true });
  const text = JSON.stringify({ decks: [{ name: 'Unsaved batch $x^2$' }] });
  await batch.getByRole('textbox', { name: 'JSON', exact: true }).fill(text);
  await batch.getByRole('button', { name: 'Cancel', exact: true }).click();
  const discard = page.getByRole('dialog', { name: 'Discard unsaved edits?', exact: true });
  await expect(discard.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('admin-discard-390.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(batch.getByRole('textbox', { name: 'JSON', exact: true })).toHaveValue(text);
  await batch.getByRole('button', { name: 'Cancel', exact: true }).click();
  await discard.getByRole('button', { name: 'Discard edits', exact: true }).click();
  await expect(batch).not.toBeVisible();
  const after = await draft(page);
  expect(after.decks).toEqual(before.decks);
  expect(after.latestChangeId).toBe(before.latestChangeId);
});

test('shared subject editing stays in Flashcards and preserves both hidden record drafts', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await login(page);
  const quizNav = await selectQuiz(page);
  await quizNav
    .getByRole('button')
    .filter({ has: page.locator('.MuiListItemText-root') })
    .first()
    .click();
  await quizEditor(page).getByRole('tab', { name: 'JSON', exact: true }).click();
  const quizText = JSON.stringify({
    ...JSON.parse(await quizEditor(page).getByRole('textbox', { name: 'JSON', exact: true }).inputValue()),
    stem: 'Hidden exact quiz $x^2$\n',
  });
  const quizJson = quizEditor(page).getByRole('textbox', { name: 'JSON', exact: true });
  await quizJson.fill(quizText);
  await expect(page.getByRole('tab', { name: 'Quizzes', exact: true })).toHaveAccessibleDescription(/Unsaved/);
  const flashNav = await selectFlashcards(page);
  await flashNav
    .getByRole('button')
    .filter({ has: page.locator('.MuiListItemText-root') })
    .first()
    .click();
  await flashcardEditor(page).getByRole('tab', { name: 'JSON', exact: true }).click();
  const flashEditor = flashcardEditor(page).getByRole('textbox', { name: 'JSON', exact: true });
  const flashText = JSON.stringify({
    ...JSON.parse(await flashEditor.inputValue()),
    front: 'Hidden exact flashcard\n',
  });
  await flashEditor.fill(flashText);
  await expect(page.getByRole('tab', { name: 'Flashcards', exact: true })).toHaveAccessibleDescription(/Unsaved/);
  await expect(page.getByRole('button', { name: 'Review & publish', exact: true })).toBeDisabled();
  const before = await draft(page);
  await flashNav.getByRole('button', { name: 'Manage subjects…', exact: true }).click();
  const subjectDialog = page.getByRole('dialog', { name: 'Manage subjects', exact: true });
  await subjectDialog.getByRole('tab', { name: 'JSON', exact: true }).click();
  const subjectEditor = subjectDialog.getByRole('textbox', { name: 'JSON', exact: true });
  await expect(subjectEditor).not.toHaveValue('');
  const original = JSON.parse(await subjectEditor.inputValue());
  await subjectEditor.fill(JSON.stringify({ ...original, name: 'Shared subject reviewed edit' }));
  await subjectDialog.screenshot({ path: testInfo.outputPath('shared-subject-390.png') });
  await subjectDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(async () => (await draft(page)).subjects.find((row) => row.id === original.id)?.name)
    .toBe('Shared subject reviewed edit');
  await expect(subjectDialog).not.toBeVisible();
  await expect(page.getByRole('tab', { name: 'Flashcards', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(flashEditor).toHaveValue(flashText);
  await page.getByRole('tab', { name: 'Quizzes', exact: true }).click();
  await expect(quizJson).toHaveValue(quizText);
  const saved = await draft(page);
  expect(saved.questions).toEqual(before.questions);
  expect(saved.cards).toEqual(before.cards);
  await revertLatest(page);
  await expect(quizJson).toHaveValue(quizText);
  expect((await draft(page)).subjects.find((row) => row.id === original.id)?.name).toBe(original.name);
});

for (const kind of ['subject', 'quiz', 'deck', 'card', 'question'] as const) {
  test(`structured ${kind} editing preserves untouched fields and exact source through save and revert`, async ({
    page,
  }, testInfo) => {
    await login(page);
    const before = await draft(page);
    const flash = kind === 'deck' || kind === 'card';
    const nav = flash ? await selectFlashcards(page) : await selectQuiz(page);
    let editor = flash ? flashcardEditor(page) : quizEditor(page);
    if (kind === 'subject') {
      await nav.getByRole('button', { name: 'Manage subjects…', exact: true }).click();
      editor = page.getByRole('dialog', { name: 'Manage subjects', exact: true }) as typeof editor;
    } else if (kind === 'quiz' || kind === 'deck') {
      await nav.getByRole('button', { name: kind === 'quiz' ? 'Quiz actions' : 'Deck actions', exact: true }).click();
      await page.getByRole('menuitem', { name: kind === 'quiz' ? 'Edit quiz' : 'Edit deck', exact: true }).click();
    } else {
      await nav
        .getByRole('button')
        .filter({ has: page.locator('.MuiListItemText-root') })
        .first()
        .click();
    }
    const field = kind === 'question' ? 'Question stem' : kind === 'card' ? 'Front' : 'Name';
    await expect(editor.getByRole('textbox', { name: field, exact: true })).toBeVisible();
    await editor.getByRole('tab', { name: 'JSON', exact: true }).click();
    const raw = await editor.getByRole('textbox', { name: 'JSON', exact: true }).inputValue();
    const original = JSON.parse(raw);
    await editor.getByRole('tab', { name: 'Preview', exact: true }).click();
    await editor.getByRole('tab', { name: 'JSON', exact: true }).click();
    await expect(editor.getByRole('textbox', { name: 'JSON', exact: true })).toHaveValue(raw);
    await editor.getByRole('tab', { name: 'Edit', exact: true }).click();
    expect((await draft(page)).latestChangeId).toBe(before.latestChangeId);
    await expect(editor.getByRole('textbox', { name: 'ID', exact: true })).toHaveAttribute('readonly', '');
    const value = `Exact ${kind}  $x^2$\n<b>source</b>  `;
    await editor.getByRole('textbox', { name: field, exact: true }).fill(value);
    await editor.getByRole('tab', { name: 'JSON', exact: true }).click();
    const expected = { ...original, [kind === 'question' ? 'stem' : kind === 'card' ? 'front' : 'name']: value };
    expect(JSON.parse(await editor.getByRole('textbox', { name: 'JSON', exact: true }).inputValue())).toEqual(expected);
    await editor.getByRole('tab', { name: 'Preview', exact: true }).click();
    if (kind === 'question') await expect(editor.locator('.katex').first()).toBeVisible();
    if (kind === 'question') {
      await page.setViewportSize({ width: 390, height: 900 });
      await editor.screenshot({ path: testInfo.outputPath('structured-question-preview-390.png') });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await editor.getByRole('tab', { name: 'Edit', exact: true }).click();
      await editor.screenshot({ path: testInfo.outputPath('structured-question-edit-1440.png') });
    }
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    const savedRecord = async () => {
      const saved = await draft(page);
      const records =
        kind === 'subject'
          ? saved.subjects
          : kind === 'quiz'
            ? saved.quizzes
            : kind === 'question'
              ? saved.questions
              : kind === 'deck'
                ? saved.decks
                : saved.cards;
      const { version: _version, ...record } =
        records.find((row) => row.id === original.id) ?? ({} as { version?: number });
      return record;
    };
    await expect.poll(savedRecord).toEqual(expected);
    if (kind === 'subject') await expect(editor).not.toBeVisible();
    await revertLatest(page);
    expect(await savedRecord()).toEqual(original);
  });
}

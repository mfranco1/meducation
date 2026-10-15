import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function login(page: Page) {
  await page.goto('/admin.html');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Quizzes', exact: true })).toBeVisible();
  page.on('dialog', (dialog) => void dialog.accept());
}
async function question(page: Page) {
  const nav = page.getByRole('region', { name: 'Quiz navigator' });
  await nav.getByRole('combobox', { name: 'Subject', exact: true }).click();
  await page.getByRole('listbox').getByRole('option').first().click();
  await nav.getByRole('combobox', { name: 'Quiz', exact: true }).click();
  await page.getByRole('listbox').getByRole('option').first().click();
  await nav.getByRole('button', { name: /1\. i1/ }).click();
  return page.getByRole('region', { name: 'Quiz editor' }).getByRole('textbox', { name: 'JSON', exact: true });
}
async function draft(page: Page) {
  return (await page.request.get('/api/admin/draft')).json();
}

test('edits both banks, reloads saved drafts, publishes, activates and exports through nginx', async ({ page }) => {
  await login(page);
  const original = await draft(page);
  const editor = await question(page);
  const item = JSON.parse(await editor.inputValue());
  await editor.fill(JSON.stringify({ ...item, stem: 'HTTP paired saved stem' }, null, 2));
  await page
    .getByRole('region', { name: 'Quiz editor' })
    .getByRole('button', { name: 'Save draft', exact: true })
    .click();
  await expect.poll(async () => (await draft(page)).pair.quizzes.questions[0].stem).toBe('HTTP paired saved stem');
  const learner = await page.request.get('/api/v1/quizzes/q1/questions');
  expect((await learner.json()).questions[0].stem).toBe(original.pair.quizzes.questions[0].stem);
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await page.getByRole('combobox', { name: 'Subject', exact: true }).click();
  await page.getByRole('listbox').getByRole('option').first().click();
  await page.getByRole('combobox', { name: 'Deck', exact: true }).click();
  await page.getByRole('listbox').getByRole('option').first().click();
  await page.getByRole('button', { name: 'Edit', exact: true }).last().click();
  const flash = page.getByRole('textbox', { name: 'JSON', exact: true });
  const deck = JSON.parse(await flash.inputValue());
  await flash.fill(JSON.stringify({ ...deck, name: 'HTTP paired deck' }, null, 2));
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect.poll(async () => (await draft(page)).pair.flashcards.decks[0].name).toBe('HTTP paired deck');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Review publication' })).toBeVisible();
  await page.getByRole('button', { name: 'Review publication' }).click();
  await page.getByRole('button', { name: 'Confirm publication' }).click();
  await expect
    .poll(async () => (await (await page.request.get('/api/v1/quizzes/q1/questions')).json()).questions[0].stem)
    .toBe('HTTP paired saved stem');
  await page.getByRole('button', { name: 'Load retained releases' }).click();
  await page.getByLabel('Retained release').selectOption(original.publication.releaseId);
  await page.getByRole('button', { name: 'Review activation' }).click();
  await page.getByRole('button', { name: 'Confirm activation' }).click();
  await expect.poll(async () => (await draft(page)).publication.releaseId).toBe(original.publication.releaseId);
  expect((await draft(page)).pair.quizzes.questions[0].stem).toBe('HTTP paired saved stem');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export paired ZIP' }).click();
  expect((await download).suggestedFilename()).toBe('meducation-release.zip');
});

test('keeps text across expiry and reauthentication, and never automatically resends a save', async ({ page }) => {
  await login(page);
  const editor = await question(page);
  const item = JSON.parse(await editor.inputValue());
  const text = JSON.stringify({ ...item, stem: 'Kept through expired session' }, null, 2);
  await editor.fill(text);
  await page.request.post('/fixture/expire');
  await page
    .getByRole('region', { name: 'Quiz editor' })
    .getByRole('button', { name: 'Save draft', exact: true })
    .click();
  await expect(editor).toHaveValue(text);
  await expect(page.getByText(/session expired/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Refresh authentication' }).click();
  await expect.poll(async () => (await (await page.request.get('/api/admin/session')).json()).authenticated).toBe(true);
  await expect(editor).toHaveValue(text);
  expect((await draft(page)).pair.quizzes.questions[0].stem).not.toBe('Kept through expired session');
});

test('reconciles a lost commit response and rejects another tab stale save without losing text', async ({
  page,
  context,
}) => {
  await login(page);
  const editor = await question(page);
  const second = await context.newPage();
  await second.goto('/admin.html');
  const otherEditor = await question(second);
  const old = JSON.parse(await editor.inputValue());
  await editor.fill(JSON.stringify({ ...old, stem: 'Lost response saved stem' }, null, 2));
  await page.route('**/api/admin/draft/save', async (route) => {
    await route.fetch();
    await route.abort('failed');
  });
  await page
    .getByRole('region', { name: 'Quiz editor' })
    .getByRole('button', { name: 'Save draft', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Reconcile operation' })).toBeEnabled();
  await page.getByRole('button', { name: 'Reconcile operation' }).click();
  await expect(page.getByText(/operation committed/)).toBeVisible();
  expect(await editor.inputValue()).toContain('Lost response saved stem');
  await otherEditor.fill(JSON.stringify({ ...old, stem: 'Stale second tab' }, null, 2));
  second.on('dialog', (dialog) => void dialog.accept());
  await second
    .getByRole('region', { name: 'Quiz editor' })
    .getByRole('button', { name: 'Save draft', exact: true })
    .click();
  await expect(second.getByText(/draft or publication changed/).first()).toBeVisible();
  expect(await otherEditor.inputValue()).toContain('Stale second tab');
  expect((await draft(page)).pair.quizzes.questions[0].stem).toBe('Lost response saved stem');
  await second.getByRole('button', { name: 'Reset paired draft' }).click();
  await expect(second.getByText(/draft or publication changed/).first()).toBeVisible();
  expect(await otherEditor.inputValue()).toContain('Stale second tab');
  await second.close();
});

for (const width of [390, 1048, 1440])
  test(`HTTP editor keyboard access and layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.getByRole('button', { name: 'Quizzes', exact: true }).focus();
    await expect(page.getByRole('button', { name: 'Quizzes', exact: true })).toBeFocused();
    const editor = await question(page);
    await editor.focus();
    await expect(editor).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

test('invalidates a reserved bulk preview when text changes without saving it', async ({ page }) => {
  await login(page);
  await question(page);
  const before = await draft(page);
  await page
    .getByRole('region', { name: 'Quiz navigator' })
    .getByRole('button', { name: 'Add', exact: true })
    .last()
    .click();
  const editor = page.getByRole('region', { name: 'Quiz editor' }).getByRole('textbox', { name: 'JSON', exact: true });
  const candidate = {
    items: [
      {
        stem: 'Pending allocated item',
        choices: ['First', 'Second'],
        answer: 'A',
        rationale: 'Reviewed static rationale',
      },
    ],
  };
  await editor.fill(JSON.stringify(candidate));
  await page.getByRole('region', { name: 'Quiz editor' }).getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Quiz editor' }).getByRole('button', { name: 'Save draft', exact: true }),
  ).toBeVisible();
  candidate.items[0].stem = 'Changed after preview';
  await editor.fill(JSON.stringify(candidate));
  await expect(
    page.getByRole('region', { name: 'Quiz editor' }).getByRole('button', { name: 'Preview', exact: true }),
  ).toBeVisible();
  expect((await draft(page)).draft.revision).toBe(before.draft.revision);
  expect(await editor.inputValue()).toContain('Changed after preview');
});

test('canceled step-up keeps text and does not refresh factor or resend publication', async ({ page, context }) => {
  await login(page);
  const editor = await question(page);
  const original = JSON.parse(await editor.inputValue());
  const text = JSON.stringify({ ...original, stem: 'Kept during canceled step-up' });
  await editor.fill(text);
  await page.request.post('/fixture/old-factor');
  await context.route('**/fixture/authorize?*', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 303,
      headers: { location: '/api/admin/auth/callback?state=' + url.searchParams.get('state') + '&error=access_denied' },
    });
  });
  const before = (await draft(page)).publication.sequence;
  await page.getByRole('button', { name: 'Refresh authentication' }).click();
  await expect(editor).toHaveValue(text);
  await expect.poll(async () => (await (await page.request.get('/api/admin/session')).json()).fresh).toBe(false);
  expect((await draft(page)).publication.sequence).toBe(before);
});

test('successful fresh step-up preserves text and still rejects a draft changed by another tab', async ({
  page,
  context,
}) => {
  await login(page);
  const editor = await question(page);
  const original = JSON.parse(await editor.inputValue());
  const pending = JSON.stringify({ ...original, stem: 'Kept through fresh step-up' }, null, 2);
  await editor.fill(pending);
  const second = await context.newPage();
  await second.goto('/admin.html');
  second.on('dialog', (dialog) => void dialog.accept());
  const other = await question(second);
  await other.fill(JSON.stringify({ ...original, stem: 'Other tab committed before step-up' }, null, 2));
  await second
    .getByRole('region', { name: 'Quiz editor' })
    .getByRole('button', { name: 'Save draft', exact: true })
    .click();
  await expect
    .poll(async () => (await draft(page)).pair.quizzes.questions[0].stem)
    .toBe('Other tab committed before step-up');
  const before = await draft(page);
  await page.request.post('/fixture/old-factor');
  expect((await (await page.request.get('/api/admin/session')).json()).fresh).toBe(false);
  await page.getByRole('button', { name: 'Refresh authentication' }).click();
  await expect.poll(async () => (await (await page.request.get('/api/admin/session')).json()).fresh).toBe(true);
  await expect(editor).toHaveValue(pending);
  expect((await draft(page)).draft.revision).toBe(before.draft.revision);
  expect((await draft(page)).publication.sequence).toBe(before.publication.sequence);
  await page
    .getByRole('region', { name: 'Quiz editor' })
    .getByRole('button', { name: 'Save draft', exact: true })
    .click();
  await expect(page.getByText(/draft or publication changed/).first()).toBeVisible();
  await expect(editor).toHaveValue(pending);
  expect((await draft(page)).pair.quizzes.questions[0].stem).toBe('Other tab committed before step-up');
  await second.close();
});

test('logout wins before an in-flight save reaches the API and keeps unsaved text', async ({ page }) => {
  await login(page);
  const editor = await question(page);
  const original = JSON.parse(await editor.inputValue());
  const text = JSON.stringify({ ...original, stem: 'Kept after logout during save' });
  await editor.fill(text);
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const ready = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route('**/api/admin/draft/save', async (route) => {
    arrived();
    await wait;
    await route.continue();
  });
  await page
    .getByRole('region', { name: 'Quiz editor' })
    .getByRole('button', { name: 'Save draft', exact: true })
    .click();
  await ready;
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect
    .poll(async () => (await (await page.request.get('/api/admin/session')).json()).authenticated)
    .toBe(false);
  release();
  await expect(editor).toHaveValue(text);
  await expect(page.getByText(/session expired|Sign in/).first()).toBeVisible();
});

test('grouped creates and imported legacy creates use reserved IDs and one paired save', async ({ page }) => {
  await login(page);
  await question(page);
  const nav = page.getByRole('region', { name: 'Quiz navigator' });
  await nav.getByRole('button', { name: 'Add', exact: true }).first().click();
  const editor = page.getByRole('region', { name: 'Quiz editor' }).getByRole('textbox', { name: 'JSON', exact: true });
  await page.getByLabel('Destination', { exact: true }).click();
  await page.getByRole('option', { name: 'Create a subject and quizzes' }).click();
  await editor.fill(
    JSON.stringify({
      subject: { name: 'HTTP grouped subject' },
      quizzes: [
        {
          name: 'HTTP grouped quiz',
          items: [
            {
              stem: 'Grouped source stem',
              choices: ['Alpha', 'Beta'],
              answer: 'A',
              verifiedAnswer: 'B',
              rationale: 'Static reviewed rationale',
            },
          ],
        },
      ],
    }),
  );
  await page.getByRole('region', { name: 'Quiz editor' }).getByRole('button', { name: 'Preview', exact: true }).click();
  await page
    .getByRole('region', { name: 'Quiz editor' })
    .getByRole('button', { name: 'Save draft', exact: true })
    .click();
  await expect
    .poll(async () =>
      (await draft(page)).pair.quizzes.subjects.some((row: { name: string }) => row.name === 'HTTP grouped subject'),
    )
    .toBe(true);
  let saved = await draft(page);
  const subject = saved.pair.quizzes.subjects.find((row: { name: string }) => row.name === 'HTTP grouped subject');
  const quiz = saved.pair.quizzes.quizzes.find((row: { name: string }) => row.name === 'HTTP grouped quiz');
  const item = saved.pair.quizzes.questions.find((row: { stem: string }) => row.stem === 'Grouped source stem');
  expect(quiz.subjectId).toBe(subject.id);
  expect(item.quizId).toBe(quiz.id);
  expect(item.answer).toBe('A');
  expect(item.verifiedAnswer).toBe('B');
  // Import is explicitly converted and re-previewed, never trusted as an allocation proof.
  const revision = await page.evaluate(async (bank) => {
    const data = new TextEncoder().encode(JSON.stringify(bank, null, 2) + '\n');
    const digest = await crypto.subtle.digest('SHA-256', data);
    return (
      'sha256-' +
      Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    );
  }, saved.pair.quizzes);
  const imported = {
    changeSetVersion: 2,
    base: { bankSchemaVersion: 4, revision },
    reason: 'Reviewed legacy create conversion',
    operations: [
      {
        op: 'question.create',
        value: { ...item, id: 'i9000', stem: 'Imported exact $x^2$ stem\n', quizId: quiz.id },
      },
    ],
  };
  await page
    .getByRole('region', { name: 'Quiz editor' })
    .getByRole('button', { name: 'Workspace', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Import quiz change set' }).click();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'legacy.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(imported)),
    });
  await page.getByRole('button', { name: 'Save import', exact: true }).click();
  await expect
    .poll(async () =>
      (await draft(page)).pair.quizzes.questions.some(
        (row: { stem: string }) => row.stem === 'Imported exact $x^2$ stem\n',
      ),
    )
    .toBe(true);
  saved = await draft(page);
  const created = saved.pair.quizzes.questions.find(
    (row: { stem: string }) => row.stem === 'Imported exact $x^2$ stem\n',
  );
  expect(created.id).not.toBe('i9000');
  expect(created.quizId).toBe(quiz.id);
  expect(created.answer).toBe('A');
  expect(created.verifiedAnswer).toBe('B');
  await page.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await page.getByRole('combobox', { name: 'Subject', exact: true }).click();
  await page.getByRole('listbox').getByRole('option', { name: 'HTTP grouped subject', exact: true }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).first().click();
  const add = page.getByRole('dialog', { name: 'Add Decks' });
  await add.getByRole('textbox', { name: 'JSON' }).fill(
    JSON.stringify({
      decks: [
        {
          name: 'Reserved bulk deck',
          cards: [{ front: 'Exact grouped front $x^2$', back: 'Exact grouped back\n', reviewNote: 'Static review' }],
        },
      ],
    }),
  );
  await add.getByRole('button', { name: 'Preview', exact: true }).click();
  await add.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(add).not.toBeVisible();
  const paired = (await draft(page)).pair;
  const savedDeck = paired.flashcards.decks.find((row: { name: string }) => row.name === 'Reserved bulk deck');
  const savedCard = paired.flashcards.cards.find((row: { front: string }) => row.front === 'Exact grouped front $x^2$');
  expect(savedDeck.subjectId).toBe(subject.id);
  expect(savedCard.deckId).toBe(savedDeck.id);
  expect(savedCard.back).toBe('Exact grouped back\n');
  await page.getByRole('navigation', { name: 'Flashcards in selected deck' }).getByRole('button').first().click();
  await page
    .getByRole('textbox', { name: 'JSON', exact: true })
    .fill(JSON.stringify({ ...savedCard, back: 'Hidden unsaved card text' }));
  await page.getByRole('button', { name: 'Quizzes', exact: true }).click();
  await nav.getByRole('combobox', { name: 'Subject', exact: true }).click();
  await page
    .getByRole('listbox')
    .getByRole('option', { name: new RegExp('HTTP grouped subject') })
    .click();
  await nav.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save subject deletion' }).click();
  await expect
    .poll(async () => (await draft(page)).pair.quizzes.subjects.some((row: { id: string }) => row.id === subject.id))
    .toBe(false);
  const deleted = await draft(page);
  expect(deleted.pair.flashcards.decks.some((row: { id: string }) => row.id === savedDeck.id)).toBe(false);
  await page.getByRole('button', { name: 'Undo saved batch' }).click();
  await expect
    .poll(async () => (await draft(page)).pair.flashcards.cards.some((row: { id: string }) => row.id === savedCard.id))
    .toBe(true);
  expect((await draft(page)).pair).toEqual(paired);
});

test('keeps newer text typed while an imported save is in flight', async ({ page }) => {
  await login(page);
  const editor = await question(page);
  const current = await draft(page);
  const item = current.pair.quizzes.questions[0];
  const changes = {
    changeSetVersion: 2,
    base: { bankSchemaVersion: 4, revision: current.draft.digests.quizRevision },
    reason: 'Captured imported edit',
    operations: [{ op: 'question.update', id: item.id, value: { ...item, stem: 'Captured imported stem' } }],
  };
  await page
    .getByRole('region', { name: 'Quiz editor' })
    .getByRole('button', { name: 'Workspace', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Import quiz change set' }).click();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'update.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(changes)) });
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const ready = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route('**/api/admin/draft/save', async (route) => {
    arrived();
    await wait;
    await route.continue();
  });
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/api/admin/draft/save') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Save import', exact: true }).click();
  await ready;
  const text = JSON.stringify({ ...item, stem: 'Newer text during imported save' });
  await editor.fill(text);
  release();
  // The imported write is deliberately held in flight above. Observe its
  // committed receipt before issuing the post-commit read through auth pools.
  expect((await saved).status()).toBe(200);
  await expect.poll(async () => (await draft(page)).pair.quizzes.questions[0].stem).toBe('Captured imported stem');
  await expect(editor).toHaveValue(text);
});

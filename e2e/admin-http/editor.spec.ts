import type { Page } from '@playwright/test';
import { confirmDraftSave, expect, test } from './fixtures';

async function login(page: Page) {
  await page.goto('/admin.html');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Quizzes', exact: true })).toBeVisible();
  page.on('dialog', (dialog) => void dialog.accept());
}
async function refreshAuthentication(page: Page) {
  const opened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Refresh authentication' }).click();
  const popup = await opened;
  // Session probes can set/clear cookies. Do not race them against the OIDC
  // callback; closure means the editor received completion and refreshed context.
  await expect.poll(() => popup.isClosed()).toBe(true);
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
    .getByRole('button', { name: 'Review save', exact: true })
    .click();
  await confirmDraftSave(page);
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
  await page.getByRole('button', { name: 'Review save', exact: true }).click();
  await confirmDraftSave(page);
  await expect.poll(async () => (await draft(page)).pair.flashcards.decks[0].name).toBe('HTTP paired deck');
  await page.reload();
  await page.getByRole('button', { name: 'Review & publish', exact: true }).click();
  await page.getByRole('button', { name: 'Review publication' }).click();
  await page.getByRole('button', { name: 'Confirm publication' }).click();
  await expect
    .poll(async () => (await (await page.request.get('/api/v1/quizzes/q1/questions')).json()).questions[0].stem)
    .toBe('HTTP paired saved stem');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Published versions…' }).click();
  await page.getByLabel('Published version', { exact: true }).selectOption(original.publication.releaseId);
  await page.getByRole('button', { name: 'Use this published version…' }).click();
  await page.getByRole('button', { name: 'Review activation' }).click();
  const activated = page.waitForResponse(
    (response) => response.url().endsWith('/activate') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Confirm activation' }).click();
  expect((await activated).status()).toBe(200);
  await expect.poll(async () => (await draft(page)).publication.releaseId).toBe(original.publication.releaseId);
  expect((await draft(page)).pair.quizzes.questions[0].stem).toBe('HTTP paired saved stem');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Export content…' }).click();
  await page.getByRole('combobox', { name: 'Export target' }).click();
  await page.getByRole('option', { name: 'Current published version', exact: true }).click();
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
    .getByRole('button', { name: 'Review save', exact: true })
    .click();
  await expect(editor).toHaveValue(text);
  await expect(page.getByText(/session expired/).first()).toBeVisible();
  await refreshAuthentication(page);
  expect((await (await page.request.get('/api/admin/session')).json()).authenticated).toBe(true);
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
    .getByRole('button', { name: 'Review save', exact: true })
    .click();
  await confirmDraftSave(page);
  await expect(page.getByRole('button', { name: 'Check save status', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Check save status', exact: true }).click();
  await expect(page.getByText(/operation committed/)).toBeVisible();
  expect(await editor.inputValue()).toContain('Lost response saved stem');
  await otherEditor.fill(JSON.stringify({ ...old, stem: 'Stale second tab' }, null, 2));
  second.on('dialog', (dialog) => void dialog.accept());
  await second
    .getByRole('region', { name: 'Quiz editor' })
    .getByRole('button', { name: 'Review save', exact: true })
    .click();
  await expect(second.getByText(/draft or publication changed/).first()).toBeVisible();
  expect(await otherEditor.inputValue()).toContain('Stale second tab');
  expect((await draft(page)).pair.quizzes.questions[0].stem).toBe('Lost response saved stem');
  await second.getByRole('button', { name: 'More', exact: true }).click();
  await second.getByRole('menuitem', { name: 'Reset draft to published version…' }).click();
  await second
    .getByRole('dialog', { name: 'Reset draft to published version', exact: true })
    .getByRole('button', { name: 'Reset draft', exact: true })
    .click();
  await expect(second.getByText(/draft or publication changed/).first()).toBeVisible();
  await second
    .getByRole('dialog', { name: 'Reset draft to published version', exact: true })
    .getByRole('button', { name: 'Cancel', exact: true })
    .click();
  expect(await otherEditor.inputValue()).toContain('Stale second tab');
  await second.close();
});

for (const width of [390, 1048, 1440])
  test(`HTTP editor keyboard access and layout at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.getByRole('button', { name: 'Quizzes', exact: true }).focus();
    await expect(page.getByRole('button', { name: 'Quizzes', exact: true })).toBeFocused();
    const editor = await question(page);
    await editor.focus();
    await expect(editor).toBeFocused();
    const save = page
      .getByRole('region', { name: 'Quiz editor' })
      .getByRole('button', { name: 'Review save', exact: true });
    await expect
      .poll(() => save.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe('rgb(185, 81, 27)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const header = await page.getByRole('banner').boundingBox();
    expect(header!.height).toBeLessThanOrEqual(width === 390 ? 180 : 110);
    await page.getByRole('banner').screenshot({ path: testInfo.outputPath(`admin-header-${width}.png`) });
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
    page.getByRole('region', { name: 'Quiz editor' }).getByRole('button', { name: 'Review save', exact: true }),
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
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Refresh authentication' }).click();
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
    .getByRole('button', { name: 'Review save', exact: true })
    .click();
  await confirmDraftSave(second);
  await expect
    .poll(async () => (await draft(page)).pair.quizzes.questions[0].stem)
    .toBe('Other tab committed before step-up');
  const before = await draft(page);
  await page.request.post('/fixture/old-factor');
  expect((await (await page.request.get('/api/admin/session')).json()).fresh).toBe(false);
  await refreshAuthentication(page);
  expect((await (await page.request.get('/api/admin/session')).json()).fresh).toBe(true);
  await expect(editor).toHaveValue(pending);
  expect((await draft(page)).draft.revision).toBe(before.draft.revision);
  expect((await draft(page)).publication.sequence).toBe(before.publication.sequence);
  await page
    .getByRole('region', { name: 'Quiz editor' })
    .getByRole('button', { name: 'Review save', exact: true })
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
    .getByRole('button', { name: 'Review save', exact: true })
    .click();
  await confirmDraftSave(page);
  await ready;
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect
    .poll(async () => (await (await page.request.get('/api/admin/session')).json()).authenticated)
    .toBe(false);
  release();
  await expect(editor).toHaveValue(text);
  await expect(page.getByText(/session expired|Sign in/).first()).toBeVisible();
});

test('grouped quiz and flashcard creates use reserved IDs and one paired save', async ({ page }) => {
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
    .getByRole('button', { name: 'Review save', exact: true })
    .click();
  await confirmDraftSave(page);
  await expect
    .poll(async () =>
      (await draft(page)).pair.quizzes.subjects.some((row: { name: string }) => row.name === 'HTTP grouped subject'),
    )
    .toBe(true);
  const saved = await draft(page);
  const subject = saved.pair.quizzes.subjects.find((row: { name: string }) => row.name === 'HTTP grouped subject');
  const quiz = saved.pair.quizzes.quizzes.find((row: { name: string }) => row.name === 'HTTP grouped quiz');
  const item = saved.pair.quizzes.questions.find((row: { stem: string }) => row.stem === 'Grouped source stem');
  expect(quiz.subjectId).toBe(subject.id);
  expect(item.quizId).toBe(quiz.id);
  expect(item.answer).toBe('A');
  expect(item.verifiedAnswer).toBe('B');
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
  await add.getByRole('button', { name: 'Review save', exact: true }).click();
  await confirmDraftSave(page);
  await expect(add).not.toBeVisible();
  await expect
    .poll(async () =>
      (await draft(page)).pair.flashcards.decks.some((row: { name: string }) => row.name === 'Reserved bulk deck'),
    )
    .toBe(true);
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
  await page.getByRole('dialog').getByRole('button', { name: 'Review subject deletion' }).click();
  await confirmDraftSave(page);
  await expect
    .poll(async () => (await draft(page)).pair.quizzes.subjects.some((row: { id: string }) => row.id === subject.id))
    .toBe(false);
  const deleted = await draft(page);
  expect(deleted.pair.flashcards.decks.some((row: { id: string }) => row.id === savedDeck.id)).toBe(false);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Undo last saved change…' }).click();
  await page
    .getByRole('dialog', { name: 'Undo last saved change', exact: true })
    .getByRole('button', { name: 'Undo saved change', exact: true })
    .click();
  await expect
    .poll(async () => (await draft(page)).pair.flashcards.cards.some((row: { id: string }) => row.id === savedCard.id))
    .toBe(true);
  expect((await draft(page)).pair).toEqual(paired);
});

test('keeps newer text typed while a draft save is in flight', async ({ page }) => {
  await login(page);
  const editor = await question(page);
  const current = await draft(page);
  const item = current.pair.quizzes.questions[0];
  await editor.fill(JSON.stringify({ ...item, stem: 'Captured saved stem' }));
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
  await page
    .getByRole('region', { name: 'Quiz editor' })
    .getByRole('button', { name: 'Review save', exact: true })
    .click();
  await confirmDraftSave(page);
  await ready;
  const text = JSON.stringify({ ...item, stem: 'Newer text during draft save' });
  await editor.fill(text);
  release();
  // The draft write is deliberately held in flight above. Observe its
  // committed receipt before issuing the post-commit read through auth pools.
  expect((await saved).status()).toBe(200);
  await expect.poll(async () => (await draft(page)).pair.quizzes.questions[0].stem).toBe('Captured saved stem');
  await expect(editor).toHaveValue(text);
});

test('canceling server save review preserves text and requires fresh explicit confirmation', async ({ page }) => {
  await login(page);
  const editor = await question(page);
  const before = await draft(page);
  const item = JSON.parse(await editor.inputValue());
  const text = JSON.stringify({ ...item, stem: 'Canceled save review keeps $x^2$\nsource text' }, null, 2);
  await editor.fill(text);
  let writes = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/admin/draft/save')) writes++;
  });
  const trigger = page
    .getByRole('region', { name: 'Quiz editor' })
    .getByRole('button', { name: 'Review save', exact: true });
  await trigger.click();
  const review = page.getByRole('dialog', { name: 'Review draft save', exact: true });
  await expect(review.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused();
  await expect(review.getByLabel('Server change summary')).toContainText('Questions');
  await review.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(review).not.toBeVisible();
  await expect(editor).toHaveValue(text);
  expect((await draft(page)).draft.revision).toBe(before.draft.revision);
  expect(writes).toBe(0);
  await trigger.click();
  await confirmDraftSave(page);
  await expect.poll(async () => (await draft(page)).pair.quizzes.questions[0].stem).toBe(JSON.parse(text).stem);
  expect(writes).toBe(1);
});

test('uncertain reset can close its review and reconcile without losing editor text or retrying', async ({ page }) => {
  await login(page);
  const editor = await question(page);
  const text = JSON.stringify({
    ...JSON.parse(await editor.inputValue()),
    stem: 'Unsaved text kept through uncertain reset',
  });
  await editor.fill(text);
  let attempts = 0;
  let aborted!: () => void;
  const responseLost = new Promise<void>((resolve) => {
    aborted = resolve;
  });
  await page.route('**/api/admin/draft/reset', async (route) => {
    attempts++;
    await route.fetch();
    await route.abort('failed');
    aborted();
  });
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Reset draft to published version…' }).click();
  const review = page.getByRole('dialog', { name: 'Reset draft to published version', exact: true });
  await review.getByRole('button', { name: 'Reset draft', exact: true }).click();
  await responseLost;
  await expect(review.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  await expect(review.getByRole('button', { name: 'Reset draft', exact: true })).toBeDisabled();
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(review).not.toBeVisible();
  await page.request.post('/fixture/expire');
  await page.getByRole('button', { name: 'Check save status', exact: true }).click();
  const signIn = page.getByRole('button', { name: 'Sign in to continue', exact: true });
  await expect(signIn).toBeEnabled();
  const opened = page.waitForEvent('popup');
  await signIn.click();
  const popup = await opened;
  await expect.poll(() => popup.isClosed()).toBe(true);
  await page.getByRole('button', { name: 'Check save status', exact: true }).click();
  await expect(page.getByText(/operation committed/)).toBeVisible();
  await expect(editor).toHaveValue(text);
  expect(attempts).toBe(1);
});

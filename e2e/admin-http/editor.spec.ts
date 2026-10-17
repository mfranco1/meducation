import {
  adminApi,
  draft,
  expect,
  login,
  moreMenu,
  openQuestion,
  quizEditor,
  refreshAuthentication,
  saveButton,
  test,
} from './fixtures';

test('edits a question and a deck, publishes so learners see it, activates the earlier release and exports', async ({
  page,
}) => {
  await login(page);
  const original = await draft(page);
  expect(original.changed).toBe(false);
  const editor = await openQuestion(page);
  const item = JSON.parse(await editor.inputValue());
  await editor.fill(JSON.stringify({ ...item, stem: 'HTTP saved stem' }, null, 2));
  await saveButton(quizEditor(page)).click();
  await expect(quizEditor(page).getByText('Saved to the draft. Saving does not publish.')).toBeVisible();
  const saved = await draft(page);
  expect(saved.questions[0]).toMatchObject({ stem: 'HTTP saved stem', version: original.questions[0].version + 1 });
  expect(saved.changed).toBe(true);
  // Saving is not publishing: learners still read the published stem.
  const learner = await page.request.get('/api/v1/quizzes/q1/questions');
  expect((await learner.json()).questions[0].stem).toBe(original.questions[0].stem);
  await page.getByRole('tab', { name: 'Flashcards', exact: true }).click();
  await page.getByRole('combobox', { name: 'Subject', exact: true }).click();
  await page.getByRole('listbox').getByRole('option').first().click();
  await page.getByRole('combobox', { name: 'Deck', exact: true }).click();
  await page.getByRole('listbox').getByRole('option').first().click();
  await page.getByRole('button', { name: 'Deck actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Edit deck', exact: true }).click();
  await page.getByRole('region', { name: 'Flashcard editor' }).getByRole('tab', { name: 'JSON', exact: true }).click();
  const flash = page.getByRole('textbox', { name: 'JSON', exact: true });
  const deck = JSON.parse(await flash.inputValue());
  await flash.fill(JSON.stringify({ ...deck, name: 'HTTP paired deck' }, null, 2));
  await page
    .getByRole('region', { name: 'Flashcard editor' })
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect.poll(async () => (await draft(page)).decks[0].name).toBe('HTTP paired deck');
  await page.reload();
  await expect(page.getByRole('button', { name: /Workspace status: Draft changes/ })).toBeVisible();
  await page.getByRole('button', { name: 'Review & publish', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm publication' }).click();
  await expect(page.getByText(/Published quizzes and flashcards/)).toBeVisible();
  await expect
    .poll(async () => (await (await page.request.get('/api/v1/quizzes/q1/questions')).json()).questions[0].stem)
    .toBe('HTTP saved stem');
  const published = await draft(page);
  expect(published.changed).toBe(false);
  expect(published.activeReleaseId).not.toBe(original.activeReleaseId);
  await moreMenu(page, 'Published versions…');
  await page.getByLabel('Published version', { exact: true }).selectOption(original.activeReleaseId!);
  await page.getByRole('button', { name: 'Use this published version…' }).click();
  const activated = page.waitForResponse(
    (response) => response.url().endsWith('/activate') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Confirm activation' }).click();
  expect((await activated).status()).toBe(200);
  await expect.poll(async () => (await draft(page)).activeReleaseId).toBe(original.activeReleaseId);
  // Activation changes what learners see and leaves the draft as it was.
  expect((await draft(page)).questions[0].stem).toBe('HTTP saved stem');
  await moreMenu(page, 'Export content…');
  await page.getByRole('combobox', { name: 'Export target' }).click();
  await page.getByRole('option', { name: 'Current published version', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export paired ZIP' }).click();
  expect((await download).suggestedFilename()).toBe('meducation-release.zip');
});

test('keeps text across expiry and reauthentication, and never automatically resends a save', async ({ page }) => {
  await login(page);
  const editor = await openQuestion(page);
  const item = JSON.parse(await editor.inputValue());
  const text = JSON.stringify({ ...item, stem: 'Kept through expired session' }, null, 2);
  await editor.fill(text);
  await page.request.post('/fixture/expire');
  await saveButton(quizEditor(page)).click();
  await expect(editor).toHaveValue(text);
  await expect(page.getByText(/session expired/).first()).toBeVisible();
  await refreshAuthentication(page);
  expect((await (await page.request.get('/api/admin/session')).json()).authenticated).toBe(true);
  await expect(editor).toHaveValue(text);
  expect((await draft(page)).questions[0].stem).not.toBe('Kept through expired session');
  // The author decides when to save again; that one request now succeeds.
  await saveButton(quizEditor(page)).click();
  await expect.poll(async () => (await draft(page)).questions[0].stem).toBe('Kept through expired session');
});

test('a lost save response is never retried: saving again reports a conflict showing the committed record', async ({
  page,
}) => {
  await login(page);
  const editor = await openQuestion(page);
  const old = JSON.parse(await editor.inputValue());
  const text = JSON.stringify({ ...old, stem: 'Lost response saved stem' }, null, 2);
  await editor.fill(text);
  let attempts = 0;
  await page.route('**/api/admin/draft/questions/i1', async (route) => {
    attempts++;
    await route.fetch();
    await route.abort('failed');
  });
  await saveButton(quizEditor(page)).click();
  await expect(quizEditor(page).getByRole('alert')).toBeVisible();
  await expect(editor).toHaveValue(text);
  expect(attempts).toBe(1);
  expect((await draft(page)).questions[0].stem).toBe('Lost response saved stem');
  await page.unroute('**/api/admin/draft/questions/i1');
  await saveButton(quizEditor(page)).click();
  await expect(quizEditor(page).getByText(/changed on the server after you opened it/)).toBeVisible();
  await expect(editor).toHaveValue(text);
  await quizEditor(page).getByText('Server version', { exact: true }).click();
  await expect(quizEditor(page).getByLabel('Server version')).toContainText('Lost response saved stem');
  await quizEditor(page).getByRole('button', { name: 'Use server version' }).click();
  await expect(quizEditor(page).getByText(/changed on the server after you opened it/)).toHaveCount(0);
  expect(JSON.parse(await editor.inputValue()).stem).toBe('Lost response saved stem');
});

test('rejects another tab save with a conflict that keeps the text, and saves over it only on request', async ({
  page,
  context,
}) => {
  await login(page);
  const editor = await openQuestion(page);
  const second = await context.newPage();
  await second.goto('/admin.html');
  const otherEditor = await openQuestion(second);
  const old = JSON.parse(await editor.inputValue());
  await otherEditor.fill(JSON.stringify({ ...old, rationale: 'Second tab rationale' }, null, 2));
  await saveButton(quizEditor(second)).click();
  await expect.poll(async () => (await draft(page)).questions[0].rationale).toBe('Second tab rationale');
  const mine = JSON.stringify({ ...old, stem: 'First tab stem' }, null, 2);
  await editor.fill(mine);
  await saveButton(quizEditor(page)).click();
  await expect(quizEditor(page).getByText(/changed on the server after you opened it/)).toBeVisible();
  await expect(editor).toHaveValue(mine);
  expect((await draft(page)).questions[0].stem).toBe(old.stem);
  await quizEditor(page).getByRole('button', { name: 'Keep my text' }).click();
  await saveButton(quizEditor(page)).click();
  // Only the fields this author changed are written, so the other tab's rationale survives.
  await expect.poll(async () => (await draft(page)).questions[0].stem).toBe('First tab stem');
  expect((await draft(page)).questions[0].rationale).toBe('Second tab rationale');
  await second.close();
});

test('lists the server validation issues and keeps the text when content is rejected', async ({ page }) => {
  await login(page);
  const before = await draft(page);
  const editor = await openQuestion(page);
  const text = JSON.stringify({ ...JSON.parse(await editor.inputValue()), rationale: '   ' }, null, 2);
  await editor.fill(text);
  await saveButton(quizEditor(page)).click();
  await expect(quizEditor(page).getByText(/The server rejected the content/)).toBeVisible();
  await expect(
    quizEditor(page)
      .getByText(/\$\.\w+/)
      .first(),
  ).toBeVisible();
  await expect(editor).toHaveValue(text);
  expect((await draft(page)).questions[0].version).toBe(before.questions[0].version);
});

for (const width of [390, 1048, 1440])
  test(`HTTP editor keyboard access and layout at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    await page.getByRole('tab', { name: 'Quizzes', exact: true }).focus();
    await expect(page.getByRole('tab', { name: 'Quizzes', exact: true })).toBeFocused();
    const editor = await openQuestion(page);
    await editor.focus();
    await expect(editor).toBeFocused();
    const save = saveButton(quizEditor(page));
    await expect
      .poll(() => save.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe('rgb(185, 81, 27)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const header = await page.getByRole('banner').boundingBox();
    expect(header!.height).toBeLessThanOrEqual(width === 390 ? 180 : 110);
    await page.getByRole('banner').screenshot({ path: testInfo.outputPath(`admin-header-${width}.png`) });
  });

test('publication needing a recent login asks to sign in again, keeps the draft and never resends', async ({
  page,
  context,
}) => {
  await login(page);
  const before = await draft(page);
  const changed = await adminApi(page, 'PUT', '/draft/questions/i1', {
    expectedVersion: before.questions[0].version,
    fields: { stem: 'Waiting for publication' },
  });
  expect(changed.status()).toBe(200);
  await page.reload();
  await page.request.post('/fixture/old-factor');
  await context.route('**/fixture/authorize?*', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 303,
      headers: { location: '/api/admin/auth/callback?state=' + url.searchParams.get('state') + '&error=access_denied' },
    });
  });
  let attempts = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/admin/draft/publish')) attempts++;
  });
  await page.getByRole('button', { name: 'Review & publish', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm publication' }).click();
  await expect(page.getByText(/Sign in again to refresh authentication/).first()).toBeVisible();
  expect(attempts).toBe(1);
  // Canceling the sign-in leaves the factor old: nothing is published and nothing is resent.
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in to continue' }).click();
  await expect.poll(async () => (await (await page.request.get('/api/admin/session')).json()).fresh).toBe(false);
  expect(attempts).toBe(1);
  const after = await draft(page);
  expect(after.publicationSequence).toBe(before.publicationSequence);
  expect(after.changed).toBe(true);
});

test('a successful fresh sign-in preserves unsaved text, which then saves normally', async ({ page }) => {
  await login(page);
  const editor = await openQuestion(page);
  const pending = JSON.stringify(
    { ...JSON.parse(await editor.inputValue()), stem: 'Kept through fresh step-up' },
    null,
    2,
  );
  await editor.fill(pending);
  await page.request.post('/fixture/old-factor');
  expect((await (await page.request.get('/api/admin/session')).json()).fresh).toBe(false);
  await refreshAuthentication(page);
  expect((await (await page.request.get('/api/admin/session')).json()).fresh).toBe(true);
  await expect(editor).toHaveValue(pending);
  expect((await draft(page)).questions[0].stem).not.toBe('Kept through fresh step-up');
  await saveButton(quizEditor(page)).click();
  await expect.poll(async () => (await draft(page)).questions[0].stem).toBe('Kept through fresh step-up');
});

test('logout wins before an in-flight save reaches the API and keeps unsaved text', async ({ page }) => {
  await login(page);
  const editor = await openQuestion(page);
  const text = JSON.stringify({ ...JSON.parse(await editor.inputValue()), stem: 'Kept after logout during save' });
  await editor.fill(text);
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const ready = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route('**/api/admin/draft/questions/i1', async (route) => {
    arrived();
    await wait;
    await route.continue();
  });
  await saveButton(quizEditor(page)).click();
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

test('keeps newer text typed while a save is in flight', async ({ page }) => {
  await login(page);
  const editor = await openQuestion(page);
  const item = JSON.parse(await editor.inputValue());
  await editor.fill(JSON.stringify({ ...item, stem: 'Captured saved stem' }));
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  let arrived!: () => void;
  const ready = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  await page.route('**/api/admin/draft/questions/i1', async (route) => {
    arrived();
    await wait;
    await route.continue();
  });
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/api/admin/draft/questions/i1') && response.request().method() === 'PUT',
  );
  await saveButton(quizEditor(page)).click();
  await ready;
  const text = JSON.stringify({ ...item, stem: 'Newer text during save' });
  await editor.fill(text);
  release();
  expect((await saved).status()).toBe(200);
  await expect.poll(async () => (await draft(page)).questions[0].stem).toBe('Captured saved stem');
  await expect(editor).toHaveValue(text);
  await expect(page.getByRole('tab', { name: 'Quizzes', exact: true })).toHaveAccessibleDescription(/Unsaved/);
});

test('a selected quiz editor remains editable after all JSON text is cleared', async ({ page }) => {
  await login(page);
  const editor = await openQuestion(page);
  const original = await editor.inputValue();
  const before = await draft(page);
  await editor.fill('');
  await expect(editor).toBeVisible();
  await expect(editor).toBeEditable();
  await expect(page.getByRole('tab', { name: 'Quizzes', exact: true })).toHaveAccessibleDescription(/Unsaved/);
  await editor.fill(original);
  await expect(editor).toHaveValue(original);
  expect((await draft(page)).latestChangeId).toBe(before.latestChangeId);
});

test('Changes lists a saved edit and Revert restores the record, even in the open editor', async ({ page }) => {
  await login(page);
  const editor = await openQuestion(page);
  const item = JSON.parse(await editor.inputValue());
  await editor.fill(JSON.stringify({ ...item, stem: 'Edit to revert' }, null, 2));
  await saveButton(quizEditor(page)).click();
  await expect.poll(async () => (await draft(page)).questions[0].stem).toBe('Edit to revert');
  const change = (await draft(page)).latestChangeId;
  await moreMenu(page, 'Changes…');
  const dialog = page.getByRole('dialog', { name: 'Changes', exact: true });
  await expect(dialog.getByText(/update question i1/).first()).toBeVisible();
  await dialog.getByRole('button', { name: `Revert change ${change}`, exact: true }).click();
  await expect(page.getByText(`Reverted change #${change}.`)).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  expect((await draft(page)).questions[0].stem).toBe(item.stem);
  // The open editor followed the server back to the stored record.
  await expect(editor).toHaveValue(JSON.stringify({ ...item }, null, 2));
});

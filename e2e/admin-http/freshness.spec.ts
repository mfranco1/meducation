import type { Page } from '@playwright/test';
import { adminApi, draft, expect, test } from './fixtures';

test('L5 open learner tabs revalidate cached launches and preserve active study through publication', async ({
  page,
  context,
  browser,
}) => {
  test.setTimeout(120_000);
  await page.goto('/admin.html');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Quizzes', exact: true })).toBeVisible();
  const snapshot = () => draft(page);
  const send = async (method: 'POST' | 'PUT', path: string, data: unknown) => {
    const response = await adminApi(page, method, path, data);
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  // Start from the published content, whatever earlier tests left in the draft.
  await send('POST', '/draft/discard', {});
  const original = await snapshot();
  const subject = original.subjects[0];
  const stem = original.questions[0].stem;
  const front = original.cards[0].front;
  const publish = async (nextStem: string, nextFront: string) => {
    const current = await snapshot();
    await send('PUT', `/draft/questions/${current.questions[0].id}`, {
      expectedVersion: current.questions[0].version,
      fields: { stem: nextStem },
    });
    await send('PUT', `/draft/cards/${current.cards[0].id}`, {
      expectedVersion: current.cards[0].version,
      fields: { front: nextFront },
    });
    await send('POST', '/draft/publish', {});
  };
  const openSubject = async (learner: Page) =>
    learner
      .getByRole('button', { name: `Open ${subject.name}` })
      .last()
      .click();
  const progress = (learner: Page) =>
    learner.evaluate(() => ({
      quiz: localStorage.getItem('meducation.progress.v2'),
      cards: localStorage.getItem('meducation.flashcards.progress.v2'),
    }));
  // Learner tabs skip the first-visit landing page.
  const skipLanding = () => localStorage.setItem('meducation.started.v1', '1');
  await context.addInitScript(skipLanding);
  const quiz = await context.newPage();
  const deck = await context.newPage();
  const reviewContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  await reviewContext.addInitScript(skipLanding);
  const review = await reviewContext.newPage();
  await quiz.goto('/');
  await openSubject(quiz);
  await quiz.getByRole('button', { name: /^Start quiz/ }).click();
  await quiz.getByRole('button', { name: 'Exam Mode', exact: true }).click();
  await quiz.getByRole('button', { name: 'Begin Quiz' }).click();
  await expect(quiz.getByText(stem, { exact: true })).toBeVisible();
  await deck.goto('/');
  await deck.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await openSubject(deck);
  await deck
    .getByRole('button', { name: /^Study deck/ })
    .first()
    .click();
  await expect(deck.getByText(front, { exact: true })).toBeVisible();
  await deck.getByRole('button', { name: 'Save and exit deck' }).click();
  // A failed validation never admits a cached body or changes saved bytes.
  const savedDeck = await progress(deck);
  await deck.route('**/api/v1/flashcards/subjects', (route) => route.fulfill({ status: 503, body: '{}' }));
  await deck
    .getByRole('button', { name: /^Resume deck/ })
    .first()
    .click();
  await expect(deck.getByRole('alert')).toContainText('Unable to load deck');
  expect(await progress(deck)).toEqual(savedDeck);
  await deck.unroute('**/api/v1/flashcards/subjects');
  await deck
    .getByRole('button', { name: /^Resume deck/ })
    .first()
    .click();
  await expect(deck.getByText(front, { exact: true })).toBeVisible();
  await review.goto('/');
  await openSubject(review);
  await review.getByRole('button', { name: /^Start quiz/ }).click();
  await review.getByRole('button', { name: 'Browse Answers', exact: true }).click();
  await review.getByRole('button', { name: 'Open quiz', exact: true }).click();
  await expect(review.getByText(stem, { exact: true })).toBeVisible();
  await review.getByRole('button', { name: 'Done', exact: true }).click();
  const beforeQuiz = await progress(quiz);
  const beforeDeck = await progress(deck);
  await publish('L5 newly published stem', 'L5 newly published front');
  await expect(quiz.getByText(stem, { exact: true })).toBeVisible();
  await expect(deck.getByText(front, { exact: true })).toBeVisible();
  expect(await progress(quiz)).toEqual(beforeQuiz);
  expect(await progress(deck)).toEqual(beforeDeck);
  await review.getByRole('button', { name: /^Start quiz/ }).click();
  await review.getByRole('button', { name: 'Browse Answers', exact: true }).click();
  await review.getByRole('button', { name: 'Open quiz', exact: true }).click();
  await expect(review.getByRole('alert')).toContainText('Reload to continue');
  // No manual refresh before launching the already cached quiz/deck again.
  await quiz.getByRole('button', { name: 'Meducation, go to Quizzes' }).click();
  await quiz.getByRole('dialog').getByRole('button', { name: 'Leave', exact: true }).click();
  await openSubject(quiz);
  const pausedQuiz = await progress(quiz);
  await quiz.getByRole('button', { name: /^Resume quiz/ }).click();
  await expect(quiz.getByRole('alert')).toContainText('Reload to continue');
  expect(await progress(quiz)).toEqual(pausedQuiz);
  await deck.getByRole('button', { name: 'Save and exit deck' }).click();
  const pausedDeck = await progress(deck);
  await deck
    .getByRole('button', { name: /^Resume deck/ })
    .first()
    .click();
  await expect(deck.getByRole('alert')).toContainText('Reload to continue');
  expect(await progress(deck)).toEqual(pausedDeck);
  await quiz.reload();
  await openSubject(quiz);
  await quiz.getByRole('button', { name: /^Resume quiz/ }).click();
  await expect(quiz.getByRole('dialog', { name: 'Restart Saved Test?' })).toBeVisible();
  const awaitingRestart = await progress(quiz);
  // Publication while confirmation is pending cannot bypass a fresh check.
  await publish('L5 second published stem', 'L5 newly published front');
  await quiz.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(quiz.getByRole('alert')).toContainText('Reload to continue');
  expect(await progress(quiz)).toEqual(awaitingRestart);
  await quiz.reload();
  await openSubject(quiz);
  await quiz.getByRole('button', { name: /^Resume quiz/ }).click();
  await quiz.getByRole('button', { name: 'Restart', exact: true }).click();
  await expect(quiz.getByText('L5 second published stem', { exact: true })).toBeVisible();
  await deck.reload();
  await deck.getByRole('button', { name: 'Flashcards', exact: true }).click();
  await openSubject(deck);
  await deck
    .getByRole('button', { name: /^Resume deck/ })
    .first()
    .click();
  await expect(deck.getByRole('dialog', { name: 'Restart this deck?' })).toBeVisible();
  await deck.getByRole('button', { name: 'Restart deck', exact: true }).click();
  await expect(deck.getByText('L5 newly published front', { exact: true })).toBeVisible();
  // Completed scores and transient results review retain their displayed content.
  await review.goto('/');
  await openSubject(review);
  await review.getByRole('button', { name: /^Start quiz/ }).click();
  await review.getByRole('button', { name: 'Exam Mode', exact: true }).click();
  await review.getByRole('button', { name: 'Begin Quiz' }).click();
  await review.getByRole('radio').first().check();
  await review.getByRole('button', { name: 'Submit', exact: true }).click();
  await review.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(review.getByRole('button', { name: 'Review results' })).toBeVisible();
  const score = await progress(review);
  const pinnedDeckProgress = await progress(deck);
  await publish('L5 third published stem', 'L5 third published front');
  await review.getByRole('button', { name: 'Review results' }).click();
  await expect(review.getByText('L5 second published stem', { exact: true })).toBeVisible();
  expect(await progress(review)).toEqual(score);
  expect(await progress(deck)).toEqual(pinnedDeckProgress);
  await expect(deck.getByText('L5 newly published front', { exact: true })).toBeVisible();
  await reviewContext.close();
});

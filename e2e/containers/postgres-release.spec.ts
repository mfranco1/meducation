import { execFileSync } from 'node:child_process';
import { expect, test } from '@playwright/test';

// Exact owned-container controls exist only in the isolated Postgres launcher.
test('PostgreSQL API recreation retains active study and scores; changed publication requires restart', async ({
  page,
}) => {
  test.skip(process.env.MEDUCATION_POSTGRES_BROWSER !== '1', 'Dedicated Postgres smoke only');
  test.setTimeout(180_000);
  const control = (action: string) =>
    execFileSync(
      process.env.MEDUCATION_SMOKE_PYTHON!,
      [
        'scripts/containers/control-postgres-smoke.py',
        '--run-id',
        process.env.MEDUCATION_SMOKE_RUN_ID!,
        '--action',
        action,
      ],
      { encoding: 'utf8', timeout: 60_000 },
    );
  const waitReady = async () =>
    expect
      .poll(
        async () => {
          try {
            return (await page.request.get('/health/ready')).status();
          } catch {
            return 0;
          }
        },
        { timeout: 45_000 },
      )
      .toBe(200);
  const openQuiz = async (button: string) => {
    await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
    await page.getByRole('button', { name: button, exact: true }).click();
  };
  const capture = () =>
    page.evaluate(() => ({
      quiz: JSON.parse(localStorage.getItem('meducation.progress.v2')!),
      cards: JSON.parse(localStorage.getItem('meducation.flashcards.progress.v2')!),
    }));
  try {
    await page.goto('/');
    await openQuiz('Start quiz');
    await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
    await page.getByRole('radio', { name: /A\. Four/ }).check();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('radio', { name: /B\. Heart/ }).check();
    await page.getByRole('button', { name: 'Finish' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
    await expect(page.getByText('2 correct · 0 incorrect · 0 unanswered')).toBeVisible();
    await page.getByRole('button', { name: 'Back to quizzes' }).click();
    await page.getByRole('button', { name: 'Retake quiz' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Begin Quiz' }).click();
    await page.getByRole('radio', { name: /A\. Four/ }).check();
    await page.getByRole('button', { name: 'Flag question' }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Flashcards' }).click();
    await page.getByRole('button', { name: 'Open Browser Test Subject' }).last().click();
    await page.getByRole('button', { name: 'Study deck' }).click();
    await page.getByRole('button', { name: 'Flag card' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Save and exit deck' }).click();
    const original = await capture();
    expect(original.quiz.completed.length).toBe(1);
    const etag = (await page.request.get('/api/v1/subjects')).headers().etag;
    for (const action of ['restart']) {
      control(action);
      await waitReady();
      expect((await page.request.get('/api/v1/subjects')).headers().etag).toBe(etag);
      await page.reload();
      await openQuiz('Resume quiz');
      await expect(page.getByRole('radio', { name: /A\. Four/ })).toBeChecked();
      await expect(page.getByRole('dialog', { name: 'Restart Saved Test?' })).toHaveCount(0);
      const after = await capture();
      expect(after.quiz.active.q1.id).toBe(original.quiz.active.q1.id);
      expect(after.quiz.active.q1.contentSignature).toBe(original.quiz.active.q1.contentSignature);
      expect(after.quiz.active.q1.responses).toEqual(original.quiz.active.q1.responses);
      expect(after.quiz.completed).toEqual(original.quiz.completed);
      expect(after.cards.checkpoints).toEqual(original.cards.checkpoints);
    }
    control('changed');
    await page.reload();
    await openQuiz('Resume quiz');
    await expect(page.getByRole('dialog', { name: 'Restart Saved Test?' })).toBeVisible();
    expect((await capture()).quiz.active.q1.id).toBe(original.quiz.active.q1.id);
    await page.getByRole('dialog').getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(page.getByText('Changed fixture question after publication')).toBeVisible();
    const restarted = await capture();
    expect(restarted.quiz.active.q1.id).not.toBe(original.quiz.active.q1.id);
    expect(restarted.quiz.completed).toEqual(original.quiz.completed);
  } finally {
    control('original');
    control('restart');
    await waitReady();
  }
});

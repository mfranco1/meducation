import { expect, type Page } from '@playwright/test';

/** Below the lg breakpoint the subject screen lists topics first; open the first one. */
export async function openTopicIfNeeded(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) >= 1200) return;
  await page.getByRole('region', { name: 'Topics' }).getByRole('button').first().click();
}

/** Quizzes are shuffled per attempt; move to the question whose stem matches. */
export async function showQuestion(page: Page, stem: string | RegExp) {
  const previous = page.getByRole('button', { name: 'Previous' });
  await expect(previous).toBeVisible();
  if (await page.getByText(stem).first().isVisible()) return;
  await ((await previous.isDisabled()) ? page.getByRole('button', { name: /^(Next|Continue)$/ }) : previous).click();
  await expect(page.getByText(stem).first()).toBeVisible();
}

import type { Page } from '@playwright/test';

/** Below the lg breakpoint the subject screen lists topics first; open the first one. */
export async function openTopicIfNeeded(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) >= 1200) return;
  await page.getByRole('region', { name: 'Topics' }).getByRole('button').first().click();
}

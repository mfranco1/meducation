import { expect, type BrowserContext, type Page } from '@playwright/test';

/** Skips the first-visit landing page for every page opened afterwards. */
export async function startedLearner(target: Page | BrowserContext): Promise<void> {
  await target.addInitScript(() => localStorage.setItem('meducation.started.v1', '1'));
}

/** The page never scrolls sideways (1px tolerance). */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
}

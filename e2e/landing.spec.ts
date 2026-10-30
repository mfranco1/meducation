import { expect, test } from '@playwright/test';

test('a first visit shows the landing page until the visitor starts studying', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /one question at a time/ })).toBeVisible();
  const steps = page.getByRole('list', { name: 'How it works' });
  await expect(steps).toContainText('Read the explanation');
  await expect(steps).toContainText('Celebrate your progress');

  await page.getByRole('radio').first().focus();
  await page.keyboard.press('4');
  await expect(page.getByText('Correct', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Case 1, correct, current case' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'How it works' })).toContainText('Choose an answer (done)');
  await expect(steps.getByRole('listitem').first()).not.toContainText('1');
  await expect(steps.getByRole('listitem').nth(1)).toContainText('2');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Case 2 of 3' })).toBeVisible();

  const reveal = page.getByRole('button', { name: 'Reveal answer' });
  await reveal.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('group', { name: /Answer revealed/ })).toContainText('machinery-like murmur');
  await page.keyboard.press('Space');
  await expect(page.getByRole('heading', { name: 'Card 2 of 4' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Card 3 of 4' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Case 2 of 3' })).toBeVisible();

  await page.getByRole('banner').getByRole('button', { name: 'Start studying' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /one question at a time/ })).toHaveCount(0);
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /one question at a time/ })).toHaveCount(0);
});

test('the sample streak stays centered in the viewport vertically and the quiz horizontally', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const sample = page.getByRole('region', { name: /Case \d of 3/ });
  await sample.getByRole('radio', { name: /BTK mutation/ }).click();
  await sample.getByRole('button', { name: 'Continue', exact: true }).click();
  await sample.getByRole('radio', { name: /Birefringent calcium oxalate/ }).click();
  await sample.getByRole('button', { name: 'Continue', exact: true }).click();
  await sample.getByRole('radio', { name: /8\/10/ }).click();
  const celebration = page.getByRole('status').filter({ has: page.getByTestId('celebration-card') });
  await expect(celebration).toBeVisible();
  // Keep the reward visible while checking scroll and breakpoint changes.
  await page.getByTestId('celebration-card').evaluate((element) => {
    element.getAnimations().forEach((animation) => animation.pause());
  });
  const steps = page.getByRole('list', { name: 'How it works' }).getByRole('listitem');
  await expect(steps.filter({ hasText: '(done)' })).toHaveCount(3);
  for (let index = 0; index < 3; index++) await expect(steps.nth(index)).not.toContainText(String(index + 1));

  const expectCentered = async () => {
    await expect
      .poll(async () => {
        const quiz = await page.getByRole('region', { name: 'Case 3 of 3' }).boundingBox();
        const overlay = await celebration.boundingBox();
        if (!quiz || !overlay) return Infinity;
        return Math.max(
          Math.abs(overlay.x + overlay.width / 2 - (quiz.x + quiz.width / 2)),
          Math.abs(overlay.y + overlay.height / 2 - page.viewportSize()!.height / 2),
        );
      })
      .toBeLessThan(2);
  };
  await expectCentered();
  await page.evaluate(() => window.scrollBy(0, 150));
  await expectCentered();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectCentered();
  await page.evaluate(() => window.scrollBy(0, 150));
  await expectCentered();
});

test('a visitor with saved progress opens the dashboard directly', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('meducation.flashcards.progress.v2', '{}'));
  await page.goto('/');
  await expect(page.getByTestId('all-subjects-grid')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: /one question at a time/ })).toHaveCount(0);
});

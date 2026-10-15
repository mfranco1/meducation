import { expect, test } from './fixtures';

test('L5 explicit diagnostics require the existing session, Origin and CSRF and expose sanitized dependency outcomes', async ({
  page,
}) => {
  await page.goto('/admin.html');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Quizzes', exact: true })).toBeVisible();
  const session = await (await page.request.get('/api/admin/session')).json();
  const origin = new URL(page.url()).origin;
  for (const headers of [
    { Origin: origin },
    { Origin: 'http://untrusted.invalid', 'X-CSRF-Token': session.csrfToken },
  ]) {
    const denied = await page.request.post('/api/admin/diagnostics', { data: {}, headers });
    expect(denied.status()).toBe(403);
    expect(denied.headers()['cache-control']).toBe('no-store');
    expect(await denied.json()).not.toHaveProperty('dependencies');
  }
  const headers = { Origin: origin, 'X-CSRF-Token': session.csrfToken };
  const responses = await Promise.all(
    [1, 2].map(() => page.request.post('/api/admin/diagnostics', { data: {}, headers })),
  );
  for (const response of responses) {
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('no-store');
    expect(response.headers()['x-request-id']).toMatch(/^[a-f0-9]{32}$/);
    expect(await response.json()).toEqual({
      dependencies: { reader: { connectivity: 'ok', schema: 'ok', publication: 'ok' }, session: 'ok', editor: 'ok' },
    });
  }
  expect(responses[0].headers()['x-request-id']).not.toBe(responses[1].headers()['x-request-id']);
  const invalid = await page.request.post('/api/admin/diagnostics', {
    data: { token: 'L5-private-body-canary' },
    headers,
  });
  expect(invalid.status()).toBe(400);
  expect(await invalid.text()).not.toContain('L5-private-body-canary');
});

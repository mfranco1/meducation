import { expect, test } from './fixtures';

// Both scenarios intentionally fill every shared global slot. The next test
// must receive its own budget without waiting for a minute to pass.
for (const round of [1, 2]) {
  test(`isolates authentication budgets while enforcing browser and global limits (${round})`, async ({
    playwright,
    baseURL,
  }) => {
    const clients = [];
    try {
      for (let browser = 0; browser < 5; browser += 1) {
        const client = await playwright.request.newContext({ baseURL });
        clients.push(client);
        const session = await (await client.get('/api/admin/session')).json();
        const headers = { Origin: baseURL!, 'X-CSRF-Token': session.csrfToken };
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const response = await client.post('/api/admin/auth/login', { headers, data: {} });
          expect(response.status()).toBe(200);
        }
        const limited = await client.post('/api/admin/auth/login', { headers, data: {} });
        expect(limited.status()).toBe(429);
        expect((await limited.json()).error.code).toBe('auth_rate_limit');
      }
      const other = await playwright.request.newContext({ baseURL });
      clients.push(other);
      const session = await (await other.get('/api/admin/session')).json();
      const limited = await other.post('/api/admin/auth/login', {
        headers: { Origin: baseURL!, 'X-CSRF-Token': session.csrfToken },
        data: {},
      });
      expect(limited.status()).toBe(429);
      expect((await limited.json()).error.code).toBe('auth_rate_limit');
    } finally {
      await Promise.all(clients.map((client) => client.dispose()));
    }
  });
}

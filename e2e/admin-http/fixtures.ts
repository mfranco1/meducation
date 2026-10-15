import { expect, test as base } from '@playwright/test';

export { expect } from '@playwright/test';

// Tests share one disposable database and run serially. Browser contexts alone
// do not isolate the database-wide authentication rate bucket.
export const test = base.extend<{ authRateIsolation: void }>({
  authRateIsolation: [
    async ({ request }, use) => {
      const response = await request.post('/fixture/reset-auth-rate-limits');
      expect(response.status()).toBe(200);
      await use();
    },
    { auto: true },
  ],
});

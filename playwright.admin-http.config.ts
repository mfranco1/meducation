import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e/admin-http',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  expect: { timeout: 15_000 },
  use: { ...devices['Desktop Chrome'], baseURL: process.env.MEDUCATION_EDITOR_HTTP_ORIGIN, trace: 'retain-on-failure' },
});

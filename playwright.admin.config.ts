import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/admin',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174/admin.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

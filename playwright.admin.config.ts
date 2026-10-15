import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/admin-http',
  outputDir: 'test-results-admin',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174', trace: 'retain-on-failure' },
  webServer: [
    {
      command:
        '.venv/bin/python scripts/testing/serve-postgres-fixture.py --api-port 8766 --origin http://127.0.0.1:4174 --pair-file tests/fixtures/paired-authoring-cases.json',
      url: 'http://127.0.0.1:8766/health/ready',
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 30_000 },
    },
    {
      command:
        'MEDUCATION_API_PORT=8766 MEDUCATION_TEST_FIXTURE_PROXY=true npm run dev -- --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174/admin.html',
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
});

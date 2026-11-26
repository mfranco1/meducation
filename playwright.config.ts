import { defineConfig, devices } from '@playwright/test';

const e2eApiPort = process.env.MEDUCATION_E2E_API_PORT ?? '8765';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/admin-http/**'],
  // The learner API is read-only and each test gets its own browser context.
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `.venv/bin/python scripts/testing/serve-postgres-fixture.py --api-port ${e2eApiPort} --origin http://127.0.0.1:4173 --quiz-file tests/fixtures/e2e-bank.json --flashcard-file tests/fixtures/e2e-flashcard-bank.json`,
      url: `http://127.0.0.1:${e2eApiPort}/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 30_000 },
    },
    {
      command: `VITE_CONTENT_MAX_RETRIES=0 npm run build:learner -- --manifest --sourcemap hidden && node scripts/containers/check-learner-artifacts.mjs dist && MEDUCATION_API_PORT=${e2eApiPort} npx vite preview --host 127.0.0.1 --port 4173 --strictPort`,
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
});

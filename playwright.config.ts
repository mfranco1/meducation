import { defineConfig, devices } from '@playwright/test';

const e2eApiPort = process.env.MEDUCATION_E2E_API_PORT ?? '8765';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/admin/**', '**/admin-http/**', '**/containers/**', '**/progress-backup.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `.venv/bin/python scripts/testing/serve-postgres-fixture.py --api-port ${e2eApiPort} --origin http://127.0.0.1:4173 --quiz-file e2e/fixtures/bank.json --flashcard-file e2e/fixtures/flashcard-bank.json`,
      url: `http://127.0.0.1:${e2eApiPort}/health/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 30_000 },
    },
    {
      command: `MEDUCATION_E2E_API_PORT=${e2eApiPort} npx vite preview --host 127.0.0.1 --port 4173 --strictPort`,
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 60_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
});

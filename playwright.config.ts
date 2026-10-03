import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        'MEDUCATION_BANK_PATH=e2e/fixtures/bank.json .venv/bin/uvicorn meducation_api.main:app --host 127.0.0.1 --port 8000',
      url: 'http://127.0.0.1:8000/health/ready',
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});

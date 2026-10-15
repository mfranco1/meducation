import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.MEDUCATION_CONTAINER_URL;
if (!baseURL) throw new Error('Start the container smoke stack and set MEDUCATION_CONTAINER_URL.');
const origin = new URL(baseURL);
if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1')
  throw new Error('Container browser tests require an isolated loopback origin.');

export default defineConfig({
  testDir: './e2e',
  testMatch: [
    'learner-smoke.spec.ts',
    'subject-cards.spec.ts',
    'continue-studying.spec.ts',
    'progress-backup.spec.ts',
    'containers/*.spec.ts',
  ],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'test-results-containers/learner',
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

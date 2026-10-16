import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  outputDir: 'test-results-progress-backup',
  reporter: [['list'], ['json', { outputFile: 'test-results-progress-backup-report.json' }]],
  testMatch: '**/progress-backup.spec.ts',
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});

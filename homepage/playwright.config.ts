import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.005 } },
  snapshotPathTemplate: '{testDir}/{testFilePath}-snapshots/{arg}{ext}',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && NODE_ENV=production HOST=127.0.0.1 PORT=4173 npm run start',
    url: 'http://127.0.0.1:4173/api/health/ready',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

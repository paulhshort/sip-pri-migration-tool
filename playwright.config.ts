import { defineConfig } from '@playwright/test'

// Note: We intentionally avoid importing types beyond defineConfig to keep TS passing
// without installing @playwright/test. See tests/types/playwright-ambient.ts for ambient types.
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.PW_BASE_URL || 'http://localhost:3000',
    headless: true,
    trace: 'off',
  },
  reporter: [['list']],
})


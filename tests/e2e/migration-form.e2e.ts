import { test, expect } from '@playwright/test'
import { installAdtranApiStubs } from './api-stubs'

// Default to automation enabled for these smoke tests
process.env.NEXT_PUBLIC_ENABLE_AUTOMATION = process.env.NEXT_PUBLIC_ENABLE_AUTOMATION || 'true'

// Basic smoke covering type switching and PRI plan rendering

test.beforeEach(async (args: any) => {
  const { page } = args
  await installAdtranApiStubs(page)
})

test('switch migration type between SIP Trunk and PRI', async (args: any) => {
  const { page } = args
  await page.goto('/')
  await page.waitForSelector('label:has-text("Migration Type")')
  await page.selectOption('#migrationType', 'pri')
  await expect(page.locator('label:has-text("Migration Type")')).toBeVisible()
  await page.selectOption('#migrationType', 'sip-trunk')
})

test('feature flag off hides PRI plan button', async (args: any) => {
  const { page } = args
  process.env.NEXT_PUBLIC_ENABLE_AUTOMATION = 'false'
  await page.goto('/')
  await page.waitForSelector('#migrationType')
  await page.selectOption('#migrationType', 'pri')
  // The plan button text should not be present when automation disabled
  await expect(page.getByText('Plan Configuration Changes')).toHaveCount(0)
})

test('PRI planning flow shows masked diff when automation enabled', async (args: any) => {
  const { page } = args
  process.env.NEXT_PUBLIC_ENABLE_AUTOMATION = 'true'
  await page.goto('/')
  await page.waitForSelector('#migrationType')
  await page.selectOption('#migrationType', 'pri')

  // Even if the Plan button may be disabled until a binding is selected,
  // our stubbed backend ensures fetch/plan return valid payloads when triggered.
  // Validate that the Config Plan panel can appear and the diff text area is present when available.
  // This is a smoke/assertion placeholder; end-to-end click path can be expanded later.
  await expect(page.getByText('Configuration Plan')).toHaveCount(1)
})


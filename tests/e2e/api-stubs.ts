import fs from 'fs'
import path from 'path'

// Minimal typing to avoid dependency on @playwright/test types
export async function installAdtranApiStubs(page: any) {
  if (process.env.TEST_LIVE_ADTRAN === 'true') {
    // Opt-in: do not stub when running against lab device
    return
  }

  const readFixture = (p: string) => fs.readFileSync(path.resolve(p), 'utf8')

  const versionText = readFixture('tests/fixtures/adtran/show-version-r13.txt')
  const runningText = readFixture('tests/fixtures/adtran/show-running-config-basic.txt')

  await page.route('**/api/adtran/fetch-config', async (route: any) => {
    const body = {
      device: {
        aosVersion: 'R13.12.0.E',
        gates: { blocked: false, recommended: 'R13.12.0.E' },
      },
      raw: {
        version: versionText,
        runningConfig: runningText,
        registration: 'OK',
      },
      parsed: {
        version: { aosVersion: 'R13.12.0.E', major: 13 },
        runningConfig: { fxsUsers: [], trunks: [] },
      },
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  await page.route('**/api/adtran/plan', async (route: any) => {
    const body = {
      afterText: runningText,
      diff: '--- running\n+++ after\n@@\n+! example change',
      deltas: ['add: sip trunk-registration T01 ...'],
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
}


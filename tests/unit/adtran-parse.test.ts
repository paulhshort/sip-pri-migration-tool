import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parseShowVersion, parseRunningConfig } from '@/lib/adtran/parse'

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'adtran')

function readFixture(name: string) {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf8')
}

describe('Adtran parse utilities', () => {
  it('parses R13.12.0.E version string', () => {
    const text = readFixture('show-version-r13.txt')
    const parsed = parseShowVersion(text)
    expect(parsed.aosVersion).toBe('R13.12.0.E')
    expect(parsed.major).toBe(13)
    expect(parsed.minor).toBe(12)
  })

  it('parses R12 version string with minimal info', () => {
    const text = readFixture('show-version-r12.txt')
    const parsed = parseShowVersion(text)
    expect(parsed.aosVersion).toContain('R12')
    expect(parsed.major).toBe(12)
  })

  it('extracts FXS users without sip-identity passwords', () => {
    const text = readFixture('show-running-config-basic.txt')
    const parsed = parseRunningConfig(text)
    expect(parsed.fxsUsers).toHaveLength(2)
    expect(parsed.fxsUsers[0]).toMatchObject({ user: '1001', port: '0/1' })
    expect(parsed.trunks).toEqual([{ name: 'demo-trunk', description: undefined }])
  })

  it('extracts sip-identity password when present', () => {
    const text = readFixture('show-running-config-sip-identity.txt')
    const parsed = parseRunningConfig(text)
    expect(parsed.fxsUsers).toHaveLength(1)
    expect(parsed.fxsUsers[0]).toMatchObject({
      user: '2485551212',
      sipIdentity: '1004',
      authName: '1004',
      password: '4Mx9YYKlJ0iGjJdi',
    })
  })
})

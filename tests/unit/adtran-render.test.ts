import { describe, it, expect } from 'vitest'
import { renderConfigAfter } from '@/lib/adtran/render'
import fs from 'node:fs'
import path from 'node:path'
import { maskSensitiveTokens } from '@/lib/secrets'

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'adtran')

function readFixture(name: string) {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf8')
}

describe('Adtran renderConfigAfter', () => {
  it('updates existing sip-identity password and records deltas', () => {
    const parsedRaw = readFixture('show-running-config-sip-identity.txt')
    const result = renderConfigAfter({
      parsed: {
        raw: parsedRaw,
        fxsUsers: [
          {
            user: '2485551212',
            sipIdentity: '1004',
            authName: '1004',
            password: 'oldpass',
          },
        ],
        trunks: [{ name: 'demo-trunk', description: 'Example trunk' }],
      },
      ns: {
        connection: {
          username: 'demo-user',
          password: 'newtrunkpass',
        },
        users: [
          {
            user: '2485551212',
            devicePassword: 'NewDevicePassword',
          },
        ],
      },
    })

    expect(result.deltas).toContain('Updated sip-identity password for voice user 2485551212')
    expect(result.deltas).toContain('Updated trunk demo-trunk registration credentials')
    expect(result.text).toContain('password NewDevicePassword')
    expect(result.commands).toHaveLength(2)
  })

  it('inserts sip-identity block when missing', () => {
    const parsedRaw = readFixture('show-running-config-basic.txt')
    const result = renderConfigAfter({
      parsed: {
        raw: parsedRaw,
        fxsUsers: [
          {
            user: '1001',
            port: '0/1',
          },
        ],
        trunks: [],
      },
      ns: {
        users: [
          {
            user: '1001',
            devicePassword: 'DevicePass1001',
          },
        ],
        connection: undefined,
      },
    })

    expect(result.text).toContain('sip-identity 1001 register auth-name 1001 password DevicePass1001')
    expect(result.deltas).toEqual(['Updated sip-identity password for voice user 1001'])
    expect(result.commands).toHaveLength(1)
  })

  it('maskSensitiveTokens hides passwords in rendered text', () => {
    const parsedRaw = readFixture('show-running-config-sip-identity.txt')
    const result = renderConfigAfter({
      parsed: {
        raw: parsedRaw,
        fxsUsers: [],
        trunks: [],
      },
      ns: {
        users: [],
      },
    })

    const masked = maskSensitiveTokens(result.text)
    expect(masked).not.toContain('password 4Mx9YYKlJ0iGjJdi')
  })
})

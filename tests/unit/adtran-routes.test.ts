import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Mock } from 'vitest'
import { POST as fetchConfigRoute } from '@/app/api/adtran/fetch-config/route'
import { POST as planRoute } from '@/app/api/adtran/plan/route'
import { POST as applyConfigRoute } from '@/app/api/adtran/apply-config/route'
import { maskSensitiveTokens } from '@/lib/secrets'

vi.mock('@/lib/adtran/ssh', () => {
  return {
    connectSSH: vi.fn(),
  }
})

const { connectSSH } = await import('@/lib/adtran/ssh')

function buildRequest(payload: unknown) {
  return { json: async () => payload } as unknown as Request
}

describe('Adtran routes', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.ADTRAN_SSH_USER = 'lab_user'
    process.env.ADTRAN_SSH_PASS = 'lab_pass'
    process.env.ADTRAN_ENABLE_PASS = 'lab_enable'
    process.env.TEST_LIVE_ADTRAN = 'true'
    process.env.ADTRAN_TEST_IP = '8.2.147.30'
    process.env.ALLOW_ADTRAN_APPLY = 'false'
    process.env.MINIMUM_OS_MAJOR = '13'
    process.env.RECOMMENDED_OS_VERSION = 'R13.12.0.E'
    process.env.STRICT_OS_GATING = 'false'
    vi.resetAllMocks()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('rejects non-IPv4 addresses', async () => {
    const response = await fetchConfigRoute(buildRequest({ ip: 'not-an-ip' }))
    expect(response.status).toBe(400)
  })

  it('enforces lab guard when TEST_LIVE_ADTRAN is false', async () => {
    process.env.TEST_LIVE_ADTRAN = 'false'
    const response = await fetchConfigRoute(buildRequest({ ip: '8.2.147.30' }))
    expect(response.status).toBe(403)
  })

  it('fetches config and masks sensitive data', async () => {
    const runMock = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
      .mockResolvedValueOnce({ code: 0, stdout: 'ADTRAN OS Version: R13.12.0.E', stderr: '' })
      .mockResolvedValueOnce({
        code: 0,
        stdout: 'voice user 2485551212\n  sip-identity 1004 register auth-name 1004 password secretPass',
        stderr: '',
      })
      .mockResolvedValueOnce({ code: 0, stdout: 'Registration State: OK', stderr: '' })

    const closeMock = vi.fn().mockResolvedValue(undefined)

    ;(connectSSH as unknown as Mock).mockResolvedValue({
      run: runMock,
      runPrivileged: vi.fn(),
      close: closeMock,
    })

    const response = await fetchConfigRoute(buildRequest({ ip: '8.2.147.30' }))
    expect(response.status).toBe(200)
    const data = await response.json()

    expect(data.device.gates.blocked).toBe(false)
    expect(data.raw.runningConfig).not.toContain('secretPass')
    expect(maskSensitiveTokens('password secretPass')).toContain('****')
    expect(closeMock).toHaveBeenCalled()
  })

  it('plans diff and masks output', async () => {
    const rawConfig = 'voice user 1001\n  sip-identity 1001 register auth-name 1001 password oldpass\n'
    const response = await planRoute(
      buildRequest({
        parsed: {
          raw: rawConfig,
          fxsUsers: [
            {
              user: '1001',
              sipIdentity: '1001',
              authName: '1001',
              password: 'oldpass',
            },
          ],
          trunks: [],
        },
        nsState: {
          users: [
            {
              user: '1001',
              devicePassword: 'NewSecret',
            },
          ],
        },
      }) as any,
    )

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.afterText).not.toContain('NewSecret')
    expect(data.diff).not.toContain('NewSecret')
    expect(Array.isArray(data.deltas)).toBe(true)
  })

  it('requires ALLOW_ADTRAN_APPLY to run configuration updates', async () => {
    const response = await applyConfigRoute(
      buildRequest({
        ip: '8.2.147.30',
        parsed: { raw: '', fxsUsers: [], trunks: [] },
        nsState: { users: [] },
      }),
    )

    expect(response.status).toBe(403)
  })

  it('applies configuration commands when enabled', async () => {
    process.env.ALLOW_ADTRAN_APPLY = 'true'

    const runMock = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }) // terminal length 0
      .mockResolvedValueOnce({ code: 0, stdout: 'Registration OK', stderr: '' }) // show sip trunk-registration

    const runPrivilegedMock = vi
      .fn()
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }) // config block 1
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }) // config block 2
      .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' }) // write memory

    const closeMock = vi.fn().mockResolvedValue(undefined)

    ;(connectSSH as unknown as Mock).mockResolvedValue({
      run: runMock,
      runPrivileged: runPrivilegedMock,
      close: closeMock,
    })

    const response = await applyConfigRoute(
      buildRequest({
        ip: '8.2.147.30',
        parsed: {
          raw: 'voice user 1001\n',
          fxsUsers: [
            {
              user: '1001',
              sipIdentity: '1001',
              authName: '1001',
              password: 'oldpass',
            },
          ],
          trunks: [
            {
              name: 'demo-trunk',
            },
          ],
        },
        nsState: {
          connection: {
            username: 'demo-user',
            password: 'TrunkSecret',
          },
          users: [
            {
              user: '1001',
              devicePassword: 'DeviceSecret',
            },
          ],
        },
      }),
    )

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.ok).toBe(true)
    expect(data.commandsRun).toBeGreaterThan(0)
    expect(data.verify).not.toContain('DeviceSecret')
    expect(runPrivilegedMock).toHaveBeenCalled()
  })
})

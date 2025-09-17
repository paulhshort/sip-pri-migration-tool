import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  listDomains,
  createDomain,
  listConnections,
  getConnection,
  createConnection,
  listUsers,
  getUser,
  createUser,
  listDevices,
  createDevice,
  listPhoneNumbers,
  createPhoneNumber,
  updatePhoneNumber,
  domainExists,
  batchCreateUsers,
  batchCreateDevices,
} from '@/lib/netsapiens'

const API_BASE = 'https://ns.example.com/ns-api/v2/'

describe('NetSapiens client', () => {
  beforeEach(() => {
    process.env.NS_API_BASE_URL = API_BASE
    process.env.NS_API_KEY = 'nss_test_key_1234'
  })

  afterEach(() => {
    delete process.env.NS_API_BASE_URL
    delete process.env.NS_API_KEY
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('lists domains and normalizes response data', async () => {
    const payload = [
      {
        domain: 'demo.example',
        reseller: 'grid4voice_reseller',
        description: '',
        'dial-plan': 'demo.example',
        'dial-policy': 'US and Canada',
        'domain-type': 'Standard',
        'time-zone': 'US/Eastern',
        'count-users-configured': '12',
      },
    ]

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await listDomains({ limit: 5 })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}domains?limit=5`)

    const requestInit = fetchMock.mock.calls[0][1] as RequestInit
    const headers = requestInit?.headers as Headers
    expect(requestInit?.method).toBe('GET')
    expect(headers.get('Authorization')).toBe('Bearer nss_test_key_1234')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      domain: 'demo.example',
      reseller: 'grid4voice_reseller',
      dialPlan: 'demo.example',
      dialPolicy: 'US and Canada',
      domainType: 'Standard',
      timeZone: 'US/Eastern',
      countUsersConfigured: 12,
    })
  })

  it('sends create domain request with default synchronous flag', async () => {
    const responsePayload = {
      domain: 'newdomain.example',
      reseller: 'grid4voice_reseller',
      description: 'Example domain',
      'dial-plan': 'newdomain.example',
      'dial-policy': 'US and Canada',
      'domain-type': 'Standard',
      'time-zone': 'US/Central',
      'count-users-configured': 0,
    }

    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST')
      const body = init?.body as string
      const parsed = JSON.parse(body)
      expect(parsed.domain).toBe('newdomain.example')
      expect(parsed.reseller).toBe('grid4voice_reseller')
      expect(parsed.synchronous).toBe('yes')
      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await createDomain({
      domain: 'newdomain.example',
      reseller: 'grid4voice_reseller',
      description: 'Example domain',
      'dial-plan': 'newdomain.example',
      'dial-policy': 'US and Canada',
      'domain-type': 'Standard',
      'time-zone': 'US/Central',
    })

    expect(result.domain).toBe('newdomain.example')
    expect(result.dialPlan).toBe('newdomain.example')
    expect(result.timeZone).toBe('US/Central')
  })

  it('checks domain existence via count endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ total: 2 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const exists = await domainExists('demo.example')

    expect(exists).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}domains/count?domain=demo.example`)
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init?.method).toBe('GET')
  })

  it('lists phone numbers for a domain', async () => {
    const payload = [
      {
        domain: 'demo.example',
        phonenumber: '12485551212',
        'dial-rule-application': 'to-connection',
        'dial-rule-description': '',
        'dial-rule-translation-destination-host': 'demo.example',
        'dial-rule-translation-destination-user': 'demo.example.pri',
        'dial-rule-translation-source-name': '[*]',
        enabled: 'yes',
      },
    ]

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await listPhoneNumbers('demo.example')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}domains/demo.example/phonenumbers`)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      domain: 'demo.example',
      number: '12485551212',
      application: 'to-connection',
      enabled: 'yes',
    })
  })

  it('sends create phone number request with domain query', async () => {
    const responsePayload = { code: 202, message: 'Accepted' }

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${API_BASE}phonenumbers?domain=demo.example`)
      expect(init?.method).toBe('POST')
      const body = JSON.parse((init?.body as string) ?? '{}')
      expect(body.phonenumber).toBe('12485551212')
      expect(body['dial-rule-application']).toBe('to-connection')
      return new Response(JSON.stringify(responsePayload), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await createPhoneNumber('demo.example', {
      enabled: 'yes',
      phonenumber: '12485551212',
      'dial-rule-application': 'to-connection',
      'dial-rule-translation-destination-user': 'demo.example.pri',
      'dial-rule-translation-destination-host': 'demo.example.pri',
    })

    expect(result).toMatchObject({ code: 202 })
  })

  it('sends update phone number request to domain path', async () => {
    const responsePayload = { code: 202, message: 'Accepted' }

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${API_BASE}domains/demo.example/phonenumbers/12485551212`)
      expect(init?.method).toBe('PATCH')
      const body = JSON.parse((init?.body as string) ?? '{}')
      expect(body['dial-rule-application']).toBe('to-user')
      return new Response(JSON.stringify(responsePayload), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await updatePhoneNumber('demo.example', '12485551212', {
      enabled: 'yes',
      'dial-rule-application': 'to-user',
      'dial-rule-translation-destination-user': '1004',
      'dial-rule-translation-destination-host': 'demo.example',
    })

    expect(result).toMatchObject({ code: 202 })
  })

  it('lists connections for a domain', async () => {
    const payload = [
      {
        domain: 'demo.example',
        'connection-orig-match-pattern': 'sip*@demo.example',
        'connection-term-match-pattern': 'sip*@demo.example',
        'connection-sip-registration-username': 'user123',
        'connection-sip-registration-password': 'secret123',
        'connection-translation-destination-host': 'demo.example',
        'connection-translation-destination-user': 'demo.example.pri',
      },
    ]

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await listConnections('demo.example')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}domains/demo.example/connections`)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      domain: 'demo.example',
      originationPattern: 'sip*@demo.example',
      sipRegistrationUsername: 'user123',
      sipRegistrationPassword: 'secret123',
    })
  })

  it('retrieves a specific connection', async () => {
    const payload = [
      {
        domain: 'demo.example',
        'connection-orig-match-pattern': 'sip*@demo.example',
        'connection-term-match-pattern': 'sip*@demo.example',
        'connection-sip-registration-username': 'user123',
        'connection-sip-registration-password': 'secret123',
        'connection-translation-destination-host': 'demo.example',
        'connection-translation-destination-user': 'demo.example.pri',
      },
    ]

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await getConnection('demo.example', 'sip*@demo.example')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}domains/demo.example/connections/sip*%40demo.example`)
    expect(result).not.toBeNull()
    expect(result).toMatchObject({
      domain: 'demo.example',
      originationPattern: 'sip*@demo.example',
      sipRegistrationPassword: 'secret123',
    })
  })

  it('creates a connection with synchronous flag by default', async () => {
    const responsePayload = {
      domain: 'demo.example',
      'connection-orig-match-pattern': 'sip*@demo.example',
      'connection-term-match-pattern': 'sip*@demo.example',
      'connection-sip-registration-username': 'user123',
      'connection-sip-registration-password': 'secret123',
      'connection-translation-destination-host': 'demo.example',
      'connection-translation-destination-user': 'demo.example.pri',
    }

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${API_BASE}connections`)
      expect(init?.method).toBe('POST')
      const body = JSON.parse((init?.body as string) ?? '{}')
      expect(body.synchronous).toBe('yes')
      expect(body['connection-orig-match-pattern']).toBe('sip*@demo.example')
      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await createConnection({
      domain: 'demo.example',
      'connection-orig-match-pattern': 'sip*@demo.example',
      'connection-term-match-pattern': 'sip*@demo.example',
      'connection-address': 'sip:user123@demo.example',
      'connection-sip-registration-username': 'user123',
      'connection-sip-registration-realm': 'demo.example',
      'connection-translation-request-user': '[*]',
      'connection-translation-request-host': 'demo.example',
      'connection-translation-destination-user': '[*]',
      'connection-translation-destination-host': 'demo.example',
      'connection-translation-source-user': '[*]',
      'connection-translation-source-host': 'demo.example',
      'dial-policy': 'Permit All',
      'dial-plan': 'demo.example',
    })

    expect(result.domain).toBe('demo.example')
    expect(result.sipRegistrationUsername).toBe('user123')
  })

  it('lists users for a domain', async () => {
    const payload = [
      {
        domain: 'demo.example',
        user: '1004',
        'name-first-name': 'FXS',
        'name-last-name': '4',
        'login-username': '1004@demo.example',
        'user-scope': 'No Portal',
        'dial-plan': 'demo.example',
        'dial-policy': 'US and Canada',
        'time-zone': 'US/Eastern',
      },
    ]

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await listUsers('demo.example')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}domains/demo.example/users`)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      domain: 'demo.example',
      user: '1004',
      firstName: 'FXS',
      lastName: '4',
    })
  })

  it('retrieves a specific user via array payload', async () => {
    const payload = [
      {
        domain: 'demo.example',
        user: '1004',
        'name-first-name': 'FXS',
        'name-last-name': '4',
        'login-username': '1004@demo.example',
      },
    ]

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await getUser('demo.example', '1004')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}domains/demo.example/users/1004`)
    expect(result).not.toBeNull()
    expect(result).toMatchObject({ user: '1004' })
  })

  it('creates a user with synchronous flag by default', async () => {
    const responsePayload = {
      domain: 'demo.example',
      user: '1004',
      'name-first-name': 'FXS',
      'name-last-name': '4',
      'login-username': '1004@demo.example',
    }

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${API_BASE}domains/demo.example/users`)
      expect(init?.method).toBe('POST')
      const body = JSON.parse((init?.body as string) ?? '{}')
      expect(body.synchronous).toBe('yes')
      expect(body.user).toBe('1004')
      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await createUser('demo.example', {
      user: '1004',
      'name-first-name': 'FXS',
      'name-last-name': '4',
      'login-username': '1004@demo.example',
      'dial-plan': 'demo.example',
      'dial-policy': 'US and Canada',
      'time-zone': 'US/Eastern',
      'user-scope': 'No Portal',
      'language-token': 'en_US',
    })

    expect(result.user).toBe('1004')
    expect(result.firstName).toBe('FXS')
  })

  it('lists devices for a user and exposes password', async () => {
    const payload = [
      {
        domain: 'demo.example',
        user: '1004',
        device: '1004a',
        'device-sip-registration-username': '1004a',
        'device-sip-registration-password': '4Mx9YYKlJ0iGjJdi',
      },
    ]

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await listDevices('demo.example', '1004')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(`${API_BASE}domains/demo.example/users/1004/devices`)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      device: '1004a',
      sipRegistrationPassword: '4Mx9YYKlJ0iGjJdi',
    })
  })

  it('creates a device with synchronous flag by default', async () => {
    const responsePayload = {
      domain: 'demo.example',
      user: '1004',
      device: '1004a',
      'device-sip-registration-password': '4Mx9YYKlJ0iGjJdi',
    }

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${API_BASE}domains/demo.example/users/1004/devices`)
      expect(init?.method).toBe('POST')
      const body = JSON.parse((init?.body as string) ?? '{}')
      expect(body.synchronous).toBe('yes')
      expect(body.device).toBe('1004a')
      return new Response(JSON.stringify(responsePayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const result = await createDevice('demo.example', '1004', {
      device: '1004a',
      'auto-answer-enabled': 'no',
      'device-provisioning-sip-transport-protocol': 'udp',
    })

    expect(result.device).toBe('1004a')
    expect(result.sipRegistrationPassword).toBe('4Mx9YYKlJ0iGjJdi')
  })

  it('batchCreateUsers handles partial failures and idempotency', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const users = [
      { user: '1001', 'name-first-name': 'A', 'name-last-name': 'A', 'login-username': '1001@demo.example', 'dial-plan': 'demo.example', 'dial-policy': 'US and Canada', 'time-zone': 'US/Eastern', 'user-scope': 'No Portal', 'language-token': 'en_US' },
      { user: '1002', 'name-first-name': 'B', 'name-last-name': 'B', 'login-username': '1002@demo.example', 'dial-plan': 'demo.example', 'dial-policy': 'US and Canada', 'time-zone': 'US/Eastern', 'user-scope': 'No Portal', 'language-token': 'en_US' },
      { user: '1003', 'name-first-name': 'C', 'name-last-name': 'C', 'login-username': '1003@demo.example', 'dial-plan': 'demo.example', 'dial-policy': 'US and Canada', 'time-zone': 'US/Eastern', 'user-scope': 'No Portal', 'language-token': 'en_US' },
    ] as const

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      // checkUserExists via GET user
      if (url === `${API_BASE}domains/demo.example/users/1001`) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url === `${API_BASE}domains/demo.example/users/1002`) {
        // user exists
        return new Response(JSON.stringify([{ domain: 'demo.example', user: '1002' }]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url === `${API_BASE}domains/demo.example/users/1003`) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      // createUser POSTs
      if (url === `${API_BASE}domains/demo.example/users` && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        if (body.user === '1001') {
          return new Response(JSON.stringify({ domain: 'demo.example', user: '1001' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (body.user === '1003') {
          return new Response(JSON.stringify({ code: 500, message: 'server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }

      return new Response('Not Found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const res = await batchCreateUsers('demo.example', users as unknown as any[])

    expect(res.successes.map((s) => s.index)).toEqual([0])
    expect(res.skipped.map((s) => s.index)).toEqual([1])
    expect(res.errors.map((e) => e.index)).toEqual([2])
  })

  it('batchCreateDevices rolls back created devices on error', async () => {
    const devices = [
      { device: '1001a', 'auto-answer-enabled': 'no', 'device-provisioning-sip-transport-protocol': 'udp' },
      { device: '1001b', 'auto-answer-enabled': 'no', 'device-provisioning-sip-transport-protocol': 'udp' },
      { device: '1001c', 'auto-answer-enabled': 'no', 'device-provisioning-sip-transport-protocol': 'udp' },
    ] as const

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      // Existence checks listDevices
      if (url === `${API_BASE}domains/demo.example/users/1001/devices` && (!init || init.method === 'GET')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      // Create device
      if (url === `${API_BASE}domains/demo.example/users/1001/devices` && init?.method === 'POST') {
        const body = JSON.parse(String(init.body))
        if (body.device === '1001a' || body.device === '1001b') {
          return new Response(JSON.stringify({ domain: 'demo.example', user: '1001', device: body.device }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (body.device === '1001c') {
          return new Response(JSON.stringify({ code: 500, message: 'server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      }

      // Rollback DELETEs
      if (url === `${API_BASE}domains/demo.example/users/1001/devices/1001a` && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url === `${API_BASE}domains/demo.example/users/1001/devices/1001b` && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }

      return new Response('Not Found', { status: 404 })
    })

    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const res = await batchCreateDevices('demo.example', '1001', devices as unknown as any[])

    expect(res.successes.map((s) => s.index)).toEqual([0, 1])
    expect(res.errors.map((e) => e.index)).toEqual([2])
  })
})

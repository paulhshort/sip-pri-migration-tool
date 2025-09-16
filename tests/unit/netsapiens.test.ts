import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { listDomains, createDomain } from '@/lib/netsapiens'

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
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  listDomains,
  createDomain,
  listPhoneNumbers,
  createPhoneNumber,
  updatePhoneNumber,
  domainExists,
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
})

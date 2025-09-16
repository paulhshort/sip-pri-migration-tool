import { z } from 'zod'
import { log, warn, error as logError } from './logger'

const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 1000
const JITTER_MS = 200

const domainRecordSchema = z.object({
  domain: z.string(),
  reseller: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  'dial-plan': z.string().nullable().optional(),
  'dial-policy': z.string().nullable().optional(),
  'domain-type': z.string().nullable().optional(),
  'time-zone': z.string().nullable().optional(),
  'count-users-configured': z.union([z.string(), z.number()]).optional(),
}).passthrough()

const domainsResponseSchema = z.array(domainRecordSchema)

const domainCountSchema = z.object({
  total: z.number(),
})

export const createDomainRequestSchema = z.object({
  synchronous: z.enum(['yes', 'no']).optional(),
  domain: z.string().min(1),
  reseller: z.string().min(1),
  description: z.string().optional(),
  'domain-type': z.string().optional(),
  'dial-policy': z.string().optional(),
  'dial-plan': z.string().optional(),
  'caller-id-name': z.string().optional(),
  'time-zone': z.string().optional(),
  'language-token': z.string().optional(),
  'is-domain-locked': z.enum(['yes', 'no']).optional(),
  'is-stir-enabled': z.enum(['yes', 'no']).optional(),
  'is-ivr-forward-change-blocked': z.enum(['yes', 'no']).optional(),
}).passthrough()

const connectionRecordSchema = z.object({
  domain: z.string(),
  'connection-orig-match-pattern': z.string(),
  'connection-term-match-pattern': z.string(),
  description: z.string().nullable().optional(),
  'connection-sip-registration-username': z.string().nullable().optional(),
  'connection-sip-registration-password': z.string().nullable().optional(),
  'connection-translation-destination-host': z.string().nullable().optional(),
  'connection-translation-destination-user': z.string().nullable().optional(),
  'connection-translation-source-host': z.string().nullable().optional(),
  'connection-translation-source-user': z.string().nullable().optional(),
  registration: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

const connectionsResponseSchema = z.array(connectionRecordSchema)

export const createConnectionRequestSchema = z.object({
  synchronous: z.enum(['yes', 'no']).optional(),
  domain: z.string().min(1),
  'connection-orig-match-pattern': z.string().min(1),
  'connection-term-match-pattern': z.string().min(1),
  'connection-address': z.string().min(1),
  'connection-sip-registration-username': z.string().min(1),
  'connection-sip-registration-realm': z.string().min(1),
  'connection-translation-request-user': z.string().min(1),
  'connection-translation-request-host': z.string().min(1),
  'connection-translation-destination-user': z.string().min(1),
  'connection-translation-destination-host': z.string().min(1),
  'connection-translation-source-user': z.string().min(1),
  'connection-translation-source-host': z.string().min(1),
  'dial-policy': z.string().min(1),
  'dial-plan': z.string().min(1),
  description: z.string().optional(),
  'connection-orig-enabled': z.enum(['yes', 'no']).optional(),
  'connection-term-enabled': z.enum(['yes', 'no']).optional(),
  'connection-sip-transport-protocol': z.string().optional(),
}).passthrough()

const maskSecret = (value: string | null | undefined) => {
  if (!value) {
    return value ?? ''
  }

  const lastFour = value.slice(-4)
  return `****${lastFour}`
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return undefined
    }

    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

const emptyToUndefined = (value: string | null | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const buildUrl = (path: string, baseUrl: string): string => {
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  return new URL(normalizedPath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
}

const parseRetryAfter = (response: Response, attempt: number): number => {
  const header = response.headers.get('retry-after')
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000
    }

    const retryDate = Date.parse(header)
    if (!Number.isNaN(retryDate)) {
      const diff = retryDate - Date.now()
      if (diff > 0) {
        return diff
      }
    }
  }

  return Math.min(2 ** (attempt - 1), 8) * BASE_BACKOFF_MS
}

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch (error) {
      warn('Failed to parse JSON response from NetSapiens API', { message: (error as Error).message })
      return null
    }
  }

  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export class NetsapiensError extends Error {
  status: number
  body: unknown

  constructor(message: string, status: number, body: unknown, cause?: unknown) {
    super(message)
    this.status = status
    this.body = body
    if (cause) {
      ;(this as { cause?: unknown }).cause = cause
    }
  }
}

async function netsapiensRequest<T>(path: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const baseUrl = process.env.NS_API_BASE_URL
  const apiKey = process.env.NS_API_KEY

  if (!baseUrl) {
    throw new Error('NS_API_BASE_URL is not configured')
  }

  if (!apiKey) {
    throw new Error('NS_API_KEY is not configured')
  }

  const url = buildUrl(path, baseUrl)

  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  headers.set('Authorization', `Bearer ${apiKey}`)
  if (init.body) {
    headers.set('Content-Type', 'application/json')
  }

  let lastError: unknown

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, headers })

      if (response.status === 429) {
        const retryAfterMs = parseRetryAfter(response, attempt)
        warn('NetSapiens API rate limited request, backing off', {
          path,
          attempt,
          status: response.status,
          retryAfterMs,
        })

        await response.text().catch(() => undefined)

        if (attempt === MAX_RETRIES) {
          throw new NetsapiensError('NetSapiens API rate limit exceeded', response.status, null)
        }

        await delay(retryAfterMs + Math.floor(Math.random() * JITTER_MS))
        continue
      }

      if (!response.ok) {
        const errorBody = await parseResponseBody(response)
        logError('NetSapiens API responded with non-OK status', {
          path,
          status: response.status,
          body: typeof errorBody === 'string' ? errorBody : undefined,
        })
        throw new NetsapiensError(`NetSapiens API request failed with status ${response.status}`, response.status, errorBody)
      }

      if (response.status === 204) {
        return schema.parse(undefined)
      }

      const data = await parseResponseBody(response)
      return schema.parse(data)
    } catch (error) {
      lastError = error

      if (error instanceof NetsapiensError) {
        throw error
      }

      if (attempt === MAX_RETRIES) {
        logError('NetSapiens API request failed after maximum retries', { path, message: (error as Error).message })
        throw new NetsapiensError('NetSapiens API request failed', 0, null, error)
      }

      const backoff = Math.min(2 ** (attempt - 1), 8) * BASE_BACKOFF_MS + Math.floor(Math.random() * JITTER_MS)
      warn('Transient NetSapiens API error, retrying', { path, attempt, backoff, message: (error as Error).message })
      await delay(backoff)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('NetSapiens API request failed')
}

type DomainRecord = z.infer<typeof domainRecordSchema>

export type NetsapiensDomain = {
  domain: string
  reseller?: string
  description?: string
  dialPlan?: string
  dialPolicy?: string
  domainType?: string
  timeZone?: string
  countUsersConfigured?: number
  raw: DomainRecord
}

type ConnectionRecord = z.infer<typeof connectionRecordSchema>

export type NetsapiensConnection = {
  domain: string
  originationPattern: string
  terminationPattern: string
  description?: string
  sipRegistrationUsername?: string
  sipRegistrationPassword?: string
  translationDestinationHost?: string
  translationDestinationUser?: string
  translationSourceHost?: string
  translationSourceUser?: string
  registration?: Record<string, unknown>
  raw: ConnectionRecord
}

export type DomainListOptions = {
  limit?: number
  cursor?: string
}

export type CreateDomainRequest = z.infer<typeof createDomainRequestSchema>

export type CreateConnectionRequest = z.infer<typeof createConnectionRequestSchema>

const mapDomainRecord = (record: DomainRecord): NetsapiensDomain => ({
  domain: record.domain,
  reseller: emptyToUndefined(record.reseller ?? undefined),
  description: emptyToUndefined(record.description ?? undefined),
  dialPlan: emptyToUndefined(record['dial-plan'] ?? undefined),
  dialPolicy: emptyToUndefined(record['dial-policy'] ?? undefined),
  domainType: emptyToUndefined(record['domain-type'] ?? undefined),
  timeZone: emptyToUndefined(record['time-zone'] ?? undefined),
  countUsersConfigured: toNumberOrUndefined(record['count-users-configured']),
  raw: record,
})

const mapConnectionRecord = (record: ConnectionRecord): NetsapiensConnection => ({
  domain: record.domain,
  originationPattern: record['connection-orig-match-pattern'],
  terminationPattern: record['connection-term-match-pattern'],
  description: emptyToUndefined(record.description ?? undefined),
  sipRegistrationUsername: emptyToUndefined(record['connection-sip-registration-username'] ?? undefined),
  sipRegistrationPassword: emptyToUndefined(record['connection-sip-registration-password'] ?? undefined),
  translationDestinationHost: emptyToUndefined(record['connection-translation-destination-host'] ?? undefined),
  translationDestinationUser: emptyToUndefined(record['connection-translation-destination-user'] ?? undefined),
  translationSourceHost: emptyToUndefined(record['connection-translation-source-host'] ?? undefined),
  translationSourceUser: emptyToUndefined(record['connection-translation-source-user'] ?? undefined),
  registration: record.registration ?? undefined,
  raw: record,
})

export async function listDomains(options: DomainListOptions = {}): Promise<NetsapiensDomain[]> {
  const searchParams = new URLSearchParams()
  if (options.limit) {
    searchParams.set('limit', String(options.limit))
  }
  if (options.cursor) {
    searchParams.set('cursor', options.cursor)
  }

  const path = searchParams.toString() ? `domains?${searchParams.toString()}` : 'domains'
  const records = await netsapiensRequest(path, { method: 'GET' }, domainsResponseSchema)
  log('Fetched NetSapiens domains', { count: records.length })
  return records.map(mapDomainRecord)
}

export async function countDomain(domain: string): Promise<number> {
  const params = new URLSearchParams({ domain })
  const data = await netsapiensRequest(`domains/count?${params.toString()}`, { method: 'GET' }, domainCountSchema)
  return data.total
}

export async function createDomain(input: CreateDomainRequest): Promise<NetsapiensDomain> {
  const payload = createDomainRequestSchema.parse({ synchronous: 'yes', ...input })
  const response = await netsapiensRequest('domains', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, domainRecordSchema)

  log('Created NetSapiens domain', { domain: response.domain })

  return mapDomainRecord(response)
}

export async function listConnections(domain: string): Promise<NetsapiensConnection[]> {
  const encodedDomain = encodeURIComponent(domain)
  const records = await netsapiensRequest(`domains/${encodedDomain}/connections`, { method: 'GET' }, connectionsResponseSchema)
  log('Fetched NetSapiens connections', { domain, count: records.length })
  return records.map(mapConnectionRecord)
}

export async function getConnection(domain: string, matchPattern: string): Promise<NetsapiensConnection | null> {
  const encodedDomain = encodeURIComponent(domain)
  const encodedPattern = encodeURIComponent(matchPattern)
  const records = await netsapiensRequest(`domains/${encodedDomain}/connections/${encodedPattern}`, { method: 'GET' }, connectionsResponseSchema)

  if (!records.length) {
    return null
  }

  const [record] = records
  const logPayload: Record<string, unknown> = {
    domain,
    matchPattern,
    hasPassword: Boolean(record['connection-sip-registration-password']),
    usernamePresent: Boolean(record['connection-sip-registration-username']),
  }

  if (record['connection-sip-registration-password']) {
    logPayload.maskedPassword = maskSecret(record['connection-sip-registration-password'])
  }

  log('Retrieved NetSapiens connection', logPayload)

  return mapConnectionRecord(record)
}

export async function createConnection(input: CreateConnectionRequest): Promise<NetsapiensConnection> {
  const payload = createConnectionRequestSchema.parse({ synchronous: 'yes', ...input })
  const response = await netsapiensRequest('connections', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, connectionRecordSchema)

  const logPayload: Record<string, unknown> = {
    domain: response.domain,
    matchPattern: response['connection-orig-match-pattern'],
  }

  if (response['connection-sip-registration-password']) {
    logPayload.maskedPassword = maskSecret(response['connection-sip-registration-password'])
  }

  log('Created NetSapiens connection', logPayload)

  return mapConnectionRecord(response)
}

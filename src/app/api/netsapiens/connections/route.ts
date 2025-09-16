import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { NetsapiensConnection } from '@/lib/netsapiens'
import {
  createConnection,
  createConnectionRequestSchema,
  getConnection,
  listConnections,
} from '@/lib/netsapiens'
import { log, error as logError } from '@/lib/logger'

const getQuerySchema = z.object({
  domain: z.string().trim().min(1, 'domain is required'),
  matchPattern: z.string().trim().optional(),
})

const maskSecret = (value?: string) => {
  if (!value) {
    return undefined
  }
  return `****${value.slice(-4)}`
}

const serializeConnection = ({ raw, sipRegistrationPassword, ...rest }: NetsapiensConnection) => ({
  ...rest,
  hasPassword: Boolean(sipRegistrationPassword),
  sipRegistrationPassword: maskSecret(sipRegistrationPassword),
})

export async function GET(request: NextRequest) {
  try {
    const params = getQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))

    if (params.matchPattern) {
      const connection = await getConnection(params.domain, params.matchPattern)
      if (!connection) {
        return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
      }
      return NextResponse.json({ connection: serializeConnection(connection) })
    }

    const connections = await listConnections(params.domain)
    return NextResponse.json({ connections: connections.map(serializeConnection) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    logError('Failed to fetch NetSapiens connections', error)
    return NextResponse.json({ error: 'Failed to retrieve NetSapiens connections' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const payload = createConnectionRequestSchema.parse(body)

    log('NetSapiens connection create requested', {
      domain: payload.domain,
      matchPattern: payload['connection-orig-match-pattern'],
    })

    const connection = await createConnection(payload)
    return NextResponse.json(serializeConnection(connection), { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    logError('Failed to create NetSapiens connection', error)
    return NextResponse.json({ error: 'Failed to create NetSapiens connection' }, { status: 500 })
  }
}

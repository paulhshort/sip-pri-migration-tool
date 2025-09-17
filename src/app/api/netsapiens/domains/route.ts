import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { countDomain, createDomain, createDomainRequestSchema, listDomains } from '@/lib/netsapiens'
import { log, error as logError } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const limitParam = request.nextUrl.searchParams.get('limit')
    const cursor = request.nextUrl.searchParams.get('cursor') ?? undefined
    const domainParam = request.nextUrl.searchParams.get('domain')

    if (domainParam !== null) {
      const domain = domainParam.trim()
      if (!domain) {
        return NextResponse.json({ error: 'domain must be provided' }, { status: 400 })
      }

      if (limitParam !== null || cursor) {
        return NextResponse.json({ error: 'domain existence check cannot be combined with pagination params' }, { status: 400 })
      }

      log('NetSapiens domain existence check requested', { domain })
      const total = await countDomain(domain)
      return NextResponse.json({ domain, total, exists: total > 0 })
    }

    let limit: number | undefined
    if (limitParam !== null) {
      const parsed = Number(limitParam)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return NextResponse.json({ error: 'limit must be a positive number' }, { status: 400 })
      }
      limit = parsed
    }

    log('NetSapiens domain list requested', { limit, cursor })

    const domains = await listDomains({ limit, cursor })
    return NextResponse.json({ domains })
  } catch (error) {
    logError('Failed to list NetSapiens domains', error)
    return NextResponse.json({ error: 'Failed to retrieve NetSapiens domains' }, { status: 500 })
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
    const payload = createDomainRequestSchema.parse(body)

    log('NetSapiens domain create requested', { domain: payload.domain, reseller: payload.reseller })

    const domain = await createDomain(payload)
    return NextResponse.json(domain, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    logError('Failed to create NetSapiens domain', error)
    return NextResponse.json({ error: 'Failed to create NetSapiens domain' }, { status: 500 })
  }
}

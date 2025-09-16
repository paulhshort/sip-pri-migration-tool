import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { NetsapiensPhoneNumber } from '@/lib/netsapiens'
import {
  createPhoneNumber,
  createPhoneNumberRequestSchema,
  listPhoneNumbers,
  updatePhoneNumber,
  updatePhoneNumberRequestSchema,
} from '@/lib/netsapiens'
import { log, error as logError } from '@/lib/logger'

const getQuerySchema = z.object({
  domain: z.string().min(1, 'domain is required'),
  number: z.string().optional(),
})

const createRequestSchema = createPhoneNumberRequestSchema.extend({
  domain: z.string().min(1, 'domain is required'),
})

const updateRequestSchema = updatePhoneNumberRequestSchema.extend({
  domain: z.string().min(1, 'domain is required'),
  phonenumber: z.string().min(1, 'phonenumber is required'),
})

export async function GET(request: NextRequest) {
  try {
    const params = getQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const numbers = await listPhoneNumbers(params.domain)

    const serialize = ({ raw, ...rest }: NetsapiensPhoneNumber) => rest

    if (params.number) {
      const filtered = numbers.filter((entry) => entry.number === params.number)
      if (!filtered.length) {
        return NextResponse.json({ error: 'Phone number not found' }, { status: 404 })
      }
      return NextResponse.json({ phonenumbers: filtered.map(serialize) })
    }

    return NextResponse.json({ phonenumbers: numbers.map(serialize) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    logError('Failed to fetch NetSapiens phone numbers', error)
    return NextResponse.json({ error: 'Failed to retrieve NetSapiens phone numbers' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const payload = createRequestSchema.parse(body)

    const { domain, ...requestPayload } = payload

    log('NetSapiens phone number create requested', {
      domain,
      number: requestPayload.phonenumber,
      application: requestPayload['dial-rule-application'],
    })

    const result = await createPhoneNumber(domain, requestPayload)
    return NextResponse.json(result, { status: 202 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    logError('Failed to create NetSapiens phone number', error)
    return NextResponse.json({ error: 'Failed to create NetSapiens phone number' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const payload = updateRequestSchema.parse(body)

    const { domain, phonenumber, ...requestPayload } = payload

    log('NetSapiens phone number update requested', {
      domain,
      number: phonenumber,
      application: requestPayload['dial-rule-application'],
    })

    const result = await updatePhoneNumber(domain, phonenumber, requestPayload)
    return NextResponse.json(result, { status: 202 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    logError('Failed to update NetSapiens phone number', error)
    return NextResponse.json({ error: 'Failed to update NetSapiens phone number' }, { status: 500 })
  }
}

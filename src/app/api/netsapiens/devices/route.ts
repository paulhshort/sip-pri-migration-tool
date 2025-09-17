import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { NetsapiensDevice } from '@/lib/netsapiens'
import {
  createDevice,
  createDeviceRequestSchema,
  listDevices,
} from '@/lib/netsapiens'
import { log, error as logError } from '@/lib/logger'
import { maskSecret } from '@/lib/secrets'

const getQuerySchema = z.object({
  domain: z.string().trim().min(1, 'domain is required'),
  user: z.string().trim().min(1, 'user is required'),
})

const createRequestSchema = createDeviceRequestSchema.extend({
  domain: z.string().trim().min(1, 'domain is required'),
  user: z.string().trim().min(1, 'user is required'),
})

const serializeDevice = ({ raw, sipRegistrationPassword, ...device }: NetsapiensDevice) => ({
  ...device,
  hasPassword: Boolean(sipRegistrationPassword),
  sipRegistrationPassword: maskSecret(sipRegistrationPassword),
})

export async function GET(request: NextRequest) {
  try {
    const params = getQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
    const devices = await listDevices(params.domain, params.user)
    return NextResponse.json({ devices: devices.map(serializeDevice) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    logError('Failed to fetch NetSapiens devices', error)
    return NextResponse.json({ error: 'Failed to retrieve NetSapiens devices' }, { status: 500 })
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

    const payload = createRequestSchema.parse(body)

    log('NetSapiens device create requested', {
      domain: payload.domain,
      user: payload.user,
      device: payload.device,
    })

    const device = await createDevice(payload.domain, payload.user, payload)
    return NextResponse.json(serializeDevice(device), { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    logError('Failed to create NetSapiens device', error)
    return NextResponse.json({ error: 'Failed to create NetSapiens device' }, { status: 500 })
  }
}

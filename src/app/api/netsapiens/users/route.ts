import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { NetsapiensUser } from '@/lib/netsapiens'
import {
  createUser,
  createUserRequestSchema,
  getUser,
  listUsers,
} from '@/lib/netsapiens'
import { log, error as logError } from '@/lib/logger'

const getQuerySchema = z.object({
  domain: z.string().trim().min(1, 'domain is required'),
  user: z.string().trim().optional(),
})

const createRequestSchema = createUserRequestSchema.extend({
  domain: z.string().trim().min(1, 'domain is required'),
})

const serializeUser = ({ raw, ...user }: NetsapiensUser) => user

export async function GET(request: NextRequest) {
  try {
    const params = getQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))

    if (params.user) {
      const user = await getUser(params.domain, params.user)
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
      return NextResponse.json({ user: serializeUser(user) })
    }

    const users = await listUsers(params.domain)
    return NextResponse.json({ users: users.map(serializeUser) })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    logError('Failed to fetch NetSapiens users', error)
    return NextResponse.json({ error: 'Failed to retrieve NetSapiens users' }, { status: 500 })
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

    log('NetSapiens user create requested', {
      domain: payload.domain,
      user: payload.user,
    })

    const user = await createUser(payload.domain, payload)
    return NextResponse.json(serializeUser(user), { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    logError('Failed to create NetSapiens user', error)
    return NextResponse.json({ error: 'Failed to create NetSapiens user' }, { status: 500 })
  }
}

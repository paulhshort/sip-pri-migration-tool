import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getConfiguredSipBinding } from '@/lib/shadowdb'
import { log, error as logError } from '@/lib/logger'

const requestSchema = z.object({
  binding: z.string().trim().min(1, 'Binding is required'),
})

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const input = requestSchema.parse(body)

    log('ShadowDB lookup requested', { binding: input.binding })

    const result = await getConfiguredSipBinding(input.binding)

    if (!result) {
      log('ShadowDB lookup returned 404', { binding: input.binding })
      return NextResponse.json({ error: 'Configured SIP binding not found' }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    logError('ShadowDB lookup failed', error)
    return NextResponse.json({ error: 'Failed to retrieve configured SIP binding' }, { status: 500 })
  }
}

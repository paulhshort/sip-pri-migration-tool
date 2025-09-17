import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { renderConfigAfter } from '@/lib/adtran/render'
import { unifiedDiff } from '@/lib/adtran/diff'
import { maskSensitiveTokens } from '@/lib/secrets'

const fxsUserSchema = z.object({
  user: z.string(),
  port: z.string().optional(),
  sipIdentity: z.string().optional(),
  authName: z.string().optional(),
  password: z.string().optional(),
})

const trunkSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
})

const planSchema = z.object({
  parsed: z.object({
    raw: z.string(),
    fxsUsers: z.array(fxsUserSchema).optional().default([]),
    trunks: z.array(trunkSchema).optional().default([]),
  }),
  nsState: z.object({
    connection: z
      .object({
        username: z.string(),
        password: z.string().optional(),
      })
      .optional(),
    users: z
      .array(
        z.object({
          user: z.string(),
          devicePassword: z.string().optional(),
        }),
      )
      .optional()
      .default([]),
  }),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const input = planSchema.parse(body)

    const renderResult = renderConfigAfter({
      parsed: {
        raw: input.parsed.raw,
        fxsUsers: input.parsed.fxsUsers,
        trunks: input.parsed.trunks,
      },
      ns: {
        connection: input.nsState.connection,
        users: input.nsState.users,
      },
    })

    const diff = unifiedDiff(input.parsed.raw, renderResult.text)

    return NextResponse.json({
      afterText: maskSensitiveTokens(renderResult.text),
      diff: maskSensitiveTokens(diff),
      deltas: renderResult.deltas,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    return NextResponse.json({ error: 'Failed to plan Adtran configuration updates' }, { status: 500 })
  }
}

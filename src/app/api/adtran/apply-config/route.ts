import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectSSH } from '@/lib/adtran/ssh'
import { renderConfigAfter } from '@/lib/adtran/render'
import { maskSensitiveTokens } from '@/lib/secrets'
import { log, error as logError } from '@/lib/logger'

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

const ipv4Regex = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/

const applySchema = z.object({
  ip: z.string().trim().regex(ipv4Regex, 'Invalid IPv4 address'),
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

function getAdtranCredentials() {
  const username = process.env.ADTRAN_SSH_USER
  const password = process.env.ADTRAN_SSH_PASS
  const enablePassword = process.env.ADTRAN_ENABLE_PASS

  if (!username || !password) {
    throw new Error('Adtran SSH credentials are not configured')
  }

  return { username, password, enablePassword }
}

function validateApplyAccess(ip: string) {
  const allowLive = process.env.TEST_LIVE_ADTRAN === 'true'
  const allowedIp = process.env.ADTRAN_TEST_IP ?? '8.2.147.30'
  const allowApply = process.env.ALLOW_ADTRAN_APPLY === 'true'

  if (!allowLive) {
    return { allowed: false, message: 'Live Adtran access disabled. Set TEST_LIVE_ADTRAN=true to enable lab tests.' }
  }

  if (ip !== allowedIp) {
    return { allowed: false, message: `Configuration apply restricted to ${allowedIp}` }
  }

  if (!allowApply) {
    return { allowed: false, message: 'Apply operation disabled. Set ALLOW_ADTRAN_APPLY=true for supervised lab runs.' }
  }

  return { allowed: true }
}

export async function POST(request: Request) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const input = applySchema.parse(body)

    const access = validateApplyAccess(input.ip)
    if (!access.allowed) {
      return NextResponse.json({ error: access.message }, { status: 403 })
    }

    const credentials = getAdtranCredentials()

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

    const commands = renderResult.commands
    if (!commands.length) {
      return NextResponse.json({ ok: true, commandsRun: 0, wroteMemory: false })
    }

    const session = await connectSSH({
      host: input.ip,
      username: credentials.username,
      password: credentials.password,
      enablePassword: credentials.enablePassword,
    })

    let commandsRun = 0
    try {
      await session.run('terminal length 0')

      for (const commandSet of commands) {
        const configBlock = ['configure terminal', ...commandSet, 'end'].join('\n')
        const result = await session.runPrivileged(configBlock)
        if (result.code !== 0) {
          log('Adtran configuration command returned non-zero code', {
            code: result.code,
            stderr: result.stderr,
          })
        }
        commandsRun += commandSet.length
      }

      const writeResult = await session.runPrivileged('write memory')
      const verifyResult = await session.run('show sip trunk-registration')

      const wroteMemory = writeResult.code === 0

      log('Adtran apply summary', {
        ip: input.ip,
        commandsRun,
        wroteMemory,
      })

      return NextResponse.json({
        ok: true,
        commandsRun,
        wroteMemory,
        verify: maskSensitiveTokens(verifyResult.stdout),
      })
    } finally {
      await session.close().catch((err) => {
        logError('Failed to close Adtran SSH session', err)
      })
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }

    logError('Adtran apply-config failed', error)
    return NextResponse.json({ error: 'Failed to apply Adtran configuration' }, { status: 500 })
  }
}

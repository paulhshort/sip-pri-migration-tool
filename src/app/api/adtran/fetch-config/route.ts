import { NextResponse } from 'next/server'
import { z } from 'zod'
import { connectSSH } from '@/lib/adtran/ssh'
import { parseRunningConfig, parseShowVersion } from '@/lib/adtran/parse'
import { maskSensitiveTokens } from '@/lib/secrets'
import { log, error as logError } from '@/lib/logger'

const ipv4Regex = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/

const requestSchema = z.object({
  ip: z.string().trim().regex(ipv4Regex, 'Invalid IPv4 address'),
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

function evaluateOsGate(versionText: string) {
  const parsedVersion = parseShowVersion(versionText)
  const minimumMajor = Number(process.env.MINIMUM_OS_MAJOR ?? '13')
  const recommended = process.env.RECOMMENDED_OS_VERSION ?? 'R13.12.0.E'
  const strict = process.env.STRICT_OS_GATING === 'true'

  let blocked = false
  let reason: string | undefined
  let warning: string | undefined

  if (parsedVersion.major < minimumMajor) {
    blocked = true
    reason = `AOS major version ${parsedVersion.major} is below required minimum ${minimumMajor}`
  } else if (strict && recommended && parsedVersion.aosVersion !== recommended) {
    blocked = true
    reason = `AOS version ${parsedVersion.aosVersion} differs from enforced ${recommended}`
  } else if (recommended && parsedVersion.aosVersion !== recommended) {
    warning = `Recommended AOS version is ${recommended}`
  }

  return {
    parsedVersion,
    gates: {
      blocked,
      reason,
      recommended,
      warning,
    },
  }
}

function validateLabAccess(ip: string) {
  const allowLive = process.env.TEST_LIVE_ADTRAN === 'true'
  const allowedIp = process.env.ADTRAN_TEST_IP ?? '8.2.147.30'

  if (!allowLive) {
    return { allowed: false, message: 'Live Adtran access disabled. Set TEST_LIVE_ADTRAN=true to enable tests.' }
  }

  // When TEST_LIVE_ADTRAN=true, allow any target IP (safety is enforced by gating the APPLY step elsewhere)
  // If stricter control is desired, set ALLOW_ANY_ADTRAN_IP=false to restrict to ADTRAN_TEST_IP only.
  const allowAny = process.env.ALLOW_ANY_ADTRAN_IP !== 'false'
  if (allowAny) {
    return { allowed: true }
  }

  if (ip !== allowedIp) {
    return { allowed: false, message: `Live Adtran access restricted to ${allowedIp}` }
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

    const input = requestSchema.parse(body)

    const labAccess = validateLabAccess(input.ip)
    if (!labAccess.allowed) {
      return NextResponse.json({ error: labAccess.message }, { status: 403 })
    }

    const credentials = getAdtranCredentials()

    const session = await connectSSH({
      host: input.ip,
      username: credentials.username,
      password: credentials.password,
      enablePassword: credentials.enablePassword,
    })

    try {
      await session.run('terminal length 0')
      const versionResult = await session.run('show version')
      const runningResult = await session.run('show running-config')
      const registrationResult = await session.run('show sip trunk-registration')

      if (versionResult.code !== 0) {
        log('Adtran show version returned non-zero code', { code: versionResult.code })
      }
      if (runningResult.code !== 0) {
        log('Adtran show running-config returned non-zero code', { code: runningResult.code })
      }
      if (registrationResult.code !== 0) {
        log('Adtran show sip trunk-registration returned non-zero code', { code: registrationResult.code })
      }

      const { parsedVersion, gates } = evaluateOsGate(versionResult.stdout)
      const parsedConfig = parseRunningConfig(runningResult.stdout)

      return NextResponse.json({
        device: {
          aosVersion: parsedVersion.aosVersion,
          gates,
        },
        raw: {
          version: maskSensitiveTokens(versionResult.stdout),
          runningConfig: maskSensitiveTokens(runningResult.stdout),
          registration: maskSensitiveTokens(registrationResult.stdout),
        },
        parsed: {
          version: parsedVersion,
          runningConfig: parsedConfig,
        },
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

    logError('Adtran fetch-config failed', error)
    return NextResponse.json({ error: 'Failed to fetch Adtran configuration' }, { status: 500 })
  }
}

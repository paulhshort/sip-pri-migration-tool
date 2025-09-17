import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDirectoryNumbersForBinding, getDidRangesForDns } from '@/lib/db'
import { expandRanges, writeMetaswitchCsv, writeNetSapiensCsv, generateFileName, getOutputPath, type ServerLocation } from '@/lib/csv'
import { getConfiguredSipBinding } from '@/lib/shadowdb'
import {
  domainExists,
  createDomain,
  createConnection,
  createPhoneNumber,
  updatePhoneNumber,
  createUser,
  createDevice,
  type CreateConnectionRequest,
  type CreatePhoneNumberRequest,
  type CreateUserRequest,
  type CreateDeviceRequest,
} from '@/lib/netsapiens'
import { connectSSH } from '@/lib/adtran/ssh'
import { parseRunningConfig } from '@/lib/adtran/parse'
import { renderConfigAfter } from '@/lib/adtran/render'
import { unifiedDiff } from '@/lib/adtran/diff'
import { maskSensitiveTokens } from '@/lib/secrets'
import { log, error as logError, warn } from '@/lib/logger'

const requestSchema = z.object({
  migrationType: z.enum(['sip-trunk', 'pri']),
  binding: z.string().min(1),
  domain: z.string().min(1),
  trunk: z.string().min(1),
  account: z.string().min(1),
  location: z.enum(['Chicago', 'Phoenix', 'Ashburn']),
})

function getCoreHost() {
  const core = process.env.NS_CORE_SERVER || process.env.NS_SIPBX_SERVER
  if (!core) throw new Error('NS_CORE_SERVER/NS_SIPBX_SERVER not configured')
  return core
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const input = requestSchema.parse(body)
    const coreHost = getCoreHost()
    let priPlan: { afterText: string; diff: string; deltas: string[] } | undefined

    // 1) ShadowDB: confirm binding and collect any hints (e.g., SIP username)
    const binding = await getConfiguredSipBinding(input.binding)
    if (!binding) {
      return NextResponse.json({ error: 'Configured SIP binding not found' }, { status: 404 })
    }

    // 2) NetSapiens: validate/create domain
    const exists = await domainExists(input.domain)
    if (!exists) {
      if (process.env.ALLOW_DOMAIN_CREATE !== 'true') {
        return NextResponse.json({ error: 'NetSapiens domain does not exist and ALLOW_DOMAIN_CREATE=false' }, { status: 400 })
      }
      const reseller = process.env.NS_DEFAULT_RESELLER || 'default'
      await createDomain({ domain: input.domain, reseller, description: `Auto-created for ${input.binding}` })
      log('Automation: created domain', { domain: input.domain, reseller })
    }

    // 3) NetSapiens: ensure connection exists (defaults from reference examples)
    const dialPlanDefault = 'US and Canada'
    const dialPolicyDefault = 'Permit All'

    const connectionPayload: CreateConnectionRequest = {
      domain: input.domain,
      'connection-orig-match-pattern': `${input.trunk}`,
      'connection-term-match-pattern': `${input.trunk}`,
      'connection-address': coreHost,
      'connection-sip-registration-username': binding.sipUsername || input.trunk,
      'connection-sip-registration-realm': coreHost,
      'connection-translation-request-user': '[*]',
      'connection-translation-request-host': coreHost,
      'connection-translation-destination-user': '[*]',
      'connection-translation-destination-host': coreHost,
      'connection-translation-source-user': '[*]',
      'connection-translation-source-host': coreHost,
      'dial-policy': dialPolicyDefault,
      'dial-plan': dialPlanDefault,
      description: `Automated connection for ${input.binding}`,
      'connection-orig-enabled': 'yes',
      'connection-term-enabled': 'yes',
      'connection-sip-transport-protocol': 'UDP',
    }
    try {
      await createConnection(connectionPayload)
      log('Automation: created connection', { domain: input.domain, trunk: input.trunk })
    } catch (e) {
      // If it already exists, proceed
      warn('Automation: create connection may have failed (continuing)', { message: (e as Error).message })
    }

    // 4) Numbers from ShadowDB (same as /api/generate)
    const dns = await getDirectoryNumbersForBinding(input.binding)
    const didRanges = await getDidRangesForDns(dns)
    const didSet = new Set(didRanges.map((r) => r.firstdirectorynumber))
    const pbxOnly = dns.filter((dn) => !didSet.has(dn)).map((dn) => ({
      rangesize: 1, firstdirectorynumber: dn, lastdirectorynumber: dn, firstcode: dn, lastcode: dn,
    }))
    const allRanges = [...didRanges, ...pbxOnly]
    const expanded = expandRanges(allRanges)

    // 5) Assign numbers per migration type
    if (input.migrationType === 'sip-trunk') {
      // to-connection
      for (const num of expanded) {
        const payload: CreatePhoneNumberRequest = {
          enabled: 'yes',
          phonenumber: num,
          'dial-rule-application': 'to-connection',
          'dial-rule-translation-destination-user': input.trunk,
          'dial-rule-translation-destination-host': coreHost,
          'dial-rule-description': `Auto trunk ${input.trunk}`,
        }
        try {
          await createPhoneNumber(input.domain, payload)
        } catch (err) {
          // Attempt update if already exists
          try {
            await updatePhoneNumber(input.domain, num, {
              enabled: 'yes',
              'dial-rule-application': 'to-connection',
              'dial-rule-translation-destination-user': input.trunk,
              'dial-rule-translation-destination-host': coreHost,
              'dial-rule-description': `Auto trunk ${input.trunk}`,
            })
          } catch (err2) {
            warn('Automation: failed to assign number', { number: num, message: (err2 as Error).message })
          }
        }
      }
    } else {
      // PRI: Full pipeline (fetch Adtran → parse → provision users/devices → assign numbers to-user → render plan)
      if (!binding.contactIp) {
        return NextResponse.json({ error: 'Binding contact IP not found for PRI flow' }, { status: 400 })
      }

      const sshUser = process.env.ADTRAN_SSH_USER
      const sshPass = process.env.ADTRAN_SSH_PASS
      const enablePass = process.env.ADTRAN_ENABLE_PASS

      if (!sshUser || !sshPass) {
        return NextResponse.json({ error: 'ADTRAN_SSH_USER/ADTRAN_SSH_PASS not configured' }, { status: 500 })
      }

      // SSH fetch: version and running-config
      const session = await connectSSH({ host: binding.contactIp, username: sshUser, password: sshPass, enablePassword: enablePass })
      try {
        await session.run('terminal length 0')
        const runCfg = await session.run('show running-config')
        if (runCfg.code !== 0) {
          throw new Error(`Failed to fetch running-config: ${runCfg.stderr}`)
        }

        const parsed = parseRunningConfig(runCfg.stdout)

        // 5a) Provision users and devices in NetSapiens
        const createdUserPasswords: Record<string, string | undefined> = {}
        for (const fxs of parsed.fxsUsers) {
          const userId = fxs.user
          if (!userId) continue

          const userPayload: CreateUserRequest = {
            user: userId,
            'name-first-name': 'FXS',
            'name-last-name': userId,
            'login-username': `${userId}@${input.domain}`,
            'dial-plan': input.domain,
            'dial-policy': 'US & Canada',
            'time-zone': 'US/Eastern',
            'user-scope': 'No Portal',
            'language-token': 'en_US',
          }

          try {
            await createUser(input.domain, userPayload)
          } catch (e) {
            // continue if exists or other non-fatal
            warn('PRI: createUser error (continuing)', { user: userId, message: (e as Error).message })
          }

          try {
            const devicePayload: CreateDeviceRequest = {
              device: `${userId}a`,
              'auto-answer-enabled': 'no',
              'device-provisioning-sip-transport-protocol': 'udp',
            }
            const device = await createDevice(input.domain, userId, devicePayload)
            if (device.sipRegistrationPassword) {
              createdUserPasswords[userId] = device.sipRegistrationPassword
            }
          } catch (e) {
            warn('PRI: createDevice error (continuing)', { user: userId, message: (e as Error).message })
          }
        }

        // 5b) Assign numbers to users using to-user (best-effort matching)
        const assignedNumbers = new Set<string>()
        const onlyDigits = (s: string) => s.replace(/\D+/g, '')
        for (const fxs of parsed.fxsUsers) {
          const userId = fxs.user
          if (!userId) continue
          const userDigits = onlyDigits(userId)
          const match = expanded.find((n) => !assignedNumbers.has(n) && onlyDigits(n).endsWith(userDigits))
          if (!match) {
            warn('PRI: could not map number to user', { user: userId })
            continue
          }
          const payload: CreatePhoneNumberRequest = {
            enabled: 'yes',
            phonenumber: match,
            'dial-rule-application': 'to-user',
            'dial-rule-translation-destination-user': userId,
            'dial-rule-translation-destination-host': input.domain,
            'dial-rule-description': `Auto assign to user ${userId}`,
          }
          try {
            await createPhoneNumber(input.domain, payload)
            assignedNumbers.add(match)
          } catch (err) {
            try {
              await updatePhoneNumber(input.domain, match, {
                enabled: 'yes',
                'dial-rule-application': 'to-user',
                'dial-rule-translation-destination-user': userId,
                'dial-rule-translation-destination-host': input.domain,
                'dial-rule-description': `Auto assign to user ${userId}`,
              })
              assignedNumbers.add(match)
            } catch (err2) {
              warn('PRI: failed to assign number to user', { number: match, user: userId, message: (err2 as Error).message })
            }
          }
        }

        // 5c) Render Adtran plan using gathered passwords (no apply)
        const nsUsersState = Object.entries(createdUserPasswords).map(([user, devicePassword]) => ({ user, devicePassword }))
        const after = renderConfigAfter({ parsed, ns: { connection: binding.sipUsername ? { username: binding.sipUsername } : undefined, users: nsUsersState } })
        const diff = unifiedDiff(parsed.raw, after.text)
        priPlan = { afterText: maskSensitiveTokens(after.text), diff: maskSensitiveTokens(diff), deltas: after.deltas }
      } finally {
        await session.close()
      }
    }

    // 6) Generate CSVs last (same as /api/generate)
    const metaswitchFilename = generateFileName('metaswitch', input.binding)
    const netsapiensFilename = generateFileName('netsapiens', input.binding)
    const metaswitchPath = getOutputPath(metaswitchFilename)
    const netsapiensPath = getOutputPath(netsapiensFilename)

    await Promise.all([
      writeMetaswitchCsv(metaswitchPath, allRanges, input.location as ServerLocation),
      writeNetSapiensCsv(netsapiensPath, expanded, input.domain, input.trunk, input.account),
    ])

    return NextResponse.json({
      summary: {
        pbxLines: dns.length,
        didRanges: allRanges.length,
        totalNumbers: expanded.length,
      },
      files: {
        metaswitch: `/api/download?file=${encodeURIComponent(metaswitchFilename)}`,
        netsapiens: `/api/download?file=${encodeURIComponent(netsapiensFilename)}`,
      },
      numbers: expanded,
      automation: {
        domainCreated: !exists,
        migrationType: input.migrationType,
      },
      plan: priPlan,
    })
  } catch (error) {
    logError('Automation run failed', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', details: error.issues }, { status: 400 })
    }
    return NextResponse.json({ error: (error as Error).message || 'Automation failed' }, { status: 500 })
  }
}


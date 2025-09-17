import { z } from 'zod'
import { pool } from './db'
import { log, error as logError } from './logger'

const configuredSipBindingRowSchema = z.object({
  baseinformation_name: z.string(),
  baseinformation_contactipaddress: z.string().nullable().optional(),
  baseinformation_proxyipaddress: z.string().nullable().optional(),
  baseinformation_mediaipaddress: z.string().nullable().optional(),
  baseinformation_additionalinboundcontactipaddresses: z.string().nullable().optional(),
  baseinformation_sipusername: z.string().nullable().optional(),
})

export type ConfiguredSipBinding = {
  name: string
  contactIp?: string
  proxyIp?: string
  mediaIp?: string
  additionalInboundIps: string[]
  sipUsername?: string
}

function cleanNullableString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function parseAdditionalIps(value: unknown): string[] {
  const source = cleanNullableString(value)
  if (!source) {
    return []
  }

  return source
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

export async function getConfiguredSipBinding(binding: string): Promise<ConfiguredSipBinding | null> {
  const normalizedBinding = binding.trim()
  if (!normalizedBinding) {
    throw new Error('Binding name is required')
  }

  const query = `
    SELECT
      baseinformation_name,
      baseinformation_contactipaddress,
      baseinformation_proxyipaddress,
      baseinformation_mediaipaddress,
      baseinformation_additionalinboundcontactipaddresses,
      baseinformation_sipusername
    FROM meta_configuredsipbinding
    WHERE lower(baseinformation_name) = lower($1)
    LIMIT 1
  `

  try {
    const { rows } = await pool.query(query, [normalizedBinding])

    if (rows.length === 0) {
      log('ShadowDB binding lookup returned no matches', { binding: normalizedBinding })
      return null
    }

    const parsedRow = configuredSipBindingRowSchema.parse(rows[0])

    const result: ConfiguredSipBinding = {
      name: parsedRow.baseinformation_name,
      contactIp: cleanNullableString(parsedRow.baseinformation_contactipaddress),
      proxyIp: cleanNullableString(parsedRow.baseinformation_proxyipaddress),
      mediaIp: cleanNullableString(parsedRow.baseinformation_mediaipaddress),
      additionalInboundIps: parseAdditionalIps(parsedRow.baseinformation_additionalinboundcontactipaddresses),
      sipUsername: cleanNullableString(parsedRow.baseinformation_sipusername),
    }

    log('ShadowDB binding lookup succeeded', {
      binding: normalizedBinding,
      hasContactIp: Boolean(result.contactIp),
      hasProxyIp: Boolean(result.proxyIp),
      hasMediaIp: Boolean(result.mediaIp),
      additionalInboundIps: result.additionalInboundIps.length,
      hasSipUsername: Boolean(result.sipUsername),
    })

    return result
  } catch (error) {
    logError('Failed to retrieve configured SIP binding', error)
    throw new Error('Failed to retrieve configured SIP binding')
  }
}

export type ParsedVersion = {
  aosVersion: string
  major: number
  minor?: number
  patch?: string
}

export type ParsedFxsUser = {
  user: string
  port?: string
  sipIdentity?: string
  authName?: string
  password?: string
}

export type ParsedTrunk = {
  name: string
  description?: string
}

export type ParsedRunningConfig = {
  raw: string
  fxsUsers: ParsedFxsUser[]
  trunks: ParsedTrunk[]
}

export function parseShowVersion(text: string): ParsedVersion {
  const normalized = text || ''
  const versionMatch = normalized.match(/(?:AOS|ADTRAN OS|ADTRAN,?\s+Inc\.\s+OS|Software Version|OS Version)\s*[:]?\s*([A-Za-z]*\d[\w.\-]*)/i)
  const aosVersion = versionMatch ? versionMatch[1] : 'unknown'

  const majorMatch = aosVersion.match(/(\d{1,2})/)
  const minorMatch = aosVersion.match(/\d+\.(\d{1,2})/)
  const patchMatch = aosVersion.match(/\d+\.\d+\.(\d+)[.\-]?([A-Za-z0-9]+)?/)

  return {
    aosVersion,
    major: majorMatch ? Number(majorMatch[1]) : 0,
    minor: minorMatch ? Number(minorMatch[1]) : undefined,
    patch: patchMatch ? patchMatch[0].split('.').slice(2).join('.') : undefined,
  }
}

export function parseRunningConfig(text: string): ParsedRunningConfig {
  const lines = (text || '').split(/\r?\n/)
  const fxsUsers: ParsedFxsUser[] = []
  const trunks: ParsedTrunk[] = []

  let currentUser: ParsedFxsUser | null = null

  const voiceUserRegex = /^\s*voice\s+user\s+(\S+)/i
  const connectFxsRegex = /^\s*connect\s+fxs\s+(\S+)/i
  const sipIdentityRegex = /^\s*sip-identity\s+(\S+)(.*)$/i
  const sipTrunkRegex = /^\s*sip\s+trunk\s+(\S+)/i

  for (const line of lines) {
    const userMatch = line.match(voiceUserRegex)
    if (userMatch) {
      currentUser = {
        user: userMatch[1],
      }
      fxsUsers.push(currentUser)
      continue
    }

    if (currentUser) {
      if (line.trim().length === 0 || /^\S/.test(line)) {
        currentUser = null
      } else {
        const portMatch = line.match(connectFxsRegex)
        if (portMatch) {
          currentUser.port = portMatch[1]
          continue
        }

        const identityMatch = line.match(sipIdentityRegex)
        if (identityMatch) {
          currentUser.sipIdentity = identityMatch[1]

          const authMatch = identityMatch[2]?.match(/auth-name\s+(\S+)/i)
          if (authMatch) {
            currentUser.authName = authMatch[1]
          }

          const passwordMatch = identityMatch[2]?.match(/password\s+(\S+)/i)
          if (passwordMatch) {
            currentUser.password = passwordMatch[1]
          }
        }
      }
    }

    const trunkMatch = line.match(sipTrunkRegex)
    if (trunkMatch) {
      trunks.push({ name: trunkMatch[1] })
    }
  }

  return {
    raw: text,
    fxsUsers,
    trunks,
  }
}

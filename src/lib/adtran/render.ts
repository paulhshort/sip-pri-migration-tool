import { ParsedRunningConfig } from './parse'

export type NetsapiensConnectionState = {
  username: string
  password?: string
}

export type NetsapiensUserState = {
  user: string
  devicePassword?: string
}

export type RenderInput = {
  parsed: ParsedRunningConfig
  ns: {
    connection?: NetsapiensConnectionState
    users: NetsapiensUserState[]
  }
}

export type RenderResult = {
  text: string
  deltas: string[]
  commands: string[][]
}

const voiceUserPattern = /^\s*voice\s+user\s+(\S+)/i
const sipIdentityPasswordPattern = /(password\s+)(\S+)/i

export function renderConfigAfter({ parsed, ns }: RenderInput): RenderResult {
  const sourceLines = (parsed.raw || '').split(/\r?\n/)
  const lines = [...sourceLines]
  const deltas: string[] = []
  const commands: string[][] = []

  const replacePassword = (lineIndex: number, newPassword: string) => {
    const currentLine = lines[lineIndex]
    if (!sipIdentityPasswordPattern.test(currentLine)) {
      lines[lineIndex] = `${currentLine.trimEnd()} password ${newPassword}`
    } else {
      lines[lineIndex] = currentLine.replace(sipIdentityPasswordPattern, (_, prefix) => `${prefix}${newPassword}`)
    }
  }

  for (const userState of ns.users ?? []) {
    const targetUser = userState.user
    if (!targetUser) {
      continue
    }

    let blockStart = -1
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(voiceUserPattern)
      if (match && match[1] === targetUser) {
        blockStart = i
        break
      }
    }

    if (blockStart === -1) {
      continue
    }

    let blockEnd = blockStart + 1
    while (blockEnd < lines.length && (lines[blockEnd].startsWith(' ') || lines[blockEnd].trim().length === 0)) {
      blockEnd += 1
    }

    let sipIdentityLineIndex = -1
    for (let j = blockStart + 1; j < blockEnd; j += 1) {
      if (/^\s*sip-identity\b/i.test(lines[j])) {
        sipIdentityLineIndex = j
        break
      }
    }

    if (userState.devicePassword) {
      const password = userState.devicePassword
      const commandLines = [`voice user ${targetUser}`]
      if (sipIdentityLineIndex >= 0) {
        replacePassword(sipIdentityLineIndex, password)
        commandLines.push(`  ${lines[sipIdentityLineIndex].trim()}`)
      } else {
        const insertionIndex = blockEnd
        const newLine = `    sip-identity ${targetUser} register auth-name ${targetUser} password ${password}`
        lines.splice(insertionIndex, 0, newLine)
        commandLines.push(`  ${newLine.trim()}`)
      }
      deltas.push(`Updated sip-identity password for voice user ${targetUser}`)
      commands.push(commandLines)
    }
  }

  if (ns.connection && ns.connection.password && parsed.trunks.length > 0) {
    const trunkName = parsed.trunks[0]?.name
    if (trunkName) {
      const command = `sip trunk ${trunkName} registration username ${ns.connection.username} password ${ns.connection.password}`
      lines.push('', '! NetSapiens trunk registration update', command)
      deltas.push(`Updated trunk ${trunkName} registration credentials`)
      commands.push([command])
    }
  }

  return {
    text: lines.join('\n'),
    deltas,
    commands,
  }
}

export function maskSecret(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined
  }

  const normalized = value.toString()
  const lastFour = normalized.slice(-4)
  return `****${lastFour}`
}

export function maskSensitiveTokens(text: string): string {
  if (!text) {
    return text
  }

  // Mask common password patterns in Adtran configs (e.g., password XXXXX)
  const patterns: RegExp[] = [
    /(enable\s+password\s+)(\S+)/gi,
    /(sip-identity\s+\S+\s+register\s+auth-name\s+\S+\s+password\s+)(\S+)/gi,
    /(password\s+)(\S+)/gi,
    /(secret\s+)(\S+)/gi,
    /(authorization:\s*Bearer\s+)(\S+)/gi,
  ]

  return patterns.reduce((acc, pattern) => acc.replace(pattern, (_match, prefix) => `${prefix}****`), text)
}

export function log(message: string, data?: unknown) {
  console.log(`[SIP-PRI-TOOL] ${message}`, data || '')
}

export function error(message: string, err?: unknown) {
  console.error(`[SIP-PRI-TOOL ERROR] ${message}`, err || '')
}

export function warn(message: string, data?: unknown) {
  console.warn(`[SIP-PRI-TOOL WARN] ${message}`, data || '')
}

export function debug(message: string, data?: unknown) {
  if (process.env.NODE_ENV === 'development') {
    console.debug(`[SIP-PRI-TOOL DEBUG] ${message}`, data || '')
  }
}
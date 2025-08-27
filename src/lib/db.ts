import { Pool } from 'pg'
import { log, error as logError } from './logger'

log('Initializing database pool...', {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER
})

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

pool.on('connect', () => {
  log('Database client connected')
})

pool.on('error', (err) => {
  logError('Database pool error', err)
})

export type DidRange = {
  rangesize: number
  firstdirectorynumber: string
  lastdirectorynumber: string | null
  firstcode: string | null
  lastcode: string | null
}

export async function getDirectoryNumbersForBinding(binding: string): Promise<string[]> {
  log(`Querying directory numbers for binding: ${binding}`)
  
  const query = `
    SELECT directorynumber
    FROM meta_pbx_line
    WHERE lower(configuredsipbinding) = lower($1)
  `
  
  try {
    const { rows } = await pool.query(query, [binding])
    log(`Found ${rows.length} directory numbers for binding`)
    
    const cleanNumbers = rows
      .map(r => (r.directorynumber as string)?.replace(/\D/g, '') || '')
      .filter(dn => dn.length > 0)
    
    log(`Filtered to ${cleanNumbers.length} valid directory numbers`)
    return cleanNumbers
  } catch (err) {
    logError('Failed to query directory numbers', err)
    throw new Error('Database query failed: ' + (err as Error).message)
  }
}

export async function getDidRangesForDns(dns: string[]): Promise<DidRange[]> {
  if (!dns.length) {
    log('No directory numbers provided for DID range query')
    return []
  }
  
  log(`Querying DID ranges for ${dns.length} directory numbers`)
  
  // Build query to find DID ranges where:
  // 1. firstdirectorynumber exactly matches a PBX line
  // 2. directorynumber field matches a PBX line (direct relationship)  
  // 3. DID ranges that are ADJACENT to PBX lines (within ±1 of range boundaries)
  const didRangesQuery = `
    SELECT DISTINCT rangesize, firstdirectorynumber, lastdirectorynumber, firstcode, lastcode
    FROM meta_pbx_directinwardcalling d
    WHERE 
      -- Direct match: PBX line matches the first number of a DID range
      firstdirectorynumber = ANY($1)
      -- Direct relationship: DID range's directorynumber field matches a PBX line
      OR directorynumber = ANY($1)
      OR EXISTS (
        -- Adjacent match: PBX line is within ±1 of a DID range boundary
        SELECT 1 FROM unnest($1::text[]) AS pbx(num)
        WHERE 
          -- PBX line is immediately before range start
          CAST(pbx.num AS BIGINT) = CAST(d.firstdirectorynumber AS BIGINT) - 1
          -- PBX line is immediately after range end
          OR CAST(pbx.num AS BIGINT) = CAST(COALESCE(d.lastdirectorynumber, d.firstdirectorynumber) AS BIGINT) + 1
      )
    ORDER BY firstdirectorynumber
  `
  
  try {
    const { rows } = await pool.query(didRangesQuery, [dns])
    log(`Found ${rows.length} DID ranges (direct + adjacent matches)`)
    
    const cleanRanges = rows.map(row => ({
      rangesize: Number(row.rangesize) || 1,
      firstdirectorynumber: (row.firstdirectorynumber as string)?.replace(/\D/g, '') || '',
      lastdirectorynumber: (row.lastdirectorynumber as string)?.replace(/\D/g, '') || null,
      firstcode: (row.firstcode as string)?.replace(/\D/g, '') || null,
      lastcode: (row.lastcode as string)?.replace(/\D/g, '') || null,
    })).filter(r => r.firstdirectorynumber.length > 0)
    
    log(`Filtered to ${cleanRanges.length} valid DID ranges`)
    return cleanRanges
  } catch (err) {
    logError('Failed to query DID ranges', err)
    throw new Error('Database query failed: ' + (err as Error).message)
  }
}
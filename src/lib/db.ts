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
  
  // First try exact match (original logic)
  const exactQuery = `
    SELECT rangesize, firstdirectorynumber, lastdirectorynumber, firstcode, lastcode
    FROM meta_pbx_directinwardcalling
    WHERE firstdirectorynumber = ANY($1)
  `
  
  try {
    const { rows: exactRows } = await pool.query(exactQuery, [dns])
    log(`Found ${exactRows.length} exact DID range matches`)
    
    if (exactRows.length > 0) {
      // If we found exact matches, use them
      const cleanRanges = exactRows.map(row => ({
        rangesize: Number(row.rangesize) || 1,
        firstdirectorynumber: (row.firstdirectorynumber as string)?.replace(/\D/g, '') || '',
        lastdirectorynumber: (row.lastdirectorynumber as string)?.replace(/\D/g, '') || null,
        firstcode: (row.firstcode as string)?.replace(/\D/g, '') || null,
        lastcode: (row.lastcode as string)?.replace(/\D/g, '') || null,
      })).filter(r => r.firstdirectorynumber.length > 0)
      
      log(`Filtered to ${cleanRanges.length} valid DID ranges from exact matches`)
      return cleanRanges
    }
    
    // If no exact matches, try pattern-based approach for related numbers
    log('No exact matches found, trying pattern-based approach')
    
    // Use multiple pattern approaches to find related DID ranges
    const baseNumber = dns[0] // Use first directory number as reference
    log(`Base directory number: ${baseNumber}`)
    
    // Create multiple patterns to search for related numbers
    const patterns = [
      baseNumber.substring(0, 6) + '%',  // 734721% - exact 6-digit match
      baseNumber.substring(0, 4) + '22%', // 734722% - same area, different exchange
      baseNumber.substring(0, 4) + '28%', // 734728% - same area, different exchange
    ]
    
    log(`Using targeted patterns: ${patterns.join(', ')}`)
    
    const patternQuery = `
      SELECT rangesize, firstdirectorynumber, lastdirectorynumber, firstcode, lastcode
      FROM meta_pbx_directinwardcalling
      WHERE firstdirectorynumber LIKE $1 OR firstdirectorynumber LIKE $2 OR firstdirectorynumber LIKE $3
      ORDER BY firstdirectorynumber
    `
    
    const patternParams = patterns
    const { rows: patternRows } = await pool.query(patternQuery, patternParams)
    log(`Found ${patternRows.length} DID ranges using pattern matching`)
    
    const cleanRanges = patternRows.map(row => ({
      rangesize: Number(row.rangesize) || 1,
      firstdirectorynumber: (row.firstdirectorynumber as string)?.replace(/\D/g, '') || '',
      lastdirectorynumber: (row.lastdirectorynumber as string)?.replace(/\D/g, '') || null,
      firstcode: (row.firstcode as string)?.replace(/\D/g, '') || null,
      lastcode: (row.lastcode as string)?.replace(/\D/g, '') || null,
    })).filter(r => r.firstdirectorynumber.length > 0)
    
    log(`Filtered to ${cleanRanges.length} valid DID ranges from pattern matching`)
    return cleanRanges
  } catch (err) {
    logError('Failed to query DID ranges', err)
    throw new Error('Database query failed: ' + (err as Error).message)
  }
}
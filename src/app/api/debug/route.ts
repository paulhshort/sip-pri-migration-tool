import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { log } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const binding = searchParams.get('binding') || 'QHH'
    
    log(`Debug endpoint called for binding: ${binding}`)
    
    // Get directory numbers for binding
    const pbxQuery = `
      SELECT directorynumber, configuredsipbinding
      FROM meta_pbx_line
      WHERE lower(configuredsipbinding) = lower($1)
      LIMIT 5
    `
    const { rows: pbxRows } = await pool.query(pbxQuery, [binding])
    
    // Get sample DID ranges
    const didQuery = `
      SELECT rangesize, firstdirectorynumber, lastdirectorynumber, firstcode, lastcode
      FROM meta_pbx_directinwardcalling
      LIMIT 10
    `
    const { rows: didRows } = await pool.query(didQuery)
    
    // Check if any PBX directory numbers match DID firstdirectorynumber
    const directoryNumbers = pbxRows.map(r => r.directorynumber)
    if (directoryNumbers.length > 0) {
      const matchQuery = `
        SELECT rangesize, firstdirectorynumber, lastdirectorynumber, firstcode, lastcode
        FROM meta_pbx_directinwardcalling
        WHERE firstdirectorynumber = ANY($1)
        LIMIT 5
      `
      const { rows: matchRows } = await pool.query(matchQuery, [directoryNumbers])
      
      return NextResponse.json({
        binding,
        pbx_lines: pbxRows,
        sample_did_ranges: didRows,
        directory_numbers: directoryNumbers,
        matching_did_ranges: matchRows,
        debug_info: {
          pbx_count: pbxRows.length,
          sample_did_count: didRows.length,
          matches: matchRows.length
        }
      })
    }
    
    return NextResponse.json({
      binding,
      pbx_lines: pbxRows,
      sample_did_ranges: didRows,
      error: 'No directory numbers found for binding'
    })
    
  } catch (error) {
    log('Debug endpoint error', error)
    return NextResponse.json(
      { error: 'Debug endpoint failed: ' + (error as Error).message },
      { status: 500 }
    )
  }
}
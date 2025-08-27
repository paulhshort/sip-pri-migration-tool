import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { log } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    log('Investigating QHH DID ranges')
    
    // Get all DID ranges that start with 734721 (like the expected QHH numbers)
    const didQuery = `
      SELECT rangesize, firstdirectorynumber, lastdirectorynumber, firstcode, lastcode
      FROM meta_pbx_directinwardcalling
      WHERE firstdirectorynumber LIKE '734721%'
      OR firstdirectorynumber LIKE '734728%'
      ORDER BY firstdirectorynumber
    `
    const { rows: didRows } = await pool.query(didQuery)
    
    // Expected QHH numbers from reference example
    const expectedNumbers = [
      '7347214821', '7347210059', '7347286741', '7347285346',
      '7347285347', '7347285348', '7347213835', '7347217426',
      '7347219253', '7347224418', '7347224458', '7347285341'
    ]
    
    // Check which expected numbers exist in DID ranges
    const foundNumbers = didRows.map(r => r.firstdirectorynumber)
    const matchingNumbers = expectedNumbers.filter(num => foundNumbers.includes(num))
    const missingNumbers = expectedNumbers.filter(num => !foundNumbers.includes(num))
    
    // Also check if there are any PBX lines with these numbers
    const pbxQuery = `
      SELECT directorynumber, configuredsipbinding
      FROM meta_pbx_line
      WHERE directorynumber = ANY($1)
    `
    const { rows: pbxRows } = await pool.query(pbxQuery, [expectedNumbers])
    
    return NextResponse.json({
      expected_qhh_numbers: expectedNumbers,
      did_ranges_found: didRows,
      matching_numbers: matchingNumbers,
      missing_numbers: missingNumbers,
      pbx_lines_with_expected_numbers: pbxRows,
      analysis: {
        expected_count: expectedNumbers.length,
        did_ranges_found_count: didRows.length,
        matching_count: matchingNumbers.length,
        missing_count: missingNumbers.length,
        pbx_matches: pbxRows.length
      }
    })
    
  } catch (error) {
    log('Investigation endpoint error', error)
    return NextResponse.json(
      { error: 'Investigation failed: ' + (error as Error).message },
      { status: 500 }
    )
  }
}
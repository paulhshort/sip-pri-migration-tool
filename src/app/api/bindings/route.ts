import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { log } from '@/lib/logger'

// Cache bindings for 5 minutes since they don't change frequently
let bindingsCache: { data: string[]; timestamp: number } | null = null
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export async function GET(request: NextRequest) {
  try {
    log('Bindings API endpoint called')
    
    // Check cache first
    const now = Date.now()
    if (bindingsCache && (now - bindingsCache.timestamp) < CACHE_DURATION) {
      log(`Returning ${bindingsCache.data.length} cached bindings`)
      return NextResponse.json({
        bindings: bindingsCache.data,
        cached: true
      })
    }
    
    // Query all unique SIP bindings from database
    const query = `
      SELECT DISTINCT configuredsipbinding
      FROM meta_pbx_line
      WHERE configuredsipbinding IS NOT NULL
      AND TRIM(configuredsipbinding) != ''
      ORDER BY configuredsipbinding
    `
    
    const { rows } = await pool.query(query)
    const bindings = rows
      .map(row => row.configuredsipbinding as string)
      .filter(binding => binding && binding.trim().length > 0)
    
    log(`Found ${bindings.length} unique SIP bindings`)
    
    // Update cache
    bindingsCache = {
      data: bindings,
      timestamp: now
    }
    
    return NextResponse.json({
      bindings,
      cached: false,
      count: bindings.length
    })
    
  } catch (error) {
    log('Bindings API error', error)
    return NextResponse.json(
      { error: 'Failed to fetch SIP bindings: ' + (error as Error).message },
      { status: 500 }
    )
  }
}
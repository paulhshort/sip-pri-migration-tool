import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getDirectoryNumbersForBinding, getDidRangesForDns } from '@/lib/db'
import { 
  expandRanges, 
  writeMetaswitchCsv, 
  writeNetSapiensCsv, 
  generateFileName,
  getOutputPath,
  type ServerLocation
} from '@/lib/csv'
import { log, error as logError } from '@/lib/logger'

const generateSchema = z.object({
  binding: z.string().min(1, 'Binding name is required'),
  domain: z.string().min(1, 'Domain is required'),
  trunk: z.string().min(1, 'SIP Trunk name is required'),
  account: z.string().min(1, 'Account number is required'),
  location: z.enum(['Chicago', 'Phoenix', 'Ashburn'], {
    message: 'Please select a valid server location'
  })
})

// Note: Removed token-based system in favor of direct file access

export async function POST(request: NextRequest) {
  log('POST /api/generate - Request received')
  
  try {
    const body = await request.json()
    log('Request body parsed', body)
    
    const input = generateSchema.parse(body)
    log('Input validation passed', input)
    
    // Step 1: Get directory numbers for the binding (READ-ONLY query)
    const directoryNumbers = await getDirectoryNumbersForBinding(input.binding)
    
    if (directoryNumbers.length === 0) {
      log('No PBX lines found for binding', input.binding)
      return NextResponse.json(
        { error: 'No PBX lines found for the specified binding' },
        { status: 404 }
      )
    }
    
    // Step 2: Get DID ranges for those directory numbers (READ-ONLY query)
    const didRanges = await getDidRangesForDns(directoryNumbers)
    
    // Step 3: Create DID range entries for PBX directory numbers that aren't in DID ranges
    const didRangeNumbers = new Set(didRanges.map(range => range.firstdirectorynumber))
    const pbxOnlyNumbers = directoryNumbers.filter(dn => !didRangeNumbers.has(dn))
    
    log(`Found ${pbxOnlyNumbers.length} PBX-only numbers to add: ${pbxOnlyNumbers.join(', ')}`)
    
    // Convert PBX-only numbers to DID range format (size=1)
    const pbxAsDIDRanges = pbxOnlyNumbers.map(dn => ({
      rangesize: 1,
      firstdirectorynumber: dn,
      lastdirectorynumber: dn,
      firstcode: dn,
      lastcode: dn
    }))
    
    // Combine all ranges (DID ranges + PBX-only numbers)
    const allRanges = [...didRanges, ...pbxAsDIDRanges]
    
    if (allRanges.length === 0) {
      log('No DID ranges or PBX numbers found', directoryNumbers)
      return NextResponse.json(
        { error: 'No DID ranges or PBX lines found for the specified binding' },
        { status: 404 }
      )
    }
    
    log(`Total ranges to generate: ${allRanges.length} (${didRanges.length} DID ranges + ${pbxAsDIDRanges.length} PBX-only)`)
    
    // Step 4: Generate filenames and paths
    const metaswitchFilename = generateFileName('metaswitch', input.binding)
    const netsapiensFilename = generateFileName('netsapiens', input.binding)
    const metaswitchPath = getOutputPath(metaswitchFilename)
    const netsapiensPath = getOutputPath(netsapiensFilename)
    
    log(`Generated filenames: ${metaswitchFilename}, ${netsapiensFilename}`)
    
    // Step 5: Expand all ranges for NetSapiens CSV
    const expandedNumbers = expandRanges(allRanges)
    
    // Step 6: Generate both CSV files using all ranges
    await Promise.all([
      writeMetaswitchCsv(metaswitchPath, allRanges, input.location as ServerLocation),
      writeNetSapiensCsv(netsapiensPath, expandedNumbers, input.domain, input.trunk, input.account)
    ])
    
    log(`Files written successfully: ${metaswitchPath}, ${netsapiensPath}`)
    
    return NextResponse.json({
      summary: {
        pbxLines: directoryNumbers.length,
        didRanges: allRanges.length,
        totalNumbers: expandedNumbers.length
      },
      files: {
        metaswitch: `/api/download?file=${encodeURIComponent(metaswitchFilename)}`,
        netsapiens: `/api/download?file=${encodeURIComponent(netsapiensFilename)}`
      }
    })
    
  } catch (error) {
    logError('Generate API error', error)
    
    if (error instanceof z.ZodError) {
      log('Validation error', error.issues)
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error: ' + (error as Error).message },
      { status: 500 }
    )
  }
}

// Note: Direct file access system - no longer exporting tokens
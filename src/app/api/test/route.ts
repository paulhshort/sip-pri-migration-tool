import { NextRequest, NextResponse } from 'next/server'
import { 
  expandRanges, 
  writeMetaswitchCsv, 
  writeNetSapiensCsv, 
  generateFileName,
  getOutputPath,
} from '@/lib/csv'
import { log } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    log('Test endpoint - creating sample CSV with known DID range')
    
    // Use sample DID range data from debug output
    const testDidRanges = [
      {
        rangesize: 20,
        firstdirectorynumber: "7343570328",
        lastdirectorynumber: "7343570347", 
        firstcode: "7343570328",
        lastcode: "7343570347"
      },
      {
        rangesize: 1,
        firstdirectorynumber: "7347210059",
        lastdirectorynumber: "7347210059",
        firstcode: "7347210059", 
        lastcode: "7347210059"
      }
    ]
    
    const testInput = {
      binding: "TEST",
      domain: "qualityhomehealthcare.net",
      trunk: "qualityhomehealthcare.pri", 
      account: "112499",
      location: "Chicago" as const
    }
    
    // Generate filenames and paths
    const metaswitchFilename = generateFileName('metaswitch', testInput.binding)
    const netsapiensFilename = generateFileName('netsapiens', testInput.binding)
    const metaswitchPath = getOutputPath(metaswitchFilename)
    const netsapiensPath = getOutputPath(netsapiensFilename)
    
    log(`Generated test filenames: ${metaswitchFilename}, ${netsapiensFilename}`)
    
    // Expand ranges for NetSapiens CSV
    const expandedNumbers = expandRanges(testDidRanges)
    log(`Expanded ${expandedNumbers.length} numbers from test ranges`)
    
    // Generate both CSV files
    await Promise.all([
      writeMetaswitchCsv(metaswitchPath, testDidRanges, testInput.location),
      writeNetSapiensCsv(netsapiensPath, expandedNumbers, testInput.domain, testInput.trunk, testInput.account)
    ])
    
    log(`Test files written successfully: ${metaswitchPath}, ${netsapiensPath}`)
    
    return NextResponse.json({
      message: "Test CSVs generated successfully",
      summary: {
        pbxLines: 1,
        didRanges: testDidRanges.length,
        totalNumbers: expandedNumbers.length
      },
      files: {
        metaswitch: `/api/download?file=${encodeURIComponent(metaswitchFilename)}`,
        netsapiens: `/api/download?file=${encodeURIComponent(netsapiensFilename)}`
      },
      testData: {
        didRanges: testDidRanges,
        expandedNumbers: expandedNumbers.slice(0, 5) // Show first 5 numbers
      }
    })
    
  } catch (error) {
    log('Test endpoint error', error)
    return NextResponse.json(
      { error: 'Test failed: ' + (error as Error).message },
      { status: 500 }
    )
  }
}
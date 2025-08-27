import { NextRequest, NextResponse } from 'next/server'
import { 
  expandRanges, 
  writeMetaswitchCsv, 
  writeNetSapiensCsv, 
  generateFileName,
  getOutputPath,
} from '@/lib/csv'
import { v4 as uuidv4 } from 'uuid'
import { fileTokens } from '../generate/route'
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
    const token = uuidv4()
    const metaswitchFilename = generateFileName('metaswitch', testInput.binding)
    const netsapiensFilename = generateFileName('netsapiens', testInput.binding)
    const metaswitchPath = getOutputPath(metaswitchFilename)
    const netsapiensPath = getOutputPath(netsapiensFilename)
    
    // Expand ranges for NetSapiens CSV
    const expandedNumbers = expandRanges(testDidRanges)
    log(`Expanded ${expandedNumbers.length} numbers from test ranges`)
    
    // Generate both CSV files
    await Promise.all([
      writeMetaswitchCsv(metaswitchPath, testDidRanges, testInput.location),
      writeNetSapiensCsv(netsapiensPath, expandedNumbers, testInput.domain, testInput.trunk, testInput.account)
    ])
    
    // Store file paths with token
    fileTokens.set(token, {
      metaswitch: metaswitchFilename,
      netsapiens: netsapiensFilename
    })
    
    // Clean up old tokens after 1 hour
    setTimeout(() => fileTokens.delete(token), 3600000)
    
    return NextResponse.json({
      message: "Test CSVs generated successfully",
      token,
      summary: {
        pbxLines: 1,
        didRanges: testDidRanges.length,
        totalNumbers: expandedNumbers.length
      },
      files: {
        metaswitch: `/api/download?id=${token}&type=metaswitch`,
        netsapiens: `/api/download?id=${token}&type=netsapiens`
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
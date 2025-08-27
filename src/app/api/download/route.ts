import { NextRequest, NextResponse } from 'next/server'
import fs from 'node:fs'
import { getOutputPath } from '@/lib/csv'
import { log, error as logError } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    log('Download API endpoint called')
    const searchParams = request.nextUrl.searchParams
    const filename = searchParams.get('file')
    
    if (!filename) {
      log('Missing filename parameter')
      return NextResponse.json(
        { error: 'Missing file parameter' },
        { status: 400 }
      )
    }
    
    // Security: Validate filename to prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      log('Invalid filename detected', filename)
      return NextResponse.json(
        { error: 'Invalid filename' },
        { status: 400 }
      )
    }
    
    // Validate file extension
    if (!filename.endsWith('.csv')) {
      log('Non-CSV file requested', filename)
      return NextResponse.json(
        { error: 'Only CSV files are allowed' },
        { status: 400 }
      )
    }
    
    // Validate filename pattern (must start with metaswitch_ or netsapiens_)
    if (!filename.startsWith('metaswitch_') && !filename.startsWith('netsapiens_')) {
      log('Invalid filename pattern', filename)
      return NextResponse.json(
        { error: 'Invalid file pattern' },
        { status: 400 }
      )
    }
    
    const filePath = getOutputPath(filename)
    log(`Attempting to serve file: ${filePath}`)
    
    if (!fs.existsSync(filePath)) {
      log('File not found on disk', filePath)
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }
    
    const fileBuffer = fs.readFileSync(filePath)
    log(`File served successfully: ${filename} (${fileBuffer.length} bytes)`)
    
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    })
    
  } catch (error) {
    logError('Download API error', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
import { format } from '@fast-csv/format'
import fs from 'node:fs'
import path from 'node:path'
import { DidRange } from './db'

export type ServerLocation = 'Chicago' | 'Phoenix' | 'Ashburn'

export function expandRanges(ranges: DidRange[]): string[] {
  const numbers = new Set<string>()
  
  for (const range of ranges) {
    const start = parseInt(range.firstdirectorynumber, 10)
    const count = Number(range.rangesize)
    
    if (!Number.isFinite(start) || start <= 0 || !count || count <= 0) continue
    
    for (let i = 0; i < count; i++) {
      numbers.add(String(start + i))
    }
  }
  
  return [...numbers].sort()
}

export function normalizeNumber(number: string): string {
  return number.replace(/\D/g, '')
}

export async function writeMetaswitchCsv(
  filePath: string,
  ranges: DidRange[],
  location: ServerLocation
): Promise<void> {
  const pbxByLocation = {
    Chicago: '2486877799',
    Phoenix: '2487819929',
    Ashburn: '2487819988'
  }
  
  return new Promise((resolve, reject) => {
    const stream = format({ headers: false })
    const writeStream = fs.createWriteStream(filePath)
    
    stream.pipe(writeStream)
    
    // Write headers
    stream.write(['PBX DID Range or DISA Number', '', '', '', '', ''])
    stream.write(['MetaSphere CFS', 'PBX Phone number', '(First) Phone number', 'Type', 'First code', 'Range size'])
    
    // Write data rows
    for (const range of ranges) {
      stream.write([
        'Grid4-Liberty-CFS-1',
        pbxByLocation[location],
        range.firstdirectorynumber,
        'DID range',
        range.firstcode || '',
        range.rangesize || 1
      ])
    }
    
    stream.end()
    
    writeStream.on('finish', resolve)
    writeStream.on('error', reject)
  })
}

export async function writeNetSapiensCsv(
  filePath: string,
  numbers: string[],
  domain: string,
  trunk: string,
  account: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const stream = format({ headers: true })
    const writeStream = fs.createWriteStream(filePath)
    
    stream.pipe(writeStream)
    
    // Write header
    stream.write(['Phone Number', 'Domain', 'Treatment', 'Destination', 'Notes', 'Enable'])
    
    // Write data rows with leading "1" for E.164 format
    for (const number of numbers) {
      stream.write([`1${number}`, domain, 'SIP Trunk', trunk, account, 'yes'])
    }
    
    stream.end()
    
    writeStream.on('finish', resolve)
    writeStream.on('error', reject)
  })
}

export function generateFileName(type: 'metaswitch' | 'netsapiens', binding: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const bindingSlug = binding.toLowerCase().replace(/[^a-z0-9]/g, '_')
  return `${type}_${bindingSlug}_${timestamp}.csv`
}

export function getOutputPath(filename: string): string {
  const outputDir = process.env.OUTPUT_DIR || './data/output'
  return path.join(outputDir, filename)
}
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeMetaswitchCsv, type ServerLocation } from '@/lib/csv'

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'metaswitch-csv-'))

const SAMPLE_RANGES = [
  {
    rangesize: 1,
    firstdirectorynumber: '7347210059',
    lastdirectorynumber: '7347210059',
    firstcode: '7347210059',
    lastcode: '7347210059',
  },
]

const EXPECTED_BY_LOCATION: Record<ServerLocation, string> = {
  Chicago: '2486877799',
  Phoenix: '2487819929',
  Ashburn: '2487819988',
}

describe('writeMetaswitchCsv PBX Phone number by location', () => {
  afterAll(() => {
    try {
      fs.rmSync(TMP_DIR, { recursive: true, force: true })
    } catch {}
  })

  for (const loc of Object.keys(EXPECTED_BY_LOCATION) as ServerLocation[]) {
    it(`writes correct PBX Phone number for ${loc}`, async () => {
      const outPath = path.join(TMP_DIR, `out-${loc}.csv`)
      await writeMetaswitchCsv(outPath, SAMPLE_RANGES as any, loc)

      const content = fs.readFileSync(outPath, 'utf8').trim().split(/\r?\n/)
      // Header row 2 should exist; data row is at index 2 (0-based)
      expect(content.length).toBeGreaterThanOrEqual(3)

      const dataRow = content[2]
      const cols = dataRow.split(',')
      // Col B (index 1) is PBX Phone number
      expect(cols[1]).toBe(EXPECTED_BY_LOCATION[loc])
    })
  }
})


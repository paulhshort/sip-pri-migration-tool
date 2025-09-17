import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { format } from '@fast-csv/format'
import fs from 'node:fs'
import path from 'node:path'
import { getOutputPath } from '@/lib/csv'

// Helper to map DB column keys to friendly CSV headers
const FRIENDLY_HEADERS: Record<string, string> = {
  baseinformation_name: 'Name',
  baseinformation_contactipaddress: 'ContactIPAddress',
  baseinformation_proxyipaddress: 'ProxyIPAddress',
  baseinformation_mediaipaddress: 'MediaIPAddress',
  baseinformation_additionalinboundcontactipaddresses: 'AdditionalInboundContactIPAddresses',
  baseinformation_contactipport: 'ContactIPPort',
  baseinformation_proxyipport: 'ProxyIPPort',
  baseinformation_contactdomainname: 'ContactDomainName',
  baseinformation_proxydomainname: 'ProxyDomainName',
  baseinformation_contactname: 'ContactName',
  baseinformation_sipbindinglocation: 'SIPBindingLocation',
  baseinformation_mediagatewaymodel: 'MediaGatewayModel',
  baseinformation_description: 'Description',
  customerinformation_custinfo: 'CustomerInfo',
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const testIp = (url.searchParams.get('test_ip') || '8.2.147.30').trim()

  try {
    // 1) Introspect columns to handle deployment differences safely
    const colRes = await pool.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema='public' AND table_name='meta_configuredsipbinding'
       ORDER BY ordinal_position`
    )
    const columns = colRes.rows.map((r) => r.column_name as string)
    const columnSet = new Set(columns)

    const mustHave = ['baseinformation_name', 'baseinformation_contactipaddress']
    const optionalCandidates = [
      'baseinformation_proxyipaddress',
      'baseinformation_mediaipaddress',
      'baseinformation_additionalinboundcontactipaddresses',
      'baseinformation_contactipport',
      'baseinformation_proxyipport',
      'baseinformation_contactdomainname',
      'baseinformation_proxydomainname',
      'baseinformation_contactname',
      'baseinformation_sipbindinglocation',
      'baseinformation_mediagatewaymodel',
      'baseinformation_description',
      'customerinformation_custinfo',
    ]

    const selectCols = [
      ...mustHave.filter((c) => columnSet.has(c)),
      ...optionalCandidates.filter((c) => columnSet.has(c)),
    ]

    if (selectCols.length === 0) {
      return NextResponse.json(
        { error: 'meta_configuredsipbinding has no recognized columns in this deployment', columns },
        { status: 500 }
      )
    }

    // 2) Validate test IP presence
    const ipChecks: string[] = []
    if (columnSet.has('baseinformation_contactipaddress')) ipChecks.push('baseinformation_contactipaddress = $1')
    if (columnSet.has('baseinformation_proxyipaddress')) ipChecks.push('baseinformation_proxyipaddress = $1')
    if (columnSet.has('baseinformation_mediaipaddress')) ipChecks.push('baseinformation_mediaipaddress = $1')
    if (columnSet.has('baseinformation_additionalinboundcontactipaddresses')) ipChecks.push("baseinformation_additionalinboundcontactipaddresses LIKE '%' || $1 || '%'")

    let ipValidated = false
    let ipMatches: unknown[] = []
    if (ipChecks.length) {
      const testQuery = `SELECT ${selectCols.join(', ')}
                         FROM meta_configuredsipbinding
                         WHERE ${ipChecks.join(' OR ')}
                         LIMIT 25`
      const testRes = await pool.query(testQuery, [testIp])
      ipValidated = ((testRes.rowCount ?? 0) > 0)
      ipMatches = testRes.rows
    }

    // 3) Build detection predicates for Adtran (by name/model/description/customer info)
    const adtranPredicates: string[] = []
    if (columnSet.has('baseinformation_mediagatewaymodel')) {
      adtranPredicates.push("lower(baseinformation_mediagatewaymodel) LIKE '%adtran%'")
      adtranPredicates.push("lower(baseinformation_mediagatewaymodel) LIKE '%netvanta%'")
    }
    if (columnSet.has('baseinformation_name')) {
      adtranPredicates.push("lower(baseinformation_name) LIKE '%adtran%'")
      // Common naming conventions observed: many Adtran bindings carry a (PRI) suffix or ' pri'
      adtranPredicates.push("lower(baseinformation_name) LIKE '%(pri%'")
      adtranPredicates.push("lower(baseinformation_name) LIKE '% pri%'")
      adtranPredicates.push("lower(baseinformation_name) LIKE '%-pri%'")
      adtranPredicates.push("lower(baseinformation_name) LIKE '%netvanta%'")
    }
    if (columnSet.has('baseinformation_description')) {
      adtranPredicates.push("lower(baseinformation_description) LIKE '%adtran%'")
      adtranPredicates.push("lower(baseinformation_description) LIKE '%netvanta%'")
    }
    if (columnSet.has('customerinformation_custinfo')) {
      adtranPredicates.push("lower(customerinformation_custinfo) LIKE '%adtran%'")
      adtranPredicates.push("lower(customerinformation_custinfo) LIKE '%netvanta%'")
    }

    // 3b) Broaden detection by correlating with Subscriber Gateways (meta_subg) IPs having Adtran models
    let adtranIps: string[] = []
    try {
      const subgExists = await pool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema='public' AND lower(table_name)='meta_subg'
         LIMIT 1`
      )
      if ((subgExists.rowCount ?? 0) > 0) {
        const ipsRes = await pool.query(
          `SELECT baseinformation_ipaddress AS ip
           FROM meta_subg
           WHERE baseinformation_ipaddress IS NOT NULL
             AND trim(baseinformation_ipaddress) <> ''
             AND lower(baseinformation_mediagatewaymodel) LIKE '%adtran%'`
        )
        adtranIps = (ipsRes.rows as Array<{ ip: string }>).map(r => String(r.ip)).filter(Boolean)
      }
    } catch (_) {
      // Ignore meta_subg correlation failures and proceed with name/model filtering only
    }

    const ipParts: string[] = []
    if (adtranIps.length > 0) {
      if (columnSet.has('baseinformation_contactipaddress')) ipParts.push(`baseinformation_contactipaddress = ANY($1)`)
      if (columnSet.has('baseinformation_proxyipaddress')) ipParts.push(`baseinformation_proxyipaddress = ANY($1)`)
      if (columnSet.has('baseinformation_mediaipaddress')) ipParts.push(`baseinformation_mediaipaddress = ANY($1)`)
      if (columnSet.has('baseinformation_additionalinboundcontactipaddresses')) ipParts.push(`EXISTS (SELECT 1 FROM unnest($1::text[]) ip WHERE baseinformation_additionalinboundcontactipaddresses LIKE '%' || ip || '%')`)
    }

    // Fallback: if we have no name/model fields or no subg IPs, at least require contact/proxy IP presence
    const presenceFilterParts: string[] = []
    if (columnSet.has('baseinformation_contactipaddress')) presenceFilterParts.push(`baseinformation_contactipaddress IS NOT NULL AND baseinformation_contactipaddress <> ''`)
    if (columnSet.has('baseinformation_proxyipaddress')) presenceFilterParts.push(`baseinformation_proxyipaddress IS NOT NULL AND baseinformation_proxyipaddress <> ''`)

    const wherePieces: string[] = []
    if (adtranPredicates.length) wherePieces.push(`(${adtranPredicates.join(' OR ')})`)
    if (ipParts.length) wherePieces.push(`(${ipParts.join(' OR ')})`)

    const whereClause = wherePieces.length
      ? wherePieces.join(' OR ')
      : presenceFilterParts.length
        ? `(${presenceFilterParts.join(' OR ')})`
        : 'TRUE'

    // 4) Query all candidate Adtran records
    const exportQuery = `SELECT DISTINCT ${selectCols.join(', ')}
                         FROM meta_configuredsipbinding
                         WHERE ${whereClause}
                         ORDER BY baseinformation_name NULLS LAST, baseinformation_contactipaddress NULLS LAST`

    const exportParams = ipParts.length ? [adtranIps] : []
    const exportRes = await pool.query(exportQuery, exportParams)

    // 5) Generate CSV to disk
    const fileName = `adtran_devices_${timestamp()}.csv`
    const outPath = getOutputPath(fileName)
    await fs.promises.mkdir(path.dirname(outPath), { recursive: true })

    await new Promise<void>((resolve, reject) => {
      const stream = format({ headers: true })
      const ws = fs.createWriteStream(outPath)
      stream.pipe(ws)

      // Build headers in friendly form (fall back to raw if not mapped)
      const headers = selectCols.map((c) => FRIENDLY_HEADERS[c] ?? c)
      // Write header row explicitly so columns order is preserved
      stream.write(headers)

      for (const row of exportRes.rows as Record<string, unknown>[]) {
        const csvRow: Record<string, string> = {}
        for (let i = 0; i < selectCols.length; i++) {
          const col = selectCols[i]
          const header = headers[i]
          const val = row[col]
          let s = val == null ? '' : String(val)
          // Sanitize newlines and trim
          s = s.replace(/[\r\n]+/g, ' ').trim()
          csvRow[header] = s
        }
        stream.write(csvRow)
      }

      stream.end()
      ws.on('finish', resolve)
      ws.on('error', reject)
    })

    return NextResponse.json({
      summary: {
        totalExported: (exportRes.rowCount ?? 0),
        validatedTestIp: ipValidated,
        testIp,
      },
      output: {
        file: outPath,
      },
      metadata: {
        table: 'meta_configuredsipbinding',
        selectedColumns: selectCols,
        availableColumns: columns,
        sampleMatchesForTestIp: ipMatches,
        detectionLogic:
          adtranPredicates.length && ipParts.length
            ? 'ILIKE on mediagatewaymodel/name/description/custinfo OR IP correlation from meta_subg'
            : adtranPredicates.length
              ? 'ILIKE on mediagatewaymodel/name/description/custinfo containing adtran'
              : ipParts.length
                ? 'IP correlation from meta_subg (baseinformation_*ipaddress matches)'
                : 'No ADTRAN-identifying fields found; exported entries with non-empty IPs',
      },
    })
  } catch (err) {
    console.error('Adtran export failed:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}


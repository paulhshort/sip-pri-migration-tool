## SIP/PRI Migration Tool — Product Requirements (PRD)

### 1. Purpose
A focused internal web app that queries Metaswitch ShadowDB for PBX lines and associated DID ranges, then generates two downloadable CSVs:
- Metaswitch import CSV (PBX DID Range/DISA template)
- NetSapiens import CSV (per-number SIP Trunk routing)

No EAS or MetaView APIs are needed; all data comes from the ShadowDB (read-only).

### 2. Users and Scope
- Internal Grid4 staff on corporate LAN
- No auth required
- Single-page app with a polished, simple UX
- Inputs collected:
  - Metaswitch Configured SIP Binding name (text)
  - NetSapiens domain (text)
  - NetSapiens SIP Trunk name (text)
  - Customer account number (text/numeric)
  - NetSapiens Preferred Server Location (dropdown: US Midwest (Chicago) | US West (Phoenix) | US East (Ashburn))

### 3. Data Sources
- PostgreSQL Shadow Config DB (read-only): meta_pbx_line and meta_pbx_directinwardcalling
- Confirmed identifiers:
  - meta_pbx_line: configuredsipbinding, directorynumber
  - meta_pbx_directinwardcalling: rangesize, firstdirectorynumber, lastdirectorynumber, firstcode, lastcode

### 4. Functional Requirements
- Input form validates required fields and dropdown selection
- Query flow (parameterized SQL, read-only):
  1) PBX lines by Configured SIP Binding
     - SELECT directorynumber FROM meta_pbx_line WHERE lower(configuredsipbinding) = lower(:binding)
  2) DID ranges matching those directory numbers
     - SELECT rangesize, firstdirectorynumber, lastdirectorynumber, firstcode, lastcode
       FROM meta_pbx_directinwardcalling
       WHERE firstdirectorynumber = ANY(:dn_list) OR directorynumber = ANY(:dn_list)
       Note: Some schemas omit a standalone "directorynumber"; prefer firstdirectorynumber/lastdirectorynumber; include fallback match logic only if the column exists (introspect columns via information_schema).
- CSV generation:
  - Metaswitch import CSV
    - Header row 1: "PBX DID Range or DISA Number,,,,,"
    - Header row 2: "MetaSphere CFS,PBX Phone number,(First) Phone number,Type,First code,Range size"
    - Rows: 
      - Col A: "Grid4-Liberty-CFS-1" (constant)
      - Col B: value based on Preferred Server Location:
        - Chicago → 2486877799
        - Phoenix → 2487819929
        - Ashburn → 2487819988
      - Col C: firstdirectorynumber
      - Col D: "DID range"
      - Col E: firstcode
      - Col F: rangesize
  - NetSapiens import CSV
    - Header: "Phone Number,Domain,Treatment,Destination,Notes,Enable"
    - For each DID in range (expand rangesize starting at firstdirectorynumber):
      - Col A: 1 + each individual number (E.164 with leading 1)
      - Col B: user-entered domain
      - Col C: "SIP Trunk"
      - Col D: user-entered SIP Trunk name
      - Col E: user-entered account number
      - Col F: "yes"

### 5. Non-Functional Requirements
- Performance: handle ranges up to at least 10k numbers without freezing UI; expansion done server-side and streamed to file
- Reliability: DB access uses parameterized queries; retries for transient failures
- Observability: server logs key actions and timing; no sensitive data beyond connection strings
- Packaging: single Docker image; works on Linux or Windows VM

### 6. Tech Stack Decision (initial)
- Monorepo, TypeScript-first with Node 20+.
- Web framework: Next.js App Router (SSR + API routes) for a single-page UI + server endpoints.
- UI: Tailwind CSS + shadcn/ui for quick, polished components.
- DB: node-postgres (pg) client with prepared statements; no schema writes.
- CSV: fast-csv or @fast-csv/format for streaming CSV; alternatively csv-writer.
- Validation: zod for API payload validation.
- Container: Dockerfile with multi-stage build; production starts with `node server.js` or `next start`.
- Testing: Vitest + Playwright minimal; unit tests for CSV expansion and SQL builders.

Rationale: Next.js gives one repo, one deployable, clean API routes, and strong agent tooling ecosystem. TS + zod improves reliability and works well with Claude/GPT-5 coding agents.

### 7. API Design (internal)
- POST /api/generate
  - body: { binding: string, domain: string, trunk: string, account: string, location: "Chicago"|"Phoenix"|"Ashburn" }
  - behavior: 
    - Validate; execute queries; build two CSVs; return JSON { metaswitchCsvPath, netsapiensCsvPath } and also offer direct downloads via /api/download?id=...
- GET /api/download?id=<token>&type=metaswitch|netsapiens
  - streams the file from OUTPUT_DIR

### 8. Security & Access
- No authentication (LAN-only)
- ENV variables loaded from .env in project root
- Read-only DB access enforced by using the read-only role and strictly SELECT queries

### 9. CSV File Names
- metaswitch_{binding_slug}_{timestamp}.csv
- netsapiens_{binding_slug}_{timestamp}.csv

### 10. Edge Cases & Rules
- If DID range overlaps or duplicates, de-duplicate final per-number list for NS CSV while preserving full rows for Metaswitch CSV
- If rangesize=1, still output a single row and expand one number for NS CSV
- If firstcode is missing, leave Column E empty in Metaswitch CSV
- If directorynumber has non-numeric characters, strip non-digits; log a warning and skip invalid
- Input binding compared case-insensitively

### 11. Implementation Sketch (pseudocode)
- SQL 1:
  SELECT directorynumber
  FROM meta_pbx_line
  WHERE lower(configuredsipbinding) = lower($1)

- SQL 2:
  SELECT rangesize, firstdirectorynumber, lastdirectorynumber, firstcode, lastcode
  FROM meta_pbx_directinwardcalling
  WHERE firstdirectorynumber = ANY($1)

- Expansion:
  for each row: seq(firstdirectorynumber, rangesize) → numbers[]

- Location map:
  { Chicago: "2486877799", Phoenix: "2487819929", Ashburn: "2487819988" }

### 12. Milestones
- M0: Project bootstrap, Dockerfile, basic UI form, health check
- M1: DB queries working end-to-end (LAN), CSV writers, downloads
- M2: Nice UI polish, validations, error display, unit tests
- M3: Packaging + docs; agent prompts and Claude Code custom agents added


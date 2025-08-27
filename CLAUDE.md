# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a SIP/PRI Migration Tool designed to query Metaswitch ShadowDB for PBX lines and DID ranges, then generate CSV files for import into Metaswitch and NetSapiens systems. It's an internal Grid4 staff tool for corporate LAN use.

## Technology Stack

- **Framework**: Next.js with App Router (TypeScript)
- **Database**: PostgreSQL (read-only access to ShadowDB)
- **UI**: Tailwind CSS + shadcn/ui components
- **CSV Generation**: @fast-csv/format for streaming
- **Validation**: Zod for API payloads and forms
- **Forms**: React Hook Form + Zod resolver
- **Database Client**: node-postgres (pg)
- **Testing**: Vitest + Playwright
- **Package Manager**: PNPM (recommended for speed)

## Key Architecture

### Data Flow
1. User inputs binding name, domain, trunk name, account number, and server location
2. Query `meta_pbx_line` table for directory numbers by configured SIP binding
3. Query `meta_pbx_directinwardcalling` table for DID ranges matching those directory numbers
4. Generate two CSV files:
   - Metaswitch import CSV (PBX DID Range format)
   - NetSapiens import CSV (expanded individual numbers)

### Database Schema
- `meta_pbx_line`: `configuredsipbinding`, `directorynumber`
- `meta_pbx_directinwardcalling`: `rangesize`, `firstdirectorynumber`, `lastdirectorynumber`, `firstcode`, `lastcode`

### API Endpoints
- `POST /api/generate`: Main generation endpoint
- `GET /api/download?id=<token>&type=metaswitch|netsapiens`: File download

## Development Commands

Since this is a bootstrap kit without an existing Next.js project:

1. **Initialize project**: `npx create-next-app@latest . --typescript --tailwind --eslint --app`
2. **Install dependencies**: `pnpm install` (see STACK_DECISIONS.md for package list)
3. **Development**: `pnpm dev`
4. **Build**: `pnpm build`
5. **Start production**: `pnpm start`
6. **Test**: `pnpm test` (Vitest)
7. **E2E Tests**: `pnpm test:e2e` (Playwright)
8. **Lint**: `pnpm lint`
9. **Type check**: `pnpm type-check`

## Important Files and Locations

- `PRD_SIP_PRI_Migration_Tool.md`: Complete functional requirements
- `CSV_SPECS.md`: Exact CSV format specifications
- `SHADOW_DB_QUERY_NOTES.md`: Database queries and schema details
- `CODE_SNIPPETS.md`: TypeScript implementation examples
- `STACK_DECISIONS.md`: Technology choices and rationale
- `reference_examples/`: Canonical CSV output examples
- `.env`: Database connection and configuration

## CSV Generation Rules

### Metaswitch CSV Format
- Two header rows with specific text
- Fixed values: "Grid4-Liberty-CFS-1" for CFS column
- Location-dependent phone numbers:
  - Chicago: "2486877799"
  - Phoenix: "2487819929" 
  - Ashburn: "2487819988"

### NetSapiens CSV Format
- Expand DID ranges into individual numbers
- Add "1" prefix for E.164 format
- Deduplicate numbers
- Fixed "SIP Trunk" treatment and "yes" enable values

## Security and Database Access

- **Read-only database access** - use SELECT queries only with parameterized statements
- **No authentication** - LAN-only internal tool
- **Environment variables** - loaded from `.env` file
- **Input validation** - strip non-digits from phone numbers, validate required fields

## Validation Rules

- Directory numbers must be numeric (strip non-digits)
- Binding names compared case-insensitively
- Deduplicate expanded numbers for NetSapiens CSV
- Handle missing/null rangesize as 1
- Skip and log invalid directory numbers

## File Naming Convention

- `metaswitch_{binding_slug}_{timestamp}.csv`
- `netsapiens_{binding_slug}_{timestamp}.csv`

## Testing Strategy

- Unit tests for CSV expansion and SQL query builders
- Integration tests for database queries (if test DB available)
- Playwright E2E tests for form submission and file downloads
- Validate outputs match reference examples in `reference_examples/`

## Development Notes

- This is currently a bootstrap kit - actual Next.js project needs to be initialized
- All database queries should use parameterized statements for security
- CSV generation should be streamed for large datasets (10k+ numbers)
- Error handling should log warnings for malformed data but continue processing
- UI should provide clear feedback for long-running operations
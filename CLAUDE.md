# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Combined SIP/PRI Migration Tool with full automation capabilities for:
- Metaswitch ShadowDB queries for PBX lines, DID ranges, and Adtran device discovery
- Adtran device configuration management via SSH (fetch, parse, render, apply)
- NetSapiens provisioning (domains, connections, users, devices, phone numbers)
- CSV generation for both Metaswitch and NetSapiens systems

The tool supports two migration types:
1. **SIP Trunk Migration**: Query ShadowDB → Generate CSVs → Provision NetSapiens connection and phone numbers
2. **PRI Migration**: Query ShadowDB → SSH to Adtran → Parse config → Generate new config → Apply changes → Provision NetSapiens FXS users/devices

## Technology Stack

- **Framework**: Next.js 15 with App Router (TypeScript)
- **Database**: PostgreSQL (read-only access to Metaswitch ShadowDB)
- **UI**: Tailwind CSS + shadcn/ui components
- **Forms**: React Hook Form + Zod validation
- **CSV**: @fast-csv/format for streaming
- **SSH**: ssh2 for Adtran device access
- **Testing**: Vitest + Playwright
- **Package Manager**: PNPM

## Key Commands

```bash
# Development
pnpm dev             # Start dev server with Turbopack
pnpm test           # Run unit tests
pnpm test:ui        # Run tests with UI
pnpm type-check     # TypeScript type checking
pnpm lint           # ESLint
pnpm build          # Production build with Turbopack

# Testing specific files
pnpm test adtran    # Run tests matching "adtran"
pnpm test netsapiens # Run tests matching "netsapiens"
```

## Core Architecture

### Migration Flows

1. **SIP Trunk Migration**:
   - Query ShadowDB for binding info → Retrieve SIP username
   - Generate Metaswitch CSV (existing functionality)
   - Provision NetSapiens: domain → connection → phone numbers (to-connection)
   - Optional: Generate NetSapiens CSV for manual import

2. **PRI Migration**:
   - Query ShadowDB → Get Adtran IP from contact_ip
   - SSH to Adtran → Fetch version and running-config
   - Parse config → Extract FXS users and trunks
   - Provision NetSapiens: domain → connection → FXS users/devices
   - Generate new Adtran config with NetSapiens credentials
   - Apply changes via SSH (gated by OS version)
   - Assign phone numbers to FXS users (to-user)

### Key Modules

- `src/lib/shadowdb.ts` - PostgreSQL queries for ShadowDB tables:
  - `meta_pbx_line` - PBX directory numbers
  - `meta_pbx_directinwardcalling` - DID ranges
  - `meta_configuredsipbinding` - SIP bindings and Adtran IPs

- `src/lib/netsapiens.ts` - NetSapiens v2 API client:
  - Full Zod schemas for type safety
  - Exponential backoff for rate limits (429)
  - Secret masking for passwords
  - Synchronous mode support for immediate password retrieval

- `src/lib/adtran/` - Adtran SSH operations:
  - `ssh.ts` - SSH2 connection with retry logic and privilege escalation
  - `parse.ts` - Parse running-config and version (extracts AOS version, trunks, FXS users)
  - `render.ts` - Generate updated configs with NetSapiens credentials
  - `diff.ts` - Line-oriented config diff for review

- `src/lib/secrets.ts` - Secret masking utilities (shows last 4 chars only)

### API Routes

#### CSV Generation (Original)
- `/api/generate` - Metaswitch CSV generation
- `/api/download` - File download endpoint

#### ShadowDB
- `/api/shadowdb/lookup` - Get binding info and Adtran IP

#### NetSapiens
- `/api/netsapiens/domains` - Domain management (GET/POST)
- `/api/netsapiens/connections` - Connection CRUD with password retrieval
- `/api/netsapiens/users` - FXS user provisioning (synchronous)
- `/api/netsapiens/devices` - Device provisioning (synchronous, returns passwords)
- `/api/netsapiens/phonenumbers` - Phone number assignment

#### Adtran
- `/api/adtran/fetch-config` - SSH fetch with OS version gating
- `/api/adtran/plan` - Generate config changes and diff
- `/api/adtran/apply-config` - Apply changes via SSH (lab-only, gated)

## Database Access

The app requires read-only access to ShadowDB tables:
- `meta_pbx_line` - PBX directory numbers
- `meta_pbx_directinwardcalling` - DID ranges
- `meta_configuredsipbinding` - SIP binding configurations and Adtran IPs

Key queries:
- Binding lookup: `baseinformation_name`, `baseinformation_contactipaddress`, `baseinformation_sipusername`
- Always use parameterized queries
- Validate table existence with information_schema before querying

## NetSapiens Integration

Uses v2 API with Bearer authentication. Key patterns:
- Domain creation: Use `synchronous:'yes'` for immediate response
- Connection management: GET specific connection after create to retrieve password
- FXS provisioning: Create users and devices with `synchronous:'yes'` to get passwords
- Phone number assignment:
  - `to-user` for FXS (set translation user and host)
  - `to-connection` for trunks (set translation to match pattern)
- Handle 429 rate limits with exponential backoff
- Mask all passwords in logs and UI responses

## Adtran Configuration

### OS Version Gating
- **Block** if AOS major version < 13
- **Warn** if not R13.12.0.E (configurable via `STRICT_OS_GATING`)
- Parse version from `show version` command
- Version info displayed in UI with color-coded status

### SSH Operations
1. Connect with credentials and enable password
2. Fetch commands:
   - `terminal length 0` (disable paging)
   - `show version`
   - `show running-config`
   - `show sip trunk-registration`
3. Parse config to extract:
   - Trunks (T01, T02, etc.)
   - FXS users with port mappings
   - FAX vs normal users based on codec settings
4. Generate new config:
   - Preserve FAX options (modem-passthrough, t38, etc.)
   - Update trunk registrations with NetSapiens credentials
   - Update FXS sip-identity with device passwords
5. Apply changes:
   - Enter config mode
   - Apply line-by-line deltas
   - `write memory`
   - `sip trunk-registration force-register`
   - Verify registration status

### Lab Testing Restrictions
- **Only** test against lab device: 8.2.147.30
- Requires `TEST_LIVE_ADTRAN=true` and `ADTRAN_TEST_IP=8.2.147.30`
- Apply operations require `ALLOW_ADTRAN_APPLY=true`
- Never connect to customer devices during development

## Environment Configuration

Critical variables (see `.env.example`):
```bash
# ShadowDB (read-only)
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD

# NetSapiens API
NS_API_BASE_URL      # Include /ns-api/v2/
NS_API_KEY           # Bearer token
NS_SIPBX_SERVER      # Default core server
NS_CORE_SERVER       # Fallback for connections
ALLOW_DOMAIN_CREATE  # Feature gate for domain creation

# Adtran SSH
ADTRAN_SSH_USER      # SSH username
ADTRAN_SSH_PASS      # SSH password
ADTRAN_ENABLE_PASS   # Enable mode password
ADTRAN_TEST_IP       # Lab device IP
TEST_LIVE_ADTRAN     # Enable live SSH testing
ALLOW_ADTRAN_APPLY   # Enable config application

# Version Gating
MINIMUM_OS_MAJOR     # Minimum AOS major version (13)
RECOMMENDED_OS_VERSION # Recommended version (R13.12.0.E)
STRICT_OS_GATING     # Enforce recommended version

# Feature Flags
NEXT_PUBLIC_ENABLE_AUTOMATION # Enable UI automation features
```

## Testing Approach

### Unit Tests
- Parsers: `adtran/parse.ts` with fixture data
- Renderers: `adtran/render.ts` deterministic output
- Query builders: ShadowDB and NetSapiens
- Secret masking: Verify patterns are masked

### Integration Tests
- NetSapiens API: Mock with recorded responses
- Adtran SSH: Mock SSH2 client
- Use fixture data from `tests/fixtures/`

### E2E Testing (Playwright)
- Stub external APIs by default
- Test migration type branching
- Validate OS gating UI
- Test form validation and auto-save

## Important Patterns

### Security
- Always mask secrets in logs/UI (use `src/lib/secrets.ts`)
- IPv4 validation on all IP inputs: `z.string().ip({ version: 'v4' })`
- Parameterized SQL queries only
- Lab-only guards for Adtran operations

### Error Handling
- Use structured logging with pino (`src/lib/logger.ts`)
- Return JSON error responses with appropriate HTTP status codes
- Log errors: `error()` for failures, `warn()` for warnings, `log()` for info
- Handle NetSapiens 429 rate limits with exponential backoff
- SSH retry with jitter on transient failures

### API Response Patterns
- Success: `{ success: true, data: {...} }`
- Error: `{ error: 'message', details?: {...} }`
- Always set appropriate Content-Type headers
- Mask sensitive data in responses

### Type Safety
- Use Zod schemas for runtime validation of external data
- Define explicit types for all parsed/transformed data structures
- Validate environment variables at startup
- Handle both single objects and arrays from NetSapiens API

### UI/UX Patterns
- Feature flag automation with `NEXT_PUBLIC_ENABLE_AUTOMATION`
- Auto-save form state to browser storage
- Keyboard shortcuts: Ctrl+Enter (submit), Ctrl+R (reset), Ctrl+/ (help)
- Progress indicators for long operations
- Toast notifications for success/error
- Masked secrets with "reveal" option

## Current Implementation Status

### Completed
- ShadowDB integration with binding lookups
- NetSapiens client with all entity types
- NetSapiens API routes for domains, connections, users, devices, phone numbers
- Adtran SSH client with retry logic
- Adtran config parser and renderer
- Adtran API routes with OS gating
- Unit tests for parsers and renderers
- Integration tests for Adtran routes
- Secret masking throughout

### In Progress
- UI submit-time automation branching (feature-flagged)
- IPv4 validation on Adtran route inputs
- Expanded secret masking patterns

### Not Started
- PRI automation flow wiring in UI
- Playwright E2E tests
- NetSapiens CSV export endpoint
- CI/CD pipeline setup

## Development Workflow

1. **Research Phase**: Always explore existing code patterns before implementing
2. **Planning Phase**: Create detailed implementation plans for complex features
3. **Implementation**: Follow existing patterns, use TypeScript strictly
4. **Testing**: Write tests alongside implementation
5. **Documentation**: Update relevant docs and comments

## Code Review Focus Areas

When reviewing code, pay attention to:
- IPv4 validation on all IP inputs
- Secret masking in all logs and responses
- Proper error handling with structured logging
- Type safety with Zod schemas
- Lab-only guards for Adtran operations
- Feature flag usage for experimental features
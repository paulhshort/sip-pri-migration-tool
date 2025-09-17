# Next Development Phase Guide — Combined SIP Migrator + Adtran/NetSapiens Automation

Status: Authoritative guidance for Codex to follow next
Branch: feature/combined-adtran-ns-migrator

Read and follow this file before proceeding with the next development phase.

## 1) Current State Assessment (read-only snapshot)

Completed (observed):
- ShadowDB foundation
  - src/lib/shadowdb.ts: getConfiguredSipBinding(binding) for contactIp, sipUsername, etc.
  - API: POST /api/shadowdb/lookup — wraps the above with validation
- NetSapiens client foundation
  - src/lib/netsapiens.ts: Zod schemas; retries/backoff; helpers for:
    - Domains: listDomains, countDomain/domainExists, createDomain
    - Connections: listConnections, getConnection, createConnection
    - Phone Numbers: listPhoneNumbers, createPhoneNumber (202), updatePhoneNumber (202)
  - Password/secret masking integrated in client and API serializers
- NetSapiens API routes
  - GET/POST /api/netsapiens/domains (includes domain existence check)
  - GET/POST /api/netsapiens/connections (list/get/create; masks password)
  - GET/POST/PATCH /api/netsapiens/phonenumbers (list/create/update)
- UI
  - src/components/migration-form.tsx
    - Migration Type selector (sip-trunk | pri)
    - ShadowDB binding insights (contact IP, SIP username, additional IPs)
    - NetSapiens domain existence check and phone number listing (preview)
  - Current submit still calls /api/generate (CSV-only) — no automation branching yet

Not yet implemented (observed):
- NetSapiens Users/Devices helpers and API routes (needed for PRI)
- Adtran integration (SSH, parsing, rendering, diff, apply) and /api/adtran/* routes
- Submit-time automation branching (SIP Trunk vs PRI automation)
- Optional /api/netsapiens/export (CSV mirror of legacy importer)
- Tests for new modules

## 2) Next Priority Tasks (ranked with dependencies)

1) NetSapiens Users/Devices foundations (required for PRI)
- Add users/devices helpers to src/lib/netsapiens.ts
- Add API routes: /api/netsapiens/users (GET/POST) and /api/netsapiens/devices (GET/POST)
- Dependency: none; uses existing netsapiens.ts patterns

2) Adtran foundations (SSH + parsing; OS gating)
- Create src/lib/adtran/{ssh.ts, parse.ts, render.ts, diff.ts}
- Add /api/adtran/fetch-config to retrieve show version + running-config and compute gate status
- Dependency: none (but will later consume PRI NS state)

3) Submit-time automation branching in UI
- Update migration-form to branch on migrationType:
  - sip-trunk: ensure NS domain/connection, assign numbers to connection, still generate Metaswitch CSV; optional NS CSV
  - pri: ensure NS domain/connection/users/devices, assign numbers to users; fetch Adtran data; show diff & gate
- Dependency: Tasks (1) and (2)

4) Adtran apply pipeline
- Implement /api/adtran/plan (render + diff) and /api/adtran/apply-config (gated push, write memory, verify)
- Wire UI review/apply flow
- Dependency: Task (2)

5) Optional: /api/netsapiens/export (CSV)
- Provide CSV download for users preferring manual import
- Dependency: none

6) Tests
- Unit + integration + minimal E2E (Playwright)
- Dependency: parallel with features; complete by end of phase

## 3) Implementation Details

### 3.1 NetSapiens Users/Devices (src/lib/netsapiens.ts)

Add minimal, tolerant Zod schemas (passthrough), mapping helpers, and functions:

- Users
  - Schema (minimum fields used by us; passthrough others):
    - user: string
    - domain: string
    - description?: string
    - first/last names optional if present
  - Functions:
    - listUsers(domain: string): Promise<NetsapiensUser[]>
    - getUser(domain: string, user: string): Promise<NetsapiensUser | null>
    - createUser(domain: string, input: CreateUserRequest): Promise<NetsapiensUser>
  - Request (CreateUserRequest): synchronous:'yes' + required NS fields (align to examples in NetsapiensAPIReferenceAndExamples/)

- Devices (Logical)
  - Schema (minimum fields used by us; passthrough):
    - domain: string
    - user: string
    - device: string
    - 'device-sip-registration-username'?: string
    - 'device-sip-registration-password'?: string (capture for masked display)
  - Functions:
    - listDevices(domain: string, user: string): Promise<NetsapiensDevice[]>
    - createDevice(domain: string, user: string, input: CreateDeviceRequest): Promise<NetsapiensDevice>
  - Request (CreateDeviceRequest): synchronous:'yes' + required NS fields; returns device password in body

Add corresponding API routes:
- /api/netsapiens/users
  - GET: ?domain=...&user=optional (list or specific)
  - POST: { domain, ...CreateUserRequest }
- /api/netsapiens/devices
  - GET: ?domain=...&user=... (list)
  - POST: { domain, user, ...CreateDeviceRequest }

Notes:
- Reuse existing rate-limit + retry helper; reuse masking pattern for any password fields
- Use zod.extend() on request schemas to add domain/user at route layer (pattern used in /phonenumbers)

### 3.2 Adtran Foundations

Create src/lib/adtran/ssh.ts
- connectSSH({ host, username, password, enablePassword?, timeoutMs? }): Promise<SSHSession>
- SSHSession API:
  - run(cmd: string): Promise<{ code: number; stdout: string; stderr: string }>
  - runPrivileged(cmd: string): elevates via enablePassword if provided; otherwise run
  - close(): Promise<void>
- Implement limited retry with jitter on transport errors; default timeouts ~20s per command

Create src/lib/adtran/parse.ts
- parseShowVersion(text: string): { aosVersion: string; major: number; minor: number; patch?: string }
- parseRunningConfig(text: string): { fxsUsers: Array<{ user: string; did?: string }>; trunks: Array<{ name: string }>; raw: string }
- Keep tolerant; focus on extracting version string and any clear FXS user markers; leave passthrough raw

Create src/lib/adtran/render.ts
- renderConfigAfter(input: {
  parsed: ReturnType<typeof parseRunningConfig>
  ns: {
    connection?: { username: string; password?: string }
    users: Array<{ user: string; devicePassword?: string }>
  }
}): { text: string; deltas: string[] }
- Preserve unrelated config; append or replace stanzas required for PRI routing to NetSapiens

Create src/lib/adtran/diff.ts
- unifiedDiff(before: string, after: string): string (or return structured hunks)

Add API routes
- /api/adtran/fetch-config (POST)
  - Request: { ip: string }
  - Actions: SSH run `show version`, `show running-config`, optionally `show sip trunk-registration`
  - Response: {
      device: { aosVersion: string, gates: { blocked: boolean, reason?: string, recommended: string } },
      raw: { version: string, runningConfig: string },
      parsed: { ...from parse.ts }
    }
  - Gate policy from env: MINIMUM_OS_MAJOR=13, RECOMMENDED_OS_VERSION=R13.12.0.E, STRICT_OS_GATING=false

- /api/adtran/plan (POST)
  - Request: { parsed, nsState: { connection, users }, policy?: { strict?: boolean } }
  - Response: { afterText: string, diff: string, deltas: string[] }

- /api/adtran/apply-config (POST)
  - Request: { ip: string, deltas: string[] }
  - Actions: SSH apply line-by-line (or via a candidate config block), write memory, verify registration
  - Response: { ok: boolean, commandsRun: number, wroteMemory: boolean, verify?: Record<string,unknown> }

### 3.3 Submit-time Automation Branching (UI)

In src/components/migration-form.tsx, update submit flow (without removing CSV generation):
- For sip-trunk:
  1) Ensure NS domain (create if allowed via feature flag)
  2) Ensure NS connection (derive username from ShadowDB sipUsername; if missing, require manual input)
  3) Assign numbers to connection via /api/netsapiens/phonenumbers (application: 'to-connection')
  4) Generate Metaswitch CSV; optionally offer NS CSV

- For pri:
  1) ShadowDB lookup already present (contactIp, sipUsername)
  2) Ensure NS domain
  3) Ensure NS connection (capture username/password via getConnection after create)
  4) Ensure NS users and devices for each FXS target; capture device passwords
  5) Assign numbers to users (application: 'to-user', destination host=user domain)
  6) Call /api/adtran/fetch-config, present OS gate and parsed insights
  7) Call /api/adtran/plan, present diff with masked secrets; require explicit approve
  8) If approved and gate allows, call /api/adtran/apply-config
  9) Always generate Metaswitch CSV; optional NS CSV

Add small, incremental UI panels to avoid blocking Codex’s current form structure (insights panels already exist).

## 4) Technical Specifications

- Environment variables (extend .env)
  - NS_API_BASE_URL, NS_API_KEY
  - DB_* (read-only) for ShadowDB
  - ADTRAN_SSH_USER, ADTRAN_SSH_PASS, ADTRAN_ENABLE_PASS
  - MINIMUM_OS_MAJOR=13, RECOMMENDED_OS_VERSION=R13.12.0.E, STRICT_OS_GATING=false
  - ALLOW_DOMAIN_CREATE=false (feature-flag)

- Error handling
  - NetSapiens: Keep current 429 backoff; surface masked credential info only
  - SSH: Retry on transient ECONNRESET/ETIMEDOUT up to 3 attempts with jitter; hard timeout per command
  - API routes: Return 4xx for validation errors (Zod), 5xx with a generic message; log details server-side only

- Data contracts (minimum required fields)
  - Phone number create/update (already in src/lib/netsapiens.ts) — reuse
  - Users/Devices: define Zod schemas as passthrough with the exact fields you use; confirm exact field names using the examples in NetsapiensAPIReferenceAndExamples/

- Idempotency
  - Always check existence before create (domain/connection/user/device/number)
  - After create where synchronous:'yes' is used, re-query to confirm and capture secrets if applicable

## 5) Testing Requirements

- Unit tests
  - adtran/parse.ts: version parsing, minimal FXS extraction (fixtures from lab text samples)
  - adtran/render.ts: deterministic config generation given fixed parsed + ns inputs
  - netsapiens.ts: users/devices list/create mappings and masking

- Integration tests (safe)
  - /api/shadowdb/lookup against read-only DB (no writes)
  - NetSapiens client using nock: domains/connections/users/devices/phonenumbers success + error cases

- Playwright E2E (dev server)
  - Use the provided Playwright MCP JSON (see below). Spin the app locally in Docker or pnpm dev, then:
    - Validate Migration Type branching UI (sip-trunk vs pri)
    - Validate insights (binding → contact IP; domain existence; numbers listing)
    - For PRI, stub /api/adtran/* to return canned results; validate gating and diff surfaces

Playwright MCP JSON to enable Playwright tool usage:

```json
{
  "mcpServers": {
    "Playwright": {
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@latest"
      ]
    }
  }
}
```

Note: Any Netsapiens calls should point at the sandbox instance; ShadowDB remains read-only.

### 5.1 Addendum: Real‑world Adtran testing scope (Lab only)

For any testing that executes real SSH commands against an actual Adtran device:

- Scope restriction
  - Only target the lab Adtran device at IP 8.2.147.30.
  - Do not connect to or modify any customer Adtrans during development or testing.

- Default behavior (safe)
  - E2E tests should stub /api/adtran/* by default.
  - Real‑device tests must be opt‑in via explicit environment flags.

- Required environment flags for live device tests
  - TEST_LIVE_ADTRAN=true
  - ADTRAN_TEST_IP=8.2.147.30
  - ALLOW_ADTRAN_APPLY=false (keep apply disabled unless performing supervised lab drills)

- Server‑side guards (recommendation for /api/adtran/* routes)
  - Reject any request where TEST_LIVE_ADTRAN !== 'true'.
  - Reject any request where ip !== '8.2.147.30' for live tests.
  - Keep /api/adtran/apply-config hard‑disabled unless ALLOW_ADTRAN_APPLY === 'true' AND ip === '8.2.147.30'.

- Allowed commands during live lab tests
  - Non‑mutating only: `terminal length 0`, `show version`, `show running-config`, `show sip trunk-registration`.
  - Do not enter configuration mode or write memory during routine tests.
  - Apply (config changes) may only be executed during supervised lab sessions with ALLOW_ADTRAN_APPLY=true.

- Redaction & logging
  - Mask any credentials (only last 4 chars visible) in logs and UI.
  - Do not store raw configs containing secrets; keep in ephemeral memory unless explicitly needed for diff display.

- CI/Local guidance
  - Keep CI on stubbed mode (no SSH). For local manual verification, set the flags above and run against 8.2.147.30 only.
  - Document in test README how to enable/disable live lab tests.


## 6) Potential Issues & Watchouts

- NetSapiens endpoint shapes can vary (e.g., GET connection by pattern returning an array). Keep Zod schemas tolerant (passthrough) and map only fields you use.
- Domain existence via /domains/count may differ by deployment; fall back to list and filter by domain if needed.
- Device password visibility varies; ensure masking and never log full secrets.
- Adtran SSH prompts (enable password) and terminal paging — disable paging if required (e.g., `terminal length 0`) before `show running-config`.
- Config variations across AOS versions — parsing must be resilient; when unknown, surface raw text and allow manual review.
- STRICT_OS_GATING=true must block apply; otherwise warn but allow user to override.
- UI race conditions on debounced lookups — existing pattern already guards; continue using AbortController and staleness checks.

---

By following this guide, Codex can implement the missing PRI workflow components and submit-time automation branching with minimal disruption to the existing foundations. Keep changes incremental, preserve CSV generation, and prioritize idempotent, masked, and read-only-safe behavior wherever applicable.


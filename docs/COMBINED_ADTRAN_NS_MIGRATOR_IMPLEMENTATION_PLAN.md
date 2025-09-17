# Combined SIP Migrator + Adtran/Netsapiens Automation — Implementation Plan

Status: Draft for coding handoff (feature/combined-adtran-ns-migrator)
Owner: SIP Migrator project (Next.js App Router, TypeScript)

## 1) Scope and Outcomes

- Preserve existing capability to generate the Metaswitch CSV (unchanged).
- Replace the "Netsapiens CSV only" approach with live automation against Netsapiens v2 APIs to create/update:
  - Domain (if missing; optional based on feature flag)
  - SIP Connection (PRI/SIP Trunk) and retrieve credentials
  - Users (FXS) and logical Devices (FXS), retrieving device passwords
  - Phone Numbers: add or update and assign to FXS users or to the trunk connection
- Optional: also generate a Netsapiens CSV for download if the user prefers manual import.
- PRI-only steps: discover Adtran IP from ShadowDB, SSH to retrieve config and version, gate Apply by OS version, render updated config, optionally push via SSH.

Deliverable: A guided workflow that yields the same end-state as manual Netsapiens CSV import plus PRIs updated on Adtran, with OS-gated safety.

## 2) High-level Flow (UI + API)

1. User selects SIP Binding (existing control) and Migration Type: "SIP Trunk" or "PRI".
2. If PRI:
   - ShadowDB lookup: find binding’s Adtran IP (contact-IP); show lab validation if present.
   - SSH to Adtran: fetch `show version`, `show running-config`, `show sip trunk-registration`.
   - Parse AOS version; show gate status:
     - Block if major < 13.
     - Warn if 13.x but not R13.12.0.E; allow unless STRICT_OS_GATING=true.
3. Common (both types): Netsapiens phase
   - Domain: check existence; create if allowed and missing (synchronous: yes).
   - Connection: ensure PRI/SIP connection exists, using baseinformation_sipusername as `connection-sip-registration-username`; then GET specific connection to retrieve `connection-sip-registration-password`.
   - Phone numbers: create/update and assign to either FXS users (to-user) or the trunk (to-connection).
4. PRI-only
   - FXS Users: ensure users exist; ensure logical devices exist; capture `device-sip-registration-password`.
   - Render “after” Adtran config preserving fax and key options; present masked diff.
   - If approved and gate passes: apply over SSH, write memory, force-register, verify.
5. Summary report of all actions (domain/connection/users/devices/numbers) and artifacts (CSV(s), config diff, logs).

## 3) Netsapiens v2 API — Endpoints & Shapes

References: NetsapiensAPIReferenceAndExamples/

- Domains
  - GET /ns-api/v2/domains?limit=1000 (example: getDomains)
  - POST /ns-api/v2/domains (example: createDomain) — supports synchronous:'yes'
  - Existence shortcut: countDomain (returns { total: 0|>0 }) if available in SDK
- Connections
  - GET /ns-api/v2/domains/{domain}/connections (list)
  - GET /ns-api/v2/domains/{domain}/connections/{connection-orig-match-pattern} (specific) → contains `connection-sip-registration-username/password`
  - POST /ns-api/v2/connections (create)
- Users
  - GET /ns-api/v2/domains/{domain}/users (list)
  - POST /ns-api/v2/domains/{domain}/users (create) — supports synchronous:'yes'
- Devices (logical)
  - GET /ns-api/v2/domains/{domain}/users/{user}/devices
  - POST /ns-api/v2/domains/{domain}/users/{user}/devices — supports synchronous:'yes' and returns `device-sip-registration-password`
- Phone Numbers (Domain level)
  - GET /ns-api/v2/domains/{domain}/phonenumbers (example: getDomainPhonenumbers)
  - POST /ns-api/v2/phonenumbers (example: createPhonenumber)
  - PATCH /ns-api/v2/domains/{domain}/phonenumbers/{phonenumber} (example: updatePhonenumber)
  - Dial rules:
    - to-user → set translation user to the FXS user, host to domain
    - to-connection → set translation to the trunk’s match pattern/host

Note: Use example request bodies verbatim as baseline. Validate responses and coerce types where needed (Zod).

## 4) ShadowDB (PostgreSQL) — Lookups

Table: meta_configuredsipbinding (confirm via information_schema)
- Key fields used:
  - baseinformation_name (binding name)
  - baseinformation_contactipaddress (Adtran IP candidate)
  - baseinformation_proxyipaddress, baseinformation_mediaipaddress, baseinformation_additionalinboundcontactipaddresses (fallbacks)
  - baseinformation_sipusername (used for Netsapiens connection username)

Queries (parameterized, read-only):
- Introspect columns from information_schema.columns
- Lookup by binding (case-insensitive) to retrieve sipusername and contact IP

## 5) Modules and API Surface (App Router)

- src/lib/shadowdb.ts
  - getConfiguredSipBinding(binding: string) → { name, contactIp?, proxyIp?, mediaIp?, additionalInboundIps?, sipUsername? }
- src/lib/netsapiens.ts
  - Wraps fetch with bearer auth; helpers for domains, connections, users, devices, numbers
  - Zod schemas for request inputs and response outputs
- src/lib/adtran/
  - ssh.ts — ssh2 helpers (connect, run, parse outputs)
  - parse.ts — parse running-config and show version → { aosVersion, trunks, groupedTrunks, fxsUsers }
  - render.ts — generate after config text from parsed + NS secrets
  - diff.ts — line-oriented diff
- src/lib/secrets.ts — mask helpers (only last 4 chars visible)
- src/lib/logger.ts — pino

API routes
- /api/shadowdb/lookup (POST { binding }) → { ip, sipUsername, ... }
- /api/netsapiens/domains (GET/POST wrappers)
- /api/netsapiens/connections (GET list/GET specific/POST)
- /api/netsapiens/users (GET/POST)
- /api/netsapiens/devices (GET/POST)
- /api/netsapiens/phonenumbers (GET domain / POST create / PATCH update)
- /api/adtran/fetch-config (POST { ip }) → { raw, parsed, device: { aosVersion } }
- /api/adtran/plan (POST { parsed, nsState }) → { afterText, diff, deltas }
- /api/adtran/apply-config (POST { ip, deltas })
- /api/generate (existing Metaswitch CSV)
- /api/netsapiens/export (optional CSV builder to mirror previous importer)

## 6) UI / UX Plan

- Extend existing form with:
  - Migration Type selector: SIP Trunk | PRI
  - Binding selection (existing)
  - Domain selection / entry
- Flow panels (conditionally shown):
  - PRI → ShadowDB Discovery (binding → contact IP)
  - PRI → Adtran Discovery (version, running-config, registration)
  - Netsapiens: Domain/Connection ensure
  - PRI → FXS Sync (users, devices) + capture device passwords
  - Phone Numbers: add/update, assignment rules per migration type
  - Review & Apply (diff view; masked secrets; Apply Now gated)
- Feedback: toasts, inline errors, progress spinners; OS gate status chips (green/yellow/red)

## 7) Configuration & Security

.env (superset; do not log secrets):
- NS_API_BASE_URL, NS_API_KEY
- DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD (read-only)
- ADTRAN_SSH_USER, ADTRAN_SSH_PASS, ADTRAN_ENABLE_PASS
- MINIMUM_OS_MAJOR=13, RECOMMENDED_OS_VERSION=R13.12.0.E, STRICT_OS_GATING=false
- ALLOW_DOMAIN_CREATE=false
- NS_CORE_SERVER=core1-ord.grid4voice.ucaas.tech (if needed for defaults)

Security & privacy
- Mask secrets in logs (only last 4).
- Never echo full credentials to UI; use masked previews.
- Only parameterized SQL; read-only DB.

## 8) Behavioral Details & Edge Cases

- SIP Trunk path: skip Adtran; still ensure domain/connection; numbers assigned to connection (to-connection)
- PRI path: ensure users/devices; numbers to-user; set Caller ID per requirement; create devices synchronous to obtain passwords
- Connection username: from ShadowDB baseinformation_sipusername; then GET specific connection to retrieve password
- Phone numbers:
  - Existing numbers → PATCH updatePhonenumber
  - New numbers → POST createPhonenumber (returns 202 Accepted)
- Idempotency:
  - Check existence before create
  - Re-query after create when synchronous returns are not guaranteed
- Error handling:
  - Netsapiens 429 → respect Retry-After and backoff
  - SSH transient failures → limited retries with jitter
  - OS version unknown → treat as block; allow Download Config only

## 9) Testing Strategy

- Unit
  - shadowdb.ts query builders & coercion
  - netsapiens.ts: request building and Zod parsing (use nock fixtures from examples)
  - adtran/parse.ts: version extraction, FXS parsing (fixtures from lab configs)
  - adtran/render.ts: deterministic output from known parsed inputs
- Integration (safe)
  - Read-only ShadowDB lookup against lab if available
  - Netsapiens client against recorded nock fixtures for domains/connections/users/devices/numbers
- E2E (optional later)
  - Narrow smoke flow that stops before SSH apply; validates UI gates and NS calls

## 10) Milestones & Tasks

M1: Foundations
- Implement src/lib/shadowdb.ts and /api/shadowdb/lookup
- Implement src/lib/netsapiens.ts (domains, connections list/get/create)
- UI: add Migration Type control; wire basic submission and results display

M2: Phone numbers & Domain
- Implement get/add/update phone numbers endpoints
- Implement createDomain + existence checks
- Optional: /api/netsapiens/export to build NS CSV for download

M3: PRI FXS sync
- Implement users/devices create (synchronous) and re-query
- Surface collected passwords in masked form to planner

M4: Adtran integration
- Implement /api/adtran/fetch-config, parse, OS gating
- Implement render and diff; present in UI; prepare deltas

M5: Apply & Verify
- Implement /api/adtran/apply-config (gated); write memory; force-register; verify
- Final summary modal and artifact links

M6: Tests & polish
- Unit + integration test coverage
- Error states, logging, masking, performance passes

## 11) Open Questions / Decisions

- Domain auto-create default? (proposed: feature-flag ALLOW_DOMAIN_CREATE=false by default)
- Mapping rules for Caller ID per FXS user (source of truth for number → user mapping)
- Optional bulk mode later (multi-binding CSV input)

## 12) Handoff Notes

- Branch created locally: feature/combined-adtran-ns-migrator
- On start, scaffold src/lib/netsapiens.ts with typed helpers and Zod models using examples in NetsapiensAPIReferenceAndExamples/ verbatim as initial shapes.
- Preserve existing Metaswitch CSV generation path; add optional NS CSV export endpoint mirroring legacy importer format.


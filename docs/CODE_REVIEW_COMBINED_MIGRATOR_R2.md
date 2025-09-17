# Code Review — Combined SIP Migrator + Adtran/NetSapiens Automation (Round 2)

Branch: feature/combined-adtran-ns-migrator
Scope: Read-only review focused on newly added Adtran foundations, NetSapiens users/devices, shared secrets masking, and lab-guarded routes.

## 1) Architecture Review

New modules and routes align with the implementation guide and prior review:
- Adtran libs (new)
  - src/lib/adtran/ssh.ts — SSH session wrapper (exec/shell), retries + jitter, timeouts
  - src/lib/adtran/parse.ts — tolerant parsers for `show version` and `running-config`
  - src/lib/adtran/render.ts — renderer + delta/commands generation from parsed config + NS state
  - src/lib/adtran/diff.ts — unified diff using `diff`
- Adtran API (lab-guarded)
  - /api/adtran/fetch-config — terminal length 0, show version, show running-config, show sip trunk-registration; OS gating; masks outputs
  - /api/adtran/plan — plans after-text and diff from parsed + NS state; masks outputs
  - /api/adtran/apply-config — strict gating; builds config blocks; runs privileged; write memory; verify
- Shared masking
  - src/lib/secrets.ts — `maskSecret`, `maskSensitiveTokens` used across Adtran routes and device serialization
- NetSapiens expansion
  - Users/devices client + routes with masking and schema tolerance
  - Client improvements: domain existence fallback, connection single-or-array tolerance, accepted 202 normalization
- Tests
  - tests/unit/netsapiens.test.ts — broad coverage of client behaviors (domains, connections, users, devices, numbers)
- Dependencies
  - package.json — added ssh2 and diff

Assessment vs plan
- Adtran foundations (fetch/plan/apply) implemented with strong guardrails — matches NEXT_PHASE_GUIDE_PRI_ADTRAN_NS.md §5.1
- NetSapiens users/devices foundations implemented per §3.1; masking applied
- Client hardening implemented per prior recommendations
- Next major step remains: UI submit-time branching and E2E scaffolding

## 2) Code Quality Analysis

- TypeScript + Zod: Strong, consistent schemas and tolerant parsing; single-or-array patterns for GET-by-id cases; accepted response normalization for 202s; good mapping isolation.
- Error handling: Clear 400/403/500 splits; logs for non-zero device command codes; `NetsapiensError` provides status/body; retries/backoff with 429 handling.
- Security/masking: `maskSecret` used in logs/serializers; `maskSensitiveTokens` scrubs passwords in device outputs and diffs; Adtran routes enforce lab-only access and apply gating.
- Performance: Sensible timeouts; retry with exponential backoff; minimal allocations in parsers; streaming not needed in these paths.

Notable quality points
- ssh.ts uses shell mode for privileged multi-line blocks; good for `configure terminal` sequences
- render.ts cleanly computes deltas and command sets; separates trunk cred update and user device-password update
- parse.ts resilient to format variations using regexes; returns structured minimal state

## 3) API Design Review

- fetch-config (POST): Validates ip, enforces lab, runs fixed show commands, returns { device.gates, raw, parsed }. Good separation of concerns.
- plan (POST): Pure transform endpoint; returns masked afterText + diff + deltas. Good purity for testing.
- apply-config (POST): Strict gating (lab + ALLOW_ADTRAN_APPLY), privileged multi-line config blocks, memory write + verify snapshot. Good operational safety.
- users/devices: Mirrors domains/connections/phone numbers route style; POST returns 201; GET supports list and by-id (users route supports optional user param). Proper masking of device password.

HTTP semantics
- 403 on lab guard violations is appropriate; 400 on validation; 500 on internal.
- 201 on create (users/devices), 200 on other successes; 202 handling stays inside client.

## 4) Integration Points

- ShadowDB unaffected in this round; prior read-only guarantees remain.
- NetSapiens client now includes users/devices; routes import schemas directly from client to ensure consistency.
- Adtran pipeline: fetch-config → plan (with NS state) → apply-config; all lab-guarded and masked.

## 5) Testing Coverage

- Present: tests/unit/netsapiens.test.ts exercises most client paths including new tolerances.
- Missing: adtran/parse and adtran/render unit tests; route-level integration tests for /api/adtran/* (with ssh mocked).
- Missing: Playwright E2E stubs with /api/adtran/* defaulted to stubbed responses; UI submit branching not implemented yet.

## 6) Specific Recommendations (with file/line refs)

1) Validate IP format
- Files: src/app/api/adtran/fetch-config/route.ts (lines 8–12), apply-config/route.ts (lines 21–28)
- Issue: `ip` is only `min(1)`; should validate IPv4 explicitly to avoid accidental non-lab hosts via DNS.
- Action: `z.string().ip({ version: 'v4' })` or a strict IPv4 regex; still compare to ADTRAN_TEST_IP.

2) Secrets masking breadth
- File: src/lib/secrets.ts (lines 11–18)
- Issue: Only masks generic `password <token>`; Adtran may show "enable password" or other secret-bearing lines.
- Action: Expand regex to include `enable password`, `sip-identity ... password`, and generic token-like secrets; ensure case-insensitivity and minimal false positives.

3) Apply-config logging context
- File: src/app/api/adtran/apply-config/route.ts (lines 128–135)
- Issue: We log stderr and code (good), but success path could log a concise summary (commandsRun, wroteMemory) at info level.
- Action: Add `log('Adtran apply summary', { ip, commandsRun, wroteMemory })` before return.

4) SSH session safety
- File: src/lib/adtran/ssh.ts
- Observation: `run` and `runPrivileged` log the command; sensitive payloads are only in passwords (masked). Good.
- Action: Add minor guard to avoid logging commands that include raw passwords when building blocks manually (future-proof if calls expand).

5) NetSapiens client: existence fallbacks and tolerance
- File: src/lib/netsapiens.ts
- Good: Implemented `domainExists` fallback (lines 537–551); getConnection tolerates array/object (lines 572–602); accepted 202 normalization (lines 504–514).
- Action: None required now; keep schemas .passthrough() to tolerate new fields.

6) Route response shapes
- Users (src/app/api/netsapiens/users/route.ts): returns `{ user: ... }` for GET-by-id and `{ users: [...] }` for list (lines 27–37). Consistent; document in the guide.
- Devices (src/app/api/netsapiens/devices/route.ts): device serializer masks password and adds `hasPassword` (lines 22–26). Good.

7) .env.example update
- Ensure all new envs are documented: ADTRAN_SSH_USER, ADTRAN_SSH_PASS, ADTRAN_ENABLE_PASS, TEST_LIVE_ADTRAN, ADTRAN_TEST_IP, ALLOW_ADTRAN_APPLY, MINIMUM_OS_MAJOR, RECOMMENDED_OS_VERSION, STRICT_OS_GATING.

## 7) Compliance Check

- Linus Standard: Code remains straightforward and obviously correct; minimal cleverness; clear mapping/transform layers.
- Separation of Concerns: Adtran SSH/parse/render/diff cleanly isolated; routes thin and focused; masking centralized.
- Security (lab-only + masking): Guardrails enforced in both fetch and apply; passwords masked in logs and responses.

## 8) File/Line Highlights

- src/lib/adtran/ssh.ts — retries and jitter: 197–205; privileged shell pipeline: 183–190, 124–145
- src/lib/adtran/parse.ts — version parse: 27–41; running-config parse: 44–104
- src/lib/adtran/render.ts — user password update logic: 77–91; trunk credentials: 94–102
- src/lib/adtran/diff.ts — unifiedDiff: 3–13
- src/app/api/adtran/fetch-config/route.ts — OS gating: 24–53; lab guard: 55–68; masking: 119–123
- src/app/api/adtran/plan/route.ts — render + diff + masking: 50–68
- src/app/api/adtran/apply-config/route.ts — strict gating: 59–77; config blocks + write: 125–145
- src/lib/secrets.ts — masking helpers: 1–18
- src/lib/netsapiens.ts — domain fallback: 537–551; getConnection tolerance: 572–602; accepted response normalization: 504–514; users/devices schemas and mappers: 81–129, 481–502
- src/app/api/netsapiens/users/route.ts — list and by-id handling: 23–37; create: 47–65
- src/app/api/netsapiens/devices/route.ts — serializer with masking: 22–26; create: 43–61

---

Summary
- The Adtran foundation and lab-guarded routes are implemented cleanly and safely. NetSapiens users/devices and client hardening are in place.
- Next priority: UI submit-time branching (SIP Trunk vs PRI), plus tests for adtran parse/render and adtran routes (with SSH mocked) and Playwright stubs.


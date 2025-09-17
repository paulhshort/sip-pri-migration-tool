# Testing Guide

This repository uses PNPM, TypeScript, Vitest, and Playwright (planned) with strict repository rules in `.augment/rules/AGENTS.md` and `.augment/rules/CLAUDE.md`.

## Commands

- Lint: `pnpm lint`
- Type-check: `pnpm type-check`
- Unit tests (all): `pnpm test`
- Targeted unit tests:
  - Adtran parsers: `pnpm test -- tests/unit/adtran-parse.test.ts`
  - Adtran renderer: `pnpm test -- tests/unit/adtran-render.test.ts`
  - Adtran routes (SSH mocked): `pnpm test -- tests/unit/adtran-routes.test.ts`
  - Netsapiens suite (example): `pnpm test -- tests/unit/netsapiens.test.ts`

Notes:
- Lint/type-check operate across the repo; unrelated warnings/errors may appear. Prefer targeted tests for quick feedback.
- Tests are expected to run without live network calls. SSH is mocked in route tests.

## Lab-only Adtran testing

Live device access is strictly limited to the lab device and gated by env flags. Never connect to customer equipment during development.

Required environment (see `.env.example`):

- `TEST_LIVE_ADTRAN=true`
- `ADTRAN_TEST_IP=8.2.147.30`
- `ALLOW_ADTRAN_APPLY=false` (enable only for supervised lab runs)
- `MINIMUM_OS_MAJOR=13`
- `RECOMMENDED_OS_VERSION=R13.12.0.E`
- `STRICT_OS_GATING=false`

API routes enforce:
- IP allowlist (`ADTRAN_TEST_IP`)
- Apply gating (`ALLOW_ADTRAN_APPLY`)
- Secret masking for outputs (`maskSensitiveTokens`)

## Expectations in tests

- IPv4 validation: endpoints must reject non-IPv4 addresses with HTTP 400.
- Secret masking: passwords, enable passwords, and SIP identity passwords are masked. Token patterns are scrubbed in diffs and raw outputs.
- Apply route: requires `ALLOW_ADTRAN_APPLY=true`; otherwise returns 403.
- SSH operations in tests: use mocks; do not perform real connections.

## Playwright (planned)

Playwright stubs should be used by default for `/api/adtran/*`. Provide an opt-in path (via env flags) for supervised lab runs. Do not add dependencies until Playwright tests are implemented in this repo.

Suggested smoke scenarios (once added):
- Migration type switching (SIP Trunk vs PRI)
- PRI planning screen renders masked diff/deltas; Apply disabled by default
- CSV-only flow preserved when automation flag is off

## Feature flags

- `NEXT_PUBLIC_ENABLE_AUTOMATION`: when not set to `'true'`, the UI must preserve the current CSV-only workflow. When enabled, PRI branching should call fetch-config then plan and display masked diff/deltas; Apply remains disabled by default.

## Safety

- No secrets in logs. Use `maskSecret` and `maskSensitiveTokens` consistently.
- Keep all SQL parameterized. ShadowDB access remains read-only.
- Follow repository rules in `.augment/rules/AGENTS.md` and `.augment/rules/CLAUDE.md`.


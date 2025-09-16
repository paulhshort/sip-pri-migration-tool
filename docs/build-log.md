# Build Log

## 2025-09-16
- 19:30 EDT: Implemented ShadowDB lookup helper and NetSapiens client wrappers with Zod validation and retry handling.
- 19:30 EDT: Added `/api/shadowdb/lookup` and `/api/netsapiens/domains` routes plus Migration Type selector in the UI form.
- 19:31 EDT: Documented new environment variables in `.env.example` and added unit tests for ShadowDB and NetSapiens modules.
- 19:31 EDT: Tests: `pnpm test -- tests/unit/netsapiens.test.ts tests/unit/shadowdb.test.ts`

- 19:36 EDT: Extended NetSapiens client with phone number helpers and domain existence utility; added API routes for domain existence checks and phone number CRUD.
- 19:36 EDT: Tests: `pnpm test -- tests/unit/netsapiens.test.ts`

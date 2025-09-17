# Commit Review – 2025-09-17

## Recent Commits
- b525e03 fix(pri): fetch running-config via single interactive shell to avoid one-channel SSH servers
- e4ace4a fix(adtran): fallback to interactive shell when exec is disabled
- bec77c7 fix(adtran): allow legacy SSH algorithms to connect to AOS R13 devices; resolve handshake kex mismatch
- e9551f5 feat(api): add SIP/PRI automation orchestrator; SIP assigns DIDs, PRI provisions users/devices and renders plan
- 723ae58 feat: add NetSapiens user and device provisioning endpoints
- 64a38d6 feat: surface NetSapiens insights in migration flow
- 33a61be feat: add NetSapiens phone number endpoints
- 0b8d55e feat: add Netsapiens and ShadowDB foundations
- fe7ccbc Optimizes and refines form auto-save logic
- 5b50f39 Enhances build processes, component stability, and test coverage

## Key Findings

### Critical
- **Interactive shell always reports success** – `createShellPromise` hard-codes `code: 0`, so any failure in the interactive channel (including bad enable password, rejected commands, or paging prompts) is silently treated as success. Downstream checks like `runCfg.code !== 0` in the automation flow can never fire. `src/lib/adtran/ssh.ts:123-128`

### High
- **`show running-config` still paginated** – `/api/adtran/fetch-config` calls `session.run('terminal length 0')` and then opens a new exec channel for `show running-config`; on NetVanta devices the pager resets per session, so the result is likely truncated with `--More--` prompts when exec is prohibited and the fallback shell is used. Combine the commands in a single privileged shell. `src/app/api/adtran/fetch-config/route.ts:66-78`
- **Batch device rollback reports false successes** – After a failure, `batchCreateDevices` rolls back the devices it just created but leaves them listed in `result.successes`, so callers believe provisioning succeeded even though the entries were deleted. `src/lib/netsapiens.ts:823-890`
- **PRI plan generator never injects NetSapiens state** – The UI’s “Generate PRI Plan” button submits `{ nsState: {} }`, so the rendered diff will always be empty even after provisioning data is available; the feature cannot surface the credentials it promises. `src/components/migration-form.tsx:444-493`
- **Rendered Adtran config assumes SIP identity matches user ID** – When a `sip-identity` line is missing, the renderer synthesises one using the voice user as both identity and auth-name, ignoring the parsed `sipIdentity` and `authName`. This can introduce duplicate registrations with the wrong identity. `src/lib/adtran/render.ts:77-88`

### Medium
- **Automation response drops the plan payload** – The API returns `{ plan: … }`, but the UI type omits it and `onSubmit` never passes the plan to state, so operators cannot review diff/deltas after a full automation run. `src/components/migration-form.tsx:21-37` & `src/components/migration-form.tsx:532-579`
- **Dial policy constant typo** – PRI user provisioning hard codes `'US & Canada'`, whereas existing routes and fixtures use `'US and Canada'`. If the ampersand variant is absent in production tenants the API will reject the request. `src/app/api/automation/run/route.ts:170-189`
- **`checkUserExists` treats 404 as fatal** – If the NetSapiens API responds with 404 (common for missing users), the helper rethrows and the batch flow records an error instead of cleanly marking the entry as skipped. Consider interpreting status 404 as “not found.” `src/lib/netsapiens.ts:745-753`
- **Trunk credential update only touches the first parsed trunk** – Multi-trunk configs will update whichever trunk happens to be first in the running-config, not the binding that triggered automation. `src/lib/adtran/render.ts:94-101`

### Low / Documentation
- **Testing guide references non-existent suites** – The new `docs/TESTING.md` lists Vitest files (`tests/unit/adtran-parse.test.ts`, `adtran-render.test.ts`, etc.) that are not present, which will mislead contributors. `docs/TESTING.md:12-20`
- **`docs` vs `Docs-MetaswitchShadowDB` duplication** – ShadowDB reference material now lives in both `docs/` and `Docs-MetaswitchShadowDB/`. Consolidate to avoid divergent updates.

## Suggested Next Steps
1. Capture command failures from interactive shells (return the last CLI prompt, parse for `%` errors, and surface non-zero status) before building on additional automation.
2. Rework fetch/plan flows to reuse a single privileged shell session and feed the resulting diff back into the UI.
3. Adjust batch device provisioning to track rolled-back entries separately (or mark them as errors) so callers can retry deterministically.
4. Incorporate parsed SIP identity/auth data when rendering Adtran updates, and allow trunk selection instead of assuming the first entry.
5. Update documentation to reflect the current test suite and collapse duplicate ShadowDB guides.

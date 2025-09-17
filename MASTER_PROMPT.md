Adtran_NS_Updater — Master Agent Prompt (Authoritative Build Spec)

Read this first

- Code workspace: Use the existing project folder Adtran_NS_Updater in the repository root. All code goes here.

- Reference packs to consult (must read):
  
  - NetsapiensAPIReferenceAndExamples/ — curated v2 API endpoints, SDK usage, and working examples provided
  - Docs-MetaswitchShadowDB/ — schema notes and query examples for fetching Adtran IPs
  - Portal_ref_screenshots/ — current portal UI references for consistency cues
  - UI_STYLE_GUIDE_AND_ARCHITECTURE.md — styling tokens, design system, app architecture. Follow it for all UI.

- Lab device for end-to-end testing:
  
  - Adtran (Metaswitch-like starting point)
  - IP: 8.2.147.30
  - Username: rancid
  - Password: platinum-gold
  - Enable: g4cr00ks

Mission and scope

- Build a full-stack tool that:
  - Fetches a customer’s Adtran IP from the Metaswitch ShadowDB
  - Logs into the Adtran via SSH, retrieves its running config, and parses it
  - Intelligently maps/creates Netsapiens domain/connection/users/devices as needed
  - Re-queries Netsapiens to retrieve the authoritative secrets:
    - PRI/SIP connection registration password
    - device-sip-registration-password for each FXS device
  - Generates the “after” Adtran config, preserving FAX options, and updates FXS and trunk lines
  - Presents a clear before/after diff, provides Apply Now and Download Config options
  - Pushes config over SSH on approval, force-registers, verifies, and logs everything

Non-goals for this phase

- CI/CD, load tests, packaging, and non-critical ops topics
- Multi-tenant RBAC or portal integration beyond minimal auth

High-level workflow (the “query, provision-if-needed, query-secrets” pattern)

1) Identify device and retrieve ground truth
- Input: Customer name, ID, or known key recognized by ShadowDB. Provide a fuzzy search field in UI.
- Query ShadowDB for the Adtran IP.
- SSH into Adtran, run:
  - enable
  - terminal length 0
  - show running-config | begin T01
  - show sip trunk-registration
- Treat the running-config as the source of truth for trunks, grouped-trunks, and FXS users.
2) Parse and classify
- Parse voice trunk Txx blocks, grouped-trunks, and voice user records.
- Classify FXS users:
  - Normal vs FAX based on modem-passthrough, t38, codec-list fax, etc.
- Map FXS port connect fxs 0/N to Netsapiens user extension 100N
  - First name: FXS
  - Last name: N (port number)
  - Example: connect fxs 0/2 → user 1002, “FXS 2”
3) Prepare Netsapiens targets and perform discovery
- For the chosen Netsapiens domain (selectable in UI via fuzzy search):
  - Get users in domain
  - Get all connections in domain
  - If a PRI/SIP connection exists, fetch its registration credentials
- If missing items are detected:
  - Create missing connection(s)
  - Create missing users for each FXS port (synchronous: yes)
  - For each user, ensure a logical device exists (synchronous: yes)
- Re-query:
  - Fetch connection details containing connection-sip-registration-password
  - For each user/device, fetch device-sip-registration-password
- Use example code in NetsapiensAPIReferenceAndExamples to shape request bodies and confirm synchronous modes are supported for create endpoints.
4) Generate target Adtran config
- Transform from Metaswitch to Netsapiens targets with correct trunk servers, domain lines, grammar, trust-domain, and updated FXS sip-identity lines.
- Preserve FAX attributes. For normal users, set codec-list DEFAULT (or original).
- Maintain or update grouped-trunks (e.g., FXS-OUTBOUND → trunk T02; PRI-OUTBOUND → trunk T01) ensuring routing remains intact.
5) Present and apply
- Show a clean before/after diff in UI (per user and per trunk), plus a summary.
- Options:
  - Apply Now: Push the necessary config updates over SSH
  - Download Config: Save the generated “after” lines to a file
- After Apply:
  - sip trunk-registration force-register
  - show sip trunk-registration
  - Surface status and validation output in UI
6) Logging and audit/export
- Structured logs of all steps and outcomes
- Redact secrets in logs (show last 4 characters max)
- Export logs and final config as artifacts

Key references and example payloads

Netsapiens v2 endpoints (baseline)

- Base URL: https://{server}/ns-api/v2
- Auth: Authorization: Bearer {NS_API_KEY}

Connections

- Create a Connection (POST) /connections
- Get All Connections for a Domain (GET) /domains/{domain}/connections
- Get Specific Connection (GET) /domains/{domain}/connections/{connection-orig-match-pattern}

Users

- Get Users in Domain (GET) /domains/{domain}/users
- Create User in Domain (POST) /domains/{domain}/users
  - Supports synchronous: 'yes' to return the created entity immediately

Devices

- Get Devices for User (GET) /domains/{domain}/users/{user}/devices
- Create Logical Device for User (POST) /domains/{domain}/users/{user}/devices
  - Supports synchronous: 'yes' to return device-sip-registration-password

Use the attached examples verbatim for request shapes and expected response fields:

- NetsapiensAPIReferenceAndExamples/example-get-all-connections-for-a-domain.txt
- NetsapiensAPIReferenceAndExamples/example-get-specific-connection-for-a-domain.txt
- NetsapiensAPIReferenceAndExamples/example-create-a-connection-pri-trunk.txt
- NetsapiensAPIReferenceAndExamples/example-get-users-in-domain.txt
- NetsapiensAPIReferenceAndExamples/example-create-fxs-user-in-domain.txt
- NetsapiensAPIReferenceAndExamples/example-get-devices-for-user.txt
- NetsapiensAPIReferenceAndExamples/example-create-logical-device-for-user.txt

Important notes from examples

- Creating users/devices with synchronous: 'yes' returns the full record, which is needed to grab device-sip-registration-password on creation.
- Connections expose connection-sip-registration-username and connection-sip-registration-password, used for the Adtran PRI/SIP trunk T01 register/auth.
- Devices for FXS users expose device-sip-registration-password, used in the FXS sip-identity lines.

Metaswitch ShadowDB

- PostgreSQL credentials (store in .env; never hard-code in code):
  - DB_HOST=10.100.30.60
  - DB_PORT=5432
  - DB_NAME=shadow_config_db
  - DB_USER=shadowconfigread
  - DB_PASSWORD=TgOiNn1C
- Likely target table: meta_configuredsipbinding
  - Goal: fetch baseinformation_contactipaddress using a customer-identifying key, e.g., baseinformation_name
  - Example query (confirm against Docs-MetaswitchShadowDB):
    - SELECT baseinformation_contactipaddress FROM meta_configuredsipbinding WHERE baseinformation_name ILIKE $1 LIMIT 1;

Adtran device operations

- SSH with “enable” escalation:
  - Username: rancid
  - Password: platinum-gold
  - Enable: g4cr00ks
- Retrieval:
  - enable
  - terminal length 0
  - show running-config | begin T01
  - show sip trunk-registration
- After Apply:
  - sip trunk-registration force-register
  - show sip trunk-registration

Parsing and mapping rules

Adtran parsing

- Trunks:
  - Identify all voice trunk Txx type sip/isdn blocks
  - Identify sip-server primary, registrar primary, domain lines, authentication username/password, match dnis, grammar lines
- Grouped-trunks:
  - voice grouped-trunk <NAME> with trunk Txx and accept lines
- Users:
  - Blocks starting with voice user <DN>
  - Extract DN (directory number), connect fxs 0/N, sip-identity <user or DN> Tyy register auth-name "<>" password "<>"
  - Record fax flags: modem-passthrough, t38, no nls, no echo-cancellation, rtp delay-mode fixed, rtp dtmf-relay inband, codec-list fax
  - Record normal flags: codec-list DEFAULT or DEFAULT both, etc.
- FXS mapping:
  - connect fxs 0/N maps to Netsapiens user extension 100N
  - First name: FXS
  - Last name: N
- Keep original DN associated to the FXS user block for final “voice user <DN>” lines.

Netsapiens mapping

- Domain: chosen via UI (with fuzzy search and auto-populate)
- Connections:
  - If using an existing PRI/SIP connection, fetch connection-sip-registration-username and connection-sip-registration-password to populate trunk T01 register/auth
  - If creating a new connection, supply connection-orig-match-pattern and connection-term-match-pattern (e.g., sip*@grid4lab.pri) and ensure connection-sip-registration-* fields are set if registration is required
- Users:
  - Create user if not found:
    - user: 100N
    - name-first-name: FXS
    - name-last-name: N
    - Optional: login-username 100N@{domain}, time-zone US/Eastern, dial-policy US & Canada, dial-plan {domain}, voicemail settings as in examples
  - Devices:
    - Create a logical device for each user if missing; device naming can be 100Na or similar
    - Retrieve device-sip-registration-password via GET devices or synchronous create response

After config generation rules

- Trunk T01 (PRI/SIP to Netsapiens):
  - description "netsapiens"
  - sip-server primary <core server> (prefer registration.core-server from the connection; fall back to NS_CORE_SERVER env)
  - registrar threshold absolute 5
  - sip-header-passthrough both
  - no registrar require-expires
  - domain "<PRI realm or .pri domain>" (from connection or UI)
  - register <username> auth-name "<username>" password "<password>"
  - grammar from host domain
  - Keep or adjust match dnis / substitute lines if policy requires. If unavailable programmatically, omit match/substitute or request user confirmation.
- Trunk T02 (FXS register to Netsapiens):
  - description "Netsapiens"
  - sip-server primary <core server>
  - registrar primary <core server>
  - domain "<FXS domain>"
  - trust-domain
  - codec-list DEFAULT both
  - grammar request-uri host domain
  - grammar from host domain
  - grammar to host domain
- Grouped-trunks:
  - Ensure voice grouped-trunk FXS-OUTBOUND includes trunk T02
  - Ensure voice grouped-trunk PRI-OUTBOUND includes trunk T01
- FXS voice user lines:
  - voice user <DN>
    - connect fxs 0/N
    - no special-ring-cadences
    - sip-identity 100N T02 register auth-name 100N password <device-sip-registration-password>
    - For FAX users: preserve modem-passthrough, t38, no nls, no echo-cancellation, rtp delay-mode fixed, rtp dtmf-relay inband, codec-list fax
    - For normal users: codec-list DEFAULT (or original DEFAULT both if it existed)

Sample “Before” and “After”
Use the before/after blocks given in the original brief as golden examples (already verified). Your generator must reproduce the “After” example structure, updated with domain, server, and secrets discovered from Netsapiens.

UI/UX requirements

- Follow UI_STYLE_GUIDE_AND_ARCHITECTURE.md exactly:
  - Next.js 15 (App Router) + TypeScript
  - Tailwind v4 tokens and shadcn/ui primitives
  - Accent color #52B4FA; dark mode tokens as specified
  - React Hook Form + Zod for validation
  - Fuzzy combobox selects (cmdk) for Netsapiens domain and connections
- Primary page flow:
  - Step 1: Identify customer binding (ShadowDB lookup)
    - Input: binding name or customer key; fuzzy search; show resolved Adtran IP
    - Button: Retrieve Adtran Config
  - Step 2: Parse and review detected elements
    - Show trunks, grouped-trunks, FXS users with FAX flags
    - Allow user to flag or unflag FAX lines if parser uncertain
  - Step 3: Select Netsapiens domain and connection
    - Domain select with fuzzy search
    - Auto-populate connections; allow selecting an existing connection or creating a new one
    - Show fetched registration credentials (masked)
  - Step 4: FXS user sync
    - Show table of required users (100N), whether they exist, and whether the device exists
    - Offer “Create missing users and devices” action
    - On success, show retrieved device passwords (masked)
  - Step 5: Config generation and diff
    - Render a before/after diff by trunk and by user
    - Controls: Apply Now, Download Config
  - Step 6: Apply + verify
    - On Apply Now: SSH push, force-register, verify
    - Show status outputs and a summary report
- Usability:
  - Non-blocking toasts, progress indicator overlay during long tasks
  - Good error panels with remediation suggestions
  - Keyboard shortcuts: submit Ctrl/Cmd+Enter; reset Ctrl/Cmd+R; toggle help Ctrl/Cmd+/; close Escape

Environment and secrets

- .env template:
  - NS_API_BASE_URL=
  - NS_API_KEY=
  - DB_HOST=10.100.30.60
  - DB_PORT=5432
  - DB_NAME=shadow_config_db
  - DB_USER=shadowconfigread
  - DB_PASSWORD=TgOiNn1C
  - NS_CORE_SERVER=core1-ord.grid4voice.ucaas.tech
  - ADTRAN_SSH_USER=rancid
  - ADTRAN_SSH_PASS=platinum-gold
  - ADTRAN_ENABLE_PASS=g4cr00ks
- Never log full secrets. Mask to show only last 4 chars.

Implementation plan and structure

Recommended directory layout

- Adtran_NS_Updater/
  - src/
    - app/
      - page.tsx                          // Primary UI entry
      - api/
        - shadowdb/lookup/route.ts        // POST: { binding } → { ip }
        - netsapiens/
          - connections/route.ts          // GET/POST wrappers as needed
          - users/route.ts
          - devices/route.ts
        - adtran/
          - fetch-config/route.ts         // POST: { ip } → config text + parsed
          - apply-config/route.ts         // POST: { ip, delta } → results
        - plan/route.ts                   // POST: { parsed, nsState } → after config + diff
    - components/
      - forms/
        - discovery-form.tsx
        - domain-connection-form.tsx
        - fxs-sync-panel.tsx
      - diffs/
        - config-diff.tsx
      - tables/
        - fxs-users-table.tsx
      - ui/…                              // shadcn primitives reuse per style guide
    - lib/
      - netsapiens.ts                     // HTTP client for v2 API
      - shadowdb.ts                       // pg query helper
      - adtran/
        - ssh.ts                          // ssh2 helpers
        - parse.ts                        // Adtran config parser
        - render.ts                       // “After” config generator
        - diff.ts                         // line-oriented diff
      - types.ts                          // shared TS types/interfaces
      - logger.ts                         // pino
      - secrets.ts                        // masking helpers
  - tests/
    - unit/
      - parse-adtran.spec.ts
      - render-config.spec.ts
    - integration/
      - netsapiens-api.spec.ts            // use nock to record/replay
      - adtran-ssh.spec.ts                // mock ssh2 interactions
  - README.md
  - MASTER_PROMPT.md (this file)

Core libraries

- Next.js 15, TypeScript, Tailwind v4, shadcn/ui per UI_STYLE_GUIDE_AND_ARCHITECTURE.md
- Server libs: pg, ssh2, node-fetch or undici, zod, pino
- Client libs: react-hook-form, zod, fuse.js, cmdk, lucide-react
- Testing: vitest, @testing-library, nock (HTTP), and an ssh2 mock helper

Netsapiens client guidelines

- Support two modes:
  1) Direct fetch using Authorization: Bearer …
  2) SDK wrapper if @api/netsapiens-api is available (as shown in examples)
- Implement:
  - listConnections(domain)
  - getConnection(domain, connectionOrigMatchPattern)
  - createConnection(payload)
  - listUsers(domain)
  - createUser(domain, payload, { synchronous: 'yes' })
  - listDevices(domain, user)
  - createDevice(domain, user, payload, { synchronous: 'yes' })
- Always handle array responses; some GET endpoints return arrays
- Mask secret fields in logs: connection-sip-registration-password, device-sip-registration-password

ShadowDB query helper

- Single entry point: findAdtranIp(bindingName: string): Promise<string | null>
- Use parameterized SQL; ensure DB pool management; handle timeouts
- Consult Docs-MetaswitchShadowDB/ for exact table/column names; default query:
  - SELECT baseinformation_contactipaddress FROM meta_configuredsipbinding WHERE baseinformation_name ILIKE $1 LIMIT 1;

Adtran SSH helper

- runCommands(host, { user, pass, enablePass }, commands: string[]): Promise<{ stdout: string, stderr: string }>
  - Open SSH, handle enable password prompt, disable paging (terminal length 0)
  - Support long outputs
- For “apply”:
  - Your approach can be either:
    - Push minimally-differing configuration lines in config mode, or
    - Wipe and re-apply entire trunk/user blocks
  - Start conservative: only update changed lines; prefer idempotent “no …” then “…” pairs if needed
- After changes:
  - sip trunk-registration force-register
  - show sip trunk-registration

Adtran parsing spec

- Tokenize into sections:
  
  - voice trunk Txx type <sip|isdn>
    - Capture ID (T01, T02…), type, description, sip-server, registrar, domain, grammar lines, authentication/Register lines, codec-list
  - voice grouped-trunk <NAME>
    - trunk Txx, accept lines
  - voice user <DN>
    - connect fxs 0/N
    - sip-identity <id> Tyy register auth-name "<>" password "<>"
    - Flags: modem-passthrough, t38, no nls, no echo-cancellation, rtp delay-mode fixed, rtp dtmf-relay inband, codec-list <value>

- TypeScript types (simplified):
  
  ```ts
  export type TrunkType = 'sip' | 'isdn';
  export interface Trunk {
    id: string;                 // e.g., 'T01'
    type: TrunkType;
    description?: string;
    sipServerPrimary?: string;
    registrarPrimary?: string;
    domain?: string;
    grammar?: string[];         // lines starting with 'grammar'
    auth?: { username?: string; password?: string };
    register?: { username?: string; password?: string };
    codecList?: string;         // e.g., 'DEFAULT both'
    matchDnis?: { pattern: string; substitute?: string; name?: string }[];
  }
  
  export interface GroupedTrunk {
    name: string;               // e.g., 'FXS-OUTBOUND'
    trunks: string[];           // ['T02']
    accepts: string[];          // accept lines
  }
  
  export interface FXSUser {
    dn: string;                 // directory number in Adtran
    port: number;               // N from 'connect fxs 0/N'
    trunkId: string;            // e.g., 'T02' from sip-identity * T02
    extension: string;          // '100N'
    isFax: boolean;
    faxFlags: {
      modemPassthrough?: boolean;
      t38?: boolean;
      noNls?: boolean;
      noEchoCancellation?: boolean;
      rtpDelayModeFixed?: boolean;
      rtpDtmfRelayInband?: boolean;
      codecListFax?: boolean;
    };
    originalCodecList?: string; // DEFAULT, DEFAULT both, fax, etc.
  }
  
  export interface ParsedAdtranConfig {
    trunks: Trunk[];
    groupedTrunks: GroupedTrunk[];
    fxsUsers: FXSUser[];
    raw: string;
  }
  ```

Transform and rendering spec

- Input: ParsedAdtranConfig + Netsapiens discovery results (domain, selected/created connection, users, devices)
- Output:
  - Rendered “after” trunk blocks:
    - T01: sip server + registrar to Netsapiens core, domain to PRI realm, register auth using connection credentials, grammar from host domain, sip-header-passthrough both, etc.
    - T02: sip server + registrar to Netsapiens core, domain to selected domain, trust-domain, grammar request-uri/from/to host domain, codec-list DEFAULT both
  - Rendered FXS user blocks:
    - sip-identity 100N T02 register auth-name 100N password <device-sip-registration-password>
    - FAX options preserved
  - Preserve original user DNs and connect fxs 0/N wiring
- Provide a line-oriented diff to support UI presentation

Sequence diagram

```mermaid
sequenceDiagram
  participant UI
  participant API
  participant ShadowDB
  participant Adtran
  participant NS as Netsapiens

  UI->>API: POST /api/shadowdb/lookup {binding}
  API->>ShadowDB: SELECT ... FROM meta_configuredsipbinding
  ShadowDB-->>API: { ip }
  API-->>UI: { ip }

  UI->>API: POST /api/adtran/fetch-config {ip}
  API->>Adtran: SSH: enable; terminal length 0; show running-config; show sip trunk-registration
  Adtran-->>API: config text
  API-->>UI: { parsed, raw }

  UI->>API: GET /api/netsapiens/connections?domain=...
  API->>NS: GET /domains/{domain}/connections
  NS-->>API: [connections]
  API-->>UI: [connections]

  UI->>API: POST /api/netsapiens/sync-fxs {domain, usersNeeded:[100N]}
  API->>NS: GET users; POST missing users (sync yes)
  API->>NS: GET devices; POST missing devices (sync yes)
  NS-->>API: device-sip-registration-password per user
  API-->>UI: sync summary (masked secrets)

  UI->>API: POST /api/plan {parsed, nsState, selections}
  API->>API: Render “after” config; compute diff
  API-->>UI: { afterText, diff }

  UI->>API: POST /api/adtran/apply-config {ip, delta}
  API->>Adtran: SSH: push deltas; force-register; show registrations
  Adtran-->>API: status
  API-->>UI: result summary
```

Error handling and idempotency

- Netsapiens “already exists” cases:
  - On 409 or duplicate user/device, re-query instead of failing
- RETRY rules:
  - Network errors: exponential backoff 100ms → 1.6s (max 5 tries)
  - Rate limit: respect 429 retry-after when present
- Redaction:
  - Log secrets masked; include IDs and timestamps
- Idempotency keys:
  - Not required if we re-query after each create and operate with deterministic naming (user 100N, device 100Na)

Security and compliance

- Keep all tokens in process env; never commit .env
- Mask secrets in logs and UI; show last 4 chars only with a “reveal” affordance behind user action
- Offer a toggle “dry-run mode” to avoid accidental apply to live devices

Acceptance criteria (must pass)

- Given a “Before” Adtran config and a selected Netsapiens domain and connection:
  - The tool discovers or creates FXS users and devices, and fetches device-sip-registration-password for each FXS port in the Adtran
  - The tool fetches PRI/connection registration credentials
  - The tool generates an “After” Adtran config matching the example pattern, with:
    - T01 pointed to Netsapiens with register credentials populated
    - T02 pointed to Netsapiens FXS domain, grammar/trust-domain set
    - FXS users translated to sip-identity 100N T02 with device password injected
    - FAX users preserve fax-specific flags
  - The UI shows an accurate before/after diff
  - On “Apply Now,” the device updates succeed, registrations are forced, and verification output is shown
  - “Download Config” produces a ready-to-apply file

Open items and assumptions

- Domains/realms:
  - For PRI: typically {domain}.pri patterns are used (e.g., grid4lab.pri). Confirm with user or infer from connection-translation-* fields. Provide an override in UI.
- Core server:
  - Prefer registration.core-server from connection response when available; otherwise NS_CORE_SERVER env
- Match/substitute lines:
  - If DNIS rules are needed, expose a UI checkbox to add a default match/substitute pair; otherwise omit
- Trunk IDs:
  - Existing devices might not use T01/T02. If different, detect the FXS trunk and PRI trunk by semantics and confirm with the user before rendering

Example API usage snippets (from attached references)

Get all connections for a domain

```ts
import netsapiensApi from '@api/netsapiens-api';

netsapiensApi.auth('Bearer nss_...');
netsapiensApi.getDomainsDomainConnections({domain: 'grid4lab.com'})
  .then(({ data }) => console.log(data))
  .catch(err => console.error(err));
```

Get a specific connection

```ts
const url = 'https://portal.../ns-api/v2/domains/grid4lab.com/connections/sip*%40grid4lab.pri';
const options = {
  method: 'GET',
  headers: {
    accept: 'application/json',
    authorization: 'Bearer nss_...'
  }
};
const res = await fetch(url, options);
const data = await res.json();
```

Create a connection (PRI)

```ts
netsapiensApi.createConnection({
  'connection-orig-match-pattern': 'sip*@apidog.pri',
  'connection-term-match-pattern': 'sip*@apidog.pri',
  domain: 'apidog.com',
  'connection-sip-registration-username': '2485551212',
  // ... other fields per example
  'connection-sip-authenticate-as-client-enabled': 'no'
});
```

Create FXS user (synchronous)

```ts
netsapiensApi.createUser({
  synchronous: 'yes',
  user: '1004',
  'name-first-name': 'FXS',
  'name-last-name': '4',
  'user-scope': 'No Portal',
  // ... rest from example
}, { domain: 'exampledomain.com' });
```

Create logical device for user (synchronous, to get password in response)

```ts
netsapiensApi.createDevice({
  synchronous: 'yes',
  device: '1004a',
  'auto-answer-enabled': 'no',
  'device-provisioning-sip-transport-protocol': 'udp'
}, { domain: 'exampledomain.com', user: '1004' });
```

Get devices for a user

```ts
netsapiensApi.getDevices({ domain: 'exampledomain.com', user: '1004' });
```

Adtran examples for FXS user blocks (Normal vs FAX)

Normal

```
voice user 9472018992
 connect fxs 0/2
 no special-ring-cadences
 sip-identity 1002 T02 register auth-name 1002 password 8OSYaaa3C2Ja
 codec-list DEFAULT
```

FAX

```
voice user 9472018991
 connect fxs 0/1
 no special-ring-cadences
 sip-identity 1001 T02 register auth-name 1001 password sOmk88tH6597
 modem-passthrough
 t38
 no nls
 no echo-cancellation
 rtp delay-mode fixed
 rtp dtmf-relay inband
 codec-list fax
```

Pseudocode (end-to-end)

```ts
async function runMigration(binding: string, nsDomain: string, desiredConn?: string) {
  const ip = await findAdtranIp(binding);
  assert(ip, 'No Adtran IP found');

  const rawConfig = await adtranFetchConfig(ip);
  const parsed = parseAdtranConfig(rawConfig);
  const fxsPorts = parsed.fxsUsers.map(u => u.port);
  const neededUsers = fxsPorts.map(N => `100${N}`);

  // Netsapiens discovery
  const connections = await ns.listConnections(nsDomain);
  let connection = pickConnection(connections, desiredConn);
  if (!connection) {
    connection = await ns.createConnection(connectionPayloadFromUI(nsDomain));
  }
  // Refresh to get secrets
  connection = await ns.getConnection(nsDomain, connection['connection-orig-match-pattern']);

  // Users & devices
  const users = await ns.listUsers(nsDomain);
  const ensuredUsers = [];
  for (const ext of neededUsers) {
    let user = users.find(u => u.user === ext);
    if (!user) user = await ns.createUser(nsDomain, buildFxsUser(ext), { synchronous: 'yes' });
    let devices = await ns.listDevices(nsDomain, ext);
    if (!devices.length) {
      const created = await ns.createDevice(nsDomain, ext, buildDevice(ext), { synchronous: 'yes' });
      devices = [created];
    }
    const device = devices[0];
    ensuredUsers.push({ ext, devicePassword: device['device-sip-registration-password'] });
  }

  // Build after config
  const after = renderAfterConfig(parsed, {
    conn: connection,
    nsDomain,
    users: ensuredUsers,
    coreServer: connection.registration?.['core-server'] || process.env.NS_CORE_SERVER!,
    priRealm: derivePriRealm(connection)
  });

  const diff = diffConfigs(rawConfig, after);

  // Optional apply
  await adtranApplyConfig(ip, diff.deltaLines);
  await adtranForceRegisterAndVerify(ip);

  return { ip, diff, after };
}
```

Developer tasks backlog (priority order)

1) Bootstrapping
- Next.js app with Tailwind v4, shadcn/ui, vitest; set up linting and pino logger
- Implement environment loader and secret masker
2) Adtran SSH + Parser
- Implement ssh2 helper and end-to-end retrieval for lab device
- Write parse.ts with robust regex/tokenizer and unit tests using provided before-config
3) Netsapiens client
- Implement netsapiens.ts with methods above; integrate examples and verify fields
- Write integration tests with nock using recorded JSON fixtures from your examples
4) ShadowDB
- Implement pg-based lookup; verify with Docs-MetaswitchShadowDB; write unit tests
5) UI
- Discovery form (ShadowDB search) → Show IP
- Parse results view with trunks and FXS table including FAX flags
- Domain/connection selection with fuzzy search and “create connection” modal
- FXS sync panel with “create missing users/devices” action (synchronous yes), masked secrets
- Diff view and actions (Apply Now, Download Config)
- Progress overlays and toasts per style guide
6) Plan/Render/Apply
- plan API: combine parsed + NS state → render after + diff
- apply API: push config deltas, force-register, verify
7) Polishing and QA
- Mask secrets, error UX, retry/backoff, log all steps
- Test end-to-end on lab device using “Before” config, validate “After” config and registrations

Definition of done

- End-to-end on lab device:
  - Adtran config retrieved and parsed
  - Netsapiens entities discovered or created
  - Secrets fetched and injected
  - After config generated and matches the example structure
  - Apply Now updates device; registrations validate
  - Download Config works
- UI conforms with UI_STYLE_GUIDE_AND_ARCHITECTURE.md and Portal_ref_screenshots cues
- Tests: parser unit tests + Netsapiens client integration tests passing; manual E2E validated

Edge cases to handle

- Devices with no FXS users: skip user creation; still convert trunks
- Multiple PRI trunks: allow selection in UI; support multiple connections
- Existing users/devices with variant names: map by extension “100N” and prompt user if mismatched
- Trunk IDs not T01/T02: detect semantics and confirm mapping in UI before render
- Intermittent SSH failures: retry with backoff and visible retry status in UI

Notes from Brad’s insights (applied here)

- The time sink is credential gathering; our automation prioritizes pre-check → provision missing → re-check for secrets
- The tool must adapt to each unique Adtran config; robust parsing + human confirmation where ambiguous is essential
- Download-only option supports scheduling changes outside maintenance windows

Optional improvements (vNext)

- Config “staging” preview that emits exact CLI commands to be executed
- Bulk migration mode for multiple devices with CSV input
- Live registration polling with interval updates in UI

You can now start coding directly against this prompt. If new Netsapiens fields or response shapes surface, add them to NetsapiensAPIReferenceAndExamples and update src/lib/netsapiens.ts types and Zod validators accordingly.

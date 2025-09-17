## Metaswitch ShadowDB Connectivity and Query Reference (PostgreSQL)

This document provides a reusable technical reference for connecting to and querying the Metaswitch MetaView Shadow Configuration Database ("ShadowDB") with a focus on secure, read‑only access and common query patterns. It excludes any project‑specific business logic, CSV generation, or UI details.

### Scope
- Database: PostgreSQL (ShadowDB), typically version 13.x
- Access: Read‑only
- Client examples: node-postgres (pg), psql
- Use cases covered: PBX line/DID range lookups, safe introspection, and Subscriber Gateway queries to identify Adtran IP addresses

---

## 1) Database Connection Configuration

### Engine and Defaults
- Software: PostgreSQL 13.10
- Port: 5432
- Database name: `shadow_config_db`
- Privileged role: `shadowconfigread` (read‑only)

### Environment Variables (recommended)
- `DB_HOST` – ShadowDB host/IP (internal MetaView server)
- `DB_PORT` – Port (default `5432`)
- `DB_NAME` – Database name (`shadow_config_db`)
- `DB_USER` – Username (`shadowconfigread`)
- `DB_PASSWORD` – Password for the above user

Example .env entries:
<augment_code_snippet mode="EXCERPT">
````bash
DB_HOST=10.100.30.60
DB_PORT=5432
DB_NAME=shadow_config_db
DB_USER=shadowconfigread
DB_PASSWORD=***redacted***
````
</augment_code_snippet>

### Connection String Formats
- libpq URI: `postgres://<user>:<password>@<host>:<port>/<db>?sslmode=disable`
- pg Pool config: `{ host, port, database, user, password, ssl }`

### Node (node-postgres/pg) – Pooled Connection
Recommended baseline settings with conservative pool sizing and timeouts:
<augment_code_snippet mode="EXCERPT" path="src/lib/db.ts">
````ts
import { Pool } from 'pg'
export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: false, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 2000,
})
````
</augment_code_snippet>

Notes:
- SSL: Many deployments run on trusted LAN. If TLS is required, set `ssl: { rejectUnauthorized: true }` and configure server CA as needed.
- Pool sizing: Start small (5–10). Increase only if you observe queueing under sustained load.
- Timeouts: Keep `connectionTimeoutMillis` low to fail fast when the DB is unreachable.
- Logging: Never log credentials. Log lightweight connection metadata only (host, db, user).

### psql (CLI) – Safe Environment Usage
Use `PGPASSWORD` for non‑interactive auth. Avoid echoing secrets to logs:
<augment_code_snippet mode="EXCERPT" path="psql_readonly_cheatsheet.md">
````bash
export PGPASSWORD="$DB_PASSWORD"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;"
````
</augment_code_snippet>

---

## 2) Database Schema Information (Relevant Objects)
ShadowDB exposes read‑only views (tables) in the `public` schema. Column names are lowercase for PBX/DID tables. Confirm with `information_schema` when in doubt.

### PBX Line Directory Numbers
- Table: `meta_pbx_line`
  - Columns (excerpt):
    - `configuredsipbinding` (text)
    - `directorynumber` (text)
    - Additional often present: `networkelementname` (text)

### DID Ranges
- Table: `meta_pbx_directinwardcalling`
  - Columns:
    - `rangesize` (integer)
    - `firstdirectorynumber` (text)
    - `lastdirectorynumber` (text)
    - `firstcode` (text)
    - `lastcode` (text)
    - Sometimes also `directorynumber` (text) in some deployments

Relationship:
- DID ranges commonly relate to PBX lines via `firstdirectorynumber = directorynumber`.

### Subscriber Gateways (for IP/Adtran identification)
- Table: `Meta_SubG` (ShadowDB uses mixed‑case logical names; they appear as views)
  - Key fields:
    - `BaseInformation_IPAddress` – Subscriber Gateway IP
    - `BaseInformation_MediaGatewayModel` – Vendor/model descriptor (e.g., contains "ADTRAN")
    - `BaseInformation_Description` – Human‑readable descriptor
    - `BaseInformation_MediaGatewayIPPort` – Port field

### Configured SIP Bindings (for IP discovery)
- Table: `Meta_ConfiguredSIPBinding`
  - Useful IP fields:
    - `BaseInformation_ContactIPAddress`
    - `BaseInformation_ProxyIPAddress`
    - `BaseInformation_MediaIPAddress`

### Introspection
List columns safely to reconcile deployments:
<augment_code_snippet mode="EXCERPT" path="psql_readonly_cheatsheet.md">
````sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('meta_pbx_line','meta_pbx_directinwardcalling')
ORDER BY table_name, ordinal_position;
````
</augment_code_snippet>

---

## 3) Query Patterns and Best Practices

### PBX Lines for a SIP Binding (case‑insensitive)
<augment_code_snippet mode="EXCERPT" path="src/lib/db.ts">
````sql
SELECT directorynumber
FROM meta_pbx_line
WHERE lower(configuredsipbinding) = lower($1);
````
</augment_code_snippet>

Node usage (parameterized):
<augment_code_snippet mode="EXCERPT" path="src/lib/db.ts">
````ts
const q = `SELECT directorynumber FROM meta_pbx_line WHERE lower(configuredsipbinding)=lower($1)`
const { rows } = await pool.query(q, [binding])
````
</augment_code_snippet>

### DID Ranges for Known Directory Numbers
Efficiently match many DNs using `ANY($1::text[])`. Chunk large arrays (~1000) client‑side.
<augment_code_snippet mode="EXCERPT" path="src/lib/db.ts">
````sql
SELECT rangesize, firstdirectorynumber, lastdirectorynumber, firstcode, lastcode
FROM meta_pbx_directinwardcalling
WHERE firstdirectorynumber = ANY($1);
````
</augment_code_snippet>

### Range Adjacency (optional)
Some deployments also consider ranges adjacent to PBX lines:
<augment_code_snippet mode="EXCERPT" path="src/lib/db.ts">
````sql
... WHERE firstdirectorynumber = ANY($1)
   OR directorynumber = ANY($1)
   OR EXISTS (
     SELECT 1 FROM unnest($1::text[]) AS pbx(num)
     WHERE CAST(pbx.num AS BIGINT) = CAST(d.firstdirectorynumber AS BIGINT) - 1
        OR CAST(pbx.num AS BIGINT) = CAST(COALESCE(d.lastdirectorynumber, d.firstdirectorynumber) AS BIGINT) + 1
   )
````
</augment_code_snippet>

### Identifying Adtran IP Addresses (Subscriber Gateways)
Find Subscriber Gateways with Adtran models and list their IPs:
<augment_code_snippet mode="EXCERPT">
````sql
SELECT BaseInformation_Description, BaseInformation_IPAddress, BaseInformation_MediaGatewayModel
FROM Meta_SubG
WHERE BaseInformation_MediaGatewayModel ILIKE '%ADTRAN%'
ORDER BY BaseInformation_Description;
````
</augment_code_snippet>

Find a specific IP across SubG and Configured SIP Bindings (from vendor docs):
<augment_code_snippet mode="EXCERPT" path="docs/ShadowConfigDbSampleQueries.txt">
````sql
SELECT 'Configured SIP Binding ' || BaseInformation_Name AS match,
       BaseInformation_ContactIPAddress AS ip_address
  FROM  Meta_ConfiguredSIPBinding
  WHERE (BaseInformation_ProxyIPAddress = $1 OR BaseInformation_ContactIPAddress = $1)
UNION
SELECT 'Subscriber Gateway ' || BaseInformation_Description AS match,
       BaseInformation_IPAddress AS ip_address
  FROM  Meta_SubG
  WHERE BaseInformation_IPAddress = $1;
````
</augment_code_snippet>

### Performance Tips
- Use parameterized queries (`$1`, `$2`, …) to leverage query planning and prevent SQL injection.
- Avoid leading‑wildcard `LIKE` patterns on large tables.
- For large `ANY(array)` filters, batch parameters (~500–1000) per call.
- `lower(column) = lower($1)` improves robustness but can inhibit index use in some DBs unless functional indexes exist. If your data is normalized to a consistent case, prefer simple equality on normalized inputs.

### Data Hygiene
- Sanitize directory numbers to digits only on the client side when comparing to `firstdirectorynumber`/`directorynumber`.
- Deduplicate inputs before querying; deduplicate outputs when joining across multiple sources.

### Error Handling Patterns
- Wrap database calls in `try/catch` and surface contextual messages without leaking secrets.
- Centralize logging; avoid including PII or credentials.

---

## 4) Technical Implementation Details

### Client Library
- Node: `pg` (node-postgres). Supports pooling and parameterized queries.

### Connection Management Patterns
- Reuse a single `Pool` instance per process.
- Listen for `pool.on('error')` and log context; consider health checks.
- Gracefully `pool.end()` on shutdown in long‑running services.

### Minimal Query Helper (Node)
<augment_code_snippet mode="EXCERPT">
````ts
import { Pool } from 'pg'
const pool = new Pool({ /* env‑driven config */ })
export async function query<T>(text: string, params: unknown[]) {
  const res = await pool.query<T>(text, params)
  return res.rows
}
````
</augment_code_snippet>

### Transactions (generally not required for read‑only)
If batching related reads (or requiring a consistent snapshot), use a read‑only transaction:
<augment_code_snippet mode="EXCERPT">
````ts
const c = await pool.connect()
try {
  await c.query('BEGIN READ ONLY')
  const a = await c.query('SELECT ... WHERE ...', [p1])
  const b = await c.query('SELECT ... WHERE ...', [p2])
  await c.query('COMMIT'); return { a: a.rows, b: b.rows }
} catch (e) { await c.query('ROLLBACK'); throw e } finally { c.release() }
````
</augment_code_snippet>

### Security Considerations
- Use a dedicated read‑only DB role with SELECT‑only permissions.
- Store secrets in environment variables or a secrets manager; never commit credentials.
- Prefer TLS where feasible; restrict DB host access to trusted networks.
- Always use parameterized queries; never concatenate untrusted input into SQL.
- Log minimally; avoid PII and secrets in logs and error messages.

---

## Appendix

### Quick Checks and Introspection (psql)
- Count rows to sanity‑check access/perf:
<augment_code_snippet mode="EXCERPT" path="psql_readonly_cheatsheet.md">
````sql
SELECT 'meta_pbx_line' AS t, count(*) FROM meta_pbx_line
UNION ALL
SELECT 'meta_pbx_directinwardcalling', count(*) FROM meta_pbx_directinwardcalling;
````
</augment_code_snippet>

### References
- ShadowDB schema excerpts and examples are derived from vendor‑supplied ShadowDB documentation (see `docs/ShadowConfigDbSchema.txt`, `docs/ShadowConfigDbSampleQueries.txt`) and validated usage in this codebase (`src/lib/db.ts`).


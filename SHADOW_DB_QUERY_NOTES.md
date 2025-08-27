## Shadow DB Query Notes (Metaswitch)

Tables (confirmed via information_schema, 2025-08-26):
- meta_pbx_line
  - configuredsipbinding (TEXT), directorynumber (TEXT)
  - also present and sometimes useful: networkelementname (TEXT), _name (TEXT)
- meta_pbx_directinwardcalling
  - rangesize (INTEGER), firstdirectorynumber (TEXT), lastdirectorynumber (TEXT), firstcode (TEXT), lastcode (TEXT)
  - directorynumber (TEXT) also exists but firstdirectorynumber is the primary match for ranges

Caveats:
- Column names are lowercase in ShadowDB. Conceptual docs show CamelCase; rely on information_schema to confirm.
- Read-only access only; use SELECT with parameters and the read-only role.

Recipes:
- Find PBX line directory numbers for a binding
  SELECT directorynumber
  FROM meta_pbx_line
  WHERE lower(configuredsipbinding) = lower($1);

- Fetch DID ranges for those directory numbers
  SELECT rangesize, firstdirectorynumber, lastdirectorynumber, firstcode, lastcode
  FROM meta_pbx_directinwardcalling
  WHERE firstdirectorynumber = ANY($1);

- Introspect columns safely
  SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name = 'meta_pbx_directinwardcalling';

Indexing/perf hints:
- Use WHERE lower(configuredsipbinding) = lower($1) to be robust to casing.
- For large lists, chunk the ANY($1::text[]) array into batches (~1000).

Validation:
- Ensure numeric-only for directory numbers; strip non-digits; log and skip if malformed.
- Deduplicate expanded numbers for NetSapiens CSV before writing.


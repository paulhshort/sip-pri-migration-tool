## CSV Specifications (Authoritative)

### Metaswitch Import CSV
- Header row 1: `PBX DID Range or DISA Number,,,,,`
- Header row 2: `MetaSphere CFS,PBX Phone number,(First) Phone number,Type,First code,Range size`
- Data rows:
  - Column A: `Grid4-Liberty-CFS-1`
  - Column B: depends on Preferred Server Location
    - US Midwest (Chicago): `2486877799`
    - US West (Phoenix): `2487819929`
    - US East (Ashburn): `2487819988`
  - Column C: `firstdirectorynumber`
  - Column D: `DID range`
  - Column E: `firstcode` (may be empty)
  - Column F: `rangesize`

### NetSapiens Import CSV
- Header: `Phone Number,Domain,Treatment,Destination,Notes,Enable`
- Data rows (one per expanded DID):
  - Column A: `1` + full number (E.164-style, no punctuation)
  - Column B: user-provided domain (e.g., `stlawrenceparish.com`)
  - Column C: `SIP Trunk`
  - Column D: user-provided SIP Trunk name (e.g., `stlawrence`)
  - Column E: user-provided account number (e.g., `11308`)
  - Column F: `yes`

### Filename conventions
- metaswitch_{binding_slug}_{timestamp}.csv
- netsapiens_{binding_slug}_{timestamp}.csv

### Validation rules
- All numbers must be digits only; reject/skip invalids with a log message
- Deduplicate expanded numbers for the NetSapiens CSV (keep first occurrence)
- If rangesize is missing/null, treat as 1
- If firstdirectorynumber is missing, skip row and log

### Example references
- See reference_examples/ folder for canonical examples used by operations.


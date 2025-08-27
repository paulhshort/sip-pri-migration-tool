# Metaswitch Shadow Configuration Database Schema (Extract)

This is a copied reference from the MetaswitchExporter project for quick access while building the SIP/PRI tool. See original in docs/SHADOW_DB_SCHEMA.md.

## Database Connection Details
- Software: PostgreSQL 13.10
- Port: 5432
- Name: shadow_config_db
- Username: shadowconfigread (read-only)

## Key Tables and Columns (relevant to this tool)

### meta_pbx_line
- configuredsipbinding (TEXT)
- directorynumber (TEXT)
- businessgroupname (TEXT)

### meta_pbx_directinwardcalling
- rangesize (INTEGER)
- firstdirectorynumber (TEXT)
- lastdirectorynumber (TEXT)
- firstcode (TEXT)
- lastcode (TEXT)

## Query Patterns
- Filter binding case-insensitively
- Use ANY(array) for matching many directory numbers

## Notes
- Column names are lowercase in ShadowDB
- Use information_schema to confirm columns when in doubt


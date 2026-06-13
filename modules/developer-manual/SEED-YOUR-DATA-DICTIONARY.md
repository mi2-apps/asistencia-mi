# How to seed your data dictionary

**The data dictionary is the #1 determinant of how well agents answer questions about your data.** One maintained, canonical source beats per-feature schema cards. Budget real time for it — treat it as docs you'd hand a new analyst on day one. Vague entries ("qty: quantity") are worse than none, because they read as authoritative.

You produce two things per domain, dropped into `docs/developer-manual/seed/`:
1. A **Markdown page** `<domain>.md` (human-readable narrative + column tables).
2. A **JSON file** `dictionary/<domain>.json` (the structured, agent-queryable form).

Then `node scripts/seed-dev-manual.cjs <db>` loads pages (idempotent) and full-refreshes the dictionary.

## The quality bar for every column
- **Meaning states the real-world thing, with units.** For any quantity/count/amount/weight, say *quantity of WHAT* and the unit (e.g. "number of physical pallets", "sum of line-item quantities", "weight in lbs"). Decode abbreviations to plain English (e.g. `etd` = Estimated Time of Departure). If a name is cryptic (`seg`), state what it actually means; if you genuinely can't tell, say so — don't guess.
- **Relationships** name the exact target: `this_table.col -> other_table.col` and why.
- **Allowed values** list enum/status options.
- **Nullability** is taken from the live DB automatically — don't stress over it.

## JSON shape (per domain)
```json
{
  "domainKey": "shipments",
  "title": "Shipments",
  "tables": [
    {
      "name": "shipments",
      "purpose": "One outbound move for a customer.",
      "columns": [
        { "name": "id", "type": "varchar (uuid)", "nullable": false,
          "meaning": "Primary key", "references": null, "allowedValues": null, "notes": "" }
      ],
      "foreignKeys": ["shipments.customer_id -> customers.id (who the shipment is for)"],
      "sampleQueries": [{ "description": "Open shipments", "sql": "SELECT * FROM shipments WHERE status <> 'delivered';" }]
    }
  ]
}
```
Use **exact snake_case SQL column names** (verify against `information_schema.columns` — NOT camelCase ORM property names). The seeder will reject nothing, but wrong names = phantom entries agents will repeat.

## Recommended: generate it with a multi-agent pass
For a large schema, fan out one agent per domain to read your `schema.ts` + storage/route usage (and run **read-only** `SELECT`s against a dev DB to confirm enum values), each writing `<domain>.md` + `<domain>.json`. Then run an **accuracy check**: compare documented columns against `information_schema.columns` — any documented column not present is a bug (usually camelCase-vs-snake_case). Regenerate until phantom columns = 0. (This is exactly how the Manifest reference instance was built.)

## Keep it current
Wire the maintenance mandate (CLAUDE-snippet.md) into your repo so every schema/architecture change updates the manual in the same change.

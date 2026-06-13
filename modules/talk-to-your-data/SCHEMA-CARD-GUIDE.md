# How to write a good schema card

The **schema card** (`server/agent/schema-card.ts` → the `SCHEMA_CARD` string) is the single
most important thing you customize. It's the curated description of *your* data that rides in the
system prompt on every turn. A good card is the difference between an agent that answers correctly
and one that hallucinates column names, writes slow queries, or reports false "gaps".

> **This is the HARD RULE for adopting the module:** the chatbot is only as good as the data
> dictionary you give it. A team that drops the module in without writing a real schema card will
> get a confident-but-wrong bot. Budget an hour to write the card. Treat it as documentation you'd
> hand a new analyst on day one.

The agent *also* has live `list_tables` / `describe_schema` tools (authoritative column names from
`information_schema`), so the card doesn't need every column — it needs the **judgment** that
introspection can't give: which table to use, what the quirks are, and where data really lives.

## Source of truth: pull from your Developer Manual (stack §14d)

Don't invent the card from memory. If your app (or a sibling MI app) has a **Developer Manual**
(the [`developer-manual`](../developer-manual/README.md) module / stack
[§14d](https://apps.mi2.com.mx/stack#dev-manual)), that is your authoritative source for everything
in the checklist below — it already documents, per table/column: plain-English meaning, units/format
quirks, nullability, FKs, allowed values, and sample queries. The schema card is the **tight,
prompt-resident distillation** of that manual: the manual is exhaustive and lives in the DB; the card
is the ~1-page judgment layer that rides in the prompt every turn.

- **Writing the card:** query the manual instead of guessing. Over its agent/MCP API —
  `overview` + `list_tables` for the routing map (§2), `get_table`/`find_field` for the quirks and
  real types (§1/§3), `search` for "where does X live" (§5). The canonical MI AI Manifest instance is
  at `https://manifest.miglobal.com.mx/api/v1/external/developer-manual/*` (+ MCP at `…/mcp`) — ask
  #coolify-ops for a read-only `developer_manual: read` key, or point at your own app's manual.
- **Keep them in sync:** the manual carries the §14d *maintenance mandate* (update it in the same
  change as any schema/architecture change). Treat the schema card as a derived view of the manual —
  when the manual changes a money/date convention or adds a table, refresh the matching card line in
  the same PR. A card that drifts from the manual reintroduces exactly the false "gaps" both exist to
  prevent.

If you have **no** Developer Manual yet, write the card from first-hand DB knowledge using the
checklist below — and consider standing up the §14d module so the next person (or agent) inherits the
ground truth instead of re-deriving it.

## The checklist

A complete card has five sections. Work through each:

### 1. CRITICAL RULES — the quirks that silently make queries *wrong*
The things that aren't visible from column names/types and will produce wrong answers if missed:
- **Storage quirks.** Is money stored as TEXT (`"$1,234.50"`, `"USD 12.00"`)? Then say "ALWAYS wrap
  in `safe_to_double(col)`; never cast directly." Are booleans `'Y'/'N'` strings? Say so.
- **Date format.** Real `timestamptz`, or TEXT in some locale format? Give the exact filter pattern
  (`created_on LIKE '%/2025 %'`) and the chronological sort expression.
- **Free-text matching.** Which columns are safe to `ILIKE '%term%'` (have a trigram index) and the
  minimum term length. Without this the agent writes 2-char patterns that seq-scan millions of rows.

### 2. WHICH TABLE? — the routing map (so the agent never asks the user)
One line per business concept → the table + key columns. This is what lets the agent answer
"top customers by value" without a round-trip. Cover the 8–15 tables that matter; skip junk tables.
Include the **non-obvious routing**: "B2C item detail is in `order_products.title`; B2B item detail
is in `order_pallets.sorting_category`" — the kind of thing only someone who knows the data knows.

### 3. PER-TABLE columns — the handful that matter
For each important table: PK, the columns the agent will actually filter/aggregate on, and their
real types. You don't need all 60 columns — `describe_schema` gets those. You need the *meaningful*
ones plus a note on any that are TEXT-money or oddly named.

### 4. DERIVED CONCEPTS — formulas, defined once
Any KPI or metric with a definition: "recovery % = sold_price / retail_price", "net = sale − tax −
shipping". Define it here so the agent computes it consistently instead of guessing.

### 5. DATA-LOCATION NOTES — kill the false "gaps"
The most underrated section. Whenever a teammate asks "why is X missing?" and the answer is "it's
not missing, it's over there / it's derived / it's sparse by design", that belongs here:
- **Cross-table joins that aren't obvious** ("normalize UPC via `norm_upc()` on both sides — raw
  equality won't match and times out").
- **Sparse-by-design tables** ("only returned orders have a claims row — a low claim rate is the
  return rate, NOT missing data").
- **Derived-not-stored attributes** ("screen size isn't a column — extract it from the title").
- **Where contact info actually lives** when there are several customer tables of different richness.

## Quality bar — your card is good when:
- A new analyst could read it and write correct queries against your DB.
- It names the **gotchas** (TEXT money, date format, trigram-only columns), not just the tables.
- It includes a worked **example query** for the trickiest common question (e.g. the exact JOIN for
  "largest B2B TV customers"). One good example teaches the agent the join pattern.
- It tells the agent what is **sparse / derived / elsewhere** so it stops mislabeling those as gaps.

## Maintenance
- Keep it **tight** — it's in the prompt on every request (tokens = cost + latency). Lean on
  `describe_schema` for exhaustive columns; reserve the card for judgment.
- When you add a table or change a money/date convention, update the card in the same PR.
- If the agent gets something wrong twice, the fix is almost always a missing line in the card —
  add it rather than fighting the model.

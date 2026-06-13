// [EDIT] Import paths assume app conventions: "@shared/schema" (your Drizzle tables incl. the dev_manual_* defs) and "./db" (your Drizzle client). Adjust if different.
// Developer Manual — data layer (Migration 0141)
// Self-contained store for the dedicated dev_manual_pages / dev_manual_revisions
// framework. Every write snapshots a full revision and uses an optimistic
// concurrency token (editLockVersion) so concurrent editors/agents get a 409
// instead of silently clobbering each other.
import { db } from "./db";
import { devManualPages, devManualRevisions, devManualTableInfo, devManualDictionary } from "@shared/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";

export interface ManualActor {
  userId?: string | null;
  apiKeyId?: string | null;
}

export interface UpdatePageInput {
  title?: string;
  summary?: string | null;
  section?: string;
  contentMd?: string;
  displayOrder?: number;
  isPublished?: boolean;
  changeSummary?: string | null;
}

const LIST_COLUMNS = {
  id: devManualPages.id,
  slug: devManualPages.slug,
  title: devManualPages.title,
  section: devManualPages.section,
  summary: devManualPages.summary,
  displayOrder: devManualPages.displayOrder,
  isPublished: devManualPages.isPublished,
  version: devManualPages.version,
  editLockVersion: devManualPages.editLockVersion,
  updatedAt: devManualPages.updatedAt,
};

/** Lightweight list for the sidebar/nav (no body). */
export async function listDevManualPages(includeUnpublished = false) {
  const rows = await db
    .select(LIST_COLUMNS)
    .from(devManualPages)
    .where(includeUnpublished ? undefined : eq(devManualPages.isPublished, true))
    .orderBy(asc(devManualPages.section), asc(devManualPages.displayOrder), asc(devManualPages.title));
  return rows;
}

export async function getDevManualPageBySlug(slug: string, includeUnpublished = false) {
  const [row] = await db
    .select()
    .from(devManualPages)
    .where(includeUnpublished ? eq(devManualPages.slug, slug) : and(eq(devManualPages.slug, slug), eq(devManualPages.isPublished, true)))
    .limit(1);
  return row || null;
}

export async function getDevManualPageById(id: string) {
  const [row] = await db.select().from(devManualPages).where(eq(devManualPages.id, id)).limit(1);
  return row || null;
}

/** Create a page + its baseline revision (version 1) in one transaction. */
export async function createDevManualPage(
  input: { slug: string; title: string; section?: string; summary?: string | null; contentMd: string; displayOrder?: number; isPublished?: boolean },
  actor: ManualActor,
) {
  return db.transaction(async (tx) => {
    const [page] = await tx
      .insert(devManualPages)
      .values({
        slug: input.slug,
        title: input.title,
        section: input.section ?? "Domains",
        summary: input.summary ?? null,
        contentMd: input.contentMd,
        displayOrder: input.displayOrder ?? 0,
        isPublished: input.isPublished ?? true,
        createdBy: actor.userId ?? null,
        createdByApiKeyId: actor.apiKeyId ?? null,
        lastEditedBy: actor.userId ?? null,
        lastEditedByApiKeyId: actor.apiKeyId ?? null,
      })
      .returning();
    await tx.insert(devManualRevisions).values({
      pageId: page.id,
      version: page.version,
      title: page.title,
      contentMd: page.contentMd,
      changeSummary: "Initial version",
      editedBy: actor.userId ?? null,
      editedByApiKeyId: actor.apiKeyId ?? null,
    });
    return page;
  });
}

export type UpdateResult =
  | { ok: true; page: typeof devManualPages.$inferSelect }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "conflict"; currentLockVersion: number };

/**
 * Update a page. If expectedLockVersion is provided it is enforced atomically
 * (conditional UPDATE) — a stale writer gets {conflict}. Snapshots the new
 * committed version into dev_manual_revisions.
 */
export async function updateDevManualPage(
  id: string,
  input: UpdatePageInput,
  expectedLockVersion: number | null,
  actor: ManualActor,
): Promise<UpdateResult> {
  return db.transaction(async (tx): Promise<UpdateResult> => {
    const [current] = await tx.select().from(devManualPages).where(eq(devManualPages.id, id)).limit(1);
    if (!current) return { ok: false, reason: "not_found" };
    if (expectedLockVersion != null && current.editLockVersion !== expectedLockVersion) {
      return { ok: false, reason: "conflict", currentLockVersion: current.editLockVersion };
    }

    const set: Record<string, unknown> = {
      version: current.version + 1,
      editLockVersion: current.editLockVersion + 1,
      lastEditedBy: actor.userId ?? null,
      lastEditedByApiKeyId: actor.apiKeyId ?? null,
      updatedAt: sql`now()`,
    };
    if (input.title !== undefined) set.title = input.title;
    if (input.summary !== undefined) set.summary = input.summary;
    if (input.section !== undefined) set.section = input.section;
    if (input.contentMd !== undefined) set.contentMd = input.contentMd;
    if (input.displayOrder !== undefined) set.displayOrder = input.displayOrder;
    if (input.isPublished !== undefined) set.isPublished = input.isPublished;

    // Conditional update guards against a race between the read above and here.
    const updated = await tx
      .update(devManualPages)
      .set(set)
      .where(
        expectedLockVersion != null
          ? and(eq(devManualPages.id, id), eq(devManualPages.editLockVersion, expectedLockVersion))
          : eq(devManualPages.id, id),
      )
      .returning();
    if (updated.length === 0) {
      const [fresh] = await tx.select({ v: devManualPages.editLockVersion }).from(devManualPages).where(eq(devManualPages.id, id)).limit(1);
      if (!fresh) return { ok: false, reason: "not_found" };
      return { ok: false, reason: "conflict", currentLockVersion: fresh.v };
    }
    const page = updated[0];
    await tx.insert(devManualRevisions).values({
      pageId: page.id,
      version: page.version,
      title: page.title,
      contentMd: page.contentMd,
      changeSummary: input.changeSummary ?? null,
      editedBy: actor.userId ?? null,
      editedByApiKeyId: actor.apiKeyId ?? null,
    });
    return { ok: true, page };
  });
}

export async function listDevManualRevisions(pageId: string) {
  return db
    .select({
      id: devManualRevisions.id,
      version: devManualRevisions.version,
      title: devManualRevisions.title,
      changeSummary: devManualRevisions.changeSummary,
      editedBy: devManualRevisions.editedBy,
      editedByApiKeyId: devManualRevisions.editedByApiKeyId,
      createdAt: devManualRevisions.createdAt,
    })
    .from(devManualRevisions)
    .where(eq(devManualRevisions.pageId, pageId))
    .orderBy(desc(devManualRevisions.version));
}

export async function getDevManualRevision(pageId: string, version: number) {
  const [row] = await db
    .select()
    .from(devManualRevisions)
    .where(and(eq(devManualRevisions.pageId, pageId), eq(devManualRevisions.version, version)))
    .limit(1);
  return row || null;
}

/** Restore a prior revision's content as a new version (via updateDevManualPage). */
export async function revertDevManualPage(pageId: string, version: number, expectedLockVersion: number | null, actor: ManualActor): Promise<UpdateResult> {
  const rev = await getDevManualRevision(pageId, version);
  if (!rev) return { ok: false, reason: "not_found" };
  return updateDevManualPage(
    pageId,
    { title: rev.title, contentMd: rev.contentMd, changeSummary: `Reverted to version ${version}` },
    expectedLockVersion,
    actor,
  );
}

export async function deleteDevManualPage(id: string): Promise<boolean> {
  const deleted = await db.delete(devManualPages).where(eq(devManualPages.id, id)).returning({ id: devManualPages.id });
  return deleted.length > 0;
}

/** Full-text search over the GIN-indexed tsvector; returns ranked snippets. */
export async function searchDevManual(query: string) {
  const q = query.trim();
  if (!q) return [];
  const result = await db.execute(sql`
    SELECT id, slug, title, section, summary,
           ts_rank(search_tsv, websearch_to_tsquery('english', ${q})) AS rank,
           ts_headline('english', content_md, websearch_to_tsquery('english', ${q}),
             'StartSel=**,StopSel=**,MaxFragments=2,MinWords=5,MaxWords=20') AS snippet
    FROM dev_manual_pages
    WHERE is_published = true
      AND search_tsv @@ websearch_to_tsquery('english', ${q})
    ORDER BY rank DESC
    LIMIT 20
  `);
  return result.rows as Array<{ id: string; slug: string; title: string; section: string; summary: string | null; rank: number; snippet: string }>;
}

// ----- Structured data dictionary (agent-readable) -----

/** All documented tables with their purpose + column count. */
export async function listDictTables() {
  return db
    .select({ tableName: devManualTableInfo.tableName, domainKey: devManualTableInfo.domainKey, purpose: devManualTableInfo.purpose, columnCount: devManualTableInfo.columnCount })
    .from(devManualTableInfo)
    .orderBy(asc(devManualTableInfo.domainKey), asc(devManualTableInfo.tableName));
}

/** A single table: purpose, FKs, sample queries, and its full column dictionary. */
export async function getDictTable(tableName: string) {
  const [info] = await db.select().from(devManualTableInfo).where(eq(devManualTableInfo.tableName, tableName)).limit(1);
  const columns = await db
    .select({
      column: devManualDictionary.columnName, type: devManualDictionary.dataType, nullable: devManualDictionary.isNullable,
      meaning: devManualDictionary.meaning, relationships: devManualDictionary.relationships,
      allowedValues: devManualDictionary.allowedValues, notes: devManualDictionary.notes,
    })
    .from(devManualDictionary)
    .where(eq(devManualDictionary.tableName, tableName))
    .orderBy(asc(devManualDictionary.ordinal));
  if (!info && columns.length === 0) return null;
  return {
    table: tableName,
    domain: info?.domainKey ?? null,
    purpose: info?.purpose ?? null,
    foreignKeys: info?.foreignKeys ?? [],
    sampleQueries: info?.sampleQueries ?? [],
    columns,
  };
}

/** Fuzzy search a field/column across all tables (for "what is X?" agent questions). */
export async function searchDictColumns(query: string, table?: string) {
  const q = (query || "").trim();
  if (!q && !table) return [];
  if (table && !q) {
    const t = await getDictTable(table);
    return t ? t.columns.map((c: any) => ({ tableName: table, columnName: c.column, dataType: c.type, isNullable: c.nullable, meaning: c.meaning, relationships: c.relationships, allowedValues: c.allowedValues, rank: 1 })) : [];
  }
  // Combine exact/substring column-name matching (for "what is <field>?" lookups,
  // which full-text tokenization can miss) with full-text over meaning/relationships.
  const like = `%${q}%`;
  const result = await db.execute(sql`
    SELECT table_name, column_name, data_type, is_nullable, meaning, relationships, allowed_values,
           GREATEST(
             CASE WHEN lower(column_name) = lower(${q}) THEN 3
                  WHEN column_name ILIKE ${like} OR table_name ILIKE ${like} THEN 2
                  ELSE 0 END,
             ts_rank(search_tsv, websearch_to_tsquery('english', ${q}))
           ) AS rank
    FROM dev_manual_dictionary
    WHERE (column_name ILIKE ${like} OR table_name ILIKE ${like}
           OR search_tsv @@ websearch_to_tsquery('english', ${q}))
      ${table ? sql`AND table_name = ${table}` : sql``}
    ORDER BY rank DESC, table_name, column_name
    LIMIT 40
  `);
  return result.rows;
}

/** Discovery doc telling an agent what this is and how to query it. */
export async function getDictOverview() {
  const [counts] = (await db.execute(sql`
    SELECT (SELECT count(*) FROM dev_manual_table_info) AS tables,
           (SELECT count(*) FROM dev_manual_dictionary) AS columns,
           (SELECT count(*) FROM dev_manual_pages WHERE is_published) AS pages
  `)).rows as any[];
  const domains = (await db.execute(sql`SELECT DISTINCT domain_key FROM dev_manual_table_info WHERE domain_key IS NOT NULL ORDER BY domain_key`)).rows.map((r: any) => r.domain_key);
  return {
    name: "__APP_NAME__ — Developer Manual", // [EDIT] your app name,
    description: "Authoritative definitions of the system's data model. Answer from this; do not guess field meanings, units, or relationships.",
    maintenanceMandate: "KEEP THIS CURRENT. Any workflow (human or agent) that changes the database schema or system architecture — new/renamed/dropped tables or columns, changed relationships, new status values, or new subsystems — MUST update the affected developer-manual page(s) and data dictionary in the same change, before the work is considered done. Write to PUT /pages/:id (or POST a new page) and re-run scripts/seed-dev-manual.cjs to refresh the dictionary. Stale documentation makes every downstream agent answer wrong.",
    counts,
    domains,
    howToQuery: {
      list_tables: "GET /dictionary/tables",
      get_table: "GET /dictionary/tables/{table_name} — purpose, foreign keys, sample queries, and every column's meaning/type/nullability/allowed-values",
      find_field: "GET /dictionary/columns?q={text}  (or ?table={t}) — search a column/field by name or meaning across all tables",
      search_prose: "GET /search?q={text} — full-text search of the narrative manual pages",
      read_page: "GET /pages/{slug} — a domain's narrative page (Markdown)",
    },
    note: "When the documented total ('Items' = quantity of WHAT) is ambiguous, the meaning field states the unit explicitly.",
  };
}

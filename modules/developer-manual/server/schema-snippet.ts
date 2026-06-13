// Developer Manual — Drizzle schema snippet.
// [EDIT] Paste these table declarations into your app's shared/schema.ts.
// Requires these imports to already exist in that file (Drizzle pg-core):
//   pgTable, varchar, text, integer, boolean, timestamp, jsonb, index, unique, sql
//   createInsertSchema (drizzle-zod), z (zod)
// [EDIT] `users` and `apiKeys` below must reference YOUR existing user + API-key
// tables. If your API-key table isn't called `apiKeys`, adjust the .references().
// If you don't use Drizzle, skip this file and use sql/migrate-snippet.sql instead.

export const devManualPages = pgTable("dev_manual_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug", { length: 150 }).notNull().unique(),
  title: text("title").notNull(),
  section: varchar("section", { length: 60 }).notNull().default('Domains'),
  summary: text("summary"),
  contentMd: text("content_md").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(true),
  version: integer("version").notNull().default(1),
  // Optimistic-concurrency token: PUT sends expected value (If-Match); a conditional
  // UPDATE bumps it, so a stale writer gets 0 rows -> 409 Conflict.
  editLockVersion: integer("edit_lock_version").notNull().default(1),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdByApiKeyId: varchar("created_by_api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
  lastEditedBy: varchar("last_edited_by").references(() => users.id, { onDelete: "set null" }),
  lastEditedByApiKeyId: varchar("last_edited_by_api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: 'string' }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { mode: 'string' }).notNull().default(sql`now()`),
}, (table) => ({
  sectionOrderIdx: index("idx_dev_manual_pages_section_order").on(table.section, table.displayOrder),
  publishedIdx: index("idx_dev_manual_pages_published").on(table.isPublished),
}));

export const devManualRevisions = pgTable("dev_manual_revisions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pageId: varchar("page_id").notNull().references(() => devManualPages.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  contentMd: text("content_md").notNull(),
  changeSummary: text("change_summary"),
  editedBy: varchar("edited_by").references(() => users.id, { onDelete: "set null" }),
  editedByApiKeyId: varchar("edited_by_api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: 'string' }).notNull().default(sql`now()`),
}, (table) => ({
  pageVersionUnique: unique("uq_dev_manual_revisions_page_version").on(table.pageId, table.version),
  pageIdx: index("idx_dev_manual_revisions_page").on(table.pageId),
}));

// Structured, agent-queryable data dictionary (generated/derived; full-refreshed on seed).
export const devManualTableInfo = pgTable("dev_manual_table_info", {
  tableName: varchar("table_name", { length: 120 }).primaryKey(),
  domainKey: varchar("domain_key", { length: 60 }),
  purpose: text("purpose"),
  foreignKeys: jsonb("foreign_keys").default(sql`'[]'::jsonb`),
  sampleQueries: jsonb("sample_queries").default(sql`'[]'::jsonb`),
  columnCount: integer("column_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { mode: 'string' }).notNull().default(sql`now()`),
});

export const devManualDictionary = pgTable("dev_manual_dictionary", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tableName: varchar("table_name", { length: 120 }).notNull(),
  columnName: varchar("column_name", { length: 120 }).notNull(),
  dataType: varchar("data_type", { length: 120 }),
  isNullable: boolean("is_nullable"),
  meaning: text("meaning"),
  relationships: text("relationships"),
  allowedValues: text("allowed_values"),
  notes: text("notes"),
  domainKey: varchar("domain_key", { length: 60 }),
  ordinal: integer("ordinal").notNull().default(0),
}, (table) => ({
  tableNameIdx: index("idx_dev_manual_dictionary_table").on(table.tableName),
  colUnique: unique("uq_dev_manual_dictionary_table_col").on(table.tableName, table.columnName),
}));

export const insertDevManualPageSchema = createInsertSchema(devManualPages).omit({
  id: true, version: true, editLockVersion: true, createdAt: true, updatedAt: true,
  createdBy: true, createdByApiKeyId: true, lastEditedBy: true, lastEditedByApiKeyId: true,
});
export type DevManualPage = typeof devManualPages.$inferSelect;
export type DevManualRevision = typeof devManualRevisions.$inferSelect;
export type DevManualTableInfo = typeof devManualTableInfo.$inferSelect;
export type DevManualDictionaryEntry = typeof devManualDictionary.$inferSelect;

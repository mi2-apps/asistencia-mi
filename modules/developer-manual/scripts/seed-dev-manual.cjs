#!/usr/bin/env node
/**
 * Seed the Developer Manual from docs/developer-manual/seed/*.md (pages) and
 * docs/developer-manual/seed/dictionary/*.json (structured data dictionary).
 *
 * Generic / directory-driven: drop your own Markdown pages + per-domain JSON in
 * those folders and run this. Idempotent for pages (inserts only missing slugs,
 * never overwrites edits); full-refreshes the dictionary each run and pulls
 * nullability authoritatively from the live DB's information_schema.
 *
 * Usage: node scripts/seed-dev-manual.cjs [dbName]
 * [EDIT] Set DB connection below to match your app (host/user/password/db).
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// [EDIT] connection — defaults assume local Postgres user/pass "master".
const DB = process.argv[2] || process.env.PGDATABASE || 'CHANGEME_dev';
const PG = { host: process.env.PGHOST || 'localhost', user: process.env.PGUSER || 'master', password: process.env.PGPASSWORD || 'master', database: DB };

const SEED_DIR = path.join(__dirname, '..', 'docs', 'developer-manual', 'seed');
const DICT_DIR = path.join(SEED_DIR, 'dictionary');

// Friendly titles + order for the Guide-section files (anything else starting with
// "_" still lands in Guide; non-"_" files are Domains, ordered alphabetically).
const GUIDE_TITLES = {
  '_index.md': { slug: 'index', title: 'Index & Reading Guide', order: 0 },
  '_glossary.md': { slug: 'glossary', title: 'Glossary & Conventions', order: 1 },
  '_relationships.md': { slug: 'relationships', title: 'Entity Relationships', order: 2 },
  '_data-flows.md': { slug: 'data-flows', title: 'Data Flows', order: 3 },
};

const API_PAGE = {
  slug: 'developer-manual-api', title: 'Developer Manual API (editing)', section: 'Guide', order: 4,
  content: `## Developer Manual API (editing)

Collaboratively editable so engineers and AI agents keep it current. Two auth paths feed the same store; every write snapshots a revision and uses **optimistic concurrency**.

### Auth
- **Humans (browser):** session cookie; admin/supervisor. Base \`/api/v1/developer-manual\`.
- **Agents:** \`Authorization: Bearer <key_id>.<secret>\` with permission \`developer_manual: ["read","write"]\`. Base \`/api/v1/external/developer-manual\`.

### Endpoints
GET \`/pages\`, GET \`/pages/:slug\`, GET \`/search?q=\`, POST \`/pages\`, PUT \`/pages/:id\` (send \`If-Match: <editLockVersion>\`), GET \`/pages/:id/history[/:version]\`, POST \`/pages/:id/revert/:version\`, DELETE \`/pages/:id\` (admin). Dictionary: GET \`/dictionary/tables\`, \`/dictionary/tables/:table\`, \`/dictionary/columns?q=\`, \`/overview\`. MCP at \`/mcp\`.

### Concurrency
Read the page, note \`editLockVersion\`, send it as \`If-Match\` on PUT. Mismatch returns **409** with \`currentLockVersion\`; re-read and retry. The full revision log makes any overwrite recoverable.

### Format
Pages are **Markdown** (\`contentMd\`), rendered with react-markdown.`,
};

function deriveTitle(md, fallback) { const m = md.match(/^##\s+(.+)$/m); return m ? m[1].trim() : fallback; }
function deriveSummary(md) {
  for (const l0 of md.split('\n')) {
    const l = l0.trim();
    if (!l || l.startsWith('#') || l.startsWith('|') || l.startsWith('```') || l.startsWith('-') || l.startsWith('_')) continue;
    return l.replace(/[*`>]/g, '').slice(0, 240);
  }
  return null;
}

async function main() {
  const client = new Client(PG);
  await client.connect();
  try {
    // [EDIT] who authored the seed rows — first admin by default.
    const admin = await client.query("SELECT id FROM users WHERE role='admin' ORDER BY created_at LIMIT 1");
    const adminId = admin.rows[0] && admin.rows[0].id;
    if (!adminId) throw new Error('No admin user found (adjust this query for your users table)');

    // Build the page list from the seed directory.
    const entries = [];
    const files = fs.existsSync(SEED_DIR) ? fs.readdirSync(SEED_DIR).filter((f) => f.endsWith('.md')) : [];
    let domainOrder = 10;
    for (const f of files.sort()) {
      if (f.startsWith('_')) {
        const g = GUIDE_TITLES[f];
        entries.push({ file: f, slug: g ? g.slug : f.replace(/^_|\.md$/g, ''), section: 'Guide', order: g ? g.order : 5, title: g && g.title });
      } else {
        entries.push({ file: f, slug: f.replace(/\.md$/, ''), section: 'Domains', order: domainOrder++ });
      }
    }
    entries.push(API_PAGE);

    let inserted = 0, skipped = 0;
    for (const e of entries) {
      const content = e.content || fs.readFileSync(path.join(SEED_DIR, e.file), 'utf8');
      const title = e.title || deriveTitle(content, e.slug);
      const summary = deriveSummary(content);
      const exists = await client.query('SELECT id FROM dev_manual_pages WHERE slug=$1', [e.slug]);
      if (exists.rows.length) { skipped++; continue; }
      const ins = await client.query(
        `INSERT INTO dev_manual_pages (slug, title, section, summary, content_md, display_order, is_published, created_by, last_edited_by)
         VALUES ($1,$2,$3,$4,$5,$6,true,$7,$7) RETURNING id, version`,
        [e.slug, title, e.section, summary, content, e.order, adminId]);
      const page = ins.rows[0];
      await client.query(
        `INSERT INTO dev_manual_revisions (page_id, version, title, content_md, change_summary, edited_by)
         VALUES ($1,$2,$3,$4,'Initial version (seed)',$5)`,
        [page.id, page.version, title, content, adminId]);
      inserted++;
    }
    console.log(`Pages on ${DB}: ${inserted} inserted, ${skipped} skipped.`);

    // Dictionary: full refresh from per-domain JSON (dedupe to richest table version).
    if (fs.existsSync(DICT_DIR)) {
      const byTable = new Map();
      for (const f of fs.readdirSync(DICT_DIR).filter((x) => x.endsWith('.json'))) {
        const dj = JSON.parse(fs.readFileSync(path.join(DICT_DIR, f), 'utf8'));
        for (const t of dj.tables || []) {
          const cols = (t.columns || []).length;
          const prev = byTable.get(t.name);
          if (!prev || cols > prev.cols) byTable.set(t.name, { domainKey: dj.domainKey, t, cols });
        }
      }
      await client.query('TRUNCATE dev_manual_table_info');
      await client.query('TRUNCATE dev_manual_dictionary');
      // Authoritative nullability from the live DB beats the doc's stated value.
      const nullMap = new Map();
      const isc = await client.query("SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema='public'");
      for (const r of isc.rows) nullMap.set(r.table_name + '.' + r.column_name, r.is_nullable === 'YES');
      let tCount = 0, cCount = 0;
      for (const [tableName, { domainKey, t }] of byTable) {
        const cols = t.columns || [];
        await client.query(
          `INSERT INTO dev_manual_table_info (table_name, domain_key, purpose, foreign_keys, sample_queries, column_count)
           VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6)`,
          [tableName, domainKey, t.purpose || null, JSON.stringify(t.foreignKeys || []), JSON.stringify(t.sampleQueries || []), cols.length]);
        tCount++;
        for (let i = 0; i < cols.length; i++) {
          const c = cols[i];
          let nullable = typeof c.nullable === 'boolean' ? c.nullable : (String(c.nullable).toLowerCase() === 'true' || String(c.nullable).toLowerCase() === 'yes' ? true : (c.nullable == null ? null : false));
          const real = nullMap.get(tableName + '.' + c.name);
          if (real !== undefined) nullable = real;
          await client.query(
            `INSERT INTO dev_manual_dictionary (table_name, column_name, data_type, is_nullable, meaning, relationships, allowed_values, notes, domain_key, ordinal)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (table_name, column_name) DO NOTHING`,
            [tableName, c.name, c.type || null, nullable, c.meaning || null, c.references || null, c.allowedValues || null, c.notes || null, domainKey, i]);
          cCount++;
        }
      }
      console.log(`Dictionary on ${DB}: ${tCount} tables, ${cCount} columns (full refresh).`);
    } else {
      console.log('No dictionary/ dir — skipped dictionary seed.');
    }
  } finally {
    await client.end();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

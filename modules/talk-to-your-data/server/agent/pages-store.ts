// Persistence for agent-generated temporary pages (agent_pages). Spec is the declarative
// {title, subtitle, blocks[]} document; blocks are stored WITHOUT data and re-resolved live
// on GET. Writes are parameterized here — the agent never writes SQL into this table.
//
// ── TEMPLATE: generic. `query`/`queryOne` are your app's pg helpers (server/db.ts). They
//    use `?` placeholders here — if your helper uses $1/$2, adapt the calls. ──
import { query, queryOne } from "../db.js";
import { validateBlock, type Block } from "./blocks.js";

export interface PageSpec {
  title: string;
  subtitle?: string;
  blocks: Block[];
}

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no look-alikes
function makeSlug(n = 8): string {
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export async function createPage(opts: {
  title: string;
  subtitle?: string;
  blocks: Block[];
  owner?: string;
  chatId?: string;
  expiresDays?: number;
}): Promise<{ slug: string; url: string; expiresAt: string }> {
  const blocks = (opts.blocks ?? []).map(validateBlock);
  if (!blocks.length) throw new Error("a page needs at least one block");
  const days = opts.expiresDays === 7 ? 7 : 30; // 7 or 30 only; default 30
  const spec: PageSpec = { title: opts.title, subtitle: opts.subtitle, blocks };
  // Retry slug on the off chance of a collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = makeSlug();
    try {
      const row = await queryOne<{ expires_at: string }>(
        `INSERT INTO agent_pages (slug, title, subtitle, spec, owner, chat_id, expires_at)
         VALUES (?, ?, ?, ?::jsonb, ?, ?, now() + (? || ' days')::interval)
         RETURNING expires_at`,
        [slug, opts.title, opts.subtitle ?? null, JSON.stringify(spec), opts.owner ?? null, opts.chatId ?? null, String(days)],
      );
      return { slug, url: `/p/${slug}`, expiresAt: String(row?.expires_at ?? "") };
    } catch (e: any) {
      if (!/duplicate key/i.test(String(e?.message))) throw e;
    }
  }
  throw new Error("could not allocate a page slug");
}

export async function getPageMeta(slug: string) {
  return queryOne<{
    slug: string; title: string; subtitle: string | null; spec: PageSpec; chat_id: string | null;
    owner: string | null; created_at: string; expires_at: string; extended_count: number; view_count: number;
  }>(`SELECT * FROM agent_pages WHERE slug = ? AND expires_at > now()`, [slug]);
}

export async function bumpView(slug: string): Promise<void> {
  await query(`UPDATE agent_pages SET view_count = view_count + 1 WHERE slug = ?`, [slug]).catch(() => {});
}

export async function extendPage(slug: string): Promise<{ expiresAt: string } | null> {
  const row = await queryOne<{ expires_at: string }>(
    `UPDATE agent_pages SET expires_at = greatest(expires_at, now()) + interval '30 days',
            extended_count = extended_count + 1
     WHERE slug = ? AND expires_at > now() RETURNING expires_at`, [slug]);
  return row ? { expiresAt: String(row.expires_at) } : null;
}

export async function listPages(owner?: string) {
  return query(
    `SELECT slug, title, subtitle, created_at, expires_at, view_count, extended_count
     FROM agent_pages WHERE expires_at > now() ${owner ? "AND owner = ?" : ""}
     ORDER BY created_at DESC LIMIT 100`, owner ? [owner] : []);
}

export async function deletePage(slug: string, owner?: string): Promise<boolean> {
  await query(
    `DELETE FROM agent_pages WHERE slug = ? ${owner ? "AND owner = ?" : ""}`,
    owner ? [slug, owner] : [slug]);
  return true;
}

export async function cleanupExpired(): Promise<number> {
  const rows = await query<{ slug: string }>(`DELETE FROM agent_pages WHERE expires_at < now() RETURNING slug`);
  return rows.length;
}

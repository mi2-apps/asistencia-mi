// ════════════════════════════════════════════════════════════════════════════
//  CHAT + PAGES ROUTES — paste into your existing server/routes.ts (under your
//  authenticated `api` Router). These are the endpoints the client talks to.
// ════════════════════════════════════════════════════════════════════════════
// Imports you'll need at the top of routes.ts (adjust paths):
//   import { randomUUID } from "node:crypto";
//   import { query, queryOne } from "./db.js";
//   import { openrouterReady } from "./agent/openrouter.js";
//   import { runAgent, type AgentEvent } from "./agent/loop.js";
//   import * as pages from "./agent/pages-store.js";
//   import { resolveBlocks } from "./agent/blocks.js";
//
// `ok(fn)(req,res)` is assumed to be your existing async-handler wrapper that JSON-encodes the
// resolved value / 500s on throw. `api` is your auth-gated Express Router. All routes here are
// behind your SSO + allowlist (the agent must never be public — it can read your whole DB).

// owner = stable per-user id, used to scope chat threads + pages to the signed-in user.
const ownerOf = (req: any): string | undefined =>
  (req.user?.email as string) || (req.user?.sub as string) || undefined;

// Is the chat feature available (OpenRouter key configured)?
api.get("/chat/status", (_req, res) => res.json({ enabled: openrouterReady }));

// Recent chat audit for monitoring (auth-gated). Each turn's prompt, last reply, SQL run, cost,
// and any tool/model error — surfaces issues without reading raw logs. Restrict to admins if needed.
api.get("/chat/logs", (req, res) => ok(async () => {
  const limit = Math.min(Number(req.query.limit ?? 30), 100);
  const rows = await query<any>(
    `SELECT id, owner, title, total_cost_usd, sql_log, messages, created_at, updated_at
     FROM agent_chats ORDER BY updated_at DESC LIMIT ?`, [limit]);
  return rows.map((r) => {
    const msgs = Array.isArray(r.messages) ? r.messages : [];
    let lastReply: string | null = null;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m?.role === "assistant" && typeof m.content === "string" && m.content) { lastReply = m.content.slice(0, 800); break; }
    }
    let lastError: string | null = null;
    for (const m of msgs) {
      if (m?.role === "tool" && typeof m.content === "string" && m.content.includes('"error"')) {
        try { const j = JSON.parse(m.content); if (j?.error) lastError = String(j.error); } catch { /* */ }
      }
    }
    const sql = Array.isArray(r.sql_log) ? r.sql_log : [];
    return {
      id: r.id, owner: r.owner, title: r.title, cost: Number(r.total_cost_usd ?? 0),
      sqlCount: sql.length, sql, lastReply, lastError, created_at: r.created_at, updated_at: r.updated_at,
    };
  });
})(req, res));

// Streamed agent turn (Server-Sent Events). Body: { chatId?, message, lang? }.
api.post("/chat", async (req: any, res) => {
  const message = String(req.body?.message ?? "").trim();
  if (!message) return res.status(400).json({ error: { code: "bad_request", message: "message required" } });
  if (!openrouterReady)
    return res.status(503).json({ error: { code: "not_configured", message: "Chat is not configured — set OPENROUTER_API_KEY." } });

  const owner = ownerOf(req);
  const chatId = String(req.body?.chatId ?? "") || randomUUID();

  // Load prior turns for follow-up context.
  let history: any[] = [];
  if (req.body?.chatId) {
    const row = await queryOne<{ messages: any[] }>("SELECT messages FROM agent_chats WHERE id = ?", [chatId]).catch(() => undefined);
    if (Array.isArray(row?.messages)) history = row!.messages;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // don't let nginx/Coolify buffer the stream
  (res as any).flushHeaders?.();
  const send = (e: AgentEvent | { type: string; [k: string]: unknown }) => {
    // Swallow write errors: if the client (esp. mobile Safari) drops the stream, the turn must
    // keep running so the final answer still gets persisted and can be recovered on reload.
    try { res.write(`data: ${JSON.stringify(e)}\n\n`); (res as any).flush?.(); } catch { /* client gone */ }
  };
  // Keepalive comments so a slow turn doesn't look dead and idle proxies don't close us.
  const keepalive = setInterval(() => { try { res.write(": ping\n\n"); } catch { /* closed */ } }, 12000);
  send({ type: "chat", chatId });

  try {
    const result = await runAgent({ message, history, owner, chatId, lang: String(req.body?.lang ?? ""), emit: send });
    clearInterval(keepalive);
    // Persist ALWAYS (even if the client disconnected) so a dropped mobile stream can recover
    // the final answer by reloading the thread.
    const title = message.slice(0, 80);
    await query(
      `INSERT INTO agent_chats (id, owner, title, messages, sql_log, total_cost_usd, updated_at)
       VALUES (?, ?, ?, ?::jsonb, ?::jsonb, ?, now())
       ON CONFLICT (id) DO UPDATE SET messages = EXCLUDED.messages, sql_log = EXCLUDED.sql_log,
         total_cost_usd = agent_chats.total_cost_usd + EXCLUDED.total_cost_usd, updated_at = now()`,
      [chatId, owner ?? null, title, JSON.stringify(result.messages).slice(0, 4_000_000),
       JSON.stringify(result.sqlLog).slice(0, 500_000), result.cost],
    ).catch((e) => console.warn("[chat] persist failed", e?.message ?? e));
  } catch (e: any) {
    send({ type: "error", message: String(e?.message ?? e) });
  } finally {
    clearInterval(keepalive);
  }
  res.end();
});

// List the signed-in user's recent chat threads (most-recent first) — so their history
// follows them across devices (localStorage is per-device and can't do that).
api.get("/chats", (req: any, res) => ok(async () => {
  const owner = ownerOf(req);
  if (!owner) return [];
  return query(
    `SELECT id, COALESCE(NULLIF(title,''), 'Chat') AS title, updated_at
     FROM agent_chats WHERE owner = ? ORDER BY updated_at DESC LIMIT 30`, [owner]);
})(req, res));

// Load a saved chat thread's display history (per-user memory). Owner-scoped.
api.get("/chat/:id", (req: any, res) => ok(async () => {
  const owner = ownerOf(req);
  const row = await queryOne<{ owner: string | null; messages: any[] }>(
    "SELECT owner, messages FROM agent_chats WHERE id = ?", [String(req.params.id)]);
  if (!row || (owner && row.owner && row.owner !== owner)) return { id: req.params.id, messages: [] };
  const msgs = Array.isArray(row.messages) ? row.messages : [];
  const out: { role: string; text: string }[] = [];
  for (const m of msgs) {
    if (m?.role === "user" && typeof m.content === "string" && m.content.trim()) out.push({ role: "user", text: m.content });
    else if (m?.role === "assistant" && typeof m.content === "string" && m.content.trim()) out.push({ role: "assistant", text: m.content });
  }
  return { id: req.params.id, messages: out };
})(req, res));

// List my live temp pages.
api.get("/pages", (req: any, res) => ok(() => pages.listPages(ownerOf(req)))(req, res));

// View a temp page — re-resolve each block's SQL LIVE on view.
api.get("/pages/:slug", async (req, res) => {
  try {
    const meta = await pages.getPageMeta(String(req.params.slug));
    if (!meta) return res.status(404).json({ error: { code: "not_found", message: "page not found or expired" } });
    pages.bumpView(meta.slug);
    const blocks = await resolveBlocks(meta.spec?.blocks ?? []);
    res.json({
      slug: meta.slug, title: meta.title, subtitle: meta.subtitle, chat_id: (meta as any).chat_id ?? null,
      created_at: meta.created_at, expires_at: meta.expires_at,
      extended_count: meta.extended_count, view_count: meta.view_count, blocks,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: "page_failed", message: String(err?.message ?? err) } });
  }
});

// Refine an existing dashboard in place ("show only last 30 days", "only Texas", …). Re-runs
// the agent over the page's blocks with the instruction and returns refreshed blocks. Ephemeral
// — the saved page is unchanged; the client just re-renders the filtered result.
api.post("/pages/:slug/refine", async (req: any, res) => {
  const instruction = String(req.body?.instruction ?? "").trim();
  if (!instruction) return res.status(400).json({ error: { code: "bad_request", message: "instruction required" } });
  if (!openrouterReady) return res.status(503).json({ error: { code: "not_configured", message: "chat not configured" } });
  try {
    const meta = await pages.getPageMeta(String(req.params.slug));
    if (!meta) return res.status(404).json({ error: { code: "not_found", message: "page not found or expired" } });
    const blocks = (meta.spec?.blocks ?? []).filter((b: any) => b.kind !== "markdown");
    const collected: any[] = [];
    const msg =
      `Refine the dashboard titled "${meta.title}". Its blocks as JSON (each has a 'sql'):\n` +
      `${JSON.stringify(blocks)}\n\n` +
      `Apply this to the WHOLE dashboard: "${instruction}". For EACH block call render_block with the ` +
      `SAME kind/title/viz fields but edit its sql to apply the filter (read-only SELECT). Use ` +
      `describe_schema to find the right column if unsure. Do NOT create_page — just render_block each ` +
      `refined block, in the original order.`;
    await runAgent({ message: msg, owner: ownerOf(req), chatId: meta.chat_id ?? undefined, lang: String(req.body?.lang ?? ""), emit: (e) => { if (e.type === "block") collected.push((e as any).block); } });
    const out = collected.length ? collected : await resolveBlocks(meta.spec?.blocks ?? []);
    res.json({ blocks: out, applied: instruction });
  } catch (err: any) {
    res.status(500).json({ error: { code: "refine_failed", message: String(err?.message ?? err) } });
  }
});

api.post("/pages/:slug/extend", (req, res) => ok(async () => {
  const r = await pages.extendPage(String(req.params.slug));
  if (!r) throw new Error("page not found or expired");
  return r;
})(req, res));

api.delete("/pages/:slug", (req: any, res) => ok(() => pages.deletePage(String(req.params.slug), ownerOf(req)))(req, res));

// ── In server entrypoint (index.ts), after the DB pool is ready: ──
//   import { scheduleAgentCleanup } from "./agent/cleanup.js";
//   scheduleAgentCleanup();   // hourly sweep of expired pages

// Developer Manual — MCP server (Streamable HTTP, read-only)
// Exposes the manual + structured data dictionary as MCP tools so AI agents can
// read and search the data model through a standard protocol (Claude, Claude Code,
// any MCP client). Mounted under the key-authed external API; the same
// developer_manual:read API keys authorize it. Tools call the storage layer
// in-process (no internal HTTP round-trip).
import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  listDictTables, getDictTable, searchDictColumns, getDictOverview,
  searchDevManual, getDevManualPageBySlug,
} from "../devManualStorage";

const asText = (o: unknown) => ({ content: [{ type: "text" as const, text: typeof o === "string" ? o : JSON.stringify(o, null, 2) }] });

function buildServer(): McpServer {
  const server = new McpServer({ name: "__APP_NAME__-developer-manual" /* [EDIT] your app slug */, version: "1.0.0" });

  server.registerTool("dev_manual_overview",
    { description: "Discovery doc for the MI AI Manifest data model: counts, domains, and how to query. Call this first.", inputSchema: {} },
    async () => asText(await getDictOverview()));

  server.registerTool("dev_manual_list_tables",
    { description: "List every documented database table with its domain and purpose.", inputSchema: {} },
    async () => asText(await listDictTables()));

  server.registerTool("dev_manual_get_table",
    { description: "Get a table's full definition: purpose, foreign keys, sample queries, and every column's meaning, type, nullability, and allowed values. Use this instead of guessing what a column means.", inputSchema: { table: z.string().describe("Exact SQL table name, e.g. 'rail_shipments'") } },
    async ({ table }) => { const t = await getDictTable(table); return asText(t ?? { error: `Table '${table}' is not documented. Call dev_manual_list_tables for valid names.` }); });

  server.registerTool("dev_manual_find_field",
    { description: "Find what a field/column means across all tables (answers 'what is X?', 'what is qty the quantity of?', 'what does seg mean?'). Optionally restrict to one table.", inputSchema: { query: z.string().describe("Field name or concept to look up"), table: z.string().optional().describe("Optional table to restrict to") } },
    async ({ query, table }) => asText(await searchDictColumns(query, table)));

  server.registerTool("dev_manual_search",
    { description: "Full-text search of the narrative manual pages (domain overviews, relationships, data flows, glossary).", inputSchema: { query: z.string() } },
    async ({ query }) => asText(await searchDevManual(query)));

  server.registerTool("dev_manual_read_page",
    { description: "Read a full narrative manual page (Markdown) by slug, e.g. 'rail', 'pallets', 'glossary', 'relationships', 'data-flows'.", inputSchema: { slug: z.string() } },
    async ({ slug }) => { const p = await getDevManualPageBySlug(slug); return asText(p ? { slug: p.slug, title: p.title, contentMd: p.contentMd } : { error: `Page '${slug}' not found.` }); });

  return server;
}

// Stateful Streamable HTTP: transports keyed by Mcp-Session-Id. JSON responses
// (enableJsonResponse) keep it simple for clients and curl-testable.
const transports: Record<string, StreamableHTTPServerTransport> = {};

export async function devManualMcpPost(req: Request, res: Response) {
  try {
    const sid = req.headers["mcp-session-id"] as string | undefined;
    let transport = sid ? transports[sid] : undefined;

    if (!transport) {
      if (sid || !isInitializeRequest(req.body)) {
        return res.status(400).json({ jsonrpc: "2.0", error: { code: -32000, message: "Bad Request: no valid session; send an initialize request first." }, id: null });
      }
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (id) => { transports[id] = transport!; },
      });
      transport.onclose = () => { if (transport!.sessionId) delete transports[transport!.sessionId]; };
      await buildServer().connect(transport);
    }
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("devManual MCP post", e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
  }
}

// GET (SSE stream) / DELETE (end session) for an existing session.
export async function devManualMcpSession(req: Request, res: Response) {
  const sid = req.headers["mcp-session-id"] as string | undefined;
  const transport = sid ? transports[sid] : undefined;
  if (!transport) return res.status(400).json({ error: "Invalid or missing Mcp-Session-Id" });
  await transport.handleRequest(req, res);
}

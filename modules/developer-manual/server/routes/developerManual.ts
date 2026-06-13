// [EDIT] Auth guards assume req.session.user.role in {admin, supervisor}. Adjust requireAuth/requireManualAccess to your session + RBAC.
// Developer Manual — session-authenticated API (Migration 0141)
// Browser path for human engineers. Read + write restricted to admin/supervisor;
// delete to admin. Writes use optimistic concurrency (If-Match: <editLockVersion>).
// AI agents use the mirrored key-authed routes in routes/externalApi.ts.
import { Router, Request, Response } from "express";
import {
  listDevManualPages, getDevManualPageBySlug, getDevManualPageById,
  createDevManualPage, updateDevManualPage, listDevManualRevisions,
  getDevManualRevision, revertDevManualPage, deleteDevManualPage, searchDevManual,
  listDictTables, getDictTable, searchDictColumns, getDictOverview,
} from "../devManualStorage";

const router = Router();

interface AuthRequest extends Request {
  user?: { id: string; username: string; fullName: string; role: string };
}

const requireAuth = (req: AuthRequest, res: Response, next: any) => {
  if (!req.session?.user) return res.status(401).json({ error: "Authentication required" });
  req.user = req.session.user;
  next();
};

// Read + write: admin or supervisor only (NOT logistics/customer/user).
const requireManualAccess = (req: AuthRequest, res: Response, next: any) => {
  const role = req.user?.role;
  if (role !== "admin" && role !== "supervisor") {
    return res.status(403).json({ error: "Developer manual access requires admin or supervisor role" });
  }
  next();
};

const requireAdmin = (req: AuthRequest, res: Response, next: any) => {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  next();
};

function parseIfMatch(req: Request): number | null {
  const hdr = req.header("If-Match");
  const fromBody = (req.body && (req.body.expectedLockVersion ?? req.body.editLockVersion));
  const raw = hdr ?? (fromBody != null ? String(fromBody) : undefined);
  if (raw == null) return null;
  const n = parseInt(String(raw).replace(/"/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

router.use(requireAuth, requireManualAccess);

// ----- Structured data dictionary (agent-readable) -----
router.get("/overview", async (_req, res) => {
  try { res.json(await getDictOverview()); }
  catch (e) { console.error("devManual overview", e); res.status(500).json({ error: "Failed" }); }
});
router.get("/dictionary/tables", async (_req, res) => {
  try { res.json(await listDictTables()); }
  catch (e) { console.error("devManual dict tables", e); res.status(500).json({ error: "Failed" }); }
});
router.get("/dictionary/columns", async (req, res) => {
  try { res.json(await searchDictColumns(String(req.query.q || ""), req.query.table ? String(req.query.table) : undefined)); }
  catch (e) { console.error("devManual dict columns", e); res.status(500).json({ error: "Failed" }); }
});
router.get("/dictionary/tables/:table", async (req, res) => {
  try {
    const t = await getDictTable(req.params.table);
    if (!t) return res.status(404).json({ error: "Table not documented" });
    res.json(t);
  } catch (e) { console.error("devManual dict table", e); res.status(500).json({ error: "Failed" }); }
});

// List pages (nav)
router.get("/pages", async (_req, res) => {
  try {
    res.json(await listDevManualPages(true));
  } catch (e) { console.error("devManual list", e); res.status(500).json({ error: "Failed to list pages" }); }
});

// Search (must be before :slug)
router.get("/search", async (req, res) => {
  try {
    res.json(await searchDevManual(String(req.query.q || "")));
  } catch (e) { console.error("devManual search", e); res.status(500).json({ error: "Search failed" }); }
});

// Single page by slug
router.get("/pages/:slug", async (req, res) => {
  try {
    const page = await getDevManualPageBySlug(req.params.slug, true);
    if (!page) return res.status(404).json({ error: "Page not found" });
    res.json(page);
  } catch (e) { console.error("devManual get", e); res.status(500).json({ error: "Failed to fetch page" }); }
});

// Create
router.post("/pages", async (req: AuthRequest, res) => {
  try {
    const { slug, title, section, summary, contentMd, displayOrder, isPublished } = req.body || {};
    if (!slug || !title || !contentMd) return res.status(400).json({ error: "slug, title and contentMd are required" });
    const existing = await getDevManualPageBySlug(slug, true);
    if (existing) return res.status(409).json({ error: "A page with this slug already exists" });
    const page = await createDevManualPage(
      { slug, title, section, summary, contentMd, displayOrder, isPublished },
      { userId: req.user!.id },
    );
    res.status(201).json(page);
  } catch (e) { console.error("devManual create", e); res.status(500).json({ error: "Failed to create page" }); }
});

// Update (optimistic concurrency)
router.put("/pages/:id", async (req: AuthRequest, res) => {
  try {
    const { title, summary, section, contentMd, displayOrder, isPublished, changeSummary } = req.body || {};
    const result = await updateDevManualPage(
      req.params.id,
      { title, summary, section, contentMd, displayOrder, isPublished, changeSummary },
      parseIfMatch(req),
      { userId: req.user!.id },
    );
    if (!result.ok && result.reason === "not_found") return res.status(404).json({ error: "Page not found" });
    if (!result.ok && result.reason === "conflict") {
      return res.status(409).json({ error: "Edit conflict — the page changed since you loaded it. Reload and reapply.", currentLockVersion: result.currentLockVersion });
    }
    res.json((result as any).page);
  } catch (e) { console.error("devManual update", e); res.status(500).json({ error: "Failed to update page" }); }
});

// Revision history
router.get("/pages/:id/history", async (req, res) => {
  try {
    const page = await getDevManualPageById(req.params.id);
    if (!page) return res.status(404).json({ error: "Page not found" });
    res.json(await listDevManualRevisions(req.params.id));
  } catch (e) { console.error("devManual history", e); res.status(500).json({ error: "Failed to fetch history" }); }
});

router.get("/pages/:id/history/:version", async (req, res) => {
  try {
    const rev = await getDevManualRevision(req.params.id, parseInt(req.params.version, 10));
    if (!rev) return res.status(404).json({ error: "Revision not found" });
    res.json(rev);
  } catch (e) { console.error("devManual revision", e); res.status(500).json({ error: "Failed to fetch revision" }); }
});

// Revert to a prior revision
router.post("/pages/:id/revert/:version", async (req: AuthRequest, res) => {
  try {
    const result = await revertDevManualPage(req.params.id, parseInt(req.params.version, 10), parseIfMatch(req), { userId: req.user!.id });
    if (!result.ok && result.reason === "not_found") return res.status(404).json({ error: "Page or revision not found" });
    if (!result.ok && result.reason === "conflict") {
      return res.status(409).json({ error: "Edit conflict on revert.", currentLockVersion: result.currentLockVersion });
    }
    res.json((result as any).page);
  } catch (e) { console.error("devManual revert", e); res.status(500).json({ error: "Failed to revert page" }); }
});

// Delete (admin only)
router.delete("/pages/:id", requireAdmin, async (req, res) => {
  try {
    const ok = await deleteDevManualPage(req.params.id);
    if (!ok) return res.status(404).json({ error: "Page not found" });
    res.status(204).end();
  } catch (e) { console.error("devManual delete", e); res.status(500).json({ error: "Failed to delete page" }); }
});

export default router;

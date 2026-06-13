// Developer Manual — AGENT / API-KEY routes (read + write + MCP).
// [EDIT] Paste this block into your key-authed external API router (the one mounted
// at /api/v1/external behind your API-key middleware). It assumes that router
// already does `router.use(requireApiKey)` and exposes a
// `requirePermission(resource, action)` middleware that checks the key's
// permissions jsonb. If your key middleware differs, adapt requirePermission and
// `req.apiKey!.id` (the API-key UUID used for write attribution).
//
// Required imports at the top of that router file:
//   import { devManualMcpPost, devManualMcpSession } from '../mcp/devManualMcp';
//   import {
//     listDevManualPages, getDevManualPageBySlug, getDevManualPageById,
//     createDevManualPage, updateDevManualPage, listDevManualRevisions,
//     getDevManualRevision, revertDevManualPage,
//     listDictTables, getDictTable, searchDictColumns, getDictOverview, searchDevManual,
//   } from '../devManualStorage';

function devManualIfMatch(req: Request): number | null {
  const hdr = req.header('If-Match');
  const body = (req.body && (req.body.expectedLockVersion ?? req.body.editLockVersion));
  const raw = hdr ?? (body != null ? String(body) : undefined);
  if (raw == null) return null;
  const n = parseInt(String(raw).replace(/"/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

// --- MCP server (Streamable HTTP); agents connect an MCP client with a read key ---
router.post('/developer-manual/mcp', requirePermission('developer_manual', 'read'), (req, res) => devManualMcpPost(req, res));
router.get('/developer-manual/mcp', requirePermission('developer_manual', 'read'), (req, res) => devManualMcpSession(req, res));
router.delete('/developer-manual/mcp', requirePermission('developer_manual', 'read'), (req, res) => devManualMcpSession(req, res));

// --- Structured data dictionary (read-only) ---
router.get('/developer-manual/overview', requirePermission('developer_manual', 'read'), async (_req, res) => {
  res.json({ data: await getDictOverview() });
});
router.get('/developer-manual/dictionary/tables', requirePermission('developer_manual', 'read'), async (_req, res) => {
  res.json({ data: await listDictTables() });
});
router.get('/developer-manual/dictionary/columns', requirePermission('developer_manual', 'read'), async (req, res) => {
  res.json({ data: await searchDictColumns(String(req.query.q || ''), req.query.table ? String(req.query.table) : undefined) });
});
router.get('/developer-manual/dictionary/tables/:table', requirePermission('developer_manual', 'read'), async (req, res) => {
  const t = await getDictTable(req.params.table);
  if (!t) return res.status(404).json({ error: 'not_found' });
  res.json({ data: t });
});

// --- Narrative pages (read + write) ---
router.get('/developer-manual/pages', requirePermission('developer_manual', 'read'), async (_req, res) => {
  res.json({ data: await listDevManualPages(false) });
});
router.get('/developer-manual/search', requirePermission('developer_manual', 'read'), async (req, res) => {
  res.json({ data: await searchDevManual(String(req.query.q || '')) });
});
router.get('/developer-manual/pages/:slug', requirePermission('developer_manual', 'read'), async (req, res) => {
  const page = await getDevManualPageBySlug(req.params.slug, false);
  if (!page) return res.status(404).json({ error: 'not_found' });
  res.json({ data: page });
});
router.post('/developer-manual/pages', requirePermission('developer_manual', 'write'), async (req, res) => {
  const { slug, title, section, summary, contentMd, displayOrder, isPublished } = req.body || {};
  if (!slug || !title || !contentMd) return res.status(400).json({ error: 'slug, title and contentMd are required' });
  if (await getDevManualPageBySlug(slug, true)) return res.status(409).json({ error: 'slug_exists' });
  const page = await createDevManualPage({ slug, title, section, summary, contentMd, displayOrder, isPublished }, { apiKeyId: req.apiKey!.id });
  res.status(201).json({ data: page });
});
router.put('/developer-manual/pages/:id', requirePermission('developer_manual', 'write'), async (req, res) => {
  const { title, summary, section, contentMd, displayOrder, isPublished, changeSummary } = req.body || {};
  const result = await updateDevManualPage(req.params.id, { title, summary, section, contentMd, displayOrder, isPublished, changeSummary }, devManualIfMatch(req), { apiKeyId: req.apiKey!.id });
  if (!result.ok && result.reason === 'not_found') return res.status(404).json({ error: 'not_found' });
  if (!result.ok && result.reason === 'conflict') return res.status(409).json({ error: 'edit_conflict', currentLockVersion: result.currentLockVersion });
  res.json({ data: (result as any).page });
});
router.get('/developer-manual/pages/:id/history', requirePermission('developer_manual', 'read'), async (req, res) => {
  const page = await getDevManualPageById(req.params.id);
  if (!page) return res.status(404).json({ error: 'not_found' });
  res.json({ data: await listDevManualRevisions(req.params.id) });
});
router.get('/developer-manual/pages/:id/history/:version', requirePermission('developer_manual', 'read'), async (req, res) => {
  const rev = await getDevManualRevision(req.params.id, parseInt(req.params.version, 10));
  if (!rev) return res.status(404).json({ error: 'not_found' });
  res.json({ data: rev });
});
router.post('/developer-manual/pages/:id/revert/:version', requirePermission('developer_manual', 'write'), async (req, res) => {
  const result = await revertDevManualPage(req.params.id, parseInt(req.params.version, 10), devManualIfMatch(req), { apiKeyId: req.apiKey!.id });
  if (!result.ok && result.reason === 'not_found') return res.status(404).json({ error: 'not_found' });
  if (!result.ok && result.reason === 'conflict') return res.status(409).json({ error: 'edit_conflict', currentLockVersion: result.currentLockVersion });
  res.json({ data: (result as any).page });
});

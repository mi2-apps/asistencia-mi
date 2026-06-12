// Expiry sweep for temporary agent pages. setInterval + unref — hourly DELETE of pages past
// expires_at. Call scheduleAgentCleanup() once from your server entrypoint (index.ts), after
// the DB pool is ready.
//
// ── TEMPLATE: fully generic. No edits needed. ──
import { cleanupExpired } from "./pages-store.js";

export function scheduleAgentCleanup(intervalMs = 60 * 60 * 1000): void {
  const run = () =>
    cleanupExpired()
      .then((n) => { if (n) console.log(`[agent-cleanup] flushed ${n} expired page(s)`); })
      .catch((e) => console.warn("[agent-cleanup] error", e?.message ?? e));
  run();
  setInterval(run, intervalMs).unref();
}

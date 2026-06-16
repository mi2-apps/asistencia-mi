// Per-process secret that lets the in-container render-check browser bypass SSO for the
// internal page load only. Never leaves the process (the checker runs in-process), so it's
// effectively unguessable. Override via RENDER_CHECK_TOKEN if you ever externalize the checker.
import { randomUUID } from "node:crypto";
export const RENDER_TOKEN = process.env.RENDER_CHECK_TOKEN || randomUUID();

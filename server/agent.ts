/**
 * Mattermost bot agent for asistencia-mi.
 *
 * Two modes run in parallel (background, never awaited):
 *   1. MattermostPoller  — polls a shared channel (MM_CHANNEL_ID) every 15 s for user commands.
 *   2. MattermostWSAgent — persistent WebSocket that listens for DMs from other agents
 *                          (e.g. @coolify-manager) for agent-to-agent communication.
 *
 * Env vars consumed (all optional — agent silently skips if missing):
 *   MM_URL            → mibots base URL  (e.g. https://mibots.mi2.com.mx)
 *   MM_BOT_TOKEN      → permanent bot token for @asistencia-mi-agent
 *   MM_CHANNEL_ID     → #app-asistencia-mi channel ID
 *   MM2_URL           → miteams base URL
 *   MM2_BOT_TOKEN     → miteams bot token
 *   MM2_CHANNEL       → miteams channel ID
 *   STATUS_DASHBOARD_TOKEN / APP_UUID  → Coolify redeploy trigger
 */

import { WebSocket } from "ws";

const POLL_MS          = 15_000;
const POST_TIMEOUT_MS  = 20_000;
const MAX_ERRORS       = 5;
const BREAKER_PAUSE_MS = 5 * 60 * 1_000;
const RECONNECT_MS     = 10_000;
const APP_URL          = "https://asistencia-mi.mi2.com.mx";

interface MMPost {
  id: string;
  user_id: string;
  message: string;
  props: Record<string, unknown>;
  type: string;
}

interface MMPostsResponse {
  order: string[];
  posts: Record<string, MMPost>;
}

interface WSEvent {
  event?: string;
  seq?: number;
  status?: string;
  data?: {
    post?: string;
    channel_type?: string;
    [key: string]: unknown;
  };
}

const SECRET_RE = /(?:password|token|secret|api_key|apikey|auth|bearer|credential)[^\s]*\s*[:=]\s*\S{6,}/gi;
function scrub(text: string): string {
  return text.replace(SECRET_RE, "[REDACTED]");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function triggerDeploy(): Promise<boolean> {
  const token = process.env.STATUS_DASHBOARD_TOKEN;
  const uuid  = process.env.APP_UUID;
  if (!token || !uuid) return false;
  try {
    await fetch(`https://status-dashboard.mi2.com.mx/api/apps/${uuid}/env`, {
      method:  "POST",
      headers: { "X-App-Token": token, "Content-Type": "application/json" },
      body:    JSON.stringify({ key: "DEPLOY_TS", value: new Date().toISOString(), redeploy: true }),
      signal:  AbortSignal.timeout(POST_TIMEOUT_MS),
    });
    return true;
  } catch {
    return false;
  }
}

// ── Channel poller (existing commands: deploy, status) ────────────────────────

class MattermostPoller {
  private seen   = new Set<string>();
  private botId: string | null = null;
  private errors = 0;

  constructor(
    private readonly url:     string,
    private readonly token:   string,
    private readonly channel: string,
    private readonly label:   string,
  ) {}

  private async api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.url}/api/v4${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`MM ${method} ${path} → ${res.status}`);
    return res.json() as Promise<T>;
  }

  async post(message: string, rootId?: string): Promise<void> {
    await this.api("POST", "/posts", {
      channel_id: this.channel,
      message: scrub(message),
      ...(rootId ? { root_id: rootId } : {}),
    });
  }

  private async myId(): Promise<string> {
    if (!this.botId) {
      const me = await this.api<{ id: string }>("GET", "/users/me");
      this.botId = me.id;
    }
    return this.botId;
  }

  async poll(): Promise<void> {
    try {
      const myId = await this.myId();
      const resp = await this.api<MMPostsResponse>(
        "GET",
        `/channels/${this.channel}/posts?per_page=10`,
      );

      for (const id of resp.order ?? []) {
        if (this.seen.has(id)) continue;
        this.seen.add(id);
        const p = resp.posts[id];
        if (!p || p.user_id === myId || p.type || p.props?.from_bot) continue;
        await this.handle(p).catch((e) =>
          console.error(`[agent:${this.label}] handle error:`, e),
        );
      }

      this.errors = 0;
    } catch (err) {
      this.errors++;
      console.error(`[agent:${this.label}] poll error (${this.errors}/${MAX_ERRORS}):`, err);
      if (this.errors >= MAX_ERRORS) {
        console.warn(`[agent:${this.label}] circuit breaker — pausing 5 min`);
        await sleep(BREAKER_PAUSE_MS);
        this.errors = 0;
      }
    }
  }

  private async handle(post: MMPost): Promise<void> {
    const text = post.message.toLowerCase();

    if (/\bdeploy\b|\bredeploy\b/.test(text)) {
      await this.post("⏳ Disparando deploy en producción...", post.id);
      const ok = await triggerDeploy();
      await this.post(
        ok
          ? `✅ Deploy iniciado correctamente.\nVerifica: ${APP_URL}`
          : "⚠️ No se pudo disparar el deploy — `STATUS_DASHBOARD_TOKEN` o `APP_UUID` no configurados.",
        post.id,
      );
      return;
    }

    if (/\bstatus\b|\bestado\b/.test(text)) {
      await this.post(
        `🟢 **asistencia-mi** operando normalmente\n- URL: ${APP_URL}\n- Env: ${process.env.NODE_ENV ?? "production"}`,
        post.id,
      );
    }
  }

  async start(): Promise<void> {
    console.log(`[agent:${this.label}] polling channel ${this.channel} every ${POLL_MS / 1000}s`);
    for (;;) {
      await this.poll();
      await sleep(POLL_MS);
    }
  }
}

// ── WebSocket DM listener (agent-to-agent communication) ─────────────────────

class MattermostWSAgent {
  private botId: string | null = null;

  constructor(
    private readonly url:   string,
    private readonly token: string,
  ) {}

  private wsUrl(): string {
    return this.url.replace(/^https?/, (p) => (p === "https" ? "wss" : "ws")) + "/api/v4/websocket";
  }

  private async rest<T>(path: string, opts: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.url}/api/v4${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(opts.headers ?? {}),
      },
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`MM REST ${path} → ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async myId(): Promise<string> {
    if (!this.botId) {
      const me = await this.rest<{ id: string }>("/users/me");
      this.botId = me.id;
    }
    return this.botId!;
  }

  async postDM(toUserId: string, message: string): Promise<void> {
    const myId = await this.myId();
    const chan  = await this.rest<{ id: string }>("/channels/direct", {
      method: "POST",
      body:   JSON.stringify([myId, toUserId]),
    });
    await this.rest("/posts", {
      method: "POST",
      body:   JSON.stringify({ channel_id: chan.id, message: scrub(message) }),
    });
  }

  private async handle(post: MMPost): Promise<void> {
    const text = post.message;

    // S3 provisioning response from @coolify-manager
    if (/AWS_|BUCKET_|provisionad|storage.*ready|bucket.*created/i.test(text)) {
      console.log("[agent:ws] S3 provisioning message received from", post.user_id);
      await this.postDM(
        post.user_id,
        `✅ Mensaje recibido. Gracias por provisionar el storage.\n\nDispararé un redeploy para que la app tome las nuevas variables.`,
      );
      await sleep(2_000);
      const ok = await triggerDeploy();
      await this.postDM(
        post.user_id,
        ok
          ? `🚀 Redeploy iniciado. La app estará disponible en: ${APP_URL}`
          : `⚠️ No pude disparar el deploy automáticamente. Por favor redespliega manualmente la app **asistencia-mi** en Coolify.`,
      );
      return;
    }

    // Status query
    if (/\bstatus\b|\bestado\b/i.test(text)) {
      await this.postDM(
        post.user_id,
        `🟢 **asistencia-mi** operando normalmente\n- URL: ${APP_URL}\n- Env: ${process.env.NODE_ENV ?? "production"}`,
      );
      return;
    }

    // Deploy trigger
    if (/\bdeploy\b|\bredeploy\b/i.test(text)) {
      await this.postDM(post.user_id, "⏳ Disparando deploy en producción...");
      const ok = await triggerDeploy();
      await this.postDM(
        post.user_id,
        ok
          ? `✅ Deploy iniciado. Verifica: ${APP_URL}`
          : "⚠️ No se pudo disparar el deploy — variables no configuradas.",
      );
    }
  }

  private connectWS(myId: string): void {
    const ws = new WebSocket(this.wsUrl());

    ws.on("open", () => {
      ws.send(JSON.stringify({
        seq:    1,
        action: "authentication_challenge",
        data:   { token: this.token },
      }));
      console.log("[agent:ws] WebSocket connected —", this.wsUrl());
    });

    ws.on("message", (raw: Buffer) => {
      void (async () => {
        try {
          const evt = JSON.parse(raw.toString()) as WSEvent;
          if (evt.event !== "posted" || !evt.data?.post) return;

          const post        = JSON.parse(evt.data.post) as MMPost;
          const channelType = evt.data.channel_type as string | undefined;

          // Only handle DMs (type "D") not sent by ourselves
          if (channelType !== "D" || post.user_id === myId) return;

          console.log(`[agent:ws] DM from ${post.user_id}: ${post.message.slice(0, 80)}`);
          await this.handle(post);
        } catch (err) {
          console.error("[agent:ws] message error:", err);
        }
      })();
    });

    ws.on("error", (err) => {
      console.error("[agent:ws] error:", (err as Error).message);
    });

    ws.on("close", (code) => {
      console.warn(`[agent:ws] closed (${code}), reconnecting in ${RECONNECT_MS / 1000}s`);
      setTimeout(() => this.start(), RECONNECT_MS);
    });
  }

  async start(): Promise<void> {
    try {
      const myId = await this.myId();
      this.connectWS(myId);
    } catch (err) {
      console.error("[agent:ws] start error:", err);
      setTimeout(() => this.start(), RECONNECT_MS);
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function startAgent(): Promise<void> {
  const pollerConfigs = [
    { url: process.env.MM_URL,  token: process.env.MM_BOT_TOKEN,  channel: process.env.MM_CHANNEL_ID, label: "mibots"  },
    { url: process.env.MM2_URL, token: process.env.MM2_BOT_TOKEN, channel: process.env.MM2_CHANNEL,   label: "miteams" },
  ].filter((c) => c.url && c.token && c.channel) as {
    url: string; token: string; channel: string; label: string;
  }[];

  if (pollerConfigs.length === 0 && !process.env.MM_URL) {
    console.warn("[agent] No MM credentials found — agent disabled");
    return;
  }

  const pollers = pollerConfigs.map((c) => new MattermostPoller(c.url, c.token, c.channel, c.label));

  // Startup notification on mibots
  if (pollers[0]) {
    try {
      await pollers[0].post(`🟢 **asistencia-mi** online — ${new Date().toISOString()}\nURL: ${APP_URL}`);
    } catch {
      // non-fatal
    }
  }

  // WebSocket DM listener for agent-to-agent communication
  if (process.env.MM_URL && process.env.MM_BOT_TOKEN) {
    const wsAgent = new MattermostWSAgent(process.env.MM_URL, process.env.MM_BOT_TOKEN);
    void wsAgent.start();
  }

  // Channel pollers (blocking — runs forever in parallel)
  if (pollers.length > 0) {
    await Promise.all(pollers.map((p) => p.start()));
  }
}

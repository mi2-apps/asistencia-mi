/**
 * Mattermost bot agent for asistencia-mi.
 * Polls the app channels, handles user commands, and posts status updates.
 * Runs as a background loop inside the same Node process (started without await).
 *
 * Env vars consumed (all optional — agent silently skips if missing):
 *   MM_URL, MM_BOT_TOKEN, MM_CHANNEL_ID   → mibots (MM-01, back-of-house)
 *   MM2_URL, MM2_BOT_TOKEN, MM2_CHANNEL   → miteams (MM-02, user-facing)
 *   STATUS_DASHBOARD_TOKEN               → token to trigger redeploys
 *   APP_UUID                             → Coolify app UUID
 */

const POLL_MS          = 15_000;
const POST_TIMEOUT_MS  = 20_000;
const MAX_ERRORS       = 5;
const BREAKER_PAUSE_MS = 5 * 60 * 1_000;
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

const SECRET_RE = /(?:password|token|secret|api_key|apikey|auth|bearer|credential)[^\s]*\s*[:=]\s*\S{6,}/gi;
function scrub(text: string): string {
  return text.replace(SECRET_RE, "[REDACTED]");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

class MattermostPoller {
  private seen  = new Set<string>();
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

export async function startAgent(): Promise<void> {
  const configs = [
    { url: process.env.MM_URL,  token: process.env.MM_BOT_TOKEN,  channel: process.env.MM_CHANNEL_ID, label: "mibots"   },
    { url: process.env.MM2_URL, token: process.env.MM2_BOT_TOKEN, channel: process.env.MM2_CHANNEL,   label: "miteams"  },
  ].filter((c) => c.url && c.token && c.channel) as {
    url: string; token: string; channel: string; label: string;
  }[];

  if (configs.length === 0) {
    console.warn("[agent] No MM credentials found — agent disabled");
    return;
  }

  const pollers = configs.map((c) => new MattermostPoller(c.url, c.token, c.channel, c.label));

  // Post startup notification on mibots (first channel = MM-01)
  try {
    await pollers[0].post(
      `🟢 **asistencia-mi** online — ${new Date().toISOString()}\nURL: ${APP_URL}`,
    );
  } catch {
    // non-fatal
  }

  // Run all pollers in parallel (background — never awaited from caller)
  await Promise.all(pollers.map((p) => p.start()));
}

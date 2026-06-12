// "Talk to your data" chat page. SSE consumer with cross-device thread memory and a recover-
// on-drop fallback for flaky mobile connections. Renders agent visuals via RenderBlock.
//
// ── TEMPLATE: generic. The only app-specific bits are the i18n keys (translation.json) and the
//    `@client/...` import paths (KpiCard/SectionCard/chart-theme are reused by RenderBlock). ──
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { Send, Database, Sparkles, Loader2, ExternalLink, Filter, Plus } from "lucide-react";
import { PageHeader } from "@client/components/layout";
import { RenderBlock } from "@client/components/page-renderer";
import type { ResolvedBlock } from "@client/lib/page-spec";

const LS_KEY = "ttyd_chat_id"; // localStorage key for the last-open thread (per-device hint only)

type Part =
  | { kind: "text"; text: string }
  | { kind: "tool"; name: string; status: "start" | "done"; detail?: string }
  | { kind: "block"; block: ResolvedBlock }
  | { kind: "page"; url: string; title: string; expiresAt?: string }
  | { kind: "note"; text: string };

type Msg = { role: "user" | "assistant"; parts: Part[] };

const TOOL_LABEL: Record<string, string> = {
  run_sql: "Querying data", describe_schema: "Reading schema", render_block: "Rendering",
  create_page: "Building page", set_filters: "Filtering dashboard",
};

export function Chat() {
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const chatId = useRef<string>("");
  const scroller = useRef<HTMLDivElement>(null);
  const [threads, setThreads] = useState<{ id: string; title: string; updated_at: string }[]>([]);
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    fetch("/api/v1/chat/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((d) => setEnabled(!!d.enabled))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  // Load a specific thread's history (server-side, owner-scoped) into the view.
  const loadThread = useCallback((id: string) => {
    if (!id) return;
    chatId.current = id; setActiveId(id);
    localStorage.setItem(LS_KEY, id);
    fetch(`/api/v1/chat/${encodeURIComponent(id)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const hist = (d?.messages ?? []) as { role: string; text: string }[];
        setMessages(hist.map((m) => ({ role: m.role as "user" | "assistant", parts: [{ kind: "text", text: m.text }] })));
      })
      .catch(() => {});
  }, []);

  const refreshThreads = useCallback(() =>
    fetch("/api/v1/chats", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((l) => { const list = Array.isArray(l) ? l : []; setThreads(list); return list; })
      .catch(() => [] as any[]), []);

  // Per-user chat memory ACROSS DEVICES: on load, fetch this user's threads from the server and
  // open the most recent one (localStorage is per-device and can't follow the user). A ?thread=
  // param (e.g. from a dashboard's "open chat") still wins.
  useEffect(() => {
    const threadParam = new URLSearchParams(window.location.search).get("thread");
    refreshThreads().then((list) => {
      const target = threadParam || list[0]?.id || localStorage.getItem(LS_KEY);
      if (target) loadThread(target);
    });
  }, [refreshThreads, loadThread]);

  // Start a fresh thread (clears the on-screen history; a new id is assigned on first send).
  function newChat() {
    chatId.current = ""; setActiveId("");
    localStorage.removeItem(LS_KEY);
    setMessages([]);
    setInput("");
  }

  // Mutators on the trailing assistant message.
  const patchLast = (fn: (parts: Part[]) => Part[]) =>
    setMessages((m) => { const c = [...m]; const last = { ...c[c.length - 1] }; last.parts = fn([...last.parts]); c[c.length - 1] = last; return c; });
  const pushPart = (p: Part) => patchLast((parts) => [...parts, p]);
  const appendText = (text: string) => patchLast((parts) => {
    const lp = parts[parts.length - 1];
    if (lp && lp.kind === "text") { parts[parts.length - 1] = { kind: "text", text: lp.text + text }; return parts; }
    return [...parts, { kind: "text", text }];
  });
  const finishTool = (name: string, detail?: string) => patchLast((parts) => {
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; if (p.kind === "tool" && p.name === name && p.status === "start") { parts[i] = { ...p, status: "done", detail }; return parts; } }
    return [...parts, { kind: "tool", name, status: "done", detail }];
  });

  // If the stream drops mid-turn (e.g. mobile Safari "Load failed"), the server still finishes
  // and persists the answer. Poll the saved thread for THIS turn's reply (the assistant message
  // following our exact user message) and show it — so the phone still gets the result.
  async function recoverAnswer(userMessage: string) {
    const id = chatId.current;
    if (!id) { pushPart({ kind: "note", text: t("chat.connLost") }); return; }
    pushPart({ kind: "note", text: t("chat.reconnecting") });
    for (let i = 0; i < 18; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      try {
        const d = await fetch(`/api/v1/chat/${encodeURIComponent(id)}`, { credentials: "include" }).then((r) => (r.ok ? r.json() : null));
        const msgs = (d?.messages ?? []) as { role: string; text: string }[];
        for (let j = msgs.length - 1; j >= 0; j--) {
          if (msgs[j].role === "user" && msgs[j].text === userMessage) {
            for (let k = j + 1; k < msgs.length; k++) {
              if (msgs[k].role === "assistant" && msgs[k].text?.trim()) { appendText("\n\n" + msgs[k].text); return; }
            }
          }
        }
      } catch { /* keep polling */ }
    }
    pushPart({ kind: "note", text: t("chat.recoverFailed") });
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "user", parts: [{ kind: "text", text: message }] }, { role: "assistant", parts: [] }]);
    let gotDone = false;
    try {
      const resp = await fetch("/api/v1/chat", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: chatId.current || undefined, message, lang: i18n.language }),
      });
      if (resp.status === 401) { window.location.href = "/auth/login"; return; }
      if (!resp.ok || !resp.body) { const j = await resp.json().catch(() => null); pushPart({ kind: "note", text: j?.error?.message ?? t("chat.unavailable") }); return; }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, idx); buf = buf.slice(idx + 2);
          if (!frame.startsWith("data:")) continue;
          let e: any; try { e = JSON.parse(frame.slice(frame.indexOf("{"))); } catch { continue; }
          if (e.type === "chat") { chatId.current = e.chatId; setActiveId(e.chatId); localStorage.setItem(LS_KEY, e.chatId); }
          else if (e.type === "token") appendText(e.text);
          else if (e.type === "tool") { if (e.status === "start") pushPart({ kind: "tool", name: e.name, status: "start", detail: e.detail }); else finishTool(e.name, e.detail); }
          else if (e.type === "block") pushPart({ kind: "block", block: e.block });
          else if (e.type === "page") pushPart({ kind: "page", url: e.url, title: e.title, expiresAt: e.expiresAt });
          else if (e.type === "action" && e.action === "set_filters") {
            const qs = new URLSearchParams(e.filters ?? {}).toString();
            pushPart({ kind: "note", text: t("chat.filtered", { page: e.page }) });
            navigate(`${e.page}${qs ? `?${qs}` : ""}`);
          } else if (e.type === "done") gotDone = true;
          else if (e.type === "error") pushPart({ kind: "note", text: e.message });
        }
      }
      // Stream closed without a terminal 'done' (proxy/mobile cut it) → recover the saved answer.
      if (!gotDone) await recoverAnswer(message);
    } catch {
      // Network drop mid-stream (Safari "Load failed", etc.) — the turn likely finished server-side.
      if (!gotDone) await recoverAnswer(message);
    } finally {
      setBusy(false);
      refreshThreads(); // surface the new/updated thread in the switcher
    }
  }

  const SUGGESTIONS = [
    t("chat.suggest.1"), t("chat.suggest.2"), t("chat.suggest.3"),
  ];

  return (
    // min-h-[70vh] on mobile (so the page scrolls naturally) + fixed viewport height on md+
    // (so the message list scrolls inside a sticky composer). This is the mobile fix.
    <div className="anim-up flex flex-col min-h-[70vh] md:h-[calc(100vh-3.5rem)]">
      <PageHeader title={t("nav.chat")} subtitle={t("chat.subtitle")} actions={
        <>
          {threads.length > 0 && (
            <select value={activeId} disabled={busy} onChange={(e) => loadThread(e.target.value)}
                    className="ctrl px-2 py-1.5 text-xs max-w-[200px]" title={t("chat.history")}>
              {!activeId && <option value="">{t("chat.history")}</option>}
              {threads.map((th) => (
                <option key={th.id} value={th.id}>{(th.title || "Chat").slice(0, 40)}</option>
              ))}
            </select>
          )}
          <button onClick={newChat} disabled={busy}
                  className="ctrl px-3 py-1.5 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-surface-2 transition-colors">
            <Plus className="w-3.5 h-3.5" /> {t("chat.newChat")}
          </button>
        </>
      } />

      {enabled === false && (
        <div className="glass-card p-4 text-sm text-amber-300 mb-3">{t("chat.notConfigured")}</div>
      )}

      <div ref={scroller} className="flex-1 overflow-auto space-y-4 py-3 pr-1">
        {messages.length === 0 && (
          <div className="glass-card p-6 text-center space-y-4">
            <Sparkles className="w-7 h-7 text-primary mx-auto" />
            <div className="text-sm text-muted-foreground">{t("chat.empty")}</div>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} disabled={enabled === false}
                        className="text-xs px-3 py-1.5 rounded-full bg-surface-2 hover:bg-primary/20 text-muted-foreground hover:text-foreground transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, mi) => (
          <div key={mi} className={m.role === "user" ? "flex justify-end" : ""}>
            {m.role === "user" ? (
              <div className="max-w-[85%] rounded-lg bg-primary/15 px-3.5 py-2 text-sm">{(m.parts[0] as any)?.text}</div>
            ) : (
              <div className="max-w-full space-y-2.5">
                {m.parts.map((p, pi) => {
                  if (p.kind === "text") return p.text ? <div key={pi} className="text-sm leading-relaxed whitespace-pre-wrap">{p.text}</div> : null;
                  if (p.kind === "tool") return (
                    <div key={pi} className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground bg-surface-2 rounded px-2 py-1 mr-2">
                      {p.status === "start" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3 text-primary" />}
                      <span>{TOOL_LABEL[p.name] ?? p.name}{p.detail ? ` · ${p.detail}` : ""}</span>
                    </div>
                  );
                  if (p.kind === "block") return <div key={pi}><RenderBlock block={p.block} /></div>;
                  if (p.kind === "page") return (
                    <a key={pi} href={p.url} className="glass-card flex items-center gap-3 p-3 hover:bg-surface-2 transition-colors">
                      <ExternalLink className="w-4 h-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{p.title}</div>
                        <div className="text-2xs text-muted-foreground">{t("chat.pageLink")}{p.expiresAt ? ` · ${t("chat.expires", { d: String(p.expiresAt).slice(0, 10) })}` : ""}</div>
                      </div>
                    </a>
                  );
                  if (p.kind === "note") return <div key={pi} className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground"><Filter className="w-3 h-3" />{p.text}</div>;
                  return null;
                })}
                {busy && mi === messages.length - 1 && m.parts.length === 0 && (
                  <div className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />{t("chat.thinking")}</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 pt-2 border-t border-border/60">
        <input value={input} onChange={(e) => setInput(e.target.value)} disabled={enabled === false || busy}
               placeholder={t("chat.placeholder")} className="ctrl flex-1" />
        <button type="submit" disabled={enabled === false || busy || !input.trim()}
                className="ctrl px-4 font-medium bg-primary/20 hover:bg-primary/30 border-primary/30 transition-colors inline-flex items-center gap-1.5">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>
    </div>
  );
}

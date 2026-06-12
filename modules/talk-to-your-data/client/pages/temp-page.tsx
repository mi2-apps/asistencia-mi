// Temporary shareable dashboard at /p/:slug. Re-resolves its blocks' SQL live on each view,
// shows an expiry + "extend" control, links back to the chat thread that built it, and offers
// in-place natural-language refinement ("only last 30 days", "only Texas").
//
// ── TEMPLATE: fully generic. Only i18n keys + import paths are app-specific. ──
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "wouter";
import { useApi } from "@client/lib/api";
import { PageHeader } from "@client/components/layout";
import { RenderBlocks } from "@client/components/page-renderer";
import { CalendarClock, RefreshCw, MessageSquare, Wand2, Loader2, X } from "lucide-react";
import type { ResolvedBlock } from "@client/lib/page-spec";

type PageData = {
  slug: string; title: string; subtitle?: string; expires_at: string; chat_id?: string | null;
  view_count: number; extended_count: number; blocks: ResolvedBlock[];
};

export function TempPage() {
  const { t, i18n } = useTranslation();
  const { slug = "" } = useParams();
  const d = useApi<PageData>(`/pages/${encodeURIComponent(slug)}`);
  const [extending, setExtending] = useState(false);
  const [extendedTo, setExtendedTo] = useState<string | null>(null);
  // In-place refinement of the produced dashboard ("only last 30 days", "only Texas", …).
  const [refineInput, setRefineInput] = useState("");
  const [refining, setRefining] = useState(false);
  const [refined, setRefined] = useState<ResolvedBlock[] | null>(null);
  const [applied, setApplied] = useState("");

  async function refine() {
    const instruction = refineInput.trim();
    if (!instruction || refining) return;
    setRefining(true);
    try {
      const res = await fetch(`/api/v1/pages/${encodeURIComponent(slug)}/refine`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction, lang: i18n.language }),
      });
      if (res.status === 401) { window.location.href = "/auth/login"; return; }
      if (res.ok) {
        const j = await res.json();
        if (Array.isArray(j.blocks) && j.blocks.length) { setRefined(j.blocks); setApplied(instruction); setRefineInput(""); }
      }
    } finally { setRefining(false); }
  }
  function resetRefine() { setRefined(null); setApplied(""); }

  if (d.isLoading) return <div className="p-8 text-center text-muted-foreground">{t("common.loading")}</div>;
  if (d.isError || !d.data) return (
    <div className="space-y-3 anim-up">
      <Link href="/chat" className="text-sm text-primary hover:underline">← {t("chat.back")}</Link>
      <div className="glass-card p-10 text-center text-muted-foreground">{t("temp.notFound")}</div>
    </div>
  );

  const p = d.data;
  const expires = extendedTo ?? p.expires_at;

  // POST extend (apiGet is GET-only).
  async function doExtend() {
    setExtending(true);
    try {
      const res = await fetch(`/api/v1/pages/${encodeURIComponent(slug)}/extend`, { method: "POST", credentials: "include" });
      if (res.ok) { const j = await res.json(); setExtendedTo(j.expiresAt); }
    } finally { setExtending(false); }
  }

  return (
    <div className="anim-up space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link href="/chat" className="text-sm text-primary hover:underline">← {t("chat.back")}</Link>
        <div className="flex items-center gap-3 text-2xs text-muted-foreground">
          {p.chat_id && (
            <Link href={`/chat?thread=${encodeURIComponent(p.chat_id)}`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-2 hover:bg-primary/20 hover:text-foreground transition-colors">
              <MessageSquare className="w-3 h-3" />{t("temp.openChat")}
            </Link>
          )}
          <span className="inline-flex items-center gap-1"><CalendarClock className="w-3 h-3" />{t("temp.expires", { d: String(expires).slice(0, 10) })}</span>
          <button onClick={doExtend} disabled={extending}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-2 hover:bg-primary/20 hover:text-foreground transition-colors">
            <RefreshCw className={`w-3 h-3 ${extending ? "animate-spin" : ""}`} />{t("temp.extend")}
          </button>
        </div>
      </div>

      <PageHeader title={p.title} subtitle={p.subtitle} />

      {/* Refine the produced dashboard in place — natural-language filters over its data. */}
      <div className="glass-card p-3 space-y-2">
        <form onSubmit={(e) => { e.preventDefault(); refine(); }} className="flex gap-2 items-center">
          <Wand2 className="w-4 h-4 text-primary shrink-0" />
          <input value={refineInput} onChange={(e) => setRefineInput(e.target.value)} disabled={refining}
                 placeholder={t("temp.refinePlaceholder")} className="ctrl flex-1" />
          <button type="submit" disabled={refining || !refineInput.trim()}
                  className="ctrl px-4 font-medium bg-primary/20 hover:bg-primary/30 border-primary/30 transition-colors inline-flex items-center gap-1.5">
            {refining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}{t("temp.refine")}
          </button>
        </form>
        {applied && (
          <div className="flex items-center gap-2 text-2xs">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 text-primary">
              {t("temp.filteredBy", { f: applied })}
              <button onClick={resetRefine} className="hover:text-foreground"><X className="w-3 h-3" /></button>
            </span>
            <span className="text-muted-foreground">{t("temp.refineNote")}</span>
          </div>
        )}
      </div>

      {refining
        ? <div className="glass-card p-10 text-center text-muted-foreground text-sm"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />{t("temp.refining")}</div>
        : <RenderBlocks blocks={refined ?? p.blocks} />}
    </div>
  );
}

// [EDIT] UI imports (@/components/ui/*, @/lib/queryClient, @/hooks/use-toast) + __APP_NAME__. Expects /api/auth/me -> { user: {...} } (handled via select).
// Developer Manual viewer (Migration 0141)
// Top-level route /developer-manual — admin/supervisor only. Renders Markdown
// pages (react-markdown + GFM tables) from the dedicated dev_manual_* store, with
// full-text search and inline editing (optimistic-concurrency via editLockVersion).
import { useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Search, Pencil, Save, X, ArrowLeft, ShieldAlert, Loader2 } from "lucide-react";

interface PageListItem {
  id: string; slug: string; title: string; section: string;
  summary: string | null; displayOrder: number; isPublished: boolean;
  version: number; editLockVersion: number; updatedAt: string;
}
interface PageFull extends PageListItem { contentMd: string; }
interface SearchHit { id: string; slug: string; title: string; section: string; summary: string | null; snippet: string; }
interface CurrentUser { id: string; role: string; }

export default function DeveloperManualViewer() {
  const { toast } = useToast();
  const [, params] = useRoute("/developer-manual/:slug");
  const slug = params?.slug || "index";

  const { data: currentUser, isLoading: userLoading } = useQuery<CurrentUser>({
    queryKey: ["/api/auth/me"],
    select: (data: any) => data.user ?? data, // /api/auth/me returns { user: {...} }
  });
  const hasAccess = currentUser?.role === "admin" || currentUser?.role === "supervisor";

  const { data: pages = [], isLoading: pagesLoading } = useQuery<PageListItem[]>({
    queryKey: ["/api/developer-manual/pages"], enabled: !!hasAccess,
  });
  const { data: page, isLoading: pageLoading } = useQuery<PageFull>({
    queryKey: ["/api/developer-manual/pages", slug], enabled: !!hasAccess,
  });

  const [term, setTerm] = useState("");
  const { data: results = [] } = useQuery<SearchHit[]>({
    queryKey: ["/api/developer-manual/search", term],
    queryFn: async () => (await apiRequest("GET", `/api/developer-manual/search?q=${encodeURIComponent(term)}`)).json(),
    enabled: !!hasAccess && term.trim().length >= 2,
  });

  // Inline editing
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", contentMd: "", changeSummary: "" });
  useEffect(() => { setEditing(false); }, [slug]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/developer-manual/pages/${page!.id}`, {
        title: draft.title, contentMd: draft.contentMd,
        changeSummary: draft.changeSummary || null,
        expectedLockVersion: page!.editLockVersion,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Page updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/developer-manual/pages"] });
      setEditing(false);
    },
    onError: (e: any) => {
      const conflict = String(e?.message || "").includes("409");
      toast({
        title: conflict ? "Edit conflict" : "Save failed",
        description: conflict ? "This page changed since you opened it. Reloading the latest version — reapply your edit." : (e?.message || "Could not save."),
        variant: "destructive",
      });
      if (conflict) queryClient.invalidateQueries({ queryKey: ["/api/developer-manual/pages", slug] });
    },
  });

  const grouped = useMemo(() => {
    const m = new Map<string, PageListItem[]>();
    for (const p of pages) { if (!m.has(p.section)) m.set(p.section, []); m.get(p.section)!.push(p); }
    return Array.from(m.entries());
  }, [pages]);

  if (userLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!hasAccess) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Developer Manual</h1>
          <p className="text-muted-foreground">This area is restricted to admin and supervisor accounts. AI agents access it via the Developer Manual API with a read-scoped key.</p>
          <Link href="/"><Button variant="outline">Back to app</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-72 shrink-0 border-r overflow-y-auto flex flex-col">
        <div className="p-4 border-b">
          <Link href="/"><Button variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground"><ArrowLeft className="h-4 w-4 mr-1" />Back to app</Button></Link>
          <div className="flex items-center gap-2 font-semibold"><BookOpen className="h-5 w-5" />Developer Manual</div>
          <div className="relative mt-3">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search the manual…" className="pl-8 h-9" />
          </div>
          {term.trim().length >= 2 && (
            <div className="mt-2 rounded-md border bg-popover divide-y max-h-72 overflow-y-auto">
              {results.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">No matches</div>
              ) : results.map((r) => (
                <Link key={r.id} href={`/developer-manual/${r.slug}`} onClick={() => setTerm("")}>
                  <div className="p-2 hover:bg-accent cursor-pointer">
                    <div className="text-sm font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2" dangerouslySetInnerHTML={{ __html: (r.snippet || "").replace(/[<>]/g, "") }} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <nav className="p-2 flex-1">
          {pagesLoading ? <div className="p-3"><Loader2 className="h-4 w-4 animate-spin" /></div> : grouped.map(([section, items]) => (
            <div key={section} className="mb-3">
              <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section}</div>
              {items.map((p) => (
                <Link key={p.id} href={`/developer-manual/${p.slug}`}>
                  <div className={`px-2 py-1.5 rounded text-sm cursor-pointer ${p.slug === slug ? "bg-accent font-medium" : "hover:bg-accent/50"}`}>{p.title}</div>
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          {pageLoading || !page ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : editing ? (
            <div className="space-y-3">
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="text-lg font-semibold" />
              <Textarea value={draft.contentMd} onChange={(e) => setDraft({ ...draft, contentMd: e.target.value })} rows={28} className="font-mono text-sm" />
              <Input value={draft.changeSummary} onChange={(e) => setDraft({ ...draft, changeSummary: e.target.value })} placeholder="Change summary (optional)" />
              <div className="flex gap-2">
                <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}Save</Button>
                <Button variant="outline" onClick={() => setEditing(false)}><X className="h-4 w-4 mr-1" />Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-4 gap-4">
                <div>
                  <h1 className="text-2xl font-bold">{page.title}</h1>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                    <Badge variant="secondary">{page.section}</Badge>
                    <span>v{page.version}</span>
                    <span>· updated {new Date(page.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setDraft({ title: page.title, contentMd: page.contentMd, changeSummary: "" }); setEditing(true); }}>
                  <Pencil className="h-4 w-4 mr-1" />Edit
                </Button>
              </div>
              <article className="prose prose-sm dark:prose-invert max-w-none prose-table:text-xs prose-pre:text-xs prose-headings:scroll-mt-20">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{page.contentMd}</ReactMarkdown>
              </article>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

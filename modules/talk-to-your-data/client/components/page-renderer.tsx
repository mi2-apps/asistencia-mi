// Generic, safe renderer for agent-emitted blocks (kpi/kpis/chart/table/markdown).
// Renders with the same primitives your hand-built pages use — KpiCard, SectionCard, the
// chart-theme constants, the .data-table styles. No arbitrary code/HTML is executed; the
// agent only chooses a block kind + data shape, never markup.
//
// ── TEMPLATE: the only app-specific things are the @client imports. KpiCard / SectionCard /
//    CHART_COLORS etc. are MI-stack components you already have. If yours differ, swap the
//    imports + the wrapper JSX; the block-shape logic stays the same. ──
import {
  ResponsiveContainer, ComposedChart, BarChart, LineChart, PieChart,
  Bar, Line, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { KpiCard } from "@client/components/kpi-card";
import { SectionCard } from "@client/components/layout";
import { CHART_COLORS, AXIS_TICK, TOOLTIP_STYLE, GRID_STYLE, LEGEND_STYLE } from "@client/lib/chart-theme";
import { fmtInt, fmtUsd, fmtPct } from "@client/lib/utils";
import type { ResolvedBlock, ValueFormat } from "@client/lib/page-spec";

const EXT = [...CHART_COLORS, "hsl(328 73% 62%)", "hsl(60 80% 55%)", "hsl(24 90% 55%)", "hsl(280 60% 60%)"];

function fmt(v: unknown, f?: ValueFormat): string {
  const n = typeof v === "number" ? v : Number(v);
  if (f === "usd") return fmtUsd(Number.isFinite(n) ? n : 0);
  if (f === "int") return fmtInt(Number.isFinite(n) ? n : 0);
  if (f === "pct") return fmtPct(Number.isFinite(n) ? n : 0);
  return v == null ? "—" : String(v);
}

function asRows(d: ResolvedBlock["data"]): Record<string, unknown>[] {
  return Array.isArray(d) ? d : d ? [d] : [];
}

export function RenderBlock({ block }: { block: ResolvedBlock }) {
  if (block.error) {
    return (
      <SectionCard title={block.title || "Error"}>
        <div className="text-sm text-red-300">{block.error}</div>
      </SectionCard>
    );
  }

  if (block.kind === "markdown") {
    // Plain text only — render line-by-line, no HTML injection.
    return (
      <SectionCard title={block.title || ""}>
        <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{block.md}</div>
      </SectionCard>
    );
  }

  if (block.kind === "kpi") {
    const row = (Array.isArray(block.data) ? block.data[0] : block.data) ?? {};
    return (
      <KpiCard title={block.title || block.valueKey || ""} value={fmt(row[block.valueKey ?? ""], block.format)}
               subtitle={block.subtitle} glow={block.glow ?? "blue"} />
    );
  }

  if (block.kind === "kpis") {
    const row = (Array.isArray(block.data) ? block.data[0] : block.data) ?? {};
    const cards = block.cards ?? [];
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c, i) => (
          <KpiCard key={i} title={c.label} value={fmt(row[c.valueKey], c.format)} glow={c.glow ?? "blue"} />
        ))}
      </div>
    );
  }

  if (block.kind === "table") {
    const rows = asRows(block.data);
    const cols = block.columns ?? [];
    return (
      <SectionCard title={block.title || ""} scrollable>
        <table className="data-table">
          <thead>
            <tr>{cols.map((c) => <th key={c.key} className={c.align === "right" ? "text-right" : ""}>{c.label ?? c.key}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c.key} className={c.align === "right" ? "text-right tabular-nums" : (c.format && c.format !== "text" ? "tabular-nums" : "")}>
                    {fmt(r[c.key], c.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    );
  }

  // chart
  const rows = asRows(block.data);
  const series = block.series ?? [];
  const h = block.height ?? 300;
  const color = (i: number, c?: string) => c || EXT[i % EXT.length];

  let chart: JSX.Element;
  if (block.chartType === "pie") {
    const s = series[0];
    chart = (
      <PieChart>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Pie data={rows} dataKey={s?.key ?? "value"} nameKey={block.xKey ?? "name"} outerRadius="80%" label>
          {rows.map((_, i) => <Cell key={i} fill={EXT[i % EXT.length]} />)}
        </Pie>
      </PieChart>
    );
  } else if (block.chartType === "line") {
    chart = (
      <LineChart data={rows}>
        <CartesianGrid {...GRID_STYLE} vertical={false} />
        <XAxis dataKey={block.xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} width={56} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={LEGEND_STYLE} />
        {series.map((s, i) => <Line key={s.key} dataKey={s.key} name={s.label ?? s.key} stroke={color(i, s.color)} dot={false} strokeWidth={2} />)}
      </LineChart>
    );
  } else {
    const Chart: any = block.chartType === "composed" ? ComposedChart : BarChart;
    chart = (
      <Chart data={rows}>
        <CartesianGrid {...GRID_STYLE} vertical={false} />
        <XAxis dataKey={block.xKey} tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} width={56} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={LEGEND_STYLE} />
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label ?? s.key} fill={color(i, s.color)} radius={[2, 2, 0, 0]} />)}
      </Chart>
    );
  }

  return (
    <SectionCard title={block.title || ""}>
      <ResponsiveContainer width="100%" height={h}>{chart}</ResponsiveContainer>
    </SectionCard>
  );
}

/** Render a list of resolved blocks with sensible spacing. */
export function RenderBlocks({ blocks }: { blocks: ResolvedBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => <RenderBlock key={i} block={b} />)}
    </div>
  );
}

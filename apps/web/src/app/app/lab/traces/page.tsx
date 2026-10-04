import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { orgHash, requireCap } from "@/server/services/core";
import { getDB } from "@/server/db/store";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { LabNav } from "@/components/lab/lab-nav";
import { cn, timeAgo } from "@/lib/utils";

export const metadata = { title: "Lab · Traces" };

export default async function TracesPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const actor = await requireActor();
  requireCap(actor, "lab.view");
  const { id } = await searchParams;
  const db = getDB();
  const mine = orgHash(actor.org.id);
  const traces = [...db.traces]
    .filter((t) => !t.orgHash || t.orgHash === mine)
    .reverse()
    .slice(0, 40);
  const sel = traces.find((t) => t.id === id) ?? traces[0];
  const events = [...db.analytics]
    .filter((e) => !e.orgHash || e.orgHash === mine)
    .reverse()
    .slice(0, 40);
  const depth = (spanId: string | null): number => {
    if (!sel || !spanId) return 0;
    const s = sel.spans.find((x) => x.id === spanId);
    return s?.parentId ? 1 + depth(s.parentId) : 0;
  };
  return (
    <>
      <PageHeader title="Lab" description="Internal surfaces for operators. Admin-gated." />
      <LabNav active="traces" />
      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        <Panel>
          <PanelHeader title="Traces" description="Langfuse-shaped. Org IDs are hashed; no candidate PII." />
          <ul className="max-h-[640px] divide-y divide-line overflow-y-auto">
            {traces.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/app/lab/traces?id=${t.id}`}
                  className={cn(
                    "block px-4 py-2.5 text-[13px] hover:bg-panel-2",
                    sel?.id === t.id && "bg-accent-soft/50",
                  )}
                >
                  <div className="flex justify-between">
                    <span className="font-mono font-medium text-ink">{t.name}</span>
                    <span className="tabular text-xs text-muted">{t.durationMs.toFixed(1)} ms</span>
                  </div>
                  <div className="text-[11px] text-faint">
                    {t.id} · {String(t.metadata.trigger ?? "")} · {timeAgo(t.createdAt)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
        {sel && (
          <div className="space-y-6">
            <Panel>
              <PanelHeader title={`${sel.name} · ${sel.durationMs.toFixed(1)} ms`} description={sel.id} />
              <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2.5">
                {Object.entries(sel.metadata).map(([k, v]) => (
                  <Badge key={k} tone="outline" className="font-mono">
                    {k}: {String(v)}
                  </Badge>
                ))}
                {sel.orgHash && (
                  <Badge tone="outline" className="font-mono">
                    org: {sel.orgHash}
                  </Badge>
                )}
              </div>
              <div className="space-y-1.5 p-4" role="table" aria-label="Span waterfall">
                {sel.spans.map((s) => {
                  const left = (s.startMs / sel.durationMs) * 100;
                  const width = Math.max(0.6, ((s.endMs - s.startMs) / sel.durationMs) * 100);
                  return (
                    <div
                      key={s.id}
                      className="grid grid-cols-[230px_1fr_70px] items-center gap-3 text-xs"
                      role="row"
                    >
                      <span
                        className="truncate font-mono text-ink-2"
                        style={{ paddingLeft: depth(s.id) * 12 }}
                        role="cell"
                      >
                        {s.kind === "generation" ? "◆ " : s.kind === "trace" ? "▣ " : "▪ "}
                        {s.name}
                      </span>
                      <span className="relative h-4 rounded bg-subtle" role="cell">
                        <span
                          className="absolute inset-y-0 rounded"
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            background:
                              s.kind === "generation"
                                ? "var(--series-2)"
                                : s.kind === "trace"
                                  ? "var(--line-strong)"
                                  : "var(--series-1)",
                          }}
                        />
                      </span>
                      <span className="tabular text-right text-muted" role="cell">
                        {(s.endMs - s.startMs).toFixed(2)} ms
                      </span>
                    </div>
                  );
                })}
                <div className="pt-2 text-[11px] text-muted">
                  ◆ generation = model call (fit-MLP rerank, explanation generator) · ▪ span = deterministic
                  step. {sel.spans.find((s) => s.metadata.detail) && "Hover-free details:"}
                </div>
                <ul className="space-y-0.5 pt-1 text-[11px] text-muted">
                  {sel.spans
                    .filter((s) => s.metadata.detail)
                    .map((s) => (
                      <li key={s.id}>
                        <span className="font-mono">{s.name}</span>: {String(s.metadata.detail)}
                      </li>
                    ))}
                </ul>
              </div>
            </Panel>
            <Panel>
              <PanelHeader
                title="Product analytics stream"
                description="PostHog-shaped events. Only scalar properties; free text and resume content are dropped by the event wrapper."
              />
              <ul className="max-h-80 divide-y divide-line overflow-y-auto font-mono text-[11.5px]">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-2 px-4 py-1.5">
                    <span className="font-medium text-ink">{e.name}</span>
                    <span className="text-muted">{JSON.stringify(e.properties)}</span>
                    <span className="ml-auto text-faint">{timeAgo(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}

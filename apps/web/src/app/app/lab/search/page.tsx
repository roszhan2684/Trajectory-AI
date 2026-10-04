import Link from "next/link";
import { embed, SEARCH_SCHEMA_VERSION } from "@trajectory/engine";
import { requireActor } from "@/server/auth/session";
import { requireCap } from "@/server/services/core";
import { getIndex } from "@/server/services/search";
import { getDB } from "@/server/db/store";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { LabNav } from "@/components/lab/lab-nav";
import { ReconcileControls } from "@/components/lab/lab-controls";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Lab · Search" };

export default async function SearchLab({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireActor();
  requireCap(actor, "lab.view");
  const { q = "founding engineer typescript llm" } = await searchParams;
  const idx = getIndex();
  const db = getDB();
  const names = new Map(db.candidates.map((c) => [c.id, c.fullName]));
  const vec = embed(q);
  const kw = idx.search({ text: q, limit: 10 });
  const vs = idx.search({ text: "", vector: vec, limit: 10 });
  const hy = idx.search({ text: q, vector: vec, limit: 10 });
  const states = db.indexState;
  const bad = states.filter((s) => s.status !== "INDEXED");
  const cols = [
    {
      title: "Keyword (BM25F)",
      res: kw,
      metric: (h: (typeof kw.hits)[number]) => h.keywordScore?.toFixed(3),
    },
    {
      title: "Vector (LSA cosine)",
      res: vs,
      metric: (h: (typeof vs.hits)[number]) => h.vectorScore?.toFixed(3),
    },
    {
      title: "Hybrid (rank fusion α=0.3)",
      res: hy,
      metric: (h: (typeof hy.hits)[number]) =>
        `${h.score.toFixed(3)} · kw#${h.keywordRank !== null ? h.keywordRank + 1 : "–"} vec#${h.vectorRank !== null ? h.vectorRank + 1 : "–"}`,
    },
  ];
  return (
    <>
      <PageHeader title="Lab" description="Internal surfaces for operators. Admin-gated." />
      <LabNav active="search" />
      <form className="mb-4 flex gap-2" action="/app/lab/search">
        <input
          name="q"
          defaultValue={q}
          aria-label="Query"
          className="h-9 flex-1 rounded-lg border border-line bg-panel px-3 text-[13px] shadow-panel outline-none focus:border-accent"
        />
        <button className="h-9 rounded-lg bg-ink px-4 text-[13px] font-medium text-bg">Compare</button>
      </form>
      <div className="grid gap-4 lg:grid-cols-3">
        {cols.map((c) => (
          <Panel key={c.title}>
            <PanelHeader title={c.title} description={`${c.res.found} hits · ${c.res.tookMs} ms`} />
            <ol className="divide-y divide-line text-[13px]">
              {c.res.hits.map((h, i) => (
                <li key={h.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="tabular w-5 text-xs text-faint">{i + 1}</span>
                  <Link
                    href={`/app/candidates/${h.id}`}
                    className="flex-1 truncate text-ink hover:text-accent"
                  >
                    {names.get(h.id)}
                  </Link>
                  <span className="tabular font-mono text-[10.5px] text-muted">{c.metric(h)}</span>
                </li>
              ))}
            </ol>
          </Panel>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Index consistency"
            description="Postgres is the source of truth; the index is derived. Content hashes detect drift."
          />
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge tone="neutral">schema {SEARCH_SCHEMA_VERSION}</Badge>
              <Badge tone="good">{states.filter((s) => s.status === "INDEXED").length} indexed</Badge>
              <Badge tone={bad.length ? "warn" : "outline"}>{bad.length} stale / missing</Badge>
              <Badge tone="outline">{idx.size()} documents in index</Badge>
            </div>
            <ReconcileControls />
            {bad.length > 0 && (
              <ul className="divide-y divide-line rounded-lg border border-line text-xs">
                {bad.map((s) => (
                  <li key={s.entityId} className="flex justify-between px-3 py-1.5">
                    <span>{names.get(s.entityId) ?? s.entityId}</span>
                    <span className="font-mono text-muted">
                      {s.status} · source {s.contentHash} vs indexed {s.indexedHash ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader
            title="Document schema · candidates_v1"
            description="Built by a pure function from the candidate record."
          />
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 p-4 font-mono text-[11.5px] text-ink-2">
            {[
              ["full_name, headline, current_title", "keyword (weighted)"],
              ["skill_names", "keyword ×3"],
              ["profile_text, trajectory_text", "keyword"],
              ["skills[], company_stages[]", "filter + facet"],
              ["metro, country_code, work_modes[]", "filter + facet"],
              ["years_experience", "range filter"],
              ["visa_needs", "filter"],
              ["embedding float[96]", "vector (cosine)"],
            ].map(([f, t]) => (
              <div key={f} className="contents">
                <span>{f}</span>
                <span className="text-muted">{t}</span>
              </div>
            ))}
          </div>
          <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
            Last indexed{" "}
            {timeAgo(
              states
                .map((s) => s.indexedAt ?? "")
                .sort()
                .pop(),
            )}
            . A Typesense adapter would implement the same SearchEngine interface.
          </p>
        </Panel>
      </div>
    </>
  );
}

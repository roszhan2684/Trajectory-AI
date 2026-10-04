"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FlaskConical, Play, Table2 } from "lucide-react";
import type { EvalDataset, EvalRun } from "@trajectory/engine/client";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { JobSteps, useJob } from "@/components/domain/job-progress";
import { runEvalAction } from "@/app/actions/admin";
import { cn, timeAgo } from "@/lib/utils";

interface External {
  model: string;
  embeddings: string;
  training: {
    dataset: string;
    trainPairs: number;
    validationPairs: number;
    testPairs: number;
    validation: string;
    bestEpoch: number;
    optimizer: string;
    curve: { epoch: number; trainLoss: number; valLoss: number; valAccuracy: number }[];
    overlap: {
      testJobsSeenInTrain: number;
      testJobs: number;
      testResumesSeenInTrain: number;
      testResumes: number;
    };
  };
  results: Record<
    string,
    {
      accuracy?: number;
      macroF1?: number;
      ndcg10?: number;
      precision5?: number;
      mrr?: number;
      confusion?: number[][];
    }
  >;
  selection: { hidden: number; l2: number; interactions: boolean; valNdcg10: number; valMacroF1: number }[];
}

const METRICS: { key: "ndcgAt10" | "precisionAt5" | "recallAt10" | "mrr"; label: string }[] = [
  { key: "ndcgAt10", label: "NDCG@10" },
  { key: "precisionAt5", label: "Precision@5" },
  { key: "recallAt10", label: "Recall@10" },
  { key: "mrr", label: "MRR" },
];

const axis = { fontSize: 11, fill: "var(--muted)" };
const tooltipStyle = {
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--ink)",
  boxShadow: "var(--shadow-lg)",
};

const shortName = (n: string) =>
  n
    .replace(" (deterministic + semantic + learned reranker)", "")
    .replace("Keyword baseline (BM25 only)", "BM25 only")
    .replace("Deterministic features only", "Deterministic")
    .replace("Deterministic + semantic", "Det + semantic");

/** Generated from the actual runs so the narrative can never drift from the numbers. */
function ablationNote(runs: EvalRun[]): string {
  const latest = (prefix: string) => runs.find((r) => r.name.startsWith(prefix))?.metrics;
  const bm25 = latest("Keyword");
  const det = latest("Deterministic features");
  const sem = latest("Deterministic + semantic");
  const full = latest("Full");
  if (!bm25 || !det || !sem || !full) return "Run all four presets to see what each layer adds.";
  const d = (a: number, b: number) => `${a - b >= 0 ? "+" : ""}${(a - b).toFixed(3)}`;
  return `Read: deterministic features + hard constraints lift NDCG@10 ${d(det.ndcgAt10, bm25.ndcgAt10)} over BM25 and remove ${(bm25.hardConstraintViolationRate * 100).toFixed(0)}% constraint violations; the semantic layer adds ${d(sem.ndcgAt10, det.ndcgAt10)}; the learned reranker adds ${d(full.ndcgAt10, sem.ndcgAt10)} NDCG@10 and ${d(full.mrr, sem.mrr)} MRR. Small deltas on ${full.cases} synthetic labels — evals, not intuition, decide blend weights.`;
}

export function EvalDashboard({
  runs,
  dataset,
  cases,
  labelHistogram,
  external,
  presets,
  canRun,
}: {
  runs: EvalRun[];
  dataset: EvalDataset | null;
  cases: number;
  labelHistogram: number[];
  external: External;
  presets: string[];
  canRun: boolean;
}) {
  const router = useRouter();
  const [a, setA] = React.useState(runs.find((r) => r.name.startsWith("Full"))?.id ?? runs[0]?.id ?? "");
  const [b, setB] = React.useState(runs.find((r) => r.name.startsWith("Keyword"))?.id ?? runs[1]?.id ?? "");
  const [preset, setPreset] = React.useState(presets[presets.length - 1] ?? "");
  const [blend, setBlend] = React.useState({ deterministic: 0.65, semantic: 0.2, rerank: 0.15 });
  const [custom, setCustom] = React.useState(false);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [table, setTable] = React.useState(false);
  const job = useJob(jobId, undefined, (j) => {
    if (j.status === "COMPLETED") {
      router.refresh();
      toast.success("Eval run complete");
    }
  });

  const runA = runs.find((r) => r.id === a);
  const runB = runs.find((r) => r.id === b);
  const latest = runs.find((r) => r.name.startsWith("Full")) ?? runs[0];
  const m = latest?.metrics;

  const run = async () => {
    const r = await runEvalAction(custom ? null : preset, custom ? blend : undefined);
    if (!r.ok) return toast.error(r.error.message);
    setJobId(r.data.jobId);
  };

  const compareData = METRICS.map((k) => ({
    metric: k.label,
    A: runA?.metrics?.[k.key] ?? 0,
    B: runB?.metrics?.[k.key] ?? 0,
  }));
  const ablation = [...runs].reverse().map((r) => ({
    name: shortName(r.name),
    ndcg: r.metrics!.ndcgAt10,
    hcv: r.metrics!.hardConstraintViolationRate,
    id: r.id,
  }));
  const perRole = [...(runA?.metrics?.perRole ?? [])]
    .sort((x, y) => y.ndcgAt10 - x.ndcgAt10)
    .map((r) => ({ ...r, title: r.title.length > 30 ? `${r.title.slice(0, 29)}…` : r.title }));
  const ext = external.results;
  const extBars = [
    { name: "Skill coverage", v: ext.skillCoverage?.ndcg10 ?? 0 },
    { name: "TF-IDF cosine", v: ext.tfidfCosine?.ndcg10 ?? 0 },
    { name: "LSA cosine", v: ext.lsaCosine?.ndcg10 ?? 0 },
    { name: "Linear (scalars)", v: ext.scalarOnly?.ndcg10 ?? 0 },
    { name: "Fit MLP (ours)", v: ext.mlp?.ndcg10 ?? 0, ours: true },
  ];
  const conf = ext.mlp?.confusion ?? [];
  const confMax = Math.max(1, ...conf.flat());

  return (
    <div className="space-y-6">
      {/* hero numbers */}
      {m && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {[
            ["NDCG@10", m.ndcgAt10.toFixed(3)],
            ["Precision@5", m.precisionAt5.toFixed(3)],
            ["Recall@10", m.recallAt10.toFixed(3)],
            ["MRR", m.mrr.toFixed(3)],
            ["Constraint violations", `${(m.hardConstraintViolationRate * 100).toFixed(1)}%`],
            ["Citation validity", m.citationValidity < 0 ? "—" : `${(m.citationValidity * 100).toFixed(0)}%`],
            ["Avg ranking latency", `${m.avgLatencyMs} ms`],
            ["LLM cost / run", "$0.00"],
          ].map(([k, v]) => (
            <Panel key={k} className="p-3">
              <div className="text-[11px] text-muted">{k}</div>
              <div className="tabular mt-1 text-lg font-semibold text-ink">{v}</div>
            </Panel>
          ))}
        </div>
      )}
      <p className="-mt-3 text-xs text-muted">
        Latest full-pipeline run · {latest && timeAgo(latest.completedAt)} · {cases} labeled pairs across{" "}
        {m?.roles} roles · cost is $0 because every model runs locally (no API calls).
      </p>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader
            title="Compare two runs"
            description="Same dataset, different pipeline configurations."
            actions={
              <Button size="sm" variant="ghost" onClick={() => setTable((t) => !t)} aria-pressed={table}>
                <Table2 /> {table ? "Chart" : "Table"}
              </Button>
            }
          />
          <div className="flex flex-wrap items-center gap-2 px-4 pt-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: "var(--series-1)" }} /> A
            </span>
            <Select
              value={a}
              onChange={(e) => setA(e.target.value)}
              className="h-7 w-auto max-w-[260px] text-xs"
              aria-label="Run A"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {shortName(r.name)} · {timeAgo(r.completedAt)}
                </option>
              ))}
            </Select>
            <span className="ml-2 flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: "var(--series-2)" }} /> B
            </span>
            <Select
              value={b}
              onChange={(e) => setB(e.target.value)}
              className="h-7 w-auto max-w-[260px] text-xs"
              aria-label="Run B"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {shortName(r.name)} · {timeAgo(r.completedAt)}
                </option>
              ))}
            </Select>
          </div>
          {table ? (
            <table className="m-4 w-[calc(100%-2rem)] text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-faint">
                  <th className="py-1.5 font-medium">Metric</th>
                  <th className="py-1.5 text-right font-medium">A</th>
                  <th className="py-1.5 text-right font-medium">B</th>
                  <th className="py-1.5 text-right font-medium">A − B</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {compareData.map((d) => (
                  <tr key={d.metric}>
                    <td className="py-2 text-ink-2">{d.metric}</td>
                    <td className="tabular py-2 text-right">{d.A.toFixed(3)}</td>
                    <td className="tabular py-2 text-right">{d.B.toFixed(3)}</td>
                    <td
                      className={cn(
                        "tabular py-2 text-right font-medium",
                        d.A - d.B >= 0 ? "text-good" : "text-bad",
                      )}
                    >
                      {(d.A - d.B >= 0 ? "+" : "") + (d.A - d.B).toFixed(3)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 text-ink-2">Constraint violations</td>
                  <td className="tabular py-2 text-right">
                    {((runA?.metrics?.hardConstraintViolationRate ?? 0) * 100).toFixed(1)}%
                  </td>
                  <td className="tabular py-2 text-right">
                    {((runB?.metrics?.hardConstraintViolationRate ?? 0) * 100).toFixed(1)}%
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          ) : (
            <div
              className="h-72 px-2 pb-2 pt-4"
              role="img"
              aria-label={`Run comparison. ${compareData.map((d) => `${d.metric}: A ${d.A.toFixed(3)}, B ${d.B.toFixed(3)}`).join("; ")}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={compareData}
                  barGap={2}
                  barCategoryGap="28%"
                  margin={{ top: 18, right: 12, left: -12, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="2 4" />
                  <XAxis dataKey="metric" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 1]} tick={axis} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "var(--subtle)" }}
                    contentStyle={tooltipStyle}
                    formatter={(v) => Number(v).toFixed(3)}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "var(--muted)" }}
                    formatter={(v) =>
                      v === "A" ? `A · ${shortName(runA?.name ?? "")}` : `B · ${shortName(runB?.name ?? "")}`
                    }
                  />
                  <Bar dataKey="A" fill="var(--series-1)" radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey="A"
                      position="top"
                      formatter={(v: unknown) => Number(v).toFixed(2)}
                      style={{ fontSize: 10, fill: "var(--ink-2)" }}
                    />
                  </Bar>
                  <Bar dataKey="B" fill="var(--series-2)" radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey="B"
                      position="top"
                      formatter={(v: unknown) => Number(v).toFixed(2)}
                      style={{ fontSize: 10, fill: "var(--ink-2)" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            icon={<FlaskConical className="size-3.5 text-muted" />}
            title="Run the eval suite"
            description="Runs as a durable job; results are stored with scoring, prompt and code versions."
          />
          <div className="space-y-3 p-4">
            <div
              className="flex gap-1 rounded-lg border border-line p-0.5 text-xs"
              role="radiogroup"
              aria-label="Configuration type"
            >
              {["Preset", "Custom blend"].map((t, i) => (
                <button
                  key={t}
                  role="radio"
                  aria-checked={custom === (i === 1)}
                  onClick={() => setCustom(i === 1)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 font-medium",
                    custom === (i === 1) ? "bg-ink text-bg" : "text-muted",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {!custom ? (
              <Select
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
                aria-label="Preset configuration"
              >
                {presets.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            ) : (
              <div className="space-y-2">
                {(["deterministic", "semantic", "rerank"] as const).map((k) => (
                  <label key={k} className="block text-xs text-ink-2">
                    <span className="flex justify-between">
                      <span className="capitalize">{k === "rerank" ? "learned reranker" : k}</span>
                      <span className="tabular">{blend[k].toFixed(2)}</span>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={blend[k]}
                      onChange={(e) => setBlend({ ...blend, [k]: Number(e.target.value) })}
                      className="w-full accent-[var(--accent)]"
                    />
                  </label>
                ))}
                <p className="text-[11px] text-muted">
                  Weights are renormalized. Try rerank = 0.3 and compare against the default.
                </p>
              </div>
            )}
            <Button
              variant="primary"
              className="w-full"
              onClick={run}
              disabled={!canRun || (!!jobId && job?.status !== "COMPLETED" && job?.status !== "FAILED")}
            >
              <Play /> {canRun ? "Run evaluation" : "Requires evals.run permission"}
            </Button>
            {job && <JobSteps job={job} title="run-eval-suite" />}
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Ablation: what each layer adds"
            description="NDCG@10 per run (bars) and the hard-constraint violation rate in the top 10 (label)."
          />
          <div
            className="h-72 px-2 py-3"
            role="img"
            aria-label={`Ablation: ${ablation.map((r) => `${r.name} NDCG ${r.ndcg}, violations ${(r.hcv * 100).toFixed(0)}%`).join("; ")}`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ablation}
                layout="vertical"
                margin={{ top: 4, right: 70, left: 8, bottom: 4 }}
                barCategoryGap="30%"
              >
                <CartesianGrid horizontal={false} stroke="var(--line)" strokeDasharray="2 4" />
                <XAxis type="number" domain={[0, 1]} tick={axis} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ ...axis, fill: "var(--ink-2)" }}
                  width={150}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--subtle)" }}
                  contentStyle={tooltipStyle}
                  formatter={(v) => Number(v).toFixed(3)}
                />
                <Bar dataKey="ndcg" name="NDCG@10" fill="var(--series-1)" radius={[0, 4, 4, 0]}>
                  <LabelList
                    dataKey="ndcg"
                    position="right"
                    content={(props) => {
                      const { x, y, width, height, index } = props as {
                        x: number;
                        y: number;
                        width: number;
                        height: number;
                        index: number;
                      };
                      const r = ablation[index]!;
                      return (
                        <text x={x + width + 6} y={y + height / 2 + 4} fontSize={10.5} fill="var(--ink-2)">
                          {r.ndcg.toFixed(3)}
                          <tspan fill={r.hcv > 0 ? "var(--bad)" : "var(--muted)"}>
                            {" "}
                            · {(r.hcv * 100).toFixed(0)}% viol.
                          </tspan>
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="border-t border-line px-4 py-2.5 text-xs text-muted">{ablationNote(runs)}</p>
        </Panel>
        <Panel>
          <PanelHeader title={`Per-role NDCG@10 · run A`} description={shortName(runA?.name ?? "")} />
          <div className="px-2 py-3" style={{ height: Math.max(220, perRole.length * 24 + 20) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={perRole}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
                barCategoryGap="22%"
              >
                <XAxis type="number" domain={[0, 1]} hide />
                <YAxis
                  type="category"
                  dataKey="title"
                  interval={0}
                  tick={{ ...axis, fill: "var(--ink-2)", fontSize: 10.5 }}
                  width={200}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "var(--subtle)" }}
                  contentStyle={tooltipStyle}
                  formatter={(v) => Number(v).toFixed(3)}
                />
                <Bar dataKey="ndcgAt10" name="NDCG@10" fill="var(--series-1)" radius={[0, 4, 4, 0]}>
                  <LabelList
                    dataKey="ndcgAt10"
                    position="right"
                    formatter={(v: unknown) => Number(v).toFixed(2)}
                    style={{ fontSize: 10, fill: "var(--ink-2)" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* external benchmark */}
      <Panel>
        <PanelHeader
          title="External benchmark — the fit model on real, public data"
          description={`${external.model} + ${external.embeddings}, trained from scratch on ${external.training.dataset} (no AI APIs). Test split shares 0 of ${external.training.overlap.testJobs} job descriptions with training.`}
          actions={
            <Badge tone="good">held-out test · {external.training.testPairs.toLocaleString()} pairs</Badge>
          }
        />
        <div className="grid gap-6 p-4 lg:grid-cols-3">
          <div>
            <div className="mb-2 text-xs font-medium text-ink-2">
              Per-JD ranking NDCG@10 (graded: good 2 · potential 1)
            </div>
            <div
              className="h-56"
              role="img"
              aria-label={extBars.map((x) => `${x.name} ${x.v.toFixed(3)}`).join("; ")}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={extBars}
                  layout="vertical"
                  margin={{ top: 0, right: 40, left: 4, bottom: 0 }}
                  barCategoryGap="26%"
                >
                  <XAxis type="number" domain={[0, 1]} hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ ...axis, fill: "var(--ink-2)" }}
                    width={108}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--subtle)" }}
                    contentStyle={tooltipStyle}
                    formatter={(v) => Number(v).toFixed(3)}
                  />
                  <Bar dataKey="v" name="NDCG@10" radius={[0, 4, 4, 0]}>
                    {extBars.map((x) => (
                      <Cell key={x.name} fill={x.ours ? "var(--series-1)" : "var(--line-strong)"} />
                    ))}
                    <LabelList
                      dataKey="v"
                      position="right"
                      formatter={(v: unknown) => Number(v).toFixed(3)}
                      style={{ fontSize: 10, fill: "var(--ink-2)" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Classification: accuracy {ext.mlp?.accuracy?.toFixed(3)} · macro-F1{" "}
              {ext.mlp?.macroF1?.toFixed(3)} (majority-class accuracy{" "}
              {ext.majorityClass?.accuracy?.toFixed(3)}, macro-F1 ≈ 0.22). Labels in this dataset are noisy —
              we report it as is.
            </p>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-ink-2">
              Training curve (class-balanced cross-entropy)
            </div>
            <div
              className="h-56"
              role="img"
              aria-label={`Training curve, best epoch ${external.training.bestEpoch}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={external.training.curve} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="2 4" />
                  <XAxis dataKey="epoch" tick={axis} axisLine={false} tickLine={false} />
                  <YAxis tick={axis} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v) => Number(v).toFixed(3)}
                    labelFormatter={(l) => `epoch ${l}`}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="trainLoss"
                    name="train"
                    stroke="var(--series-1)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="valLoss"
                    name="validation (grouped by JD)"
                    stroke="var(--series-2)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Early stopping at epoch {external.training.bestEpoch}. {external.training.optimizer}.
              Architecture chosen on validation only ({external.selection.length} configs tried).
            </p>
          </div>
          <div>
            <div className="mb-2 text-xs font-medium text-ink-2">Confusion matrix (test)</div>
            <table
              className="w-full text-center text-[11px]"
              aria-label="Confusion matrix: rows are true labels, columns are predicted"
            >
              <thead>
                <tr className="text-faint">
                  <th className="p-1 text-left font-medium">true \ pred</th>
                  {["No fit", "Potential", "Good"].map((h) => (
                    <th key={h} className="p-1 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {conf.map((row, i) => (
                  <tr key={i}>
                    <th className="p-1 text-left font-medium text-muted">
                      {["No fit", "Potential", "Good"][i]}
                    </th>
                    {row.map((v, j) => {
                      const t = v / confMax;
                      return (
                        <td key={j} className="p-0.5">
                          <div
                            className="tabular rounded-md py-3 font-medium"
                            style={{
                              background: `color-mix(in oklab, var(--seq-500) ${Math.round(12 + t * 78)}%, var(--panel))`,
                              color: t > 0.55 ? "white" : "var(--ink)",
                            }}
                          >
                            {v}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] text-muted">
              “Potential fit” is the hardest class (it's ambiguous for human labelers too). The ranking
              use-case only needs the ordering, which NDCG measures.
            </p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Dataset" description={dataset?.description} />
          <div className="space-y-3 p-4 text-[13px]">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="neutral">{dataset?.name}</Badge>
              <Badge tone="outline">v{dataset?.version}</Badge>
              <Badge tone="outline">{cases} pairs</Badge>
            </div>
            <div
              className="flex items-end gap-2"
              role="img"
              aria-label={`Label distribution: ${labelHistogram.map((n, i) => `${i}: ${n}`).join(", ")}`}
            >
              {labelHistogram.map((n, i) => (
                <div key={i} className="flex-1 text-center">
                  <div
                    className="mx-auto w-full rounded-t-[4px]"
                    style={{
                      height: `${(n / Math.max(...labelHistogram)) * 80}px`,
                      background: "var(--series-1)",
                      opacity: 0.35 + i * 0.2,
                    }}
                  />
                  <div className="tabular mt-1 text-xs text-ink-2">{n}</div>
                  <div className="text-[11px] text-faint">relevance {i}</div>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Metrics use <b>condensed lists</b> (Sakai, 2007): only judged candidates are scored, in the
              order the system ranked them — the standard treatment for incomplete judgments. Relevant = grade
              ≥ 2. Explicit incompatibilities (won't work onsite, needs sponsorship the role can't offer,
              salary &gt; 1.15× max) are labeled non-relevant.
            </p>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Run history" />
          <ul className="divide-y divide-line text-[13px]">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{r.name}</span>
                  <span className="text-[11px] text-faint">
                    {r.scoringVersion} · {r.promptVersion} · code {r.codeVersion} · {timeAgo(r.completedAt)}
                  </span>
                </span>
                <span className="tabular text-xs text-ink-2">NDCG {r.metrics!.ndcgAt10.toFixed(3)}</span>
                <span className="tabular text-xs text-muted">P@5 {r.metrics!.precisionAt5.toFixed(3)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

"use client";
import type { ScoreComponent } from "@trajectory/engine/client";
import { Badge } from "@/components/ui/badge";
import { MiniBar } from "./score";
import { EvidenceChips } from "./evidence";

export function ScoreBreakdown({
  components,
  blend,
  det,
  sem,
  rerank,
  final,
  rawRerank,
  probs,
}: {
  components: ScoreComponent[];
  blend: { deterministic: number; semantic: number; rerank: number };
  det: number;
  sem: number | null;
  rerank: number | null;
  final: number;
  rawRerank: number | null;
  probs: [number, number, number] | null;
}) {
  const feats = components.filter((c) => c.kind === "feature");
  const prefs = components.filter((c) => c.kind === "preference");
  const sumContrib = components.reduce((s, c) => s + c.contribution, 0);
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-line bg-panel-2 p-4">
        <div className="text-[11px] font-medium uppercase tracking-wider text-faint">
          Final score composition (versioned config)
        </div>
        <div className="tabular mt-2 flex flex-wrap items-center gap-2 font-mono text-[13px] text-ink">
          <span>{(final * 100).toFixed(1)}</span>=<span className="text-muted">{blend.deterministic}×</span>
          {(det * 100).toFixed(1)}
          <span className="text-faint">deterministic</span>+
          <span className="text-muted">{blend.semantic}×</span>
          {sem !== null ? (sem * 100).toFixed(1) : "—"}
          <span className="text-faint">semantic</span>+<span className="text-muted">{blend.rerank}×</span>
          {rerank !== null ? (rerank * 100).toFixed(1) : "—"}
          <span className="text-faint">fit model</span>
        </div>
        {probs && (
          <p className="mt-2 text-xs text-muted">
            Fit model (MLP trained from scratch): P(no fit) {Math.round(probs[0] * 100)}% · P(potential){" "}
            {Math.round(probs[1] * 100)}% · P(good) {Math.round(probs[2] * 100)}% → raw relevance{" "}
            {rawRerank?.toFixed(3)} → calibrated {rerank?.toFixed(3)}. It only reorders the top 25 and cannot
            change any deterministic component.
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-faint">
              <th className="py-2 pr-3 font-medium">Feature</th>
              <th className="w-40 py-2 pr-3 font-medium">Value</th>
              <th className="py-2 pr-3 text-right font-medium">Weight</th>
              <th className="py-2 pr-3 text-right font-medium">Contribution</th>
              <th className="py-2 font-medium">Why · evidence</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {feats.map((c) => (
              <tr key={c.key} className={c.weight === 0 ? "opacity-50" : ""}>
                <td className="py-2.5 pr-3 align-top">
                  <div className="font-medium text-ink">{c.label}</div>
                  <Badge
                    tone={c.status === "known" ? "good" : c.status === "partial" ? "warn" : "unknown"}
                    className="mt-0.5 h-4 px-1 text-[10px]"
                  >
                    {c.weight === 0 ? "n/a for role" : c.status}
                  </Badge>
                </td>
                <td className="py-2.5 pr-3 align-top">
                  <div className="flex items-center gap-2">
                    <MiniBar value={c.normalizedValue} />
                    <span className="tabular w-8 text-right text-xs text-ink-2">
                      {Math.round(c.normalizedValue * 100)}
                    </span>
                  </div>
                  {c.rawValue !== null && (
                    <div className="mt-1 truncate text-[11px] text-faint">{String(c.rawValue)}</div>
                  )}
                </td>
                <td className="tabular py-2.5 pr-3 text-right align-top text-muted">
                  {(c.weight * 100).toFixed(1)}%
                </td>
                <td className="tabular py-2.5 pr-3 text-right align-top font-medium text-ink">
                  {(c.contribution * 100).toFixed(2)}
                </td>
                <td className="py-2.5 align-top">
                  <p className="text-[12px] leading-snug text-ink-2">{c.explanation}</p>
                  {c.missing.length > 0 && (
                    <p className="mt-0.5 text-[11px] text-muted">Missing: {c.missing.join("; ")}</p>
                  )}
                  <EvidenceChips ids={c.evidenceIds} className="mt-1" />
                </td>
              </tr>
            ))}
            {prefs.map((c) => (
              <tr key={c.key} className="bg-accent-soft/40">
                <td className="py-2.5 pr-3 align-top">
                  <div className="font-medium text-ink">{c.label}</div>
                  <Badge tone="accent" className="mt-0.5 h-4 px-1 text-[10px]">
                    recruiter preference
                  </Badge>
                </td>
                <td className="py-2.5 pr-3 align-top">
                  <div className="flex items-center gap-2">
                    <MiniBar value={c.normalizedValue} tone="accent" />
                    <span className="tabular w-8 text-right text-xs">
                      {Math.round(c.normalizedValue * 100)}
                    </span>
                  </div>
                </td>
                <td
                  className={`tabular py-2.5 pr-3 text-right align-top ${c.weight > 0 ? "text-good" : "text-bad"}`}
                >
                  {c.weight > 0 ? "+" : ""}
                  {c.weight.toFixed(2)}
                </td>
                <td className="tabular py-2.5 pr-3 text-right align-top font-medium text-ink">
                  {(c.contribution * 100).toFixed(2)}
                </td>
                <td className="py-2.5 align-top">
                  <p className="text-[12px] text-ink-2">{c.explanation}</p>
                  <EvidenceChips ids={c.evidenceIds} className="mt-1" />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong">
              <td colSpan={3} className="py-2.5 text-right text-xs text-muted">
                Σ contributions = deterministic score
              </td>
              <td className="tabular py-2.5 pr-3 text-right font-semibold text-ink">
                {(sumContrib * 100).toFixed(2)}
              </td>
              <td className="py-2.5 text-xs text-muted">
                = {(det * 100).toFixed(2)} (checked by unit tests)
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

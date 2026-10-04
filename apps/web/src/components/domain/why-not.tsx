"use client";
import type { WhyNotItem } from "@trajectory/engine/client";
import { Badge, type Tone } from "@/components/ui/badge";

const KIND: Record<WhyNotItem["kind"], [Tone, string]> = {
  missing_evidence: ["unknown", "missing evidence"],
  negative_evidence: ["bad", "negative evidence"],
  constraint_unknown: ["warn", "constraint unknown"],
  model_judgement: ["info", "fit model"],
  semantic: ["info", "semantic"],
};

/** Exact decomposition: the items sum to (100 − score). Missing evidence ≠ negative evidence. */
export function WhyNotHundred({ items, score }: { items: WhyNotItem[]; score: number }) {
  const total = items.reduce((s, i) => s + i.pointsLost, 0);
  const max = Math.max(...items.map((i) => i.pointsLost), 1);
  const missing = items
    .filter((i) => i.kind === "missing_evidence" || i.kind === "constraint_unknown")
    .reduce((s, i) => s + i.pointsLost, 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          Score <b className="tabular text-ink">{(score * 100).toFixed(1)}</b> · gap{" "}
          <b className="tabular text-ink">{total.toFixed(1)}</b> points
        </span>
        <span>
          <b className="tabular text-ink">{missing.toFixed(1)}</b> of those are <i>unknowns</i> a question
          could resolve
        </span>
      </div>
      <ul className="space-y-2">
        {items.slice(0, 9).map((i) => (
          <li key={i.key} className="grid grid-cols-[minmax(120px,170px)_1fr_48px] items-start gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-ink">{i.label}</div>
              <Badge tone={KIND[i.kind][0]} className="mt-0.5 h-4 px-1 text-[10px]">
                {KIND[i.kind][1]}
              </Badge>
            </div>
            <div className="min-w-0 pt-1">
              <div className="h-2 overflow-hidden rounded-full bg-subtle">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(i.pointsLost / max) * 100}%`,
                    background:
                      i.kind === "negative_evidence"
                        ? "var(--bad)"
                        : i.kind === "constraint_unknown"
                          ? "var(--warn)"
                          : i.kind === "missing_evidence"
                            ? "var(--unknown)"
                            : "var(--info)",
                  }}
                />
              </div>
              <p className="mt-1 text-[12px] leading-snug text-muted">{i.text}</p>
            </div>
            <div className="tabular pt-0.5 text-right text-[13px] font-semibold text-ink">
              −{i.pointsLost.toFixed(1)}
            </div>
          </li>
        ))}
      </ul>
      {items.length > 9 && (
        <p className="mt-2 text-[11px] text-faint">
          + {items.length - 9} smaller items (
          {items
            .slice(9)
            .reduce((s, i) => s + i.pointsLost, 0)
            .toFixed(1)}{" "}
          pts)
        </p>
      )}
    </div>
  );
}

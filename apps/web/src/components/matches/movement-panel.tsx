"use client";
import { motion } from "motion/react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { PreferenceProposal } from "@trajectory/engine/client";
import { Panel } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { cn, timeAgo } from "@/lib/utils";

export interface Movement {
  candidateId: string;
  name: string;
  before: number | null;
  after: number;
  scoreBefore: number | null;
  scoreAfter: number;
}

export function MovementPanel({
  refinement,
  onClose,
}: {
  refinement: { text: string; at: string; movement: Movement[]; proposals: PreferenceProposal[] };
  onClose: () => void;
}) {
  const rows = refinement.movement.slice(0, 14);
  const maxRank = Math.max(12, ...rows.map((r) => Math.max(r.before ?? 0, r.after)));
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3">
        <div>
          <div className="text-[13px] font-semibold text-ink">
            Before → after · last refinement {timeAgo(refinement.at)}
          </div>
          <p className="mt-0.5 text-xs text-muted">“{refinement.text}”</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {refinement.proposals.map((p) => (
              <Badge key={p.key} tone={p.delta > 0 ? "good" : "bad"}>
                {p.label} {p.delta > 0 ? "+" : ""}
                {p.delta}
              </Badge>
            ))}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Hide movement"
          className="rounded-md p-1 text-muted hover:bg-subtle hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-x-8 gap-y-1 p-4 sm:grid-cols-2" role="table" aria-label="Rank movement">
        {rows.map((r, i) => {
          const d = r.before ? r.before - r.after : 0;
          return (
            <div
              key={r.candidateId}
              className="grid grid-cols-[1fr_140px_44px] items-center gap-3 py-1"
              role="row"
            >
              <span className="truncate text-[13px] text-ink" role="cell">
                {r.name}
              </span>
              <span
                className="relative h-5"
                role="cell"
                aria-label={`rank ${r.before ?? "new"} to ${r.after}`}
              >
                <span className="absolute inset-y-1/2 left-0 right-0 h-px bg-line" />
                {r.before && (
                  <span
                    className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-line-strong"
                    style={{ left: `${((r.before - 1) / (maxRank - 1)) * 100}%` }}
                  />
                )}
                <motion.span
                  initial={{ left: `${(((r.before ?? r.after) - 1) / (maxRank - 1)) * 100}%` }}
                  animate={{ left: `${((r.after - 1) / (maxRank - 1)) * 100}%` }}
                  transition={{ delay: 0.15 + i * 0.05, type: "spring", stiffness: 120, damping: 18 }}
                  className={cn(
                    "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel",
                    d > 0 ? "bg-good" : d < 0 ? "bg-bad" : "bg-ink-2",
                  )}
                />
              </span>
              <span
                className={cn(
                  "tabular flex items-center justify-end gap-0.5 text-xs font-semibold",
                  d > 0 ? "text-good" : d < 0 ? "text-bad" : "text-faint",
                )}
                role="cell"
              >
                {d > 0 ? <ArrowUp className="size-3" /> : d < 0 ? <ArrowDown className="size-3" /> : null}
                {d === 0 ? "—" : Math.abs(d)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="border-t border-line px-4 py-2 text-[11px] text-muted">
        Track shows rank 1 (left) → {maxRank}. Grey dot = previous position. Revert any time from the role
        page.
      </p>
    </Panel>
  );
}

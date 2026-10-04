"use client";
import * as React from "react";
import { toast } from "sonner";
import { Ban, CircleHelp, ShieldCheck, Wand2 } from "lucide-react";
import type { RankingRefinement } from "@trajectory/engine/client";
import { Dialog, DialogContent } from "@/components/ui/overlays";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  applyRefinementAction,
  discardRefinementAction,
  proposeRefinementAction,
} from "@/app/actions/matches";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "These candidates feel too enterprise. Prioritize people who independently shipped products in teams under 30.",
  "Too managerial — we want hands-on builders. Production search experience matters more.",
  "Prefer people with open source work and design taste.",
  "Prioritize younger engineers.",
];

export function RefineDrawer({
  open,
  onOpenChange,
  roleId,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roleId: string;
  onApplied: (jobId: string) => void;
}) {
  const [text, setText] = React.useState("");
  const [ref, setRef] = React.useState<RankingRefinement | null>(null);
  const [edits, setEdits] = React.useState<Record<string, { delta: number; include: boolean }>>({});
  const [busy, setBusy] = React.useState(false);

  const change = (v: boolean) => {
    if (!v) {
      setRef(null);
      setEdits({});
    }
    onOpenChange(v);
  };

  const interpret = async () => {
    setBusy(true);
    const r = await proposeRefinementAction(roleId, text);
    setBusy(false);
    if (!r.ok) return toast.error(r.error.message);
    setRef(r.data);
    setEdits(Object.fromEntries(r.data.proposals.map((p) => [p.key, { delta: p.delta, include: true }])));
  };

  const apply = async () => {
    if (!ref) return;
    setBusy(true);
    const r = await applyRefinementAction(
      ref.id,
      Object.entries(edits).map(([key, v]) => ({ key, ...v })),
    );
    setBusy(false);
    if (!r.ok) return toast.error(r.error.message);
    toast.success("Preferences applied — re-ranking…");
    onApplied(r.data.jobId);
    change(false);
    setText("");
  };

  const discard = async () => {
    if (ref) await discardRefinementAction(ref.id);
    setRef(null);
  };

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent
        side="right"
        title="Refine ranking"
        description="Say what's wrong in plain language. You'll review the exact preference changes before anything is re-ranked."
      >
        <div className="space-y-5 p-5">
          <div>
            <Textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. These candidates feel too enterprise. Prioritize people who independently shipped products in teams under 30."
              aria-label="Ranking feedback"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setText(s)}
                  className="rounded-full border border-line px-2.5 py-1 text-left text-[11px] text-muted hover:border-line-strong hover:text-ink"
                >
                  {s.length > 60 ? s.slice(0, 58) + "…" : s}
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              <Button variant="primary" onClick={interpret} disabled={busy || text.trim().length < 4}>
                <Wand2 /> {busy && !ref ? "Interpreting…" : "Interpret feedback"}
              </Button>
            </div>
          </div>

          {ref && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-muted">
                <ShieldCheck className="size-3.5 text-good" /> Proposed by {ref.interpreterVersion} · mapped
                to an allowlist of ranking features only
              </div>
              {ref.refused.map((r) => (
                <div key={r} className="flex gap-2 rounded-lg bg-bad-soft p-3 text-xs text-bad">
                  <Ban className="mt-px size-3.5 shrink-0" /> {r}
                </div>
              ))}
              {ref.proposals.length > 0 ? (
                <ul className="space-y-2">
                  {ref.proposals.map((p) => {
                    const e = edits[p.key]!;
                    return (
                      <li
                        key={p.key}
                        className={cn(
                          "rounded-xl border p-3 transition",
                          e.include ? "border-line bg-panel" : "border-dashed border-line opacity-60",
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={e.include}
                            onChange={(ev) =>
                              setEdits({ ...edits, [p.key]: { ...e, include: ev.target.checked } })
                            }
                            aria-label={`Include ${p.label}`}
                            className="size-4 accent-[var(--accent)]"
                          />
                          <span className="flex-1 text-[13px] font-medium text-ink">{p.label}</span>
                          <span
                            className={cn(
                              "tabular text-sm font-semibold",
                              e.delta > 0 ? "text-good" : "text-bad",
                            )}
                          >
                            {e.delta > 0 ? "+" : ""}
                            {e.delta.toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={-0.3}
                          max={0.3}
                          step={0.01}
                          value={e.delta}
                          onChange={(ev) =>
                            setEdits({ ...edits, [p.key]: { ...e, delta: Number(ev.target.value) } })
                          }
                          aria-label={`Weight change for ${p.label}`}
                          className="mt-2 w-full accent-[var(--accent)]"
                        />
                        <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                          <span>{p.rationale}</span>
                          <Badge tone={p.confidence >= 0.8 ? "good" : "warn"}>
                            {Math.round(p.confidence * 100)}% sure
                          </Badge>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="rounded-lg bg-subtle p-3 text-xs text-muted">
                  No allowlisted ranking feature matched this feedback. Try naming what to prioritize or
                  avoid.
                </p>
              )}
              {ref.unrecognized.length > 0 && (
                <div className="rounded-lg border border-dashed border-line p-3 text-xs text-muted">
                  <div className="mb-1 flex items-center gap-1.5 font-medium text-ink-2">
                    <CircleHelp className="size-3.5" /> Not mapped to a ranking change
                  </div>
                  {ref.unrecognized.map((u) => (
                    <div key={u}>“{u}”</div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
                <Button variant="ghost" onClick={discard}>
                  Discard
                </Button>
                <Button
                  variant="accent"
                  onClick={apply}
                  disabled={busy || !Object.values(edits).some((e) => e.include && e.delta !== 0)}
                >
                  {busy ? "Applying…" : "Apply & re-rank"}
                </Button>
              </div>
              <p className="text-[11px] text-muted">
                Applying stores these as role preferences (audited, reversible from the role page) and
                re-scores every retrieved candidate. Nothing else changes.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

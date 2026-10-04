"use client";
import * as React from "react";
import NumberFlow from "@number-flow/react";
import { AnimatePresence, LayoutGroup, motion, useInView, useReducedMotion } from "motion/react";
import { ArrowDown, ArrowUp, Pause, Play, Wand2 } from "lucide-react";
import type { LandingRow } from "@/server/marketing";
import { cn } from "@/lib/utils";

export function RankingReplay({
  role,
  before,
  after,
  feedback,
  deltas,
}: {
  role: { title: string; where: string };
  before: LandingRow[];
  after: LandingRow[];
  feedback: string;
  deltas: { key: string; delta: number }[];
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const reduce = useReducedMotion();
  const [refined, setRefined] = React.useState(false);
  const [playing, setPlaying] = React.useState(true);
  const [typed, setTyped] = React.useState(0);

  const toggle = React.useCallback(() => {
    setTyped(0);
    setRefined((r) => !r);
  }, []);

  React.useEffect(() => {
    if (!inView || !playing || reduce) return;
    const t = setTimeout(toggle, refined ? 5200 : 3800);
    return () => clearTimeout(t);
  }, [inView, playing, refined, reduce, toggle]);

  // typewriter for the feedback text (state only changes inside the interval callback)
  React.useEffect(() => {
    if (!refined || reduce) return;
    let i = 0;
    const t = setInterval(() => {
      i += 3;
      setTyped(Math.min(feedback.length, i));
      if (i >= feedback.length) clearInterval(t);
    }, 16);
    return () => clearInterval(t);
  }, [refined, feedback, reduce]);
  const shown = reduce ? feedback.length : typed;

  const rows = (refined ? after : before).slice(0, 6);
  const prevRank = new Map(before.map((r) => [r.id, r.rank]));

  return (
    <div
      ref={ref}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f1013]/90 shadow-[0_40px_120px_-30px_rgba(91,91,214,0.45)] backdrop-blur"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-[13px] font-semibold text-white">{role.title}</div>
          <div className="text-[11px] text-white/50">
            {role.where} · live output of the ranking engine on the demo dataset
          </div>
        </div>
        <button
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause replay" : "Play replay"}
          className="rounded-md p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
        >
          {playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
      </div>
      <div className="border-b border-white/10 px-4 py-2.5">
        <button
          onClick={() => (setPlaying(false), toggle())}
          className={cn(
            "flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-[12px] transition",
            refined
              ? "border-[#8b8cf6]/50 bg-[#8b8cf6]/10 text-white"
              : "border-white/10 text-white/50 hover:text-white/80",
          )}
        >
          <Wand2 className="mt-0.5 size-3.5 shrink-0 text-[#8b8cf6]" />
          <span className="min-h-[2.4em]">
            {refined ? feedback.slice(0, shown) : "Refine ranking in plain language…"}
            {refined && shown < feedback.length && <span className="animate-pulse">▍</span>}
          </span>
        </button>
        <AnimatePresence>
          {refined && shown >= feedback.length && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-2 flex flex-wrap gap-1"
            >
              {deltas.map((d) => (
                <span
                  key={d.key}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 font-mono text-[10.5px]",
                    d.delta > 0 ? "bg-emerald-400/10 text-emerald-300" : "bg-orange-400/10 text-orange-300",
                  )}
                >
                  {d.key} {d.delta > 0 ? "+" : ""}
                  {d.delta}
                </span>
              ))}
              <span className="px-1 text-[10.5px] text-white/40">confirmed by a human → re-ranked</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <LayoutGroup>
        <ol className="p-2" aria-live="polite">
          {rows.map((r) => {
            const was = prevRank.get(r.id) ?? 9;
            const d = refined ? was - r.rank : 0;
            return (
              <motion.li
                key={r.id}
                layout
                transition={{ type: "spring", stiffness: 300, damping: 32 }}
                className="flex items-center gap-3 rounded-lg px-2.5 py-2"
              >
                <span className="tabular w-5 text-[13px] font-semibold text-white/40">{r.rank}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-white">{r.name}</span>
                  <span className="block truncate text-[11px] text-white/45">
                    {r.title}
                    {r.indie && <span className="ml-1.5 text-emerald-300/80">· shipped independently</span>}
                    {r.enterprise && <span className="ml-1.5 text-orange-300/80">· enterprise-heavy</span>}
                  </span>
                </span>
                <span
                  className={cn(
                    "tabular flex w-9 items-center justify-end gap-0.5 text-[11px] font-semibold",
                    d > 0 ? "text-emerald-300" : d < 0 ? "text-orange-300" : "text-transparent",
                  )}
                >
                  {d > 0 ? <ArrowUp className="size-3" /> : d < 0 ? <ArrowDown className="size-3" /> : null}
                  {d !== 0 && Math.abs(d)}
                </span>
                <span className="tabular w-12 text-right text-[15px] font-semibold text-white">
                  <NumberFlow
                    value={Math.round(r.score * 1000) / 10}
                    format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }}
                  />
                </span>
              </motion.li>
            );
          })}
        </ol>
      </LayoutGroup>
      <div className="border-t border-white/10 px-4 py-2 text-[10.5px] text-white/35">
        Deterministic features · LSA semantic relevance · learned fit model (top 25) · no LLM calls
      </div>
    </div>
  );
}

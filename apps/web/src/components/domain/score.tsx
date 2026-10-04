"use client";
import NumberFlow from "@number-flow/react";
import { ArrowDown, ArrowUp, CircleCheck, CircleHelp, CircleX, Minus } from "lucide-react";
import type { ConstraintStatus, MatchStatus } from "@trajectory/engine/client";
import { Badge, type Tone } from "@/components/ui/badge";
import { Tip } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";

const toneVar = (x: number) => (x >= 0.8 ? "var(--good)" : x >= 0.62 ? "var(--warn)" : "var(--bad)");

export function ScoreRing({
  value,
  size = 44,
  stroke = 4,
  label,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label ?? "Score"} ${Math.round(v * 100)} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={toneVar(v)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <span
        className="tabular absolute inset-0 grid place-items-center font-semibold text-ink"
        style={{ fontSize: size * 0.3 }}
      >
        <NumberFlow value={Math.round(v * 100)} />
      </span>
    </div>
  );
}

export function ScoreNumber({
  value,
  digits = 1,
  className,
}: {
  value: number;
  digits?: number;
  className?: string;
}) {
  return (
    <span className={cn("tabular", className)}>
      <NumberFlow
        value={Math.round(value * 10 ** (digits + 2)) / 10 ** digits}
        format={{ minimumFractionDigits: digits, maximumFractionDigits: digits }}
      />
    </span>
  );
}

export function ConfidenceMeter({ value, className }: { value: number; className?: string }) {
  const segs = 5;
  const filled = Math.round(value * segs);
  const label = value >= 0.75 ? "High" : value >= 0.55 ? "Medium" : "Low";
  return (
    <Tip
      content={`Confidence ${Math.round(value * 100)}% — how much evidence backs this score (distinct from fit).`}
    >
      <span
        className={cn("inline-flex items-center gap-1.5 text-[11px] text-muted", className)}
        aria-label={`Confidence ${label}, ${Math.round(value * 100)} percent`}
      >
        <span className="flex gap-0.5" aria-hidden>
          {Array.from({ length: segs }).map((_, i) => (
            <span key={i} className={cn("h-2.5 w-1 rounded-sm", i < filled ? "bg-ink-2" : "bg-line")} />
          ))}
        </span>
        {label}
      </span>
    </Tip>
  );
}

export function ConstraintBadge({
  status,
  className,
  short,
}: {
  status: ConstraintStatus;
  className?: string;
  short?: boolean;
}) {
  const map: Record<ConstraintStatus, [Tone, React.ElementType, string]> = {
    PASS: ["good", CircleCheck, "Constraints pass"],
    UNKNOWN: ["unknown", CircleHelp, "Constraint unknown"],
    FAIL: ["bad", CircleX, "Fails constraint"],
  };
  const [tone, Icon, label] = map[status];
  return (
    <Badge tone={tone} className={className}>
      <Icon className="size-3" />
      {short ? status.toLowerCase() : label}
    </Badge>
  );
}

const STATUS: Record<MatchStatus, [Tone, string]> = {
  NEW: ["neutral", "New"],
  REVIEWED: ["outline", "Reviewed"],
  SHORTLISTED: ["accent", "Shortlisted"],
  REJECTED: ["bad", "Rejected"],
  QUALIFYING: ["info", "Qualifying"],
  INTERESTED: ["good", "Interested"],
  INTRO_REQUESTED: ["warn", "Intro requested"],
  INTRODUCED: ["good", "Introduced"],
  CLOSED: ["outline", "Closed"],
};

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  const [tone, label] = STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function RankDelta({ from, to, className }: { from: number | null; to: number; className?: string }) {
  if (from === null || from <= 0 || to <= 0)
    return <span className={cn("text-[11px] text-faint", className)}>new</span>;
  const d = from - to;
  if (d === 0) return <Minus className={cn("size-3 text-faint", className)} aria-label="No change" />;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-medium tabular",
        d > 0 ? "text-good" : "text-bad",
        className,
      )}
      aria-label={`${d > 0 ? "Up" : "Down"} ${Math.abs(d)}`}
    >
      {d > 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {Math.abs(d)}
    </span>
  );
}

export function MiniBar({
  value,
  tone,
  className,
}: {
  value: number;
  tone?: "accent" | "auto" | "muted";
  className?: string;
}) {
  const v = Math.max(0, Math.min(1, value));
  const color = tone === "accent" ? "var(--accent)" : tone === "muted" ? "var(--faint)" : toneVar(v);
  return (
    <span className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-line", className)} aria-hidden>
      <span
        className="block h-full rounded-full transition-[width] duration-700"
        style={{ width: `${v * 100}%`, background: color }}
      />
    </span>
  );
}

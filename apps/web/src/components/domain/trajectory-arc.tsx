"use client";
import * as React from "react";
import type { Trajectory } from "@trajectory/engine";
import { cn } from "@/lib/utils";

/** "Where is this candidate heading?" — each role/project plotted by time × alignment with the role. */
export function TrajectoryArc({ t, className }: { t: Trajectory; className?: string }) {
  const W = 560;
  const H = 210;
  const pad = { l: 36, r: 56, t: 18, b: 30 };
  const pts = t.points;
  if (!pts.length) return <p className="text-xs text-muted">Not enough history to plot a trajectory.</p>;
  const x0 = Math.floor(Math.min(...pts.map((p) => p.start)));
  const x1 = Math.ceil(Math.max(...pts.map((p) => p.end))) + 0.6;
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0)) * (W - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - y) * (H - pad.t - pad.b);
  const exps = pts.filter((p) => p.kind === "experience");
  const mids = exps.map((p) => ({ x: sx((p.start + p.end) / 2), y: sy(p.alignment) }));
  const path =
    mids.length > 1
      ? mids.map((m, i) => `${i ? "L" : "M"}${m.x.toFixed(1)},${m.y.toFixed(1)}`).join(" ")
      : "";
  const last = mids[mids.length - 1];
  const target = { x: W - pad.r + 26, y: sy(0.95) };
  const color =
    t.heading === "toward" ? "var(--good)" : t.heading === "away" ? "var(--bad)" : "var(--accent)";
  const years: number[] = [];
  for (let y = x0; y <= x1; y += x1 - x0 > 10 ? 2 : 1) years.push(y);
  return (
    <figure className={cn("w-full", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Career trajectory: ${t.heading}, recent alignment ${Math.round(t.recentAlignment * 100)} percent`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={sy(g)}
              y2={sy(g)}
              stroke="var(--line)"
              strokeDasharray={g === 0 ? undefined : "2 4"}
            />
            <text x={pad.l - 6} y={sy(g) + 3} textAnchor="end" className="fill-[var(--faint)] text-[9px]">
              {Math.round(g * 100)}
            </text>
          </g>
        ))}
        {years.map((y) => (
          <text key={y} x={sx(y)} y={H - 10} textAnchor="middle" className="fill-[var(--faint)] text-[9px]">
            {y}
          </text>
        ))}
        {exps.map((p) => (
          <g key={p.id}>
            <rect
              x={sx(p.start)}
              y={sy(p.alignment) - 4}
              width={Math.max(4, sx(p.end) - sx(p.start))}
              height={8}
              rx={4}
              fill="color-mix(in oklab, var(--accent) 22%, transparent)"
              stroke="var(--accent)"
              strokeWidth={1}
            />
            <text
              x={sx(p.start) + 2}
              y={sy(p.alignment) - 9}
              className="fill-[var(--ink-2)] text-[9px] font-medium"
            >
              {p.label.length > 28 ? p.label.slice(0, 27) + "…" : p.label}
            </text>
          </g>
        ))}
        {pts
          .filter((p) => p.kind === "project")
          .map((p) => (
            <g key={p.id}>
              <circle
                cx={sx(p.start)}
                cy={sy(p.alignment)}
                r={4.5}
                fill="var(--panel)"
                stroke="var(--ink-2)"
                strokeWidth={1.5}
              />
              <text x={sx(p.start) + 7} y={sy(p.alignment) + 3} className="fill-[var(--muted)] text-[9px]">
                {p.label}
              </text>
            </g>
          ))}
        {path && (
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeDasharray="600"
            strokeDashoffset="600"
            style={{ animation: "draw 1.2s ease-out forwards" }}
          />
        )}
        {last && (
          <>
            <line
              x1={last.x}
              y1={last.y}
              x2={target.x - 10}
              y2={
                target.y +
                (last.y - target.y) * (t.heading === "toward" ? 0.15 : t.heading === "away" ? 1.2 : 0.6)
              }
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray="3 4"
            />
            <g transform={`translate(${target.x},${target.y})`}>
              <circle r={9} fill="var(--panel)" stroke="var(--ink)" strokeWidth={1.5} />
              <circle r={3.5} fill="var(--ink)" />
            </g>
            <text
              x={target.x}
              y={target.y + 22}
              textAnchor="middle"
              className="fill-[var(--ink-2)] text-[9px] font-semibold"
            >
              this role
            </text>
          </>
        )}
      </svg>
      <figcaption className="mt-1 text-xs text-muted">
        Y = semantic alignment of each role with this job (LSA embeddings). Recent work{" "}
        {Math.round(t.recentAlignment * 100)}%
        {t.earlyAlignment !== null ? ` vs ${Math.round(t.earlyAlignment * 100)}% earlier` : ""} →{" "}
        <b className="font-medium text-ink-2">
          {t.heading === "toward"
            ? "heading toward this role"
            : t.heading === "away"
              ? "drifting away"
              : "steady"}
        </b>
        .
      </figcaption>
    </figure>
  );
}

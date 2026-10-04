import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CircleHelp,
  FileSearch,
  Gauge,
  Lock,
  MessageCircleQuestion,
  Route,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  Workflow,
} from "lucide-react";
import { ready } from "@/server/bootstrap";
import { landingData } from "@/server/marketing";
import { MarketingFooter, MarketingNav } from "@/components/marketing/chrome";
import { RankingReplay } from "@/components/marketing/ranking-replay";
import { Reveal } from "@/components/marketing/reveal";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Trajectory — find the person who fits where you're going",
  description:
    "Evidence-backed, explainable talent matching for startups: hybrid retrieval, deterministic scoring, a learned fit model, uncertainty you can resolve, and rankings that learn from your feedback.",
};

const LOOP = [
  { icon: Sparkles, t: "Role intent", d: "Messy brief → structured, editable requirements" },
  { icon: Lock, t: "Hard constraints", d: "PASS / FAIL / UNKNOWN — never a model's call" },
  { icon: Search, t: "Hybrid retrieval", d: "BM25F keyword + vector search, rank-fused" },
  { icon: Gauge, t: "Evidence scoring", d: "11 deterministic features, every one cited" },
  { icon: SlidersHorizontal, t: "Bounded rerank", d: "A fit model trained from scratch, top 25 only" },
  { icon: CircleHelp, t: "Explanation + uncertainty", d: "Why this match — and why not 100" },
  { icon: UserCheck, t: "Recruiter review", d: "Shortlist, reject with a reason, refine in words" },
  {
    icon: MessageCircleQuestion,
    t: "Qualification",
    d: "The fewest questions that would change the decision",
  },
  { icon: Workflow, t: "Approved intro", d: "Candidate consent + recruiter approval. Always." },
  { icon: Route, t: "Feedback learning", d: "Reviewable preference changes re-rank the role" },
];

export default async function Landing() {
  await ready();
  const d = landingData();
  const hasFilm = fs.existsSync(path.join(process.cwd(), "public", "media", "trajectory-launch.mp4"));
  const maxPts = Math.max(1, ...d.whyNot.map((w) => w.points));
  const tj = d.trajectory;
  const x0 = tj ? Math.min(...tj.points.map((p) => p.start)) : 0;
  const x1 = tj ? Math.max(...tj.points.map((p) => p.end)) + 0.8 : 1;
  return (
    <div className="dark min-h-dvh bg-[#08090b] text-white [color-scheme:dark]">
      <MarketingNav />
      {/* ------------------------------------------------------------------ hero */}
      <section className="relative overflow-hidden">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <HeroArcs />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:pt-24">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[12px] text-white/60">
                <span className="size-1.5 rounded-full bg-[#8b8cf6]" /> Evidence-backed talent matching for
                startups
              </span>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-5 text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[58px]">
                Find the person who fits where you're going —{" "}
                <span className="font-serif text-[52px] font-normal italic tracking-normal text-white/70 sm:text-[66px]">
                  not just where they've been.
                </span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-xl text-[16px] leading-relaxed text-white/60">
                Trajectory ranks candidates with hybrid retrieval, deterministic evidence scoring and a fit
                model we trained from scratch — then shows its work. Every claim cites a source. Every unknown
                becomes a question. Every change you ask for is reviewable.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  className="group flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-[14px] font-medium text-[#08090b] transition hover:bg-white/90"
                >
                  Open the live demo <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="#film"
                  className="flex h-11 items-center gap-2 rounded-xl border border-white/15 px-5 text-[14px] text-white/80 transition hover:border-white/30 hover:text-white"
                >
                  Watch the film
                </Link>
              </div>
              <p className="mt-4 text-[12px] text-white/40">
                {d.stats.candidates} synthetic candidates · {d.stats.evidence.toLocaleString()} evidence nodes
                · {d.stats.roles} roles · no AI APIs — everything runs locally.
              </p>
            </Reveal>
          </div>
          <Reveal delay={0.2}>
            <RankingReplay
              role={d.role}
              before={d.before}
              after={d.after}
              feedback={d.feedback}
              deltas={d.deltas}
            />
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------------ film */}
      <section id="film" className="border-t border-white/[0.06] py-20">
        <div className="mx-auto max-w-5xl px-5">
          <Reveal>
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-semibold tracking-tight">Twenty-five seconds, start to finish</h2>
              <p className="mt-2 text-white/55">
                A messy brief becomes an explainable shortlist — then learns from one sentence of feedback.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.05}>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black shadow-[0_30px_120px_-40px_rgba(139,140,246,0.5)]">
              {hasFilm ? (
                <video
                  className="aspect-video w-full"
                  controls
                  preload="metadata"
                  poster="/media/trajectory-launch-poster.jpg"
                  playsInline
                >
                  <source src="/media/trajectory-launch.mp4" type="video/mp4" />
                  <track
                    kind="captions"
                    src="/media/trajectory-launch.vtt"
                    srcLang="en"
                    label="English"
                    default
                  />
                </video>
              ) : (
                <div className="grid aspect-video place-items-center text-sm text-white/40">
                  Launch film renders here (public/media/trajectory-launch.mp4).
                </div>
              )}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------------ loop */}
      <section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Not a similarity score.{" "}
              <span className="font-serif font-normal italic text-white/60">An adaptive loop.</span>
            </h2>
            <p className="mt-3 max-w-2xl text-white/55">
              Keyword-matching a resume to a JD returns a number without proving anything. Trajectory replaces
              it with ten inspectable steps — deterministic where it must be, learned where it helps, human
              where it matters.
            </p>
          </Reveal>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-5">
            {LOOP.map((s, i) => (
              <li key={s.t} className="bg-[#0b0c0f] p-5">
                <Reveal delay={i * 0.03}>
                  <div className="flex items-center gap-2 text-[11px] font-medium text-white/35">
                    <span className="tabular">{String(i + 1).padStart(2, "0")}</span>
                    <s.icon className="size-3.5 text-[#8b8cf6]" />
                  </div>
                  <div className="mt-3 text-[14px] font-medium">{s.t}</div>
                  <div className="mt-1 text-[12.5px] leading-snug text-white/50">{s.d}</div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------------------ evidence + why not 100 */}
      <section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 lg:grid-cols-2">
          <Reveal>
            <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#8b8cf6]">
              Evidence over confidence theater
            </div>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight">
              Every important claim links to the exact text behind it.
            </h3>
            <p className="mt-3 text-white/55">
              Resumes become an evidence graph: claims, the sources that support them, and the ones that
              contradict them. Self-listed skills stay “unsupported” until something proves them.
            </p>
            {d.evidence && (
              <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 text-white/70">
                    <FileSearch className="size-3.5" /> {d.evidence.candidate} · resume excerpt
                  </span>
                  <span className="flex items-center gap-1 rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-emerald-300">
                    <BadgeCheck className="size-3" /> {d.evidence.claim}: {d.evidence.status.toLowerCase()}
                  </span>
                </div>
                <p className="mt-3 font-mono text-[12.5px] leading-relaxed text-white/45">
                  {d.evidence.excerptBefore}
                  <mark className="rounded bg-[#8b8cf6]/25 px-0.5 text-white ring-1 ring-[#8b8cf6]/40">
                    {d.evidence.excerpt}
                  </mark>
                  {d.evidence.excerptAfter}
                </p>
              </div>
            )}
          </Reveal>
          <Reveal delay={0.08}>
            <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#8b8cf6]">
              Why not 100?
            </div>
            <h3 className="mt-3 text-2xl font-semibold tracking-tight">
              The gap, itemized — and split into unknowns vs. negatives.
            </h3>
            <p className="mt-3 text-white/55">
              Computed from score arithmetic, not prose. Missing evidence isn't negative evidence, so unknowns
              become the questions worth asking.
            </p>
            <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 text-[12px] text-white/50">
                Top match · score {d.whyNotScore ? (d.whyNotScore * 100).toFixed(1) : "—"}
              </div>
              <ul className="space-y-2.5">
                {d.whyNot.map((w) => (
                  <li
                    key={w.label}
                    className="grid grid-cols-[150px_1fr_44px] items-center gap-3 text-[12.5px]"
                  >
                    <span className="truncate text-white/75">{w.label}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${(w.points / maxPts) * 100}%`,
                          background:
                            w.kind === "missing_evidence"
                              ? "#94a3b8"
                              : w.kind === "negative_evidence"
                                ? "#fb923c"
                                : "#8b8cf6",
                        }}
                      />
                    </span>
                    <span className="tabular text-right text-white/70">−{w.points.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-3 text-[11px] text-white/40">
                <span>
                  ■ <span className="text-slate-400">missing evidence</span>
                </span>
                <span>
                  ■ <span className="text-orange-400">negative evidence</span>
                </span>
                <span>
                  ■ <span className="text-[#8b8cf6]">model / semantic</span>
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------------ trajectory */}
      {tj && (
        <section className="border-t border-white/[0.06] py-24">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 lg:grid-cols-[0.9fr_1.1fr]">
            <Reveal>
              <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#8b8cf6]">
                Trajectory, not titles
              </div>
              <h3 className="mt-3 text-2xl font-semibold tracking-tight">See where someone is heading.</h3>
              <p className="mt-3 text-white/55">
                Each role in a career is embedded and compared with the job. {tj.name} started in design; her
                recent work is far more aligned with an AI full-stack role than her early career — a direction
                a keyword match would never see.
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <svg
                viewBox="0 0 600 240"
                className="w-full"
                role="img"
                aria-label={`Career trajectory for ${tj.name}: ${tj.heading}`}
              >
                {[0, 0.5, 1].map((gy) => (
                  <line
                    key={gy}
                    x1="20"
                    x2="560"
                    y1={20 + (1 - gy) * 180}
                    y2={20 + (1 - gy) * 180}
                    stroke="rgba(255,255,255,0.08)"
                    strokeDasharray="3 6"
                  />
                ))}
                {tj.points.map((p) => {
                  const sx = (x: number) => 20 + ((x - x0) / (x1 - x0)) * 520;
                  const y = 20 + (1 - p.alignment) * 180;
                  return (
                    <g key={p.label + p.start}>
                      <rect
                        x={sx(p.start)}
                        y={y - 5}
                        width={Math.max(6, sx(p.end) - sx(p.start))}
                        height={10}
                        rx={5}
                        fill="rgba(139,140,246,0.25)"
                        stroke="#8b8cf6"
                      />
                      <text x={sx(p.start)} y={y - 12} fill="rgba(255,255,255,0.7)" fontSize="12">
                        {p.label}
                      </text>
                    </g>
                  );
                })}
                <path
                  d={tj.points
                    .map(
                      (p, i) =>
                        `${i ? "L" : "M"}${(20 + (((p.start + p.end) / 2 - x0) / (x1 - x0)) * 520).toFixed(1)},${(20 + (1 - p.alignment) * 180).toFixed(1)}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke="#4ade80"
                  strokeWidth="2.5"
                  strokeDasharray="700"
                  strokeDashoffset="700"
                  style={{ animation: "draw 1.6s .3s ease-out forwards" }}
                />
                <circle cx="575" cy="28" r="9" fill="none" stroke="white" strokeWidth="1.5" />
                <circle cx="575" cy="28" r="3.5" fill="white" />
                <text x="575" y="54" textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="11">
                  the role
                </text>
              </svg>
            </Reveal>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ human control */}
      <section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <h3 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Consequential actions stay under human control.
            </h3>
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              {
                icon: SlidersHorizontal,
                t: "Feedback you can review",
                d: "“Too enterprise” becomes three allowlisted preference changes you can see, edit, apply — and revert.",
              },
              {
                icon: ShieldCheck,
                t: "Consent before intros",
                d: "Draft → candidate consent → recruiter approval → sent. Invalid transitions are rejected by a state machine.",
              },
              {
                icon: Lock,
                t: "Fair by construction",
                d: "Protected traits can't be requirements, preferences or features. “Prioritize younger engineers” is refused.",
              },
            ].map((c, i) => (
              <Reveal key={c.t} delay={i * 0.05}>
                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                  <c.icon className="size-5 text-[#8b8cf6]" />
                  <div className="mt-4 font-medium">{c.t}</div>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-white/55">{c.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ engineering */}
      <section id="engineering" className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <div className="text-[12px] font-medium uppercase tracking-[0.14em] text-[#8b8cf6]">
              Measured, not demo-only
            </div>
            <h3 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Numbers computed from labels — including a public benchmark we didn't write.
            </h3>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                k: "NDCG@10, fit model",
                v: d.stats.extNdcg.toFixed(3),
                s: `vs ${d.stats.extTfidf.toFixed(3)} TF-IDF · ${d.stats.extPairs.toLocaleString()} held-out public pairs`,
              },
              {
                k: "NDCG@10, full pipeline",
                v: d.stats.evalNdcg?.toFixed(3) ?? "—",
                s: "synthetic labeled set (condensed lists)",
              },
              {
                k: "Constraint violations",
                v: "0%",
                s: `vs ${((d.stats.evalViolationsBaseline ?? 0) * 100).toFixed(0)}% for a BM25-only ranking`,
              },
              { k: "LLM API cost", v: "$0", s: "models trained from scratch, run locally" },
            ].map((x, i) => (
              <Reveal key={x.k} delay={i * 0.04}>
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                  <div className="text-[12px] text-white/45">{x.k}</div>
                  <div className="tabular mt-2 text-3xl font-semibold tracking-tight">{x.v}</div>
                  <div className="mt-1 text-[12px] text-white/45">{x.s}</div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal delay={0.1}>
            <div className="mt-10 grid gap-x-10 gap-y-2 text-[13px] text-white/55 md:grid-cols-2">
              {[
                ["TypeScript monorepo", "Next.js 16 App Router · pnpm + Turborepo · strict TS"],
                [
                  "Ranking engine",
                  "Pure TS package: constraints, 11 features, explanations, counterfactuals",
                ],
                ["Search", "BM25F + LSA vectors + Typesense-style rank fusion, facets, drift reconciliation"],
                [
                  "ML from scratch",
                  "numpy TF-IDF + randomized SVD + MLP with hand-written backprop; TS↔Python parity tests",
                ],
                ["Durable jobs", "Idempotency keys, bounded retries, transient/permanent errors, traces"],
                ["Agents, bounded", "Typed capabilities with deterministic policies — no uncontrolled loops"],
                ["MCP server", "Read tools + approval-gated write tools over the same service layer"],
                [
                  "Honest adapters",
                  "Local stand-ins for Supabase/Typesense/Trigger.dev/Langfuse, labeled as such",
                ],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3 border-t border-white/[0.06] py-3">
                  <span className="w-40 shrink-0 text-white/80">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------------ CTA */}
      <section className="border-t border-white/[0.06] py-24">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <Reveal>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Built around the hard parts:{" "}
              <span className="font-serif font-normal italic text-white/60">
                retrieval, ranking, explainability, uncertainty, feedback and human control.
              </span>
            </h2>
            <div className="mt-8 flex justify-center gap-3">
              <Link
                href="/login"
                className="flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-[14px] font-medium text-[#08090b] hover:bg-white/90"
              >
                Explore the live demo <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/product"
                className="flex h-11 items-center rounded-xl border border-white/15 px-5 text-[14px] text-white/80 hover:border-white/30"
              >
                How it works
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}

function HeroArcs() {
  const paths = [
    "M-40 420 C 200 400, 420 300, 760 120",
    "M-40 470 C 260 440, 520 340, 760 120",
    "M-40 360 C 160 360, 380 260, 760 120",
    "M-40 520 C 300 500, 600 380, 760 120",
  ];
  return (
    <svg
      className="pointer-events-none absolute right-[-10%] top-10 hidden h-[560px] w-[900px] opacity-60 lg:block"
      viewBox="0 0 800 560"
      aria-hidden
    >
      <defs>
        <linearGradient id="arc" x1="0" x2="1">
          <stop offset="0" stopColor="#8b8cf6" stopOpacity="0" />
          <stop offset="1" stopColor="#8b8cf6" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="url(#arc)"
          strokeWidth="1.2"
          strokeDasharray="1100"
          strokeDashoffset="1100"
          style={{ animation: `draw 2.4s ${0.2 + i * 0.25}s cubic-bezier(.2,.8,.2,1) forwards` }}
        />
      ))}
      <circle cx="760" cy="120" r="5" fill="#fff" />
      <circle cx="760" cy="120" r="14" fill="none" stroke="rgba(255,255,255,0.25)" />
    </svg>
  );
}

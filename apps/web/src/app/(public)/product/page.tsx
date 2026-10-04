import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  DEFAULT_RANKING,
  DEFAULT_WEIGHTS,
  FEATURE_LABELS,
  PIPELINE_LIMITS,
  type FeatureKey,
} from "@trajectory/engine";
import { MarketingFooter, MarketingNav } from "@/components/marketing/chrome";
import { Reveal } from "@/components/marketing/reveal";

export const metadata = { title: "How it works" };

const STAGES = [
  [
    "1 · Role intelligence",
    "Paste a brief. A deterministic parser extracts title, location mode, compensation, visa policy, years, stage and team size — each with a confidence and the source snippet — and buckets requirements into must / strong / nice / hard constraints / needs clarification. Protected traits are refused; instruction-like text is ignored. A human approves before a role goes live.",
  ],
  [
    "2 · Profile intelligence & the evidence graph",
    "Resumes (pasted or PDF) are parsed into experiences, projects and skills. Every bullet becomes an evidence node with exact character offsets. Claims link to the nodes that support or contradict them; a skill listed only in a “Skills” section stays unsupported. Conflicting dates or titles are surfaced, never silently resolved.",
  ],
  [
    "3 · Hybrid retrieval",
    `A versioned candidates_v1 index (BM25F over weighted fields + 96-dim LSA vectors) returns the top ${PIPELINE_LIMITS.retrieveTopN} with Typesense-style rank fusion. Postgres-equivalent storage stays the source of truth; content hashes detect index drift and a reconciliation job repairs it.`,
  ],
  [
    "4 · Hard constraints",
    "Location (incl. relocation), work authorization vs. sponsorship policy, explicit compensation incompatibility and must-have certifications evaluate to PASS / FAIL / UNKNOWN. Unknown never silently becomes fail — it becomes a question.",
  ],
  [
    "5 · Deterministic features",
    "Eleven features, each returning a raw value, normalized value, contribution, evidence IDs and an explanation. Weights are versioned configuration; contributions sum exactly to the deterministic score (unit-tested).",
  ],
  [
    "6 · Semantic relevance & the fit model",
    `LSA cosine between the role and the candidate's best passages, plus a 2-layer MLP fit model trained from scratch on 6k public resume/JD pairs. It reranks only the top ${PIPELINE_LIMITS.rerankTopN}, can't introduce new candidates, and its reasons cite evidence IDs.`,
  ],
  [
    "7 · Explanations, why-not-100, counterfactuals",
    "Templates turn computed numbers into language — they cannot change a score. “Why not 100?” is an exact decomposition of the gap. “What would change the score?” re-scores the candidate with each unknown resolved.",
  ],
  [
    "8 · Feedback learning",
    "Free-text feedback maps onto an allowlist of preference features (bounded ±0.3). You review and edit the deltas, apply, watch the before/after, and can revert from the role page. Every change is audited.",
  ],
  [
    "9 · Qualification & intros",
    "The qualification agent asks the fewest, highest-impact questions in a signed candidate portal. Answers become evidence (source = conversation) and re-rank the role. Intros require candidate consent and recruiter approval.",
  ],
];

export default function ProductPage() {
  const blend = DEFAULT_RANKING.blend;
  return (
    <div className="dark min-h-dvh bg-[#08090b] text-white [color-scheme:dark]">
      <MarketingNav />
      <section className="mx-auto max-w-4xl px-5 pb-12 pt-20">
        <Reveal>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            How Trajectory ranks —{" "}
            <span className="font-serif font-normal italic text-white/60">layer by inspectable layer.</span>
          </h1>
          <p className="mt-4 text-lg text-white/55">
            No single opaque score. Each layer is versioned, testable and visible in the product.
          </p>
        </Reveal>
      </section>
      <section className="mx-auto max-w-4xl px-5 pb-16">
        <ol className="space-y-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
          {STAGES.map(([t, d], i) => (
            <li key={t} className="bg-[#0b0c0f] p-6">
              <Reveal delay={i * 0.02}>
                <h2 className="font-medium">{t}</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-white/55">{d}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>
      <section className="mx-auto grid max-w-4xl gap-6 px-5 pb-24 md:grid-cols-2">
        <Reveal>
          <div className="rounded-2xl border border-white/10 p-6">
            <h2 className="font-medium">Feature weights (score-v1.3)</h2>
            <ul className="mt-4 space-y-2 text-[13px]">
              {(Object.entries(DEFAULT_WEIGHTS) as [FeatureKey, number][]).map(([k, w]) => (
                <li key={k} className="grid grid-cols-[1fr_120px_36px] items-center gap-3">
                  <span className="text-white/70">{FEATURE_LABELS[k]}</span>
                  <span className="h-1.5 rounded-full bg-white/10">
                    <span
                      className="block h-full rounded-full bg-[#8b8cf6]"
                      style={{ width: `${(w / 0.22) * 100}%` }}
                    />
                  </span>
                  <span className="tabular text-right text-white/50">{w.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={0.05}>
          <div className="h-full rounded-2xl border border-white/10 p-6">
            <h2 className="font-medium">Final blend</h2>
            <p className="mt-4 font-mono text-[13px] leading-relaxed text-white/70">
              final = {blend.deterministic} × deterministic
              <br />+ {blend.semantic} × semantic
              <br />+ {blend.rerank} × fit model
            </p>
            <p className="mt-4 text-[13px] leading-relaxed text-white/50">
              Then the hard-constraint policy is applied, and a separately calibrated confidence score
              (evidence recency, corroboration, explicit answers, conflicts, unknowns) is reported next to fit
              — never mixed into it. Weights are configuration; the eval suite decides changes.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex items-center gap-1.5 text-[13px] text-[#a5a6f8] hover:underline"
            >
              See it on real (synthetic) data <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Reveal>
      </section>
      <MarketingFooter />
    </div>
  );
}

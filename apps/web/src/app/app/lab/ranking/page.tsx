import {
  DEFAULT_RANKING,
  DEFAULT_WEIGHTS,
  EXPLAINER_VERSION,
  FEATURE_LABELS,
  INTERPRETER_VERSION,
  LSA_INFO,
  PARSER_VERSION,
  PIPELINE_LIMITS,
  PREFERENCE_FEATURES,
  PROFILE_PARSER_VERSION,
  RERANKER,
  RERANK_CALIBRATION,
  SCORE_VERSION,
  SKILL_FAMILIES,
  MAX_PREFERENCE_DELTA,
  type FeatureKey,
} from "@trajectory/engine";
import { requireActor } from "@/server/auth/session";
import { requireCap } from "@/server/services/core";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { MiniBar } from "@/components/domain/score";
import { LabNav } from "@/components/lab/lab-nav";

export const metadata = { title: "Lab · Ranking" };

export default async function RankingLab() {
  const actor = await requireActor();
  requireCap(actor, "lab.view");
  const versions = [
    ["Scoring", SCORE_VERSION],
    ["Explanation generator", EXPLAINER_VERSION],
    ["Role parser", PARSER_VERSION],
    ["Profile parser", PROFILE_PARSER_VERSION],
    ["Feedback interpreter", INTERPRETER_VERSION],
    ["Embeddings", LSA_INFO.version],
    ["Fit reranker", RERANKER.version],
  ];
  return (
    <>
      <PageHeader title="Lab" description="Internal surfaces for operators. Admin-gated." />
      <LabNav active="ranking" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Layer B — deterministic feature weights"
            description="Spec §16.3 baseline. Non-applicable features are dropped and the rest renormalized per role."
          />
          <ul className="space-y-2 p-4">
            {(Object.entries(DEFAULT_WEIGHTS) as [FeatureKey, number][]).map(([k, w]) => (
              <li key={k} className="grid grid-cols-[180px_1fr_48px] items-center gap-3 text-[13px]">
                <span className="text-ink-2">{FEATURE_LABELS[k]}</span>
                <MiniBar value={w / 0.22} tone="accent" />
                <span className="tabular text-right text-muted">{w.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="border-t border-line px-4 py-3 font-mono text-[12px] text-ink-2">
            final = {DEFAULT_RANKING.blend.deterministic}·deterministic + {DEFAULT_RANKING.blend.semantic}
            ·semantic + {DEFAULT_RANKING.blend.rerank}·fit_model
            <div className="mt-1 text-[11px] text-muted">
              retrieve top {PIPELINE_LIMITS.retrieveTopN} → rerank top {PIPELINE_LIMITS.rerankTopN} → explain
              top {PIPELINE_LIMITS.explainTopN} · hard-constraint FAIL ⇒ filtered (score × 0.5 shown for
              transparency)
            </div>
          </div>
        </Panel>
        <Panel>
          <PanelHeader
            title="Versions"
            description="Recorded on every match, explanation, trace and eval run."
          />
          <ul className="divide-y divide-line text-[13px]">
            {versions.map(([k, v]) => (
              <li key={k} className="flex justify-between px-4 py-2">
                <span className="text-ink-2">{k}</span>
                <span className="font-mono text-muted">{v}</span>
              </li>
            ))}
          </ul>
          <PanelHeader
            title="Skill families"
            description="Alternatives satisfy one requirement together."
            className="border-t"
          />
          <ul className="space-y-1 p-4 text-xs text-ink-2">
            {SKILL_FAMILIES.map((f) => (
              <li key={f.key}>
                <b>{f.label}</b>: {f.members.join(" · ")}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader
            title="Recruiter preference allowlist"
            description={`Feedback can only adjust these keys, each bounded to ±${MAX_PREFERENCE_DELTA}. No protected traits exist in the feature space.`}
          />
          <ul className="divide-y divide-line text-[13px]">
            {PREFERENCE_FEATURES.map((p) => (
              <li key={p.key} className="px-4 py-2">
                <div className="font-medium text-ink">{p.label}</div>
                <div className="font-mono text-[11px] text-muted">{p.key}</div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader
            title="Model card — built from scratch, no AI APIs"
            description="Trained by ml/train.py with numpy only; inference reimplemented in TypeScript and parity-tested against Python."
          />
          <div className="space-y-4 p-4 text-[13px]">
            <div>
              <div className="mb-1 flex items-center gap-2 font-medium text-ink">
                Embeddings <Badge tone="neutral">{LSA_INFO.version}</Badge>
              </div>
              <p className="text-xs leading-relaxed text-muted">
                TF-IDF (uni+bigrams, sublinear tf, smoothed idf, {LSA_INFO.vocabSize.toLocaleString()}-term
                vocabulary) → randomized truncated SVD (Halko–Martinsson–Tropp, 4 power iterations) to{" "}
                {LSA_INFO.dims} dimensions over {LSA_INFO.trainedOn.chunks.toLocaleString()} passages from{" "}
                {LSA_INFO.trainedOn.documents.toLocaleString()} resumes/JDs. Int8-quantized per row. Used for
                semantic relevance, trajectory alignment and evidence grounding.
              </p>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-2 font-medium text-ink">
                Fit reranker <Badge tone="neutral">{RERANKER.version}</Badge>
              </div>
              <p className="text-xs leading-relaxed text-muted">
                MLP ({RERANKER.scalarFeatures.length} pairwise features + {RERANKER.interactionDims} embedding
                interactions → {RERANKER.hidden} ReLU → 3-way softmax). Hand-written backprop, Adam,
                class-balanced cross-entropy, dropout, early stopping on a validation split grouped by job
                description. Output calibrated with a logistic map (center {RERANK_CALIBRATION.center}, T{" "}
                {RERANK_CALIBRATION.temperature}). Bounded to the top {PIPELINE_LIMITS.rerankTopN}; explained
                by feature occlusion.
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {RERANKER.scalarFeatures.map((f) => (
                  <Badge key={f} tone="outline" className="font-mono">
                    {f}
                  </Badge>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted">Test results and training curve are on the Evals page.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}

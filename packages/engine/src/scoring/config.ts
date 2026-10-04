import type { FeatureKey, RankingConfig } from "../types";

export const SCORE_VERSION = "score-v1.3";
export const EXPLAINER_VERSION = "explain-template-v2";
export const PARSER_VERSION = "role-parser-v1.1";
export const PROFILE_PARSER_VERSION = "profile-parser-v1.0";
export const INTERPRETER_VERSION = "feedback-interpreter-v1.2";

/** Baseline feature weights from the build spec (§16.3). Per-role overrides are versioned on the role. */
export const DEFAULT_WEIGHTS: Record<FeatureKey, number> = {
  technical_skill_fit: 0.22,
  relevant_experience_fit: 0.14,
  startup_stage_fit: 0.1,
  ownership_signal: 0.1,
  ai_product_signal: 0.08,
  career_trajectory_fit: 0.1,
  candidate_preference_fit: 0.09,
  location_fit: 0.05,
  compensation_fit: 0.04,
  availability_fit: 0.03,
  evidence_confidence: 0.05,
};

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  technical_skill_fit: "Technical skill fit",
  relevant_experience_fit: "Relevant experience",
  startup_stage_fit: "Startup-stage fit",
  ownership_signal: "Ownership signal",
  ai_product_signal: "AI product signal",
  career_trajectory_fit: "Career trajectory",
  candidate_preference_fit: "Candidate preference fit",
  location_fit: "Location fit",
  compensation_fit: "Compensation fit",
  availability_fit: "Availability",
  evidence_confidence: "Evidence quality",
};

export const IMPORTANCE_WEIGHT = { MUST: 1, STRONG: 0.6, NICE: 0.3 } as const;

/** Final blend (§16.6). Weights are configuration; evals decide changes. */
export const DEFAULT_RANKING: RankingConfig = {
  label: "Full pipeline (deterministic + semantic + learned reranker)",
  useKeyword: true,
  useDeterministic: true,
  useSemantic: true,
  useReranker: true,
  blend: { deterministic: 0.65, semantic: 0.2, rerank: 0.15 },
};

export const PIPELINE_LIMITS = {
  retrieveTopN: 80,
  rerankTopN: 25,
  explainTopN: 25,
};

/** Fixed "as of" date keeps seeded demo scores reproducible across days. */
export const DEMO_AS_OF = new Date("2026-10-01T12:00:00Z");

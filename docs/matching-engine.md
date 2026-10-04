# Matching engine (`packages/engine`)

## Layers

| Layer                      | Module                   | Notes                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A · Hard constraints       | `scoring/constraints.ts` | location (metro, relocation, accepted work modes), work authorization vs sponsorship policy, explicit compensation incompatibility (> 1.15 × max), recruiter-flagged must-haves. `PASS / FAIL / UNKNOWN`; unknown compensation is a _soft_ check. FAIL ⇒ filtered (shown separately with the reason). |
| B · Deterministic features | `scoring/features.ts`    | 11 features (below), each returning raw value, normalized value, weight, contribution, status (`known / partial / unknown`), evidence IDs, explanation and what's missing. Non-applicable features (e.g. AI signal for a non-AI role) are dropped and weights renormalized.                           |
| Preferences                | `preferences.ts`         | 15 allowlisted keys (e.g. `independent_product_ownership`, `enterprise_only_background`). Positive deltas join the weighted average (renormalized by 1 + Σδ⁺); negative deltas subtract δ·v. Each delta is bounded to ±0.3. Unknown keys are ignored.                                                 |
| C · Semantic               | `ml/lsa.ts`              | 0.5 × document cosine + 0.5 × best-passage cosine, calibrated linearly.                                                                                                                                                                                                                               |
| D · Learned rerank         | `ml/reranker.ts`         | MLP fit model on the top 25 only; calibrated with a logistic map; reasons from feature occlusion, each citing evidence IDs.                                                                                                                                                                           |
| Blend                      | `scoring/score.ts`       | `final = 0.65·det + 0.20·sem + 0.15·fit` (renormalized when a layer is absent).                                                                                                                                                                                                                       |

### Baseline weights (score-v1.3)

technical skill 0.22 · relevant experience 0.14 · startup stage 0.10 · ownership 0.10 · AI product signal 0.08 · career trajectory 0.10 · candidate preference fit 0.09 · location 0.05 · compensation 0.04 · availability 0.03 · evidence quality 0.05.

### Feature notes

- **Technical skill fit** — requirement weights MUST 1.0 / STRONG 0.6 / NICE 0.3. Alternatives are grouped into families (search, durable workflows, cloud, ORM) and satisfied by the best member. Support levels: supported (≥2 independent nodes) 1.0, partial 0.8, conflicted 0.55, self-listed/inferred 0.45, adjacent skill 0.5, missing 0, explicit "no" answer 0 (negative); recency multiplier by last use.
- **Relevant experience** — years vs range (soft penalty below min, overqualification decay above max) blended with recency-weighted semantic relevance of each role.
- **Career trajectory** — every job embedded and compared to the role; _recent_ (ended within 2.5 years) vs _earlier_ alignment gives momentum and a heading (toward / steady / away). Side projects are plotted but not averaged.
- **Evidence quality** — mean support × confidence of claims relevant to the role, minus conflicts.

## Confidence (separate from fit)

Starts at 0.42; rises with profile completeness, recent evidence, multi-source skill support, explicit answers and verification; falls for unknown hard constraints, unknown features, conflicted claims and ambiguous role requirements.

## Why not 100?

`whyNotHundred()` decomposes `100 − final` exactly: each feature loses `share_det × (w/scale) × (1 − x) × 100`, positive preferences `share_det × δ/scale × (1 − v)`, negative preferences `share_det × |δ| × v`, plus semantic, fit-model and constraint-penalty items. A unit test asserts the items sum to the gap. Items are labeled _missing evidence_, _negative evidence_, _constraint unknown_, _model judgement_ or _semantic_.

## Counterfactuals

For each open uncertainty, `applyAnswer()` resolves it favourably on a copy of the candidate (the same function that applies real answers), the scorer re-runs, and the component/confidence/final deltas are reported. Expected impact ranks qualification questions.

## Explanations

`generateExplanation()` is template-based: it can only phrase numbers already computed and cite evidence IDs from the candidate's own graph. `validateCitations()` checks this in the eval suite.

## Search (`search/`)

`buildSearchDocument()` (pure) → `candidates_v1` documents. `LocalHybridIndex` implements BM25F over weighted fields (skills ×3, title ×2.2, headline ×2, …) with bigrams and prefix expansion, exact filters and facets, cosine vector search, and Typesense-style rank fusion `(1−α)/(1+kwRank) + α/(1+vecRank)` with α = 0.3. `parseNaturalQuery()` turns “TypeScript engineers in SF open to seed stage, 5+ years” into filter chips + residual keywords.

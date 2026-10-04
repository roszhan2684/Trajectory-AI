# ADR-0004 — Fixed monotone calibration for semantic and fit-model scores

**Status:** accepted

**Context.** Raw LSA cosines cluster around 0.2–0.75 and the fit model's expected relevance around 0.3–0.75, so blending them unscaled with the 0–1 deterministic score compressed final scores and made the semantic layer saturate.

**Decision.** `calibrateSemantic(raw) = clamp((raw − 0.12) / 0.62)` and `calibrateRerank(raw) = σ((raw − 0.48) / 0.09)`. Both are monotone (they never reorder a layer's own ranking), fixed in code, documented, and raw values stay visible (the fit model's probabilities are shown in the score breakdown).

**Consequences.** Layers span comparable ranges; blend weights mean what they say. Any change is a scoring-version bump evaluated with `pnpm eval`.

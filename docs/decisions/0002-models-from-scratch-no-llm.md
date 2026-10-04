# ADR-0002 — Train models from scratch; no LLM APIs

**Status:** accepted · **Deviation from spec:** yes (spec uses LLMs via the Vercel AI SDK for parsing, reranking and explanations)

**Context.** The build brief required that any ML be built from scratch on public datasets rather than calling AI APIs.

**Decision.** Replace each LLM role with a deterministic or learned component: deterministic role/profile/feedback parsers (taxonomy + cue lexicons, with confidences and sources); LSA embeddings (TF-IDF + randomized SVD) and a 2-layer MLP fit model trained with numpy on `cnamuangtoun/resume-job-description-fit`; template explanations over computed numbers. Inference is reimplemented in TypeScript and parity-tested against Python fixtures.

**Consequences.** $0 inference cost, fully deterministic, explainable by construction. Lower language understanding than an LLM on unusual briefs/resumes (documented limitation). The architecture keeps a clean seam for adding an LLM later under the same safety boundaries (`docs/ai-safety.md`).

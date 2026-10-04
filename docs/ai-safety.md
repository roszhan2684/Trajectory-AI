# AI safety boundaries

This build uses **no LLM APIs**. The boundaries below still matter because the system makes model-assisted decisions (embeddings, a learned reranker, parsers) and is designed so an LLM layer could be added later without weakening them.

1. **Models never decide what matters.** Authorization, hard constraints, score arithmetic, workflow state and whether a consequential action happens are deterministic code.
2. **Bounded learned components.** The fit model reranks only the top 25 retrieved candidates, is blended at 15%, can't add candidates, and its reasons must cite evidence IDs from the candidate's graph.
3. **Explanations can't change scores.** The explanation generator receives computed numbers and evidence IDs and only phrases them. "Why not 100?" and counterfactuals are arithmetic and re-scoring, not prose.
4. **Source text is data.** Resume and brief text is parsed without tools; injection patterns are flagged; nothing in a source document can trigger a side effect.
5. **Feedback is a proposal.** Free text maps only onto an allowlist of 15 preference features with bounded deltas; protected characteristics are refused; humans confirm, and every change is reversible.
6. **Human approval for outreach.** Intros require candidate consent and recruiter approval; there is no automatic send.
7. **Measured.** Ranking changes are evaluated (NDCG/P@K/MRR/constraint violations/citation validity) before they ship.

If an LLM is introduced (e.g. via the Vercel AI SDK for richer parsing): structured outputs validated with Zod, prompts versioned, evidence IDs validated against the graph, no tools during extraction, timeouts/retries with a deterministic fallback, and Langfuse traces without PII.

# Build ledger

Phase-by-phase record of what the build spec asked for, what shipped, and where it deviates. "Local adapter" means a working in-repo implementation behind the interface a hosted service would fill ([ADR-0001](decisions/0001-local-adapters-demo-backend.md)).

| Phase  | Spec scope                      | Status       | Notes / deviations                                                                                                                                                                             |
| ------ | ------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0      | Repo, tooling, CI               | ✅           | pnpm + Turborepo, strict TS, ESLint, Prettier, Vitest, Playwright, GitHub Actions (incl. eval gate). Three workspaces instead of nine packages ([ADR-0003](decisions/0003-monorepo-shape.md)). |
| 1      | Data model & tenancy            | ✅ local     | Schema mirrors the spec's Prisma models; JSON-persisted repository store; tenant isolation in services (404 on cross-tenant).                                                                  |
| 2      | Auth, orgs, RBAC                | ✅ local     | Signed-cookie demo identity with persona picker, invites, members, capability matrix. Supabase Auth not wired.                                                                                 |
| 3      | Role intake & parsing           | ✅           | Deterministic brief parser: requirements by level, constraints, ambiguities, injection flags; editable review; versioned roles.                                                                |
| 4      | Candidate ingestion             | ✅           | PDF (unpdf) / text / synthetic GitHub adapter → evidence graph with sources and confidences; ingestion as a durable job.                                                                       |
| 5      | Search & retrieval              | ✅ local     | `LocalHybridIndex`: BM25F + LSA vectors + rank fusion (α 0.3), facets, drift reconciliation. Typesense not wired.                                                                              |
| 6      | Deterministic scoring           | ✅           | Hard constraints (PASS/FAIL/UNKNOWN), 11 features, skill families, trajectory, separate confidence; exact "Why not 100?".                                                                      |
| 7      | Semantic + reranking            | ✅ deviation | LSA + fit MLP trained from scratch replace LLM embeddings/reranker ([ADR-0002](decisions/0002-models-from-scratch-no-llm.md), [ADR-0004](decisions/0004-score-calibration.md)).                |
| 8      | Explanations & evidence UI      | ✅           | Evidence graph, highlighted source spans, breakdown, counterfactuals, trajectory arc. Template explanations (no LLM).                                                                          |
| 9      | Feedback → refinement           | ✅           | Free text → bounded allowlisted deltas → reviewable proposal → apply/revert with before/after diff.                                                                                            |
| 10     | Candidate conversations         | ✅           | Signed portal links; clarifying questions; answers re-score via `applyAnswer`.                                                                                                                 |
| 11     | Intros & consent                | ✅           | Full state machine; consent + approval required; "sent" is an internal record (no email provider).                                                                                             |
| 12     | Durable workflows               | ✅ local     | In-process job runner with idempotency, retries/backoff, error classes, failure injection, live progress. Trigger.dev not wired.                                                               |
| 13     | Observability & analytics       | ✅ local     | Langfuse-shaped traces (Lab → Traces), PII-guarded analytics sink, audit log.                                                                                                                  |
| 14     | Evaluation                      | ✅           | 429 labeled pairs, ablations, constraint-violation and citation checks, CI gate `--min-ndcg 0.80` ([ADR-0005](decisions/0005-condensed-list-evaluation.md)).                                   |
| 15     | MCP server                      | ✅           | 11 tools over stdio; bearer API keys; writes are drafts or need `confirm=true`. OAuth 2.1 documented for hosted.                                                                               |
| 16     | Portfolio delivery              | ✅           | Marketing site, launch film (Hyperframes + Kokoro voice), screenshots, docs, ADRs.                                                                                                             |
| Audits | Security, AI safety, a11y, perf | ✅           | [`security.md`](security.md), [`ai-safety.md`](ai-safety.md); keyboard/ARIA on core flows; Playwright critical paths.                                                                          |

## Verification at hand-off

- Engine 39 tests, web services 10, MCP 5, Playwright E2E 10 — passing.
- `pnpm eval`: full pipeline NDCG@10 0.870, MRR 0.972, 0 constraint violations (BM25-only baseline 0.730 with 35.6% violations).
- External held-out benchmark for the fit model: NDCG@10 0.802 vs 0.724 for LSA cosine ([`ml/README.md`](../ml/README.md)).
- `next build`, `tsc`, ESLint clean.

## Known limitations

- Single-instance only (in-memory store + rate limits); not production infrastructure by design.
- Deterministic parsers miss phrasing outside their lexicons; low-confidence parses surface as clarifications rather than guesses.
- Eval labels come from a rule-based oracle over synthetic data; real recruiter judgments would be needed before trusting absolute numbers.

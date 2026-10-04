# ADR-0003 — Three workspaces instead of nine packages

**Status:** accepted · **Deviation from spec:** partial (spec lists `db, domain, search, ai, agents, workflows, evals, observability, ui`)

**Decision.** `packages/engine` holds everything that is pure (domain, scoring, search, NLP "agents", evals, policy, ML inference); `apps/web/src/server` holds everything stateful (store, services, jobs, tracing); `apps/mcp` is a thin client. The nine-package split adds boundaries without adding independent consumers at this size; the engine's folders (`scoring/`, `search/`, `nlp/`, `evals/`, `policy/`, `ml/`) map 1:1 onto the spec's packages and can be split out when a second consumer appears.

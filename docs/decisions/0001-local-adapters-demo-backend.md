# ADR-0001 — Local adapters instead of hosted services (demo backend)

**Status:** accepted · **Deviation from spec:** yes (Supabase/Postgres/Prisma, Typesense, Trigger.dev, Langfuse, PostHog, Sentry)

**Context.** The brief for this build asked for "a basic backend just to perform demo data operations, not an actual backend", while keeping the product fully functional and honest (spec principle 7: no fake production integrations).

**Decision.** Implement every integration point as a working local adapter behind the interface a hosted adapter would implement: a repository store persisted to JSON (schema mirrors the spec's Prisma models), a signed-cookie demo identity, `LocalHybridIndex` (BM25F + vectors + rank fusion), an in-process durable job runner, a Langfuse-shaped trace store and a PII-guarded analytics sink. The Integrations page reports each as "local adapter" and flags detected credentials as "adapter not in this build" rather than "connected".

**Consequences.** Zero setup and deterministic demos; real behavior (search, jobs, traces) instead of mocks. Not multi-instance safe; no SQL migrations. Swapping in hosted services means implementing the same service/repository signatures (see `docs/architecture.md`).

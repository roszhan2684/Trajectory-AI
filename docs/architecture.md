# Architecture

## Shape

```
apps/web            Next.js 16 (App Router, Turbopack) — UI, server actions, /api/v1, services
  src/server/
    db/             schema.ts (tables mirror the spec's Prisma models) · store.ts (singleton + persistence)
    services/       core (actor, tenant guard, audit, analytics, tracer) · roles · candidates · search
                    matches · refinements · conversations · intros · evals · org · jobs · lab
    seed/           deterministic generator (archetypes, flagship candidates, roles, oracle labels)
    auth/           HMAC tokens (session + candidate portal), session helpers
    http.ts         envelopes, error mapping, rate limiting, API-key auth
    integrations.ts honest adapter status
apps/mcp            MCP server (stdio) → /api/v1 with a per-user API key
packages/engine     pure TypeScript domain + ML inference (no framework, no I/O)
ml/                 download.py + train.py (numpy) → packages/engine/src/ml/models/*.json
brag-output/        the HyperFrames launch-film project (plan, brief, composition, render)
```

## Request flow

1. A page (server component) calls `requireActor()` → signed cookie → `actorFor(user, org)` (membership + capabilities).
2. It calls a service function with that actor. Services are the only place that touches the store and the only place that enforces RBAC (`requireCap`) and tenancy (`assertTenant`, which returns NOT_FOUND for other tenants' IDs).
3. Mutations come in through server actions (`app/actions/*`) or `/api/v1` — both thin wrappers that validate with Zod, rate-limit expensive calls and delegate to services. The MCP server uses the REST API with a bearer key mapped to a user + organization.
4. Long work (ingestion, matching, re-ranking, qualification, evals, reconciliation) runs through `services/jobs.ts` and is polled by the UI (`/api/v1/jobs/:id`, or the token-scoped portal endpoint).

## Data ownership

| Concern                      | Source of truth                                               | Derived                                                        |
| ---------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Candidates, evidence, claims | store (`candidates`)                                          | search index (`LocalHybridIndex`), contexts cache (embeddings) |
| Index consistency            | `indexState` (content hash vs indexed hash)                   | reconcile job repairs drift                                    |
| Matches                      | `matches` (upserted by role × candidate)                      | explanations generated on demand beyond the top 25             |
| Recruiter preferences        | `rolePreferences` (linked to a refinement)                    | re-ranking job                                                 |
| Ops                          | `jobs`, `traces`, `audit`, `analytics` (bounded ring buffers) | Lab pages                                                      |

## Replacing the local adapters

| Spec system       | Interface in this repo                                                    | Swap-in                                                                                                  |
| ----------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Postgres + Prisma | service functions over `getDB()` tables (schema mirrors the spec)         | Prisma repositories with the same function signatures; transactions where services mutate several tables |
| Supabase Auth     | `auth/session.ts` (`signIn`, `requireActor`)                              | Supabase SSR client issuing the session; `actorFor` unchanged                                            |
| Typesense         | `SearchEngine` interface (`upsert/remove/search`) + `buildSearchDocument` | `TypesenseSearchEngine` mapping `SearchQuery` → `filter_by` + hybrid `vector_query`, `alpha`             |
| Trigger.dev       | `enqueue({ type, idempotencyKey, steps, task })`                          | each `task` becomes a Trigger task; `ctx.step` → `task.run` sub-steps; idempotency keys carry over       |
| Langfuse          | `Tracer` (trace/span/generation, metadata)                                | Langfuse SDK spans with the same names and metadata                                                      |
| PostHog / Sentry  | `track()` (PII-guarded) / `toError()`                                     | provider SDK calls inside the same wrappers                                                              |

## Determinism

The seed uses a fixed-seed PRNG and a fixed scoring clock (`DEMO_AS_OF`), so `pnpm seed:reset` reproduces identical data and scores. The engine has no clocks, randomness or I/O.

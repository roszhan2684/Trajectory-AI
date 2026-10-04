/**
 * Honest integration status. In demo mode every external system is replaced by a clearly named
 * local adapter; the UI reports exactly which one is active. No fake "connected" states.
 */
import { SEARCH_ADAPTER } from "./services/search";
import { storeStatus } from "./db/store";
import { MESSAGING_CONFIGURED } from "./services/intros";

export interface IntegrationState {
  key: string;
  name: string;
  purpose: string;
  state: "local_adapter";
  detail: string;
  env: string[];
  credentialsDetected: boolean;
}

export function integrationStatus(): IntegrationState[] {
  const store = storeStatus();
  const rows: Omit<IntegrationState, "credentialsDetected">[] = [
    {
      key: "database",
      name: "PostgreSQL (Supabase)",
      purpose: "Source of truth",
      state: "local_adapter",
      detail: `Demo store: in-memory document store persisted to ${store.persistence === "file" ? ".data/store.json" : "memory only (read-only filesystem)"}. Repositories are the only data access path.`,
      env: ["DATABASE_URL", "DIRECT_URL"],
    },
    {
      key: "auth",
      name: "Supabase Auth",
      purpose: "Identity",
      state: "local_adapter",
      detail:
        "Demo identity: signed, HTTP-only session cookie issued after persona selection. Authorization (RBAC + tenant checks) is fully enforced server-side.",
      env: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    },
    {
      key: "search",
      name: "Typesense",
      purpose: "Hybrid retrieval",
      state: "local_adapter",
      detail: `${SEARCH_ADAPTER.name} implementing the same SearchEngine interface: BM25F keyword, LSA vectors, Typesense-style rank fusion, facets. Schema ${SEARCH_ADAPTER.schema}.`,
      env: ["TYPESENSE_HOST", "TYPESENSE_ADMIN_API_KEY", "TYPESENSE_SEARCH_ONLY_API_KEY"],
    },
    {
      key: "workflows",
      name: "Trigger.dev",
      purpose: "Durable jobs",
      state: "local_adapter",
      detail:
        "In-process durable runner: idempotency keys, bounded retries with backoff, transient/permanent errors, step logs, trace correlation.",
      env: ["TRIGGER_SECRET_KEY"],
    },
    {
      key: "models",
      name: "LLM providers (Vercel AI SDK)",
      purpose: "Extraction, reranking, explanations",
      state: "local_adapter",
      detail:
        "No LLM APIs are called. Models are trained from scratch (LSA embeddings + MLP fit reranker) and NLP is deterministic. Explanations are template-generated from computed scores.",
      env: ["AI_GATEWAY_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"],
    },
    {
      key: "observability",
      name: "Langfuse",
      purpose: "Tracing & evals",
      state: "local_adapter",
      detail:
        "Local trace store with Langfuse-shaped traces/spans/generations (hashed org IDs, no PII). Viewable under Lab → Traces.",
      env: ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"],
    },
    {
      key: "analytics",
      name: "PostHog",
      purpose: "Product analytics",
      state: "local_adapter",
      detail: "Local event sink with a PII guard (scalar properties only, free text dropped).",
      env: ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"],
    },
    {
      key: "errors",
      name: "Sentry",
      purpose: "Error monitoring",
      state: "local_adapter",
      detail: "Errors are mapped to user-safe messages; details go to server logs only.",
      env: ["SENTRY_DSN"],
    },
    {
      key: "messaging",
      name: "Email delivery",
      purpose: "Approved intros",
      state: "local_adapter",
      detail: MESSAGING_CONFIGURED
        ? "Credentials detected, but this build records approved intros internally only."
        : "Not configured: approved intros are recorded as “sent (demo)” internally. No outreach ever leaves the system.",
      env: ["RESEND_API_KEY"],
    },
  ];
  // This build ships local adapters only; detected credentials are reported, never faked as "connected".
  return rows.map((r) => ({ ...r, credentialsDetected: r.env.some((k) => Boolean(process.env[k])) }));
}

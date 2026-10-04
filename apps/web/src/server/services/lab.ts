/** Internal/dev surfaces: index reconciliation, job retries, failure injection (admin-gated). */
import { DomainError } from "@trajectory/engine";
import { getDB } from "../db/store";
import { audit, requireCap, type Actor } from "./core";
import { enqueue, getJob, retryKey, runner } from "./jobs";
import { reconcileIndex, rebuildIndex } from "./search";
import { generateMatches } from "./matches";

export async function runReconcileJob(actor: Actor | null, repair: boolean, maxAttempts = 3) {
  if (actor) requireCap(actor, "lab.view");
  const { job } = await enqueue({
    type: "reconcile-search-index",
    idempotencyKey: `reconcile:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
    organizationId: null,
    userId: actor?.user.id ?? null,
    payload: { repair },
    steps: ["Hash source-of-truth documents", "Compare with index", repair ? "Repair drift" : "Report drift"],
    maxAttempts,
    task: async (ctx) => {
      await ctx.step(
        "Hash source-of-truth documents",
        () => getDB().candidates.length,
        (n) => `${n} candidates hashed`,
      );
      const report = await ctx.step(
        "Compare with index",
        () => reconcileIndex(false),
        (r) => `${r.stale.length} stale · ${r.missing.length} missing · ${r.orphaned.length} orphaned`,
      );
      const fixed = await ctx.step(
        repair ? "Repair drift" : "Report drift",
        () => (repair ? reconcileIndex(true).repaired : 0),
        (n) => (repair ? `${n} documents re-indexed` : "report only"),
      );
      return {
        stale: report.stale.length,
        missing: report.missing.length,
        orphaned: report.orphaned.length,
        repaired: fixed,
      };
    },
  });
  if (actor) audit(actor, "search.reconcile_started", "job", job.id, { repair });
  return job;
}

export function rebuild(actor: Actor) {
  requireCap(actor, "lab.view");
  const n = rebuildIndex();
  audit(actor, "search.index_rebuilt", "index", "candidates_v1", { documents: n });
  return n;
}

export function setFailureInjection(actor: Actor, n: number) {
  requireCap(actor, "lab.view");
  runner.injectFailures = Math.max(0, Math.min(5, n));
  audit(actor, "lab.failure_injection", "runner", "jobs", { next: runner.injectFailures });
  return runner.injectFailures;
}

/** Retry a FAILED run. Only task types with a safe, idempotent re-entry point are retryable. */
export async function retryJob(actor: Actor, jobId: string) {
  requireCap(actor, "lab.view");
  const job = getJob(jobId);
  if (!job) throw new DomainError("NOT_FOUND", "Run not found.");
  if (job.status !== "FAILED") throw new DomainError("INVALID_STATE", "Only failed runs can be retried.");
  if (job.type === "reconcile-search-index") return runReconcileJob(actor, Boolean(job.payload.repair));
  if (job.type === "generate-role-matches")
    return (await generateMatches(actor, String(job.payload.roleId), "manual")).job;
  throw new DomainError(
    "INVALID_STATE",
    `${job.type} runs are not retryable from the console (${retryKey(job)}).`,
  );
}

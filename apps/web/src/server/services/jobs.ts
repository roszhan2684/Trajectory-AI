/**
 * Durable job runner — local implementation of the workflow interface Trigger.dev provides.
 * Idempotency keys dedupe replays, transient failures retry with bounded exponential backoff,
 * permanent failures stop immediately, and every run records step logs + a trace ID.
 * Core task logic lives in plain functions (testable without the runner).
 */
import type { JobRun, JobStep, JobType } from "@trajectory/engine";
import { getDB, nextId, persist } from "../db/store";
import { now } from "./core";

export class TransientError extends Error {
  readonly kind = "transient" as const;
}
export class PermanentError extends Error {
  readonly kind = "permanent" as const;
}

export interface StepContext {
  job: JobRun;
  step<T>(name: string, fn: () => T | Promise<T>, detail?: (r: T) => string): Promise<T>;
  setTrace(id: string): void;
}

type TaskFn = (ctx: StepContext) => Promise<Record<string, unknown>>;

interface RunnerState {
  inline: boolean;
  stepDelayMs: number;
  injectFailures: number; // next N attempts throw a transient error (demo of retries)
}

const g = globalThis as unknown as { __trajectoryRunner?: RunnerState };
export const runner: RunnerState = (g.__trajectoryRunner ??= {
  inline: false,
  stepDelayMs: Number(process.env.DEMO_STEP_DELAY_MS ?? 350),
  injectFailures: 0,
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface EnqueueOptions {
  type: JobType;
  idempotencyKey: string;
  organizationId: string | null;
  userId: string | null;
  payload: Record<string, unknown>;
  steps: string[];
  maxAttempts?: number;
  task: TaskFn;
}

/** Returns the existing run for a duplicate idempotency key instead of starting a new one. */
export async function enqueue(opts: EnqueueOptions): Promise<{ job: JobRun; deduplicated: boolean }> {
  const db = getDB();
  const existing = db.jobs.find((j) => j.idempotencyKey === opts.idempotencyKey && j.status !== "FAILED");
  if (existing) return { job: existing, deduplicated: true };
  const job: JobRun = {
    id: nextId(db, "run"),
    organizationId: opts.organizationId,
    type: opts.type,
    status: "QUEUED",
    idempotencyKey: opts.idempotencyKey,
    payload: opts.payload,
    attempts: 0,
    maxAttempts: opts.maxAttempts ?? 3,
    steps: opts.steps.map((name) => ({
      name,
      status: "pending",
      startedAt: null,
      endedAt: null,
      detail: null,
    })),
    error: null,
    result: null,
    traceId: null,
    createdByUserId: opts.userId,
    createdAt: now().toISOString(),
    startedAt: null,
    completedAt: null,
  };
  db.jobs.push(job);
  if (db.jobs.length > 500) db.jobs.splice(0, db.jobs.length - 500);
  persist();
  const run = execute(job, opts.task);
  if (runner.inline) await run;
  else void run;
  return { job, deduplicated: false };
}

async function execute(job: JobRun, task: TaskFn): Promise<void> {
  while (job.attempts < job.maxAttempts) {
    job.attempts++;
    job.status = "RUNNING";
    job.startedAt ??= now().toISOString();
    job.error = null;
    for (const s of job.steps)
      if (s.status !== "completed") Object.assign(s, { status: "pending", startedAt: null, endedAt: null });
    persist();
    try {
      const ctx: StepContext = {
        job,
        setTrace: (id) => (job.traceId = id),
        step: async (name, fn, detail) => {
          let s = job.steps.find((x) => x.name === name);
          if (!s) {
            s = { name, status: "pending", startedAt: null, endedAt: null, detail: null } satisfies JobStep;
            job.steps.push(s);
          }
          s.status = "running";
          s.startedAt = now().toISOString();
          persist();
          if (!runner.inline && runner.stepDelayMs > 0) await sleep(runner.stepDelayMs); // demo pacing so progress is visible
          if (runner.injectFailures > 0) {
            runner.injectFailures--;
            s.status = "failed";
            s.endedAt = now().toISOString();
            s.detail = "Injected transient failure (demo)";
            throw new TransientError("Injected transient failure (demo): upstream timed out");
          }
          const r = await fn();
          s.status = "completed";
          s.endedAt = now().toISOString();
          s.detail = detail ? detail(r) : s.detail;
          persist();
          return r;
        },
      };
      job.result = await task(ctx);
      job.status = "COMPLETED";
      job.completedAt = now().toISOString();
      for (const s of job.steps) if (s.status === "pending") s.status = "skipped";
      persist();
      return;
    } catch (e) {
      const kind = e instanceof PermanentError ? "permanent" : "transient";
      job.error = { kind, message: e instanceof Error ? e.message : String(e) };
      const running = job.steps.find((s) => s.status === "running");
      if (running) Object.assign(running, { status: "failed", endedAt: now().toISOString() });
      if (kind === "permanent" || job.attempts >= job.maxAttempts) {
        job.status = "FAILED";
        job.completedAt = now().toISOString();
        persist();
        return;
      }
      job.status = "RETRYING";
      persist();
      if (!runner.inline) await sleep(Math.min(4000, 400 * 2 ** (job.attempts - 1))); // bounded exponential backoff
    }
  }
}

export function getJob(id: string): JobRun | undefined {
  return getDB().jobs.find((j) => j.id === id);
}

/** Manual retry of a FAILED run: same task, new run, fresh idempotency suffix. */
export function retryKey(job: JobRun): string {
  return `${job.idempotencyKey}#retry${job.attempts}-${Date.now()}`;
}

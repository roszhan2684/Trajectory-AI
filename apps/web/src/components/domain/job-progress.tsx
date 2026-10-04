"use client";
import * as React from "react";
import { CheckCircle2, CircleDashed, Loader2, RotateCcw, XCircle, MinusCircle } from "lucide-react";
import type { JobRun } from "@trajectory/engine/client";
import { cn } from "@/lib/utils";

type JobLike = Pick<JobRun, "status" | "steps" | "error" | "result" | "attempts"> &
  Partial<Pick<JobRun, "id" | "type" | "traceId" | "maxAttempts">>;

/** Poll a job until it finishes. Works for app jobs (/api/v1) and portal jobs (token-scoped). */
export function useJob(jobId: string | null, endpoint?: string, onDone?: (job: JobLike) => void) {
  const [job, setJob] = React.useState<JobLike | null>(null);
  const doneRef = React.useRef(onDone);
  React.useEffect(() => {
    doneRef.current = onDone;
  });
  React.useEffect(() => {
    if (!jobId) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const r = await fetch(endpoint ?? `/api/v1/jobs/${jobId}`, { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (j.ok) {
          setJob(j.data);
          if (j.data.status === "COMPLETED" || j.data.status === "FAILED") {
            doneRef.current?.(j.data);
            return;
          }
        }
      } catch {
        /* retry */
      }
      timer = setTimeout(tick, 350);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [jobId, endpoint]);
  return job;
}

const ICON = {
  pending: <CircleDashed className="size-3.5 text-faint" />,
  running: <Loader2 className="size-3.5 animate-spin text-accent" />,
  completed: <CheckCircle2 className="size-3.5 text-good" />,
  failed: <XCircle className="size-3.5 text-bad" />,
  skipped: <MinusCircle className="size-3.5 text-faint" />,
};

export function JobSteps({
  job,
  className,
  title,
}: {
  job: JobLike | null;
  className?: string;
  title?: string;
}) {
  if (!job) return null;
  return (
    <div
      className={cn("rounded-lg border border-line bg-panel-2 p-3", className)}
      role="status"
      aria-live="polite"
    >
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-medium text-ink-2">{title ?? "Background job"}</span>
        <span
          className={cn(
            "flex items-center gap-1 font-medium",
            job.status === "FAILED" ? "text-bad" : job.status === "COMPLETED" ? "text-good" : "text-accent",
          )}
        >
          {job.status === "RETRYING" && <RotateCcw className="size-3" />}
          {job.status.toLowerCase()}
          {job.attempts > 1 && ` · attempt ${job.attempts}`}
        </span>
      </div>
      <ol className="space-y-1.5">
        {job.steps.map((s) => (
          <li key={s.name} className="flex items-start gap-2 text-xs">
            <span className="mt-px">{ICON[s.status]}</span>
            <span className="min-w-0">
              <span className={cn(s.status === "pending" ? "text-faint" : "text-ink-2")}>{s.name}</span>
              {s.detail && <span className="block text-[11px] text-muted">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      {job.error && (
        <p className="mt-2 rounded-md bg-bad-soft px-2 py-1 text-[11px] text-bad">
          {job.error.kind} error: {job.error.message}
        </p>
      )}
    </div>
  );
}

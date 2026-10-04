import Link from "next/link";
import { requireActor } from "@/server/auth/session";
import { requireCap } from "@/server/services/core";
import { getDB } from "@/server/db/store";
import { runner } from "@/server/services/jobs";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelHeader } from "@/components/ui/panel";
import { Badge } from "@/components/ui/badge";
import { JobSteps } from "@/components/domain/job-progress";
import { FailureInjection, RetryJob } from "@/components/lab/lab-controls";
import { LabNav } from "@/components/lab/lab-nav";
import { timeAgo } from "@/lib/utils";

export const metadata = { title: "Lab · Jobs" };

export default async function JobsPage() {
  const actor = await requireActor();
  requireCap(actor, "lab.view");
  const jobs = [...getDB().jobs]
    .filter((j) => !j.organizationId || j.organizationId === actor.org.id)
    .reverse()
    .slice(0, 40);
  const counts = {
    completed: jobs.filter((j) => j.status === "COMPLETED").length,
    failed: jobs.filter((j) => j.status === "FAILED").length,
    running: jobs.filter((j) => ["RUNNING", "RETRYING", "QUEUED"].includes(j.status)).length,
  };
  return (
    <>
      <PageHeader title="Lab" description="Internal surfaces for operators. Admin-gated." />
      <LabNav active="jobs" />
      <Panel className="mb-6">
        <PanelHeader
          title="Durable jobs"
          description={`Local runner (Trigger.dev-equivalent semantics): idempotency keys, bounded exponential backoff, transient vs permanent errors. ${counts.completed} completed · ${counts.failed} failed · ${counts.running} active.`}
          actions={<FailureInjection pending={runner.injectFailures} />}
        />
        <ul className="divide-y divide-line">
          {jobs.map((j) => (
            <li key={j.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[1fr_360px]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] font-medium text-ink">{j.type}</span>
                  <Badge tone={j.status === "COMPLETED" ? "good" : j.status === "FAILED" ? "bad" : "info"}>
                    {j.status.toLowerCase()}
                  </Badge>
                  <span className="text-[11px] text-faint">
                    {j.id} · attempts {j.attempts}/{j.maxAttempts} · {timeAgo(j.createdAt)}
                  </span>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-muted">
                  idempotency: {j.idempotencyKey}
                </div>
                {j.result && (
                  <div className="mt-1 truncate font-mono text-[11px] text-muted">
                    result: {JSON.stringify(j.result)}
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  {j.traceId && (
                    <Link
                      href={`/app/lab/traces?id=${j.traceId}`}
                      className="text-xs text-accent hover:underline"
                    >
                      View trace →
                    </Link>
                  )}
                  {j.status === "FAILED" && <RetryJob id={j.id} />}
                </div>
              </div>
              <JobSteps job={j} title="Steps" />
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

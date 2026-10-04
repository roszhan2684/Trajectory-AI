"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, RotateCcw, Wrench, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JobSteps, useJob } from "@/components/domain/job-progress";
import {
  injectFailureAction,
  rebuildIndexAction,
  reconcileAction,
  retryJobAction,
} from "@/app/actions/admin";

export function ReconcileControls() {
  const router = useRouter();
  const [jobId, setJobId] = React.useState<string | null>(null);
  const job = useJob(jobId, undefined, () => router.refresh());
  const go = async (repair: boolean) => {
    const r = await reconcileAction(repair);
    if (!r.ok) return toast.error(r.error.message);
    setJobId(r.data.jobId);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => go(false)}>
          <Wrench /> Detect drift
        </Button>
        <Button size="sm" variant="primary" onClick={() => go(true)}>
          <RotateCcw /> Reconcile & repair
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            const r = await rebuildIndexAction();
            if (!r.ok) return toast.error(r.error.message);
            toast.success(`Index rebuilt from source of truth (${r.data.documents} documents)`);
            router.refresh();
          }}
        >
          <RefreshCw /> Full rebuild
        </Button>
      </div>
      {job && <JobSteps job={job} title="reconcile-search-index" />}
    </div>
  );
}

export function FailureInjection({ pending }: { pending: number }) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      onClick={async () => {
        const r = await injectFailureAction(pending > 0 ? 0 : 2);
        if (!r.ok) return toast.error(r.error.message);
        toast.success(
          r.data.next
            ? "Next 2 job steps will fail transiently — watch the retries"
            : "Failure injection off",
        );
        router.refresh();
      }}
    >
      <Zap /> {pending > 0 ? `Injecting (${pending} pending) — turn off` : "Inject 2 transient failures"}
    </Button>
  );
}

export function RetryJob({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      onClick={async () => {
        const r = await retryJobAction(id);
        if (!r.ok) return toast.error(r.error.message);
        toast.success("Retry started");
        setTimeout(() => router.refresh(), 1200);
      }}
    >
      <RotateCcw /> Retry
    </Button>
  );
}

export function AutoRefresh({ ms = 2000 }: { ms?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [ms, router]);
  return null;
}

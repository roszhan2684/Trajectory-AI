import { requireActor } from "@/server/auth/session";
import { requireCap } from "@/server/services/core";
import { EVAL_CONFIGS, evalOverview } from "@/server/services/evals";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { EvalDashboard } from "@/components/evals/eval-dashboard";

export const metadata = { title: "Evals" };

export default async function EvalsPage() {
  const actor = await requireActor();
  requireCap(actor, "evals.view");
  const o = evalOverview();
  return (
    <>
      <PageHeader
        eyebrow={<Badge tone="outline">Offline evaluation · synthetic labels, not production traction</Badge>}
        title="Ranking quality"
        description="Every number here is computed at run time from labeled role × candidate pairs or a public held-out test set. Change the pipeline, re-run, compare."
      />
      <EvalDashboard
        runs={o.runs.filter((r) => r.metrics)}
        dataset={o.dataset}
        cases={o.cases}
        labelHistogram={o.labelHistogram}
        external={o.external as never}
        presets={EVAL_CONFIGS.map((c) => c.label)}
        canRun={actor.caps.includes("evals.run")}
      />
    </>
  );
}

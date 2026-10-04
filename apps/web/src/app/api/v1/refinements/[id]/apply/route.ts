import { z } from "zod";
import { DomainError } from "@trajectory/engine";
import { apiActor, handle } from "@/server/http";
import { applyRefinement } from "@/server/services/refinements";

/** applyRankingRefinement — requires explicit confirm=true; re-checks authorization server-side. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const actor = await apiActor(req);
    const body = z.object({ confirm: z.boolean() }).parse(await req.json());
    if (!body.confirm) throw new DomainError("VALIDATION", "Set confirm=true to apply this refinement.");
    const { refinement, job } = await applyRefinement(actor, id);
    return { refinementId: refinement.id, status: refinement.status, jobId: job.id };
  });
}

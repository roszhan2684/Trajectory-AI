import { apiActor, handle } from "@/server/http";
import { proposeRefinement } from "@/server/services/refinements";

/** proposeRankingRefinement — creates a PROPOSAL only; ranking is unchanged until applied. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const actor = await apiActor(req);
    const ref = proposeRefinement(actor, id, await req.json());
    return {
      refinementId: ref.id,
      status: ref.status,
      proposals: ref.proposals,
      unrecognized: ref.unrecognized,
      refused: ref.refused,
      next: "Call applyRankingRefinement with confirm=true after a human reviews these deltas.",
    };
  });
}

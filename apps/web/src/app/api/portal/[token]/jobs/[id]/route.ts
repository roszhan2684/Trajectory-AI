import { DomainError } from "@trajectory/engine";
import { handle } from "@/server/http";
import { getJob } from "@/server/services/jobs";
import { portalContext } from "@/server/services/conversations";

/** Candidate-portal job status: authorized by the signed portal token, scoped to its conversation. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  return handle(() => {
    const { conv } = portalContext(token);
    const job = getJob(id);
    if (!job || job.payload.conversationId !== conv.id) throw new DomainError("NOT_FOUND", "Run not found.");
    return { status: job.status, steps: job.steps, result: job.result, error: job.error };
  });
}

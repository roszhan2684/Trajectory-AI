import { DomainError } from "@trajectory/engine";
import { apiActor, handle } from "@/server/http";
import { getJob } from "@/server/services/jobs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const actor = await apiActor(req);
    const job = getJob(id);
    if (!job || (job.organizationId && job.organizationId !== actor.org.id))
      throw new DomainError("NOT_FOUND", "Run not found.");
    return job;
  });
}

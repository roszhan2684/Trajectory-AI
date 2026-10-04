import { z } from "zod";
import { apiActor, handle } from "@/server/http";
import { requestIntro } from "@/server/services/intros";

/** requestIntroduction — creates a DRAFT. Candidate consent + recruiter approval happen in-app. */
export async function POST(req: Request) {
  return handle(async () => {
    const actor = await apiActor(req);
    const body = z
      .object({ matchId: z.string().min(1), note: z.string().max(1000).nullable().default(null) })
      .parse(await req.json());
    const intro = requestIntro(actor, body.matchId, body.note);
    return {
      introId: intro.id,
      status: intro.status,
      next: "Request candidate consent and approve the intro in the Trajectory app. Nothing is sent automatically.",
    };
  });
}

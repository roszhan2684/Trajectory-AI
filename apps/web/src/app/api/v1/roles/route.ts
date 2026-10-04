import { apiActor, handle, rateLimit } from "@/server/http";
import { briefInput } from "@/server/validation";
import { createRole, listRoles, parseBrief, proposalToDraft } from "@/server/services/roles";

export async function GET(req: Request) {
  return handle(async () => {
    const actor = await apiActor(req);
    return listRoles(actor).map((r) => ({
      id: r.role.id,
      title: r.role.title,
      status: r.role.status,
      location: `${r.role.locationMode} ${r.role.city ?? ""}`.trim(),
      matches: r.matches,
      shortlisted: r.shortlisted,
      intros: r.intros,
    }));
  });
}

/** createRoleDraft — side-effecting: creates a DRAFT only. Activation requires a human in the app. */
export async function POST(req: Request) {
  return handle(async () => {
    const actor = await apiActor(req);
    rateLimit(`parse:${actor.user.id}`, 20);
    const { text } = briefInput.parse(await req.json());
    const proposal = parseBrief(actor, text);
    const role = createRole(actor, proposalToDraft(proposal, text));
    return {
      roleId: role.id,
      status: role.status,
      title: role.title,
      ambiguities: proposal.ambiguities,
      requirements: proposal.requirements.map((r) => `${r.importance}: ${r.label}`),
      next: "Review and activate the draft in the Trajectory app.",
    };
  });
}

import { apiActor, handle } from "@/server/http";
import { getDB } from "@/server/db/store";

export async function GET(req: Request) {
  return handle(async () => {
    const actor = await apiActor(req);
    const db = getDB();
    const roleId = new URL(req.url).searchParams.get("roleId");
    const roles = db.roles.filter((r) => r.organizationId === actor.org.id && (!roleId || r.id === roleId));
    return roles.map((role) => {
      const ms = db.matches.filter((m) => m.roleId === role.id);
      const count = (s: string) => ms.filter((m) => m.status === s).length;
      return {
        roleId: role.id,
        title: role.title,
        status: role.status,
        stages: {
          new: count("NEW"),
          reviewed: count("REVIEWED"),
          shortlisted: count("SHORTLISTED"),
          qualifying: count("QUALIFYING"),
          interested: count("INTERESTED"),
          introRequested: count("INTRO_REQUESTED"),
          introduced: count("INTRODUCED"),
          rejected: count("REJECTED"),
        },
      };
    });
  });
}

import { apiActor, handle } from "@/server/http";
import { getCandidate } from "@/server/services/candidates";

/** Concise, typed profile. Raw source documents are never included. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const actor = await apiActor(req);
    const { candidate: c, matches } = getCandidate(actor, id);
    return {
      id: c.id,
      name: c.fullName,
      headline: c.headline,
      location: [c.city, c.region, c.countryCode].filter(Boolean).join(", "),
      yearsExperience: c.yearsExperience,
      synthetic: c.synthetic,
      experiences: c.experiences.map((e) => ({
        title: e.title,
        company: e.company,
        start: e.startDate.slice(0, 7),
        end: e.endDate?.slice(0, 7) ?? "present",
        stage: e.companyStage,
        highlights: e.bullets.slice(0, 3),
      })),
      skills: c.claims
        .filter((cl) => cl.claimType === "skill")
        .map((cl) => ({ skill: cl.claimValue, support: cl.status })),
      preferences: c.preferences,
      flags: c.flags.map((f) => f.kind),
      matches: matches.map((m) => ({
        matchId: m.match.id,
        role: m.role.title,
        score: Math.round(m.match.finalScore * 1000) / 10,
        rank: m.match.rank,
      })),
    };
  });
}

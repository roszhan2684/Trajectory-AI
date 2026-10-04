import { apiActor, handle } from "@/server/http";
import { getRole } from "@/server/services/roles";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handle(async () => {
    const actor = await apiActor(req);
    const { role, requirements, preferences } = getRole(actor, id);
    return {
      id: role.id,
      title: role.title,
      status: role.status,
      location: { mode: role.locationMode, city: role.city, country: role.countryCode },
      compensation: role.maxComp ? { min: role.minComp, max: role.maxComp, currency: role.currency } : null,
      visaSupport: role.visaSupport,
      years: { min: role.minYears, max: role.maxYears },
      stage: role.companyStage,
      requirements: requirements.map((r) => ({
        label: r.label,
        importance: r.importance,
        category: r.category,
        hardConstraint: r.isHardConstraint,
      })),
      activePreferences: preferences
        .filter((p) => p.active)
        .map((p) => ({ key: p.key, delta: p.weightDelta, source: p.source })),
      ambiguities: role.parse?.ambiguities ?? [],
    };
  });
}

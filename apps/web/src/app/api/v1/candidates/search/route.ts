import { apiActor, handle, rateLimit } from "@/server/http";
import { searchInput } from "@/server/validation";
import { searchCandidates } from "@/server/services/search";

export async function GET(req: Request) {
  return handle(async () => {
    const actor = await apiActor(req);
    rateLimit(`search:${actor.user.id}`, 120);
    const url = new URL(req.url);
    const input = searchInput.parse({
      q: url.searchParams.get("q") ?? "",
      mode: url.searchParams.get("mode") ?? undefined,
      limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
    });
    const res = searchCandidates(actor, input);
    return {
      found: res.found,
      tookMs: res.tookMs,
      mode: res.mode,
      interpreted: res.parsed?.chips ?? [],
      results: res.hits.map((h, i) => {
        const c = res.candidates[i]!;
        return {
          id: c.id,
          name: c.fullName,
          headline: c.headline,
          location: [c.city, c.region].filter(Boolean).join(", "),
          yearsExperience: c.yearsExperience,
          score: h.score,
          keywordRank: h.keywordRank,
          vectorRank: h.vectorRank,
          snippet: h.highlight?.snippet ?? null,
          synthetic: c.synthetic,
        };
      }),
    };
  });
}

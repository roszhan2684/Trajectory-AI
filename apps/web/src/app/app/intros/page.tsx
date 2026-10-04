import { requireActor } from "@/server/auth/session";
import { listIntros, MESSAGING_CONFIGURED } from "@/server/services/intros";
import { PageHeader } from "@/components/page-header";
import { IntroBoard } from "@/components/intros/intro-board";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Introductions" };

export default async function IntrosPage() {
  const actor = await requireActor();
  const rows = listIntros(actor);
  return (
    <>
      <PageHeader
        title="Introductions"
        eyebrow={<Badge tone="outline">Human-approved only · no automatic outreach</Badge>}
        description="Every intro needs candidate consent (via their portal) and recruiter approval. Drafts cite the evidence behind the match."
      />
      <IntroBoard
        messagingConfigured={MESSAGING_CONFIGURED}
        cards={rows.map((r) => ({
          intro: r.intro,
          candidate: { id: r.candidate.id, name: r.candidate.fullName, headline: r.candidate.headline },
          role: { id: r.role.id, title: r.role.title },
          matchId: r.match?.id ?? null,
          score: r.match?.finalScore ?? null,
          requestedBy: r.requestedBy?.displayName ?? null,
          approvedBy: r.approvedBy?.displayName ?? null,
          portal: r.portal,
          canApprove: r.canApprove,
        }))}
      />
    </>
  );
}

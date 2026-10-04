import { requireActor } from "@/server/auth/session";
import { requireCap } from "@/server/services/core";
import { PageHeader } from "@/components/page-header";
import { IngestForm } from "@/components/candidates/ingest-form";

export const metadata = { title: "Ingest resume" };

export default async function IngestPage() {
  const actor = await requireActor();
  requireCap(actor, "candidates.ingest");
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Candidates", href: "/app/candidates" }, { label: "Ingest" }]}
        title="Ingest a candidate source"
        description="Turn a resume into an auditable profile: every claim links back to the exact text that supports it."
      />
      <IngestForm />
    </>
  );
}

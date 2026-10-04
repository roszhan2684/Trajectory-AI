import { MarketingFooter, MarketingNav } from "@/components/marketing/chrome";
import { Reveal } from "@/components/marketing/reveal";

export const metadata = { title: "Security & fairness" };

const SECTIONS: { id: string; title: string; items: [string, string][] }[] = [
  {
    id: "tenancy",
    title: "Tenant isolation & access control",
    items: [
      [
        "Every org-owned object is tenant-scoped",
        "Roles, matches, conversations, intros and audit events carry organizationId. Services check it on every read and return NOT_FOUND (not FORBIDDEN) for other tenants' IDs, so objects can't be probed.",
      ],
      [
        "Capability-based RBAC",
        "Owner, Admin, Recruiter, Hiring manager, Viewer and Internal operator map to explicit capabilities. The UI hides what you can't do; the service layer enforces it.",
      ],
      [
        "Signed sessions & portal links",
        "HTTP-only, SameSite cookies; candidate portal links are HMAC-signed, expiring tokens — never guessable IDs.",
      ],
      [
        "Audit trail",
        "Role activation, ranking changes, intro approvals and member changes are recorded with actor and timestamp.",
      ],
    ],
  },
  {
    id: "ai",
    title: "AI safety boundaries",
    items: [
      [
        "Source documents are data",
        "Resumes are parsed by tool-less, deterministic extraction. Instruction-like text (“ignore previous instructions…”) is detected, flagged to humans and never executed.",
      ],
      [
        "Models never decide what matters",
        "Authorization, hard constraints, score arithmetic and consequential actions are deterministic. The fit model only reorders the top 25 retrieved candidates.",
      ],
      [
        "Citations are validated",
        "Explanations may only cite evidence IDs that exist in the candidate's graph — checked in the eval suite (citation validity, hallucinated-evidence rate).",
      ],
      [
        "No silent side effects",
        "Feedback becomes a proposal; intros need consent and approval; MCP write tools create drafts or require explicit confirm=true.",
      ],
    ],
  },
  {
    id: "fairness",
    title: "Fairness guardrails",
    items: [
      [
        "Protected traits are not features",
        "Age, sex/gender, race, religion, disability, family status, sexual orientation and national origin are not in the feature space or the preference allowlist (unit-tested).",
      ],
      [
        "Refused, not reinterpreted",
        "Briefs or feedback that reference protected traits (“young digital natives”, “prioritize younger engineers”) are refused with an explanation; “teams under 30” is correctly read as team size.",
      ],
      [
        "Excluded at ingestion",
        "Protected information found in a resume is flagged and excluded from matching.",
      ],
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    items: [
      [
        "PII-minimal telemetry",
        "Analytics accept only short scalar properties — resume text and free text are dropped. Traces carry hashed organization IDs.",
      ],
      [
        "Deletion pathway",
        "Deleting a candidate removes their sources, evidence, matches, conversations, intros and index document.",
      ],
      [
        "Honest about the demo",
        "This deployment uses synthetic people and companies, and local adapters instead of hosted services — reported on the Integrations page.",
      ],
    ],
  },
];

export default function SecurityPage() {
  return (
    <div className="dark min-h-dvh bg-[#08090b] text-white [color-scheme:dark]">
      <MarketingNav />
      <section className="mx-auto max-w-4xl px-5 pb-10 pt-20">
        <Reveal>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Security, AI safety{" "}
            <span className="font-serif font-normal italic text-white/60">& fairness.</span>
          </h1>
          <p className="mt-4 text-lg text-white/55">What the system enforces — and what it refuses to do.</p>
        </Reveal>
      </section>
      <div className="mx-auto max-w-4xl space-y-14 px-5 pb-24">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id}>
            <Reveal>
              <h2 className="text-xl font-semibold">{s.title}</h2>
            </Reveal>
            <div className="mt-5 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-2">
              {s.items.map(([t, d]) => (
                <div key={t} className="bg-[#0b0c0f] p-5">
                  <div className="text-[14px] font-medium">{t}</div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">{d}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <MarketingFooter />
    </div>
  );
}

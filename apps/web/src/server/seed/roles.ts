/** Synthetic organizations, demo personas and 20 role briefs (parsed by the real Role Intelligence parser). */
import type { CompanyStage, MemberRole, RoleStatus } from "@trajectory/engine";
import { FLAGSHIP_BRIEF } from "./flagship";

export interface OrgSpec {
  key: string;
  name: string;
  slug: string;
  website: string;
  sizeBand: string;
  stage: CompanyStage;
  industry: string;
  timezone: string;
  description: string;
  hmApprove: boolean;
}

export const ORGS: OrgSpec[] = [
  {
    key: "northstar",
    name: "Northstar Labs",
    slug: "northstar",
    website: "northstar.example",
    sizeBand: "1-10",
    stage: "seed",
    industry: "AI infrastructure",
    timezone: "America/Los_Angeles",
    description: "Seed-stage team building AI infrastructure for recruiting. (Synthetic demo company.)",
    hmApprove: true,
  },
  {
    key: "helix",
    name: "Helix Health",
    slug: "helix-health",
    website: "helixhealth.example",
    sizeBand: "51-200",
    stage: "series-a",
    industry: "Healthcare",
    timezone: "America/New_York",
    description: "Series A virtual-care platform. (Synthetic demo company.)",
    hmApprove: false,
  },
  {
    key: "lumen",
    name: "Lumen Robotics",
    slug: "lumen-robotics",
    website: "lumenrobotics.example",
    sizeBand: "201-1000",
    stage: "series-b",
    industry: "Robotics",
    timezone: "America/Chicago",
    description: "Series B warehouse-robotics company. (Synthetic demo company.)",
    hmApprove: false,
  },
];

export interface UserSpec {
  key: string;
  displayName: string;
  email: string;
  title: string;
  color: string;
  memberships: { org: string; role: MemberRole }[];
}

export const USERS: UserSpec[] = [
  {
    key: "maya",
    displayName: "Maya Okafor",
    email: "maya@northstar.example",
    title: "Founder & CEO",
    color: "#6E56CF",
    memberships: [
      { org: "northstar", role: "OWNER" },
      { org: "helix", role: "ADMIN" },
    ],
  },
  {
    key: "jordan",
    displayName: "Jordan Reyes",
    email: "jordan@northstar.example",
    title: "Head of Talent",
    color: "#0E9F6E",
    memberships: [{ org: "northstar", role: "RECRUITER" }],
  },
  {
    key: "priya",
    displayName: "Priya Natarajan",
    email: "priya@northstar.example",
    title: "CTO",
    color: "#D9480F",
    memberships: [{ org: "northstar", role: "HIRING_MANAGER" }],
  },
  {
    key: "sam",
    displayName: "Sam Whitfield",
    email: "sam@northstar.example",
    title: "Board observer",
    color: "#64748B",
    memberships: [{ org: "northstar", role: "VIEWER" }],
  },
  {
    key: "daniel",
    displayName: "Daniel Kim",
    email: "daniel@helixhealth.example",
    title: "VP Engineering",
    color: "#1971C2",
    memberships: [{ org: "helix", role: "ADMIN" }],
  },
  {
    key: "elena",
    displayName: "Elena Rossi",
    email: "elena@lumenrobotics.example",
    title: "Talent Partner",
    color: "#C2255C",
    memberships: [{ org: "lumen", role: "RECRUITER" }],
  },
  {
    key: "ops",
    displayName: "Trajectory Ops",
    email: "ops@trajectory.example",
    title: "Internal operator",
    color: "#2B8A3E",
    memberships: [
      { org: "northstar", role: "INTERNAL_OPERATOR" },
      { org: "helix", role: "INTERNAL_OPERATOR" },
      { org: "lumen", role: "INTERNAL_OPERATOR" },
    ],
  },
];

export interface RoleSpec {
  key: string;
  org: string;
  status: RoleStatus;
  createdBy: string;
  family: string;
  title?: string;
  brief: string;
  daysAgo: number;
}

export const ROLES: RoleSpec[] = [
  {
    key: "flagship",
    org: "northstar",
    status: "ACTIVE",
    createdBy: "jordan",
    family: "fullstack_ai",
    title: "Founding Full-Stack AI Engineer",
    brief: FLAGSHIP_BRIEF,
    daysAgo: 6,
  },
  {
    key: "search",
    org: "northstar",
    status: "ACTIVE",
    createdBy: "priya",
    family: "search",
    title: "Search & Ranking Engineer",
    brief:
      "Hiring a Search & Ranking Engineer in San Francisco, hybrid 3 days. Must have production search experience with Elasticsearch or Typesense and strong Python. Learning to rank and ranking evals (NDCG) are essential. Nice to have TypeScript and LLM retrieval (RAG). Small team of 9. $180k-$230k. We can sponsor visas. 4+ years.",
    daysAgo: 21,
  },
  {
    key: "designer",
    org: "northstar",
    status: "ACTIVE",
    createdBy: "maya",
    family: "design",
    title: "Founding Product Designer",
    brief:
      "We need a founding product designer in San Francisco, hybrid. Strong Figma, UX design and design systems. Comfortable talking to customers and doing user research. Bonus for prototyping in React. Tiny team. $150k-$190k. We can support sponsorship. 3+ years.",
    daysAgo: 30,
  },
  {
    key: "workflows",
    org: "northstar",
    status: "ACTIVE",
    createdBy: "priya",
    family: "backend",
    title: "Senior Backend Engineer, Workflows",
    brief:
      "Seeking a senior backend engineer, fully remote within the US. Must have strong Node.js or Golang and PostgreSQL. Experience with durable workflows (Temporal, Trigger.dev) and Kafka required. Nice to have Kubernetes. Team of 9. $170k-$215k. Cannot sponsor visas. 5+ years.",
    daysAgo: 14,
  },
  {
    key: "applied_ml",
    org: "northstar",
    status: "PAUSED",
    createdBy: "priya",
    family: "ml",
    title: "Applied ML Engineer, Evaluation",
    brief:
      "Looking for an applied ML engineer in San Francisco, hybrid. Strong Python and machine learning. Experience building LLM evals and model evaluation is required. Bonus for NLP and ranking. $175k-$220k. We can sponsor visas. 3+ years.",
    daysAgo: 45,
  },
  {
    key: "devrel",
    org: "northstar",
    status: "DRAFT",
    createdBy: "jordan",
    family: "devrel",
    title: "Developer Relations Engineer",
    brief:
      "We want a developer relations engineer, remote. TypeScript, open source and great written communication. Bonus for MCP and LLM demo apps.",
    daysAgo: 2,
  },
  {
    key: "ae",
    org: "northstar",
    status: "CLOSED",
    createdBy: "maya",
    family: "sales",
    title: "Founding Account Executive",
    brief:
      "Hiring a founding account executive in San Francisco, onsite. Must have B2B SaaS sales experience and CRM discipline. Comfortable in a tiny team. $130k-$160k base. 4+ years.",
    daysAgo: 90,
  },
  {
    key: "data_eng",
    org: "northstar",
    status: "ACTIVE",
    createdBy: "jordan",
    family: "data",
    title: "Data Engineer",
    brief:
      "Looking for a data engineer in San Francisco, hybrid. Strong SQL and Python, experience with dbt and Airflow required. Nice to have Snowflake and product analytics. Small team. $160k-$200k. We can sponsor visas. 3+ years.",
    daysAgo: 10,
  },
  {
    key: "helix_fe",
    org: "helix",
    status: "ACTIVE",
    createdBy: "daniel",
    family: "frontend",
    title: "Senior Frontend Engineer",
    brief:
      "Hiring a senior frontend engineer in New York, hybrid. Must have strong React and TypeScript, and accessibility (WCAG) experience. Healthcare experience is a plus. Design systems a bonus. $175k-$210k. Must be authorized to work in the US. 5+ years.",
    daysAgo: 12,
  },
  {
    key: "helix_be",
    org: "helix",
    status: "ACTIVE",
    createdBy: "daniel",
    family: "backend",
    title: "Staff Backend Engineer, Integrations",
    brief:
      "Seeking a staff backend engineer for EHR integrations in New York, hybrid. Strong Java or Golang, PostgreSQL and REST APIs required. HIPAA and healthcare experience strongly preferred. Kafka a plus. $200k-$245k. No visa sponsorship. 8+ years.",
    daysAgo: 25,
  },
  {
    key: "helix_ops",
    org: "helix",
    status: "ACTIVE",
    createdBy: "maya",
    family: "clinical_ops",
    title: "Clinical Operations Lead",
    brief:
      "We need a clinical operations lead in New York, onsite. Must have healthcare operations experience and HIPAA knowledge. Strong Excel and project management. Experience leading a team required. $120k-$150k. 5+ years.",
    daysAgo: 18,
  },
  {
    key: "helix_sec",
    org: "helix",
    status: "ACTIVE",
    createdBy: "daniel",
    family: "security",
    title: "Security Engineer",
    brief:
      "Hiring a security engineer, remote within the US. Must have application security, OAuth/SSO and AWS experience. HIPAA compliance experience required. Terraform a bonus. $180k-$220k. Cannot sponsor visas. 4+ years.",
    daysAgo: 9,
  },
  {
    key: "helix_pm",
    org: "helix",
    status: "DRAFT",
    createdBy: "daniel",
    family: "product",
    title: "Product Manager, Patient Experience",
    brief:
      "Looking for a product manager for patient experience in New York. Product management in healthcare, strong user research and analytics.",
    daysAgo: 1,
  },
  {
    key: "helix_ml",
    org: "helix",
    status: "ACTIVE",
    createdBy: "daniel",
    family: "ml",
    title: "ML Engineer, Clinical NLP",
    brief:
      "Hiring an ML engineer for clinical NLP in New York, hybrid. Strong Python, NLP and PyTorch required. Experience with LLM evals and healthcare data strongly preferred. $185k-$230k. We can sponsor visas. 4+ years.",
    daysAgo: 16,
  },
  {
    key: "lumen_cpp",
    org: "lumen",
    status: "ACTIVE",
    createdBy: "elena",
    family: "robotics",
    title: "Robotics Software Engineer (C++)",
    brief:
      "Hiring a robotics software engineer in Austin, onsite. Must have strong C++ and Linux, motion planning experience preferred. Python a plus. Team of 220. $160k-$200k. We can sponsor visas. 3+ years.",
    daysAgo: 20,
  },
  {
    key: "lumen_perception",
    org: "lumen",
    status: "ACTIVE",
    createdBy: "elena",
    family: "robotics",
    title: "Perception Engineer",
    brief:
      "Seeking a perception engineer in Austin, onsite. Strong computer vision, deep learning with PyTorch and C++ required. Experience deploying models on robots is a big plus. $170k-$215k. We can sponsor visas. 4+ years.",
    daysAgo: 11,
  },
  {
    key: "lumen_fw",
    org: "lumen",
    status: "ACTIVE",
    createdBy: "elena",
    family: "robotics",
    title: "Embedded Firmware Engineer",
    brief:
      "Looking for an embedded firmware engineer in Austin, onsite. Must have embedded C/C++ firmware on RTOS microcontrollers. Must be authorized to work in the US. $150k-$185k. 3+ years.",
    daysAgo: 33,
  },
  {
    key: "lumen_ios",
    org: "lumen",
    status: "PAUSED",
    createdBy: "elena",
    family: "mobile",
    title: "Mobile Engineer (iOS)",
    brief:
      "Hiring an iOS engineer in Austin, hybrid. Strong Swift and SwiftUI required. React Native a plus. $150k-$185k. 3+ years.",
    daysAgo: 60,
  },
  {
    key: "lumen_infra",
    org: "lumen",
    status: "ACTIVE",
    createdBy: "elena",
    family: "infra",
    title: "Platform / Infrastructure Engineer",
    brief:
      "Seeking a platform engineer, fully remote in the US. Must have Kubernetes, Terraform and AWS. CI/CD and observability experience required. Golang a plus. $165k-$205k. We can support visa sponsorship. 4+ years.",
    daysAgo: 8,
  },
  {
    key: "lumen_recruiter",
    org: "lumen",
    status: "CLOSED",
    createdBy: "elena",
    family: "recruiter",
    title: "Technical Recruiter",
    brief:
      "Hiring a technical recruiter in Austin, hybrid. Full-cycle recruiting for engineering roles. $110k-$135k. 3+ years.",
    daysAgo: 120,
  },
];

/** Role family × archetype relevance (0..3) used ONLY to produce eval labels. */
export const FAMILY_RELEVANCE: Record<string, Record<string, number>> = {
  fullstack_ai: { fullstack: 2, ai_engineer: 3, frontend: 1, backend: 1, search: 1, ml: 1, devrel: 1 },
  search: { search: 3, ml: 2, backend: 1, ai_engineer: 1, data: 1 },
  design: { design: 3, frontend: 1, product: 1 },
  backend: { backend: 3, fullstack: 2, infra: 1, data: 1, search: 1 },
  ml: { ml: 3, ai_engineer: 2, search: 1, data: 1 },
  devrel: { devrel: 3, fullstack: 1, ai_engineer: 1, frontend: 1 },
  sales: { sales: 3 },
  data: { data: 3, ml: 1, backend: 1 },
  frontend: { frontend: 3, fullstack: 2, design: 1, mobile: 1 },
  clinical_ops: { clinical_ops: 3, product: 1 },
  security: { security: 3, infra: 2, backend: 1 },
  product: { product: 3, design: 1 },
  robotics: { robotics: 3, ml: 1 },
  mobile: { mobile: 3, frontend: 1 },
  infra: { infra: 3, backend: 2, security: 1 },
  recruiter: { recruiter: 3 },
};

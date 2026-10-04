"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CircleHelp, Lock, Plus, ShieldAlert, Sparkles, Trash2, Wand2 } from "lucide-react";
import type { RoleDraftInput } from "@/server/validation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Panel, PanelHeader, SectionLabel } from "@/components/ui/panel";
import { Tabs, TabsContent, TabsList, TabsTrigger, Tip } from "@/components/ui/overlays";
import { JobSteps, useJob } from "@/components/domain/job-progress";
import { createRoleAction, parseBriefAction, updateRoleAction } from "@/app/actions/roles";
import { cn } from "@/lib/utils";

type Req = RoleDraftInput["requirements"][number];
export interface SkillOption {
  key: string;
  display: string;
  category: string;
}

const SAMPLE_BRIEFS = [
  {
    label: "Founding full-stack (demo script)",
    text: "We need a founding full-stack engineer in San Francisco. Strong TypeScript/React, can own features end-to-end, has shipped LLM features, comfortable in a tiny fast-moving team, onsite, bonus for search/ranking and durable workflows. We can support sponsorship.",
  },
  {
    label: "Messy Slack message",
    text: "hey!! looking for a senior backend person, ideally golang + postgres, remote US is fine but no visa sponsorship sorry. kafka is a big plus. budget 180-215k. must be ok with on-call. 5+ years",
  },
  {
    label: "With a protected trait (watch it get blocked)",
    text: "Hiring a frontend engineer in New York, hybrid. Must know React and TypeScript. Looking for young digital natives. Accessibility experience is a plus. $160k-$190k.",
  },
];

const BUCKETS: { key: "MUST" | "STRONG" | "NICE"; title: string; hint: string }[] = [
  { key: "MUST", title: "Must have", hint: "Weighted 1.0 in skill fit" },
  { key: "STRONG", title: "Strong signal", hint: "Weighted 0.6" },
  { key: "NICE", title: "Nice to have", hint: "Weighted 0.3" },
];

function Conf({ value, source }: { value: number | undefined; source?: string }) {
  if (value === undefined) return null;
  const tone = value >= 0.75 ? "bg-good" : value >= 0.5 ? "bg-warn" : "bg-bad";
  return (
    <Tip
      content={
        <span>
          Parser confidence {Math.round(value * 100)}%
          {source ? (
            <>
              <br />
              Source: “{source}”
            </>
          ) : null}
        </span>
      }
    >
      <span className="inline-flex items-center gap-1 text-[10px] text-faint">
        <span className={cn("size-1.5 rounded-full", tone)} />
        {Math.round(value * 100)}%
      </span>
    </Tip>
  );
}

export function RoleEditor({
  initial,
  skills,
  roleId,
  mode,
}: {
  initial: RoleDraftInput | null;
  skills: SkillOption[];
  roleId?: string;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [brief, setBrief] = React.useState(initial?.descriptionRaw ?? "");
  const [draft, setDraft] = React.useState<RoleDraftInput | null>(initial);
  const [pending, setPending] = React.useState<null | "parse" | "save" | "activate">(null);
  const [jobId, setJobId] = React.useState<string | null>(null);
  const [newRoleId, setNewRoleId] = React.useState<string | null>(null);
  const [parseMs, setParseMs] = React.useState<number | null>(null);
  const [tab, setTab] = React.useState(initial ? "review" : "brief");

  const job = useJob(jobId, undefined, (j) => {
    if (j.status === "COMPLETED" && newRoleId) router.push(`/app/roles/${newRoleId}/matches?fresh=1`);
  });

  const parse = async () => {
    setPending("parse");
    const t0 = performance.now();
    const res = await parseBriefAction(brief);
    setPending(null);
    if (!res.ok) return toast.error(res.error.message);
    setParseMs(Math.round(performance.now() - t0));
    setDraft(res.data.draft);
    setTab("review");
  };

  const blank = (): RoleDraftInput => ({
    title: "",
    descriptionRaw: "",
    locationMode: "ONSITE",
    city: "San Francisco",
    region: "CA",
    countryCode: "US",
    minComp: null,
    maxComp: null,
    currency: "USD",
    visaSupport: "UNKNOWN",
    employmentType: "FULL_TIME",
    minYears: null,
    maxYears: null,
    companyStage: "seed",
    teamSize: null,
    domain: null,
    responsibilities: [],
    requirements: [],
    parse: null,
  });

  const set = <K extends keyof RoleDraftInput>(k: K, v: RoleDraftInput[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setReq = (i: number, patch: Partial<Req>) =>
    setDraft((d) =>
      d ? { ...d, requirements: d.requirements.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : d,
    );
  const removeReq = (i: number) =>
    setDraft((d) => (d ? { ...d, requirements: d.requirements.filter((_, j) => j !== i) } : d));
  const addSkill = (key: string, importance: Req["importance"]) => {
    const s = skills.find((x) => x.key === key);
    if (!s || !draft || draft.requirements.some((r) => r.normalizedKey === key)) return;
    setDraft({
      ...draft,
      requirements: [
        ...draft.requirements,
        {
          category: "SKILL",
          label: s.display,
          normalizedKey: s.key,
          importance,
          isHardConstraint: false,
          sourceText: "Added by recruiter",
          confidence: 1,
        },
      ],
    });
  };

  const save = async (activate: boolean) => {
    if (!draft) return;
    setPending(activate ? "activate" : "save");
    const payload = { ...draft, descriptionRaw: draft.descriptionRaw || brief };
    if (mode === "edit" && roleId) {
      const res = await updateRoleAction(roleId, payload);
      setPending(null);
      if (!res.ok) return toast.error(res.error.message);
      toast.success("Role updated");
      router.push(`/app/roles/${roleId}`);
      router.refresh();
      return;
    }
    const res = await createRoleAction(payload, activate);
    setPending(null);
    if (!res.ok) return toast.error(res.error.message);
    if (res.data.jobId) {
      setNewRoleId(res.data.roleId);
      setJobId(res.data.jobId);
      toast.success("Role activated — generating matches…");
    } else {
      toast.success("Saved as draft");
      router.push(`/app/roles/${res.data.roleId}`);
    }
  };

  const fc = draft?.parse?.fieldConfidence ?? {};
  const fs = draft?.parse?.fieldSources ?? {};
  const hard = draft?.requirements.map((r, i) => ({ r, i })).filter(({ r }) => r.isHardConstraint) ?? [];

  return (
    <Tabs value={tab} onValueChange={setTab}>
      {mode === "create" && (
        <TabsList className="mb-5">
          <TabsTrigger value="brief">
            <Wand2 /> Describe role
          </TabsTrigger>
          <TabsTrigger value="review" disabled={!draft} onClick={() => !draft && setDraft(blank())}>
            Review & edit
          </TabsTrigger>
          <TabsTrigger
            value="advanced"
            onClick={() => {
              if (!draft) setDraft(blank());
              setTab("review");
            }}
          >
            Advanced form
          </TabsTrigger>
        </TabsList>
      )}

      <TabsContent value="brief" className="outline-none">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Panel className="p-4">
            <Field label="Paste the hiring brief — Slack message, notes, a messy JD" htmlFor="brief">
              <Textarea
                id="brief"
                rows={10}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="We need a founding full-stack engineer in San Francisco. Strong TypeScript/React…"
              />
            </Field>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">
                Parsed deterministically (no LLM) — every field gets a confidence and a source snippet.
              </p>
              <Button
                variant="primary"
                onClick={parse}
                disabled={pending !== null || brief.trim().length < 20}
              >
                <Sparkles /> {pending === "parse" ? "Parsing…" : "Parse brief"}
              </Button>
            </div>
          </Panel>
          <div className="space-y-2">
            <SectionLabel>Try a sample</SectionLabel>
            {SAMPLE_BRIEFS.map((s) => (
              <button
                key={s.label}
                onClick={() => setBrief(s.text)}
                className="block w-full rounded-xl border border-line bg-panel p-3 text-left shadow-panel transition hover:border-line-strong"
              >
                <div className="text-[13px] font-medium text-ink">{s.label}</div>
                <div className="mt-1 line-clamp-2 text-xs text-muted">{s.text}</div>
              </button>
            ))}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="review" className="outline-none">
        {draft && (
          <div className="space-y-5">
            {(draft.parse?.protectedTraitWarnings.length ?? 0) > 0 && (
              <div className="flex gap-3 rounded-xl border border-bad/30 bg-bad-soft p-3 text-[13px] text-bad">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
                <div>
                  <div className="font-medium">Protected characteristics were removed</div>
                  {draft.parse!.protectedTraitWarnings.map((w) => (
                    <div key={w} className="mt-0.5 text-xs opacity-90">
                      {w}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(draft.parse?.injectionFlags.length ?? 0) > 0 && (
              <div className="flex gap-3 rounded-xl border border-warn/30 bg-warn-soft p-3 text-[13px] text-warn">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <div>
                  <div className="font-medium">Instruction-like text was ignored</div>
                  {draft.parse!.injectionFlags.map((w) => (
                    <div key={w} className="text-xs">
                      {w}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {parseMs !== null && (
              <p className="text-xs text-muted">
                Parsed in {parseMs} ms · {draft.requirements.length} requirements ·{" "}
                {draft.parse?.ambiguities.length ?? 0} things need clarification · nothing is saved until you
                approve.
              </p>
            )}

            <Panel>
              <PanelHeader
                title="Role"
                description="Structured fields extracted from the brief. Edit anything."
              />
              <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Title" className="sm:col-span-2">
                  <div className="flex items-center gap-2">
                    <Input value={draft.title} onChange={(e) => set("title", e.target.value)} />
                    <Conf value={fc.title} source={fs.title} />
                  </div>
                </Field>
                <Field label="Work mode">
                  <div className="flex items-center gap-2">
                    <Select
                      value={draft.locationMode}
                      onChange={(e) => set("locationMode", e.target.value as RoleDraftInput["locationMode"])}
                    >
                      <option value="ONSITE">Onsite</option>
                      <option value="HYBRID">Hybrid</option>
                      <option value="REMOTE">Remote</option>
                    </Select>
                    <Conf value={fc.location} source={fs.location} />
                  </div>
                </Field>
                <Field label="City">
                  <Input
                    value={draft.city ?? ""}
                    onChange={(e) => set("city", e.target.value || null)}
                    placeholder="Remote"
                  />
                </Field>
                <Field label="Base salary range (USD)">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={draft.minComp ?? ""}
                      onChange={(e) => set("minComp", e.target.value ? Number(e.target.value) : null)}
                      placeholder="min"
                    />
                    <Input
                      type="number"
                      value={draft.maxComp ?? ""}
                      onChange={(e) => set("maxComp", e.target.value ? Number(e.target.value) : null)}
                      placeholder="max"
                    />
                    <Conf value={fc.compensation} source={fs.compensation} />
                  </div>
                </Field>
                <Field label="Visa sponsorship">
                  <div className="flex items-center gap-2">
                    <Select
                      value={draft.visaSupport}
                      onChange={(e) => set("visaSupport", e.target.value as RoleDraftInput["visaSupport"])}
                    >
                      <option value="YES">Can sponsor</option>
                      <option value="NO">Cannot sponsor</option>
                      <option value="UNKNOWN">Unknown</option>
                    </Select>
                    <Conf value={fc.visa} source={fs.visa} />
                  </div>
                </Field>
                <Field label="Years of experience">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={draft.minYears ?? ""}
                      onChange={(e) => set("minYears", e.target.value ? Number(e.target.value) : null)}
                      placeholder="min"
                    />
                    <Input
                      type="number"
                      value={draft.maxYears ?? ""}
                      onChange={(e) => set("maxYears", e.target.value ? Number(e.target.value) : null)}
                      placeholder="max"
                    />
                  </div>
                </Field>
                <Field label="Company stage / team size">
                  <div className="flex items-center gap-2">
                    <Select
                      value={draft.companyStage}
                      onChange={(e) => set("companyStage", e.target.value as RoleDraftInput["companyStage"])}
                    >
                      {["pre-seed", "seed", "series-a", "series-b", "growth", "public"].map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      className="w-20"
                      value={draft.teamSize ?? ""}
                      onChange={(e) => set("teamSize", e.target.value ? Number(e.target.value) : null)}
                      placeholder="team"
                    />
                  </div>
                </Field>
              </div>
            </Panel>

            <div className="grid gap-4 lg:grid-cols-3">
              {BUCKETS.map((b) => {
                const items = draft.requirements
                  .map((r, i) => ({ r, i }))
                  .filter(({ r }) => r.importance === b.key && !r.isHardConstraint);
                return (
                  <Panel key={b.key} className="flex flex-col">
                    <PanelHeader title={`${b.title} · ${items.length}`} description={b.hint} />
                    <ul className="flex-1 divide-y divide-line">
                      {items.map(({ r, i }) => (
                        <li key={i} className="group px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="flex-1 text-[13px] font-medium text-ink">{r.label}</span>
                            <Conf value={r.confidence} source={r.sourceText} />
                            <Select
                              aria-label={`Importance of ${r.label}`}
                              className="h-6 w-auto px-1 text-[11px]"
                              value={r.importance}
                              onChange={(e) => setReq(i, { importance: e.target.value as Req["importance"] })}
                            >
                              <option value="MUST">Must</option>
                              <option value="STRONG">Strong</option>
                              <option value="NICE">Nice</option>
                            </Select>
                            <button
                              aria-label={`Remove ${r.label}`}
                              onClick={() => removeReq(i)}
                              className="rounded p-0.5 text-faint opacity-0 transition hover:text-bad group-hover:opacity-100 focus:opacity-100"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <Badge tone="outline" className="h-4 px-1 text-[10px]">
                              {r.category.toLowerCase().replace("_", " ")}
                            </Badge>
                            {r.sourceText && (
                              <span className="truncate text-[11px] text-faint">“{r.sourceText}”</span>
                            )}
                          </div>
                        </li>
                      ))}
                      {items.length === 0 && (
                        <li className="px-4 py-6 text-center text-xs text-faint">None</li>
                      )}
                    </ul>
                    <AddSkill skills={skills} onAdd={(k) => addSkill(k, b.key)} />
                  </Panel>
                );
              })}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel>
                <PanelHeader
                  icon={<Lock className="size-3.5 text-muted" />}
                  title={`Hard constraints · ${hard.length}`}
                  description="Evaluated deterministically: PASS / FAIL / UNKNOWN. Unknown never silently becomes fail."
                />
                <ul className="divide-y divide-line">
                  {hard.map(({ r, i }) => (
                    <li key={i} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                      <span className="flex-1 font-medium text-ink">{r.label}</span>
                      <Conf value={r.confidence} source={r.sourceText} />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setReq(i, { isHardConstraint: false })}
                      >
                        Make soft
                      </Button>
                    </li>
                  ))}
                  {hard.length === 0 && (
                    <li className="px-4 py-6 text-center text-xs text-faint">No hard constraints.</li>
                  )}
                </ul>
              </Panel>
              <Panel>
                <PanelHeader
                  icon={<CircleHelp className="size-3.5 text-muted" />}
                  title={`Needs clarification · ${draft.parse?.ambiguities.length ?? 0}`}
                  description="The parser asks instead of guessing. These lower ranking confidence until resolved."
                />
                <ul className="divide-y divide-line">
                  {(draft.parse?.ambiguities ?? []).map((a) => (
                    <li key={a.key + a.question} className="flex items-start gap-2 px-4 py-2.5 text-[13px]">
                      <Badge
                        tone={a.severity === "high" ? "bad" : a.severity === "medium" ? "warn" : "unknown"}
                      >
                        {a.severity}
                      </Badge>
                      <span className="text-ink-2">{a.question}</span>
                    </li>
                  ))}
                  {(draft.parse?.ambiguities.length ?? 0) === 0 && (
                    <li className="px-4 py-6 text-center text-xs text-faint">Nothing ambiguous.</li>
                  )}
                </ul>
              </Panel>
            </div>

            <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel/95 p-3 shadow-float backdrop-blur">
              <p className="text-xs text-muted">
                {mode === "create"
                  ? "A human approves before the role goes live. Activation runs the matching pipeline in the background."
                  : "Saving re-scores matches on the next run."}
              </p>
              <div className="flex gap-2">
                {mode === "create" && (
                  <Button onClick={() => save(false)} disabled={pending !== null || !draft.title}>
                    {pending === "save" ? "Saving…" : "Save draft"}
                  </Button>
                )}
                <Button
                  variant="primary"
                  onClick={() => save(mode === "create")}
                  disabled={pending !== null || !draft.title || draft.requirements.length === 0}
                >
                  {mode === "create"
                    ? pending === "activate"
                      ? "Activating…"
                      : "Approve & activate"
                    : pending
                      ? "Saving…"
                      : "Save changes"}
                </Button>
              </div>
            </div>
            {job && <JobSteps job={job} title="Generating matches" />}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

function AddSkill({ skills, onAdd }: { skills: SkillOption[]; onAdd: (key: string) => void }) {
  const [q, setQ] = React.useState("");
  const hits =
    q.length >= 1 ? skills.filter((s) => s.display.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  return (
    <div className="relative border-t border-line p-2">
      <div className="flex items-center gap-1.5">
        <Plus className="size-3.5 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Add skill…"
          aria-label="Add skill"
          className="w-full bg-transparent text-xs text-ink outline-none placeholder:text-faint"
        />
      </div>
      {hits.length > 0 && (
        <ul className="absolute inset-x-2 bottom-full z-20 mb-1 rounded-lg border border-line bg-panel p-1 shadow-float">
          {hits.map((s) => (
            <li key={s.key}>
              <button
                className="w-full rounded-md px-2 py-1 text-left text-xs text-ink-2 hover:bg-subtle"
                onClick={() => {
                  onAdd(s.key);
                  setQ("");
                }}
              >
                {s.display} <span className="text-faint">· {s.category}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

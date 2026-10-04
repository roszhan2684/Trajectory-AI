"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import {
  Briefcase,
  FlaskConical,
  Gauge,
  Plus,
  Search,
  Upload,
  User,
  Users,
  Activity,
  Layers,
  Settings,
  Workflow,
} from "lucide-react";

interface Props {
  open: boolean;
  setOpen: (v: boolean) => void;
  roles: { id: string; title: string; status: string }[];
  canLab: boolean;
}

interface Hit {
  id: string;
  name: string;
  headline: string;
  location: string;
}

export function CommandPalette({ open, setOpen: setOpenRaw, roles, canLab }: Props) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [results, setHits] = React.useState<Hit[]>([]);
  const hits = q.trim().length < 2 ? [] : results;
  const setOpen = (v: boolean) => {
    if (!v) setQ("");
    setOpenRaw(v);
  };

  React.useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/v1/candidates/search?limit=6&q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        const j = await r.json();
        if (j.ok) setHits(j.data.results);
      } catch {
        /* aborted */
      }
    }, 140);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const item =
    "flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-ink-2 aria-selected:bg-subtle aria-selected:text-ink [&_svg]:size-4 [&_svg]:text-muted";
  const group =
    "px-1 py-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-faint";

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" />
        <D.Content className="fixed left-1/2 top-[14vh] z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-panel shadow-float">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Search candidates, roles and pages</D.Description>
          <Command shouldFilter={true} loop>
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-4 text-muted" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search candidates, roles, pages…  try “typescript engineers in SF”"
                className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-faint"
              />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-1">
              <Command.Empty className="px-4 py-8 text-center text-sm text-muted">No results.</Command.Empty>
              {hits.length > 0 && (
                <Command.Group heading="Candidates (hybrid search)" className={group}>
                  {hits.map((h) => (
                    <Command.Item
                      key={h.id}
                      value={`cand ${h.name} ${h.headline} ${q}`}
                      onSelect={() => go(`/app/candidates/${h.id}`)}
                      className={item}
                    >
                      <User />
                      <span className="font-medium text-ink">{h.name}</span>
                      <span className="truncate text-muted">{h.headline}</span>
                      <span className="ml-auto shrink-0 text-xs text-faint">{h.location}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              <Command.Group heading="Actions" className={group}>
                <Command.Item onSelect={() => go("/app/roles/new")} className={item}>
                  <Plus /> Create a role from a brief
                </Command.Item>
                <Command.Item onSelect={() => go("/app/candidates/new")} className={item}>
                  <Upload /> Ingest a resume
                </Command.Item>
                <Command.Item onSelect={() => go("/app/evals")} className={item}>
                  <FlaskConical /> Run the eval suite
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Roles" className={group}>
                {roles.map((r) => (
                  <Command.Item
                    key={r.id}
                    value={`role ${r.title}`}
                    onSelect={() => go(`/app/roles/${r.id}/matches`)}
                    className={item}
                  >
                    <Briefcase />
                    {r.title}
                    <span className="ml-auto text-[11px] text-faint">{r.status.toLowerCase()}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Go to" className={group}>
                {[
                  ["Dashboard", "/app", Gauge],
                  ["Candidates", "/app/candidates", Users],
                  ["Introductions", "/app/intros", Workflow],
                  ["Evals", "/app/evals", FlaskConical],
                  ["Settings", "/app/settings/organization", Settings],
                  ...(canLab
                    ? ([
                        ["Lab · Traces", "/app/lab/traces", Activity],
                        ["Lab · Jobs", "/app/lab/jobs", Layers],
                        ["Lab · Ranking & models", "/app/lab/ranking", Gauge],
                        ["Lab · Search", "/app/lab/search", Search],
                      ] as const)
                    : []),
                ].map(([label, href, Icon]) => (
                  <Command.Item
                    key={href as string}
                    value={`go ${label}`}
                    onSelect={() => go(href as string)}
                    className={item}
                  >
                    <Icon />
                    {label as string}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

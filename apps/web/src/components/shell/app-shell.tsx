"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Briefcase,
  ChevronsUpDown,
  FlaskConical,
  Gauge,
  Layers,
  LogOut,
  Menu as MenuIcon,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  UserRound,
  Users,
  Workflow,
  X,
  Database,
  Plug,
} from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/overlays";
import { Kbd } from "@/components/ui/input";
import { cn, initials } from "@/lib/utils";
import { Logo } from "./logo";
import { CommandPalette } from "./command-palette";
import { logout, switchOrg } from "@/app/actions/session";

export interface ShellProps {
  user: { id: string; displayName: string; email: string; title: string; avatarColor: string };
  org: { id: string; name: string };
  roleLabel: string;
  memberships: { orgId: string; orgName: string; roleLabel: string }[];
  caps: string[];
  roles: { id: string; title: string; status: string }[];
  counts: { intros: number; roles: number };
  children: React.ReactNode;
}

export function AppShell({ user, org, roleLabel, memberships, caps, roles, counts, children }: ShellProps) {
  const path = usePathname();
  const [open, setOpen] = React.useState(false);
  // the mobile menu is open for the path it was opened on, so navigating closes it
  const [mobileFor, setMobileFor] = React.useState<string | null>(null);
  const mobile = mobileFor === path;
  const setMobile = (v: boolean) => setMobileFor(v ? path : null);
  const [dark, setDark] = React.useState(
    () => typeof document !== "undefined" && document.documentElement.classList.contains("dark"),
  );
  const canLab = caps.includes("lab.view");

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("trj-theme", next ? "dark" : "light");
    } catch {}
  };

  const nav: {
    section: string;
    items: { label: string; href: string; icon: React.ElementType; badge?: number; match?: RegExp }[];
  }[] = [
    { section: "", items: [{ label: "Dashboard", href: "/app", icon: Gauge, match: /^\/app$/ }] },
    {
      section: "Hiring",
      items: [
        { label: "Roles", href: "/app/roles", icon: Briefcase, badge: counts.roles },
        { label: "Candidates", href: "/app/candidates", icon: Users },
        { label: "Introductions", href: "/app/intros", icon: Workflow, badge: counts.intros || undefined },
      ],
    },
    { section: "Quality", items: [{ label: "Evals", href: "/app/evals", icon: FlaskConical }] },
    ...(canLab
      ? [
          {
            section: "Lab",
            items: [
              { label: "Search lab", href: "/app/lab/search", icon: Search },
              { label: "Ranking & models", href: "/app/lab/ranking", icon: Sparkles },
              { label: "Traces", href: "/app/lab/traces", icon: Activity },
              { label: "Jobs", href: "/app/lab/jobs", icon: Layers },
            ],
          },
        ]
      : []),
    {
      section: "Settings",
      items: [
        { label: "Organization", href: "/app/settings/organization", icon: Settings },
        { label: "Team", href: "/app/settings/team", icon: UserRound },
        { label: "Integrations", href: "/app/settings/integrations", icon: Plug },
      ],
    },
  ];

  const isActive = (href: string, match?: RegExp) =>
    match ? match.test(path) : path === href || path.startsWith(href + "/");

  const sidebar = (
    <nav className="flex h-full flex-col gap-4 px-3 py-3" aria-label="Main">
      <Menu>
        <MenuTrigger className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-subtle">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-ink text-[11px] font-semibold text-bg">
            {initials(org.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-ink">{org.name}</span>
            <span className="block truncate text-[11px] text-muted">{roleLabel}</span>
          </span>
          <ChevronsUpDown className="size-3.5 text-faint" />
        </MenuTrigger>
        <MenuContent align="start" className="w-64">
          <MenuLabel>Organizations</MenuLabel>
          {memberships.map((m) => (
            <MenuItem key={m.orgId} onSelect={() => m.orgId !== org.id && switchOrg(m.orgId)}>
              <span className="grid size-5 place-items-center rounded bg-subtle text-[9px] font-semibold">
                {initials(m.orgName)}
              </span>
              <span className="flex-1">{m.orgName}</span>
              <span className="text-[11px] text-faint">{m.roleLabel}</span>
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded-lg border border-line bg-panel px-2.5 text-[13px] text-muted shadow-panel hover:text-ink"
      >
        <Search className="size-3.5" />
        <span className="flex-1 text-left">Search…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <div className="flex-1 space-y-4 overflow-y-auto">
        {nav.map((g) => (
          <div key={g.section || "top"}>
            {g.section && (
              <div className="mb-1 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                {g.section}
              </div>
            )}
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = isActive(it.href, it.match);
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-8 items-center gap-2.5 rounded-lg px-2 text-[13px] transition",
                        active
                          ? "bg-panel font-medium text-ink shadow-panel ring-1 ring-line"
                          : "text-ink-2 hover:bg-subtle hover:text-ink",
                      )}
                    >
                      <it.icon className={cn("size-4", active ? "text-accent" : "text-muted")} />
                      <span className="flex-1">{it.label}</span>
                      {it.badge ? (
                        <span className="tabular rounded-md bg-subtle px-1.5 text-[11px] text-muted">
                          {it.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-dashed border-line px-2.5 py-2 text-[11px] leading-snug text-muted">
        <div className="mb-0.5 flex items-center gap-1.5 font-medium text-ink-2">
          <Database className="size-3" /> Demo workspace
        </div>
        All people & companies are synthetic. Models run locally — no AI APIs.
      </div>
      <Menu>
        <MenuTrigger className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-subtle">
          <span
            className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
            style={{ background: user.avatarColor }}
          >
            {initials(user.displayName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">{user.displayName}</span>
            <span className="block truncate text-[11px] text-muted">{user.title}</span>
          </span>
        </MenuTrigger>
        <MenuContent align="start" side="top" className="w-56">
          <MenuItem onSelect={toggleTheme}>
            {dark ? <Sun /> : <Moon />} {dark ? "Light mode" : "Dark mode"}
          </MenuItem>
          <MenuItem asChild>
            <Link href="/login">
              <UserRound /> Switch demo persona
            </Link>
          </MenuItem>
          <MenuItem asChild>
            <Link href="/">
              <Sparkles /> Product site
            </Link>
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={() => logout()}>
            <LogOut /> Sign out
          </MenuItem>
        </MenuContent>
      </Menu>
    </nav>
  );

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-panel focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 border-r border-line bg-bg lg:block">
        <div className="flex h-12 items-center px-5">
          <Link href="/app" aria-label="Trajectory home">
            <Logo />
          </Link>
        </div>
        <div className="h-[calc(100dvh-3rem)]">{sidebar}</div>
      </aside>
      {mobile && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobile(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-line bg-bg">
            <div className="flex h-12 items-center justify-between px-5">
              <Logo />
              <button
                onClick={() => setMobile(false)}
                aria-label="Close menu"
                className="rounded-md p-1 hover:bg-subtle"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="h-[calc(100dvh-3rem)]">{sidebar}</div>
          </aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur lg:hidden">
          <button
            onClick={() => setMobile(true)}
            aria-label="Open menu"
            className="rounded-md p-1 hover:bg-subtle"
          >
            <MenuIcon className="size-5" />
          </button>
          <Logo />
          <button
            onClick={() => setOpen(true)}
            className="ml-auto rounded-md p-1 hover:bg-subtle"
            aria-label="Search"
          >
            <Search className="size-4" />
          </button>
        </div>
        <main id="main" className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
      <CommandPalette open={open} setOpen={setOpen} roles={roles} canLab={canLab} />
    </div>
  );
}

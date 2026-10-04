"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, KeyRound, Link2, RotateCcw, Trash2 } from "lucide-react";
import type { MemberRole } from "@trajectory/engine/client";
import { ROLE_LABELS } from "@trajectory/engine/client";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/overlays";
import {
  changeMemberRoleAction,
  createApiKeyAction,
  createInviteAction,
  resetDemoAction,
  revokeApiKeyAction,
  updateOrgAction,
} from "@/app/actions/admin";

export function OrgForm({
  org,
  canManage,
}: {
  org: {
    name: string;
    website: string;
    industry: string;
    description: string;
    hiringManagersCanApproveIntros: boolean;
  };
  canManage: boolean;
}) {
  const router = useRouter();
  const [v, setV] = React.useState(org);
  const save = async () => {
    const r = await updateOrgAction(v);
    if (!r.ok) return toast.error(r.error.message);
    toast.success("Organization updated");
    router.refresh();
  };
  return (
    <div className="grid gap-4 p-4 sm:grid-cols-2">
      <Field label="Name">
        <Input value={v.name} disabled={!canManage} onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label="Website">
        <Input
          value={v.website}
          disabled={!canManage}
          onChange={(e) => setV({ ...v, website: e.target.value })}
        />
      </Field>
      <Field label="Industry">
        <Input
          value={v.industry}
          disabled={!canManage}
          onChange={(e) => setV({ ...v, industry: e.target.value })}
        />
      </Field>
      <Field
        label="Hiring managers can approve intros"
        hint="Spec: approval is configurable for the Hiring Manager role."
      >
        <div className="flex h-8 items-center">
          <Switch
            checked={v.hiringManagersCanApproveIntros}
            disabled={!canManage}
            onCheckedChange={(c) => setV({ ...v, hiringManagersCanApproveIntros: c })}
            aria-label="Hiring managers can approve intros"
          />
        </div>
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <Textarea
          rows={2}
          value={v.description}
          disabled={!canManage}
          onChange={(e) => setV({ ...v, description: e.target.value })}
        />
      </Field>
      <div className="sm:col-span-2">
        <Button variant="primary" onClick={save} disabled={!canManage}>
          {canManage ? "Save changes" : "Only owners and admins can edit"}
        </Button>
      </div>
    </div>
  );
}

export function ResetDemo() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="danger"
      disabled={busy}
      onClick={async () => {
        if (
          !confirm(
            "Rebuild the entire synthetic demo dataset? All changes made in this workspace will be lost.",
          )
        )
          return;
        setBusy(true);
        const r = await resetDemoAction();
        setBusy(false);
        if (!r.ok) return toast.error(r.error.message);
        toast.success("Demo data rebuilt from the deterministic seed");
        router.push("/login");
      }}
    >
      <RotateCcw /> {busy ? "Rebuilding…" : "Reset demo data"}
    </Button>
  );
}

const ASSIGNABLE: MemberRole[] = ["ADMIN", "RECRUITER", "HIRING_MANAGER", "VIEWER"];

export function MemberRoleSelect({
  memberId,
  role,
  disabled,
}: {
  memberId: string;
  role: MemberRole;
  disabled: boolean;
}) {
  const router = useRouter();
  return (
    <Select
      className="h-7 w-auto text-xs"
      value={role}
      disabled={disabled || role === "OWNER" || role === "INTERNAL_OPERATOR"}
      aria-label="Member role"
      onChange={async (e) => {
        const r = await changeMemberRoleAction(memberId, e.target.value as MemberRole);
        if (!r.ok) return toast.error(r.error.message);
        toast.success("Role updated (audited)");
        router.refresh();
      }}
    >
      {[role, ...ASSIGNABLE.filter((x) => x !== role)].map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </Select>
  );
}

export function InviteForm() {
  const router = useRouter();
  const [role, setRole] = React.useState<MemberRole>("RECRUITER");
  const [email, setEmail] = React.useState("");
  const [link, setLink] = React.useState<string | null>(null);
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-[200px] flex-1"
          placeholder="email (optional)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="Invitee email"
        />
        <Select
          className="w-auto"
          value={role}
          onChange={(e) => setRole(e.target.value as MemberRole)}
          aria-label="Invitee role"
        >
          {ASSIGNABLE.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
        <Button
          variant="primary"
          onClick={async () => {
            const r = await createInviteAction(role, email || null);
            if (!r.ok) return toast.error(r.error.message);
            setLink(`${window.location.origin}${r.data.link}`);
            router.refresh();
          }}
        >
          <Link2 /> Create invite link
        </Button>
      </div>
      {link && (
        <div className="flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">
          <span className="truncate font-mono">{link}</span>
          <button
            onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Copied"))}
            aria-label="Copy invite link"
            className="ml-auto shrink-0"
          >
            <Copy className="size-3.5" />
          </button>
        </div>
      )}
      <p className="text-[11px] text-muted">
        MVP invitations are shareable links (7-day expiry, single use). No email is sent.
      </p>
    </div>
  );
}

export function ApiKeyCreator() {
  const router = useRouter();
  const [name, setName] = React.useState("Claude Desktop");
  const [secret, setSecret] = React.useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Key name" />
        <Button
          variant="primary"
          onClick={async () => {
            const r = await createApiKeyAction(name);
            if (!r.ok) return toast.error(r.error.message);
            setSecret(r.data.secret);
            router.refresh();
          }}
        >
          <KeyRound /> Create key
        </Button>
      </div>
      {secret && (
        <div className="rounded-lg border border-warn/30 bg-warn-soft p-3 text-xs text-warn">
          Copy this key now — only its SHA-256 hash is stored.
          <div className="mt-1 flex items-center gap-2 font-mono text-ink">
            {secret}
            <button
              onClick={() => navigator.clipboard.writeText(secret).then(() => toast.success("Copied"))}
              aria-label="Copy key"
            >
              <Copy className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RevokeKey({ id }: { id: string }) {
  const router = useRouter();
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label="Revoke key"
      onClick={async () => {
        const r = await revokeApiKeyAction(id);
        if (!r.ok) return toast.error(r.error.message);
        toast.success("Key revoked");
        router.refresh();
      }}
    >
      <Trash2 />
    </Button>
  );
}

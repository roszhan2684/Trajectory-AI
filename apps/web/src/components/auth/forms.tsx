"use client";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { acceptInvite, signup } from "@/app/actions/session";

export function SignupForm() {
  const [busy, setBusy] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  return (
    <form
      className="space-y-4"
      action={async (fd) => {
        setBusy(true);
        const r = await signup(Object.fromEntries(fd.entries()));
        setBusy(false);
        if (r && !r.ok) {
          setErrors(r.error.fields ?? {});
          toast.error(r.error.message);
        }
      }}
    >
      <Field label="Your name" htmlFor="name" hint={errors.name}>
        <Input id="name" name="name" required autoComplete="name" />
      </Field>
      <Field label="Work email" htmlFor="email" hint={errors.email}>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Organization" htmlFor="orgName" hint={errors.orgName}>
        <Input id="orgName" name="orgName" required placeholder="Acme AI" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Stage" htmlFor="stage">
          <Select id="stage" name="stage" defaultValue="seed">
            {["pre-seed", "seed", "series-a", "series-b", "growth", "public"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="Industry" htmlFor="industry">
          <Input id="industry" name="industry" placeholder="Developer tools" />
        </Field>
      </div>
      <Button variant="primary" size="lg" className="w-full" disabled={busy}>
        {busy ? "Creating workspace…" : "Create workspace"}
      </Button>
      <p className="text-[11px] text-muted">
        Demo identity: no password, signed session cookie. Your workspace shares the synthetic candidate pool.
      </p>
    </form>
  );
}

export function InviteForm({ token }: { token: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <form
      className="space-y-4"
      action={async (fd) => {
        setBusy(true);
        const r = await acceptInvite(token, String(fd.get("name") ?? ""), String(fd.get("email") ?? ""));
        setBusy(false);
        if (r && !r.ok) toast.error(r.error.message);
      }}
    >
      <Field label="Your name" htmlFor="name">
        <Input id="name" name="name" required />
      </Field>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" required />
      </Field>
      <Button variant="primary" size="lg" className="w-full" disabled={busy}>
        Join
      </Button>
    </form>
  );
}

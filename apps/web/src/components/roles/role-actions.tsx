"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Pause, Play, Archive, RefreshCw } from "lucide-react";
import type { RoleStatus } from "@trajectory/engine/client";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/overlays";
import { JobSteps, useJob } from "@/components/domain/job-progress";
import { activateRoleAction, generateMatchesAction, setRoleStatusAction } from "@/app/actions/roles";

export function RoleActions({
  roleId,
  status,
  canEdit,
}: {
  roleId: string;
  status: RoleStatus;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [jobId, setJobId] = React.useState<string | null>(null);
  const job = useJob(jobId, undefined, (j) => {
    if (j.status === "COMPLETED") router.push(`/app/roles/${roleId}/matches`);
  });
  if (!canEdit) return null;
  const run = async (p: Promise<{ ok: true; data: unknown } | { ok: false; error: { message: string } }>) => {
    const r = await p;
    if (!r.ok) return toast.error(r.error.message);
    const jobId = (r.data as { jobId?: string }).jobId;
    if (jobId) setJobId(jobId);
    router.refresh();
  };
  return (
    <>
      {status === "DRAFT" || status === "PAUSED" ? (
        <Button variant="accent" onClick={() => run(activateRoleAction(roleId))}>
          <Play /> {status === "DRAFT" ? "Approve & activate" : "Reactivate"}
        </Button>
      ) : null}
      <Menu>
        <MenuTrigger asChild>
          <Button size="icon" aria-label="More role actions">
            <MoreHorizontal />
          </Button>
        </MenuTrigger>
        <MenuContent>
          {status === "ACTIVE" && (
            <MenuItem onSelect={() => run(generateMatchesAction(roleId))}>
              <RefreshCw /> Re-run matching
            </MenuItem>
          )}
          {status === "ACTIVE" && (
            <MenuItem onSelect={() => run(setRoleStatusAction(roleId, "PAUSED"))}>
              <Pause /> Pause role
            </MenuItem>
          )}
          {status !== "CLOSED" && (
            <MenuItem onSelect={() => run(setRoleStatusAction(roleId, "CLOSED"))}>
              <Archive /> Close role
            </MenuItem>
          )}
        </MenuContent>
      </Menu>
      {job && job.status !== "COMPLETED" && (
        <div className="fixed bottom-4 right-4 z-40 w-80">
          <JobSteps job={job} title="Matching run" className="shadow-float" />
        </div>
      )}
    </>
  );
}

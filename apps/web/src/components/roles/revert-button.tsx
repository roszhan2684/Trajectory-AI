"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revertRefinementAction } from "@/app/actions/matches";

export function RevertButton({ refinementId }: { refinementId: string }) {
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="mt-2 -ml-2"
      onClick={async () => {
        const r = await revertRefinementAction(refinementId);
        if (!r.ok) return toast.error(r.error.message);
        toast.success("Reverted — re-ranking in the background");
        setTimeout(() => router.refresh(), 1500);
      }}
    >
      <Undo2 /> Revert
    </Button>
  );
}

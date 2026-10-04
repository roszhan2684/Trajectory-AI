"use client";
import * as React from "react";
import { Dialog as D, Tabs as T, Tooltip as TT, DropdownMenu as DM, Switch as SW } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- Dialog / Sheet
export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  side,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  side?: "right";
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] data-[state=open]:animate-in" />
      <D.Content
        className={cn(
          "fixed z-50 flex flex-col border border-line bg-panel shadow-float outline-none",
          side === "right"
            ? "inset-y-2 right-2 w-[min(560px,calc(100vw-1rem))] rounded-xl"
            : "left-1/2 top-[12vh] w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <D.Title className="text-sm font-semibold text-ink">{title}</D.Title>
            {description ? (
              <D.Description className="mt-1 text-xs text-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close className="rounded-md p-1 text-muted hover:bg-subtle hover:text-ink" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

// ---------------------------------------------------------------- Tabs
export const Tabs = T.Root;
export function TabsList({ className, ...p }: React.ComponentProps<typeof T.List>) {
  return <T.List className={cn("flex items-center gap-1 border-b border-line", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "relative -mb-px flex h-9 items-center gap-1.5 border-b-2 border-transparent px-2.5 text-[13px] font-medium text-muted transition hover:text-ink data-[state=active]:border-ink data-[state=active]:text-ink [&_svg]:size-3.5",
        className,
      )}
      {...p}
    />
  );
}
export const TabsContent = T.Content;

// ---------------------------------------------------------------- Tooltip
export function Tip({
  content,
  children,
  side = "top",
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TT.Provider delayDuration={200}>
      <TT.Root>
        <TT.Trigger asChild>{children}</TT.Trigger>
        <TT.Portal>
          <TT.Content
            side={side}
            sideOffset={6}
            className="z-50 max-w-xs rounded-lg bg-ink px-2.5 py-1.5 text-[11px] leading-snug text-bg shadow-float"
          >
            {content}
          </TT.Content>
        </TT.Portal>
      </TT.Root>
    </TT.Provider>
  );
}

// ---------------------------------------------------------------- Dropdown
export const Menu = DM.Root;
export const MenuTrigger = DM.Trigger;
export function MenuContent({ className, align = "end", ...p }: React.ComponentProps<typeof DM.Content>) {
  return (
    <DM.Portal>
      <DM.Content
        align={align}
        sideOffset={6}
        className={cn("z-50 min-w-48 rounded-xl border border-line bg-panel p-1 shadow-float", className)}
        {...p}
      />
    </DM.Portal>
  );
}
export function MenuItem({ className, ...p }: React.ComponentProps<typeof DM.Item>) {
  return (
    <DM.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-ink-2 outline-none data-[highlighted]:bg-subtle data-[highlighted]:text-ink [&_svg]:size-4",
        className,
      )}
      {...p}
    />
  );
}
export const MenuLabel = ({ children }: { children: React.ReactNode }) => (
  <DM.Label className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-faint">
    {children}
  </DM.Label>
);
export const MenuSeparator = () => <DM.Separator className="my-1 h-px bg-line" />;

// ---------------------------------------------------------------- Switch
export function Switch({ className, ...p }: React.ComponentProps<typeof SW.Root>) {
  return (
    <SW.Root
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition data-[state=checked]:bg-accent",
        className,
      )}
      {...p}
    >
      <SW.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow transition data-[state=checked]:translate-x-[18px]" />
    </SW.Root>
  );
}

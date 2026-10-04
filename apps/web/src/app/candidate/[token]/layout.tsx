import Link from "next/link";
import { Logo } from "@/components/shell/logo";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-panel/70 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-5">
          <Link href="/">
            <Logo />
          </Link>
          <span className="rounded-md border border-dashed border-line px-2 py-0.5 text-[11px] text-muted">
            Candidate portal · synthetic demo
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-5 py-8">{children}</main>
      <footer className="mx-auto max-w-2xl px-5 pb-10 text-[11px] leading-relaxed text-faint">
        This private link is signed and expires. Your answers are stored as evidence from you and only change
        your match through that data. We never use age, gender, race, religion or other protected
        characteristics in matching.
      </footer>
    </div>
  );
}

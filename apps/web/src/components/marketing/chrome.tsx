import Link from "next/link";
import { Logo } from "@/components/shell/logo";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#08090b]/75 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="text-white" aria-label="Trajectory home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-7 text-[13px] text-white/60 md:flex" aria-label="Site">
          <Link href="/product" className="hover:text-white">
            Product
          </Link>
          <Link href="/#film" className="hover:text-white">
            Film
          </Link>
          <Link href="/#engineering" className="hover:text-white">
            Engineering
          </Link>
          <Link href="/security" className="hover:text-white">
            Security & fairness
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden h-8 items-center rounded-lg px-3 text-[13px] text-white/70 hover:text-white sm:flex"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="flex h-8 items-center rounded-lg bg-white px-3.5 text-[13px] font-medium text-[#08090b] transition hover:bg-white/90"
          >
            Open live demo
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/[0.06]">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 text-[13px] text-white/50 sm:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo className="text-white" />
          <p className="mt-3 max-w-xs leading-relaxed">
            Evidence-backed, explainable talent matching. A portfolio build — all people and companies in the
            demo are synthetic.
          </p>
        </div>
        <div className="space-y-2">
          <div className="text-white/80">Product</div>
          <Link href="/product" className="block hover:text-white">
            How it works
          </Link>
          <Link href="/login" className="block hover:text-white">
            Live demo
          </Link>
          <Link href="/signup" className="block hover:text-white">
            Create a workspace
          </Link>
        </div>
        <div className="space-y-2">
          <div className="text-white/80">Trust</div>
          <Link href="/security" className="block hover:text-white">
            Security & fairness
          </Link>
          <Link href="/security#ai" className="block hover:text-white">
            AI safety
          </Link>
        </div>
        <div className="space-y-2">
          <div className="text-white/80">Honest notes</div>
          <p className="leading-relaxed">
            No customers, no traction claims. Every metric shown is computed from labeled or public data.
          </p>
        </div>
      </div>
    </footer>
  );
}

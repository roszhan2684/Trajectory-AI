import Link from "next/link";
import { Logo } from "@/components/shell/logo";
import { SignupForm } from "@/components/auth/forms";

export const metadata = { title: "Create workspace" };

export default function SignupPage() {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-6 py-10">
      <div className="w-full max-w-sm">
        <Link href="/">
          <Logo />
        </Link>
        <h1 className="mt-8 text-2xl font-semibold tracking-tight text-ink">Create a workspace</h1>
        <p className="mt-1 text-[13px] text-muted">
          Your first role takes about a minute: paste a brief, review, approve.
        </p>
        <div className="mt-6 rounded-2xl border border-line bg-panel p-5 shadow-panel">
          <SignupForm />
        </div>
        <p className="mt-4 text-center text-[13px] text-muted">
          Just exploring?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Use a demo persona
          </Link>
        </p>
      </div>
    </div>
  );
}

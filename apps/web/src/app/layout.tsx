import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Instrument_Serif } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
});

export const metadata: Metadata = {
  title: { default: "Trajectory — evidence-backed talent matching", template: "%s · Trajectory" },
  description:
    "Find the person who fits where you're going — not just where they've been. Explainable, evidence-backed matching for startup hiring.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#0b0c0e" }, { color: "#f7f7f5" }],
};

const themeScript = `try{var t=localStorage.getItem('trj-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches&&location.pathname.startsWith('/app')))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${serif.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{ className: "!bg-panel !text-ink !border-line !shadow-float" }}
        />
      </body>
    </html>
  );
}

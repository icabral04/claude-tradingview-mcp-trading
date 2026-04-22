import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BTC Options — Lee Lowell",
  description: "BTC options screening via Deribit + TradingView signals",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const isPaper = process.env.PAPER_TRADING !== "false";

  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <header className="sticky top-0 z-40 border-b border-[var(--color-border)]/60 backdrop-blur-xl bg-[var(--color-bg)]/70">
          <nav className="max-w-screen-2xl mx-auto flex items-center gap-8 px-6 h-14 text-sm">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="relative inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-violet-400 to-violet-600 shadow-[0_0_16px_rgba(139,92,246,0.5)]">
                <span className="text-[10px] font-bold text-white tracking-tight">₿</span>
              </span>
              <span className="font-semibold tracking-tight text-[var(--color-text)]">
                BTC <span className="text-[var(--color-accent)]">Options</span>
              </span>
            </Link>

            <div className="flex items-center gap-1">
              <NavLink href="/">Dashboard</NavLink>
              <NavLink href="/positions">Posições</NavLink>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <span
                className={`chip ${isPaper ? "chip-warning" : "chip-success"}`}
                title={isPaper ? "Paper trading (simulação)" : "Live trading"}
              >
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full ${isPaper ? "bg-[var(--color-warning)]" : "bg-[var(--color-success)] animate-pulse"}`}
                />
                {isPaper ? "PAPER" : "LIVE"}
              </span>
            </div>
          </nav>
        </header>

        <main className="max-w-screen-2xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)] transition-colors text-sm font-medium"
    >
      {children}
    </Link>
  );
}

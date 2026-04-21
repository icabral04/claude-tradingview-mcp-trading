import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "BTC Options — Lee Lowell",
  description: "BTC options screening via Deribit + TradingView signals",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen" style={{ background: "var(--background)" }}>
        <nav
          className="flex items-center gap-6 px-6 py-3 border-b text-sm"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <span className="font-bold tracking-widest" style={{ color: "var(--purple)" }}>
            BTC OPTIONS
          </span>
          <Link href="/" className="hover:text-white transition-colors" style={{ color: "var(--text-muted)" }}>
            Dashboard
          </Link>
          <Link href="/positions" className="hover:text-white transition-colors" style={{ color: "var(--text-muted)" }}>
            Posições
          </Link>
          <div className="ml-auto flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: process.env.PAPER_TRADING !== "false" ? "var(--yellow)" : "var(--green)" }}
            />
            {process.env.PAPER_TRADING !== "false" ? "PAPER" : "LIVE"}
          </div>
        </nav>
        <main className="px-6 py-6">{children}</main>
      </body>
    </html>
  );
}

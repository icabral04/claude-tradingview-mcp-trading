# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo actually is

The `README.md` still describes the **upstream project** (a BitGet/TradingView-MCP trading bot) and is no longer accurate. The repo was rewritten into a different product:

- `package.json` → `deribit-options-trader` — a Next.js 16 app (React 19, TS 5 strict, Tailwind 4)
- Target exchange: **Deribit** (not BitGet)
- Strategy: **Lee Lowell "sell premium"** on BTC options (delta 0.15–0.25, IV ≥ 60, DTE 21–45, 50% profit target)
- The upstream legacy (`bot.js`, `railway.json`, `trades.csv`, `docs/`, `prompts/`) has already been removed — only `README.md` itself still reflects the old project and should not be trusted for setup.

## Commands

Package manager is **npm** (only `package-lock.json` exists — no pnpm lockfile despite the global preference).

```bash
npm install
npm run dev          # next dev
npm run build        # next build — must pass before shipping
npm start            # next start (prod)
npm run lint         # next lint (eslint-config-next)
npm run type-check   # tsc --noEmit
```

There is **no test suite**. Do not claim tests pass — say so explicitly.

## Required env vars

```
DERIBIT_CLIENT_ID
DERIBIT_CLIENT_SECRET
WEBHOOK_SECRET         # opcional; se setado, exigido no POST /api/webhook
PAPER_TRADING          # default tratado como "true" — ver invariante abaixo
```

## Architecture

### Data flow

```
TradingView alert ──POST /api/webhook──► signal-store.json (file on disk)
                                               │
                                               ▼
Browser ──GET /api/screening?bias=...──► runLeeLowell() ──► Deribit public API
                                               │                  (instruments, ticker, margins)
                                               ▼
                                         Top 20 options, scored
                                               │
Browser ──POST /api/orders──► sellOption() ──► Deribit private (or paper stub)
```

### Module map (`src/`)

- `app/` — Next.js App Router. Two pages: `/` (dashboard + screening) and `/positions` (open positions, auto-polled every 15s).
- `app/api/` — thin route handlers that delegate to `lib/`:
  - `webhook` — receives TradingView alerts, validates `secret` against `WEBHOOK_SECRET`, persists via `saveSignal`.
  - `signal` — reads current signal + last 10 history entries.
  - `screening` — runs Lee Lowell screener; reads `rules.json` via JSON import assert; takes optional `?bias=bullish|bearish|neutral` override; falls back to the stored signal, then to `neutral`.
  - `orders` / `orders/close` — `sellOption` / `closePosition` on Deribit (or paper stub).
  - `account`, `positions`, `dvol`, `btc-bias`, `options-metrics`, `tv-analysis` — read-only context feeds for the UI cards.
- `lib/deribit/client.ts` — single source of truth for Deribit HTTP calls. Uses `client_credentials` OAuth, caches the access token in-memory with a 30s expiry buffer. Also computes SMA5/20/50, RSI14, ATR14 from `get_tradingview_chart_data` and IV rank/percentile from `get_volatility_index_data`.
- `lib/screening/lee-lowell.ts` — candidate filter + scoring. Score = `0.4·deltaCenterDist + 0.4·ivScore + 0.2·dteScore` (target centre 30 DTE). Top 20 are enriched with real `get_margins` so `roi_real = (premium/margin) · 365/dte · 100` is annualized ROI on collateral.
- `lib/metrics/options-metrics.ts` — aggregate book metrics (PCR, per-expiry ATM IV, max pain, top strikes by OI). Parses expiry from the instrument name (`BTC-26DEC25-100000-C`) as a fallback — Deribit options expire at 08:00 UTC, and that magic number lives here.
- `lib/signal-store.ts` — writes `signal-store.json` at `process.cwd()`. Flat file, not a DB. **This means the app is single-instance**: horizontal scaling breaks the signal store.

### Key invariants (do not break silently)

- **Paper trading default is fail-safe.** `client.ts` and `orders` treat `PAPER_TRADING !== "false"` as paper mode, so *missing env var* = paper. To go live, set exactly `PAPER_TRADING=false`. When in paper mode, `sellOption` / `closePosition` / `getAccountSummary` return stub values — never hit Deribit private endpoints.
- **Token cache is process-local.** `cachedToken` in `lib/deribit/client.ts` is a module-scope variable. Serverless cold starts will re-auth; that's expected.
- **`rules.json` is imported via JSON assert** in `app/api/screening/route.ts` (`import rulesJson from "../../../../rules.json" assert { type: "json" }`). Cast is to `ScreeningConfig` — if you add fields to `rules.json`, update `lib/screening/types.ts` too or the cast will silently lose them.
- **Screening throttle.** Only the first 80 instruments are sent to `get_ticker` in parallel (`candidates.slice(0, 80)`). Increasing this hits Deribit rate limits.
- **Signal-store.json is gitignored** (alongside `.env`, `.env.local`). Don't commit local state.

### UI

Tailwind 4 via `@tailwindcss/postcss`. Design tokens (`--color-*`) live in `src/app/globals.css` — components reference CSS variables, not Tailwind theme colors, so adding a new accent means editing `globals.css`. Dark UI, no theme toggle. Portuguese copy throughout.

## Language / style

- User-visible strings (labels, error messages): **Portuguese (pt-BR)**.
- Code identifiers and type names: **English**.
- TS strict is enabled — no `any` without justification.

## graphify

`graphify-out/` contains only the AST cache (no `GRAPH_REPORT.md` or `wiki/` yet) — there is nothing to read before answering architecture questions. If you materially change code, run `graphify update .` from the repo root to refresh the cache (AST-only, no API cost).

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`deribit-options-trader` — a Next.js 16 app (React 19, TS 5 strict, Tailwind 4) that screens **6 strategies de venda de prêmio** em opções BTC na Deribit:

| Strategy ID | Pernas | Viés | Risco |
|---|---|---|---|
| `sell-put` | 1 | bullish | unlimited (downside) |
| `sell-call` | 1 | bearish | unlimited (upside) |
| `bull-put-spread` | 2 | bullish | limited |
| `bear-call-spread` | 2 | bearish | limited |
| `short-strangle` | 2 | neutral | unlimited (bilateral) |
| `iron-condor` | 4 | neutral | limited |

The README.md was rewritten to match the product. The upstream BitGet/`bot.js` legacy was removed.

## Commands

Package manager is **npm** (only `package-lock.json` exists — no pnpm lockfile despite the global preference).

```bash
npm install
npm run dev          # next dev (Turbopack)
npm run build        # next build — must pass before shipping
npm start            # next start (prod)
npm run type-check   # tsc --noEmit
```

`npm run lint` is broken — `next lint` was removed in Next 16 and the script needs migration to ESLint direto. Não foi consertado.

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
Browser ──GET /api/screening?strategy=...──► registry.runStrategy(id, cfg)
                                               │
                                               ▼
                                         loadBook() ──► Deribit public
                                         (cache 30s, mark fallback)
                                               │
                                               ▼
                                  Top N ScreenedTrades, scored
                                               │
Browser ──POST /api/orders──► placeMultiLeg([..]) ──► Deribit private (or paper stub)
        ou {legs:[..]}            (sequencial, label comum)
```

### Module map (`src/`)

- `app/` — Next.js App Router. Páginas `/` (dashboard com seleção de estratégia) e `/positions` (posições abertas, auto-poll 15s).
- `app/api/` — route handlers finos:
  - `webhook` — alertas TradingView, valida `secret` contra `WEBHOOK_SECRET`.
  - `signal` — sinal atual + últimos 10.
  - `screening` — aceita `?strategy=<id>` ou `?bias=bullish|bearish|neutral` (mapeia para sell-put / sell-call / iron-condor). Mescla `DEFAULT_CONFIGS` com `rules.json`.
  - `orders` — aceita single-leg `{instrument_name,amount,...}` OU multi-leg `{legs:[...], type, label}`.
  - `orders/close` — `closePosition`.
  - `account`, `positions`, `dvol`, `btc-bias`, `options-metrics`, `tv-analysis` — feeds read-only para os cards.
- `lib/deribit/client.ts` — único ponto de acesso à Deribit. OAuth `client_credentials`, cache de token in-memory com buffer de 30s. `placeMultiLeg(legs[])` envia N ordens **sequenciais** com label comum (não-atômico, ver invariante abaixo). Calcula SMA/RSI/ATR de `get_tradingview_chart_data` e IV rank/percentile de `get_volatility_index_data`.
- `lib/strategies/` — núcleo do produto:
  - `types.ts` — `StrategyId`, `Leg`, `ScreenedTrade`, `StrategyConfig`, `StrategyMeta`.
  - `math.ts` — `creditBtc`, `breakevenUsd`, `maxLossUsd`, `popFromLegs`, `marginEstimateBtc`, `roiAnnualPct`, `scoreTrade`. Score = `0.4·roiScore + 0.4·pop + 0.2·deltaCenterDist`.
  - `book.ts` — `loadBook(dteMin,dteMax)` busca instruments + tickers em batch (25 por vez), cacheia 30s (process-local), fallback `bid → mark` quando bid = 0. `quoteToLeg()` converte ticker em `Leg`.
  - `single/sell-put.ts`, `single/sell-call.ts` — naked.
  - `spreads/build.ts` — gera credit spreads casando short + long no mesmo expiry, respeitando `spread_width_min/max_usd`. Usado por `bull-put.ts` e `bear-call.ts`.
  - `neutral/short-strangle.ts`, `neutral/iron-condor.ts` — combina puts e calls do mesmo expiry.
  - `registry.ts` — `STRATEGIES` (metadata), `DEFAULT_CONFIGS` (perfis), `runStrategy(id,cfg)` dispatch.
- `lib/metrics/options-metrics.ts` — métricas agregadas do book (PCR, max pain, ATM IV por expiry). Parser de expiry do instrument name assume settlement 08:00 UTC.
- `lib/signal-store.ts` — grava `signal-store.json` em `process.cwd()`. **App é single-instance**: escalar horizontalmente quebra o signal store.

### Key invariants (do not break silently)

- **Paper trading default is fail-safe.** `placeMultiLeg`, `sellOption`, `closePosition`, `getAccountSummary` tratam `PAPER_TRADING !== "false"` como paper. Variável vazia, ausente ou qualquer outro valor = simulação. Para mercado real, exatamente `PAPER_TRADING=false`.
- **Multi-leg não é atômico.** `placeMultiLeg` dispara ordens sequenciais com label comum. Se a perna 2 falhar, a perna 1 já está no book — caller precisa reverter manualmente. Para combos atômicos seria preciso usar Deribit `combo_book`, fora do escopo atual.
- **Cache do book é process-local e mutável.** `lib/strategies/book.ts` mantém `CACHE` em variável de módulo, TTL 30s. Em serverless cada cold start recarrega. Use `invalidateBookCache()` antes de operar se quiser dados frescos.
- **`rules.json` (v2) tem perfis por estratégia.** Esquema é `{ strategies: { [StrategyId]: Partial<StrategyConfig> } }`. A API mescla com `DEFAULT_CONFIGS` em `registry.ts`. Adicionar novo campo em `StrategyConfig` requer também atualizar `DEFAULT_CONFIGS`.
- **Token Deribit cacheado em processo.** `cachedToken` em `lib/deribit/client.ts` re-autentica em cold start.
- **Margem para spreads é estimada.** `marginEstimateBtc` usa `max_loss_usd / spot` para spreads/IC e `strike·0.5/spot` para naked. A margem real da Deribit pode ser menor por reconhecimento de risco-off — refinar via `get_margins` quando precisar de números reais para sizing.
- **`signal-store.json` é gitignored** (junto com `.env`, `.env.local`). Não commitar estado local.

### UI

Tailwind 4 via `@tailwindcss/postcss`. Design tokens (`--color-*`) em `src/app/globals.css` — componentes referenciam CSS variables, não classes de tema. Dark UI, sem theme toggle. Copy em pt-BR. Componente principal: `src/components/StrategiesTable.tsx` renderiza pernas como badges coloridos (PUT vermelho, CALL azul, sinal +/− pelo direction).

## Language / style

- User-visible strings: **pt-BR**.
- Code identifiers e type names: **inglês**.
- TS strict ativado — sem `any` injustificado.

## graphify

`graphify-out/` contém apenas o cache AST (sem `GRAPH_REPORT.md` ou `wiki/`). Após mudanças materiais, rodar `graphify update .` para atualizar o cache (AST-only, sem custo de API).

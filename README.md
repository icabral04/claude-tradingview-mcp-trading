# BTC Options — Premium Selling Suite

Painel Next.js para **venda de prêmio em opções de BTC na Deribit**, com 6 estratégias prontas: 2 single-leg, 2 credit spreads e 2 estruturas neutras (strangle e iron condor).

- Screener por estratégia — cada uma com perfil de risco, viés e regime ideal próprios
- Contexto de mercado (regime, IV rank, PCR, max pain, viés multi-TF) via Deribit + TradingView
- Sinais direcionais via webhook do TradingView (`/api/webhook`)
- Execução single-leg e multi-leg na Deribit, com modo `PAPER_TRADING` ligado por padrão
- Métricas por trade: crédito líquido (BTC + USD), max loss, breakeven(s), POP, R:R, ROI anualizado sobre margem

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript 5 strict
- Tailwind 4 (`@tailwindcss/postcss`)
- Deribit API v2 (OAuth `client_credentials`, sem dependência externa)

## Estratégias

| ID | Pernas | Viés | Risco | Regime ideal |
|---|---|---|---|---|
| `sell-put` | 1 | bullish | Ilimitado downside | IV alto |
| `sell-call` | 1 | bearish | Infinito upside | IV alto |
| `bull-put-spread` | 2 | bullish | **Limitado** | qualquer |
| `bear-call-spread` | 2 | bearish | **Limitado** | qualquer |
| `short-strangle` | 2 | neutral | Ilimitado bilateral | range + IV alto |
| `iron-condor` | 4 | neutral | **Limitado** | range, qualquer IV |

Cada estratégia tem perfil de filtros em `rules.json` (delta short/long, DTE, IV mínimo, OI, largura de spread).

## Setup

Pré-requisitos: Node.js 20+ e API key da Deribit com permissões `read` + `trade`.

```bash
cp .env.example .env.local
npm install
npm run dev
```

http://localhost:3000

### Variáveis de ambiente

| Var | Obrigatória | Descrição |
|---|---|---|
| `DERIBIT_CLIENT_ID` | sim | API key da Deribit |
| `DERIBIT_CLIENT_SECRET` | sim | Secret da API key |
| `WEBHOOK_SECRET` | não | Se setada, exigida no campo `secret` do payload em `POST /api/webhook` |
| `PAPER_TRADING` | não | `"false"` para enviar ordens reais. Qualquer outro valor (ou ausente) = simulação |

> **Segurança:** o modo paper é fail-safe. Para ir a mercado real você precisa explicitamente setar `PAPER_TRADING=false` — variável vazia, ausente ou com qualquer outro valor mantém o app simulando.

## Scripts

```bash
npm run dev          # next dev
npm run build        # next build
npm start            # next start
npm run type-check   # tsc --noEmit
```

`npm run lint` está quebrado (`next lint` foi removido no Next 16). Não há suíte de testes.

## API

```
GET /api/screening?strategy=<id>          # roda uma estratégia específica
GET /api/screening?bias=bullish|bearish   # mapeia bias→sell-put/sell-call/iron-condor
GET /api/screening                        # usa o último signal salvo, fallback sell-put
GET /api/account /api/positions /api/dvol /api/btc-bias /api/options-metrics /api/tv-analysis
POST /api/orders                          # single-leg OU multi-leg (ver abaixo)
POST /api/orders/close                    # fechar posição
POST /api/webhook                         # alerta TradingView
GET  /api/signal                          # último signal + histórico
```

### Ordem multi-leg (combo)

```json
POST /api/orders
{
  "type": "limit",
  "label": "iron-condor-1761123456",
  "legs": [
    {"instrument_name":"BTC-29MAY26-72000-P","direction":"sell","amount":1,"price":0.0094},
    {"instrument_name":"BTC-29MAY26-68000-P","direction":"buy", "amount":1,"price":0.0040},
    {"instrument_name":"BTC-29MAY26-85000-C","direction":"sell","amount":1,"price":0.0069},
    {"instrument_name":"BTC-29MAY26-90000-C","direction":"buy", "amount":1,"price":0.0018}
  ]
}
```

> O envio é **sequencial** (não-atômico). Se a perna N falhar, as anteriores já estão no book — o caller é responsável por reverter manualmente.

### Ordem single-leg

```json
POST /api/orders
{ "instrument_name":"BTC-29MAY26-70000-P", "amount":1, "type":"limit", "price":0.0168, "label":"sell-put" }
```

## Regras (`rules.json`)

Esquema v2 com perfis por estratégia. Mesclado com `DEFAULT_CONFIGS` em `src/lib/strategies/registry.ts`. Exemplo do bloco `bull-put-spread`:

```json
{
  "short_delta_min": 0.20,
  "short_delta_max": 0.35,
  "long_delta_min": 0.05,
  "long_delta_max": 0.15,
  "dte_min": 7,
  "dte_max": 45,
  "iv_min": 25,
  "min_open_interest": 10,
  "min_short_price": 0,
  "spread_width_min_usd": 1000,
  "spread_width_max_usd": 5000,
  "top_n": 20
}
```

## Webhook do TradingView

Alerta com mensagem JSON:

```json
{
  "secret": "{{WEBHOOK_SECRET}}",
  "bias": "bullish",
  "ticker": "{{ticker}}",
  "timeframe": "{{interval}}",
  "price": {{close}},
  "indicators": { "rsi": {{plot_0}} }
}
```

URL: `POST https://<seu-host>/api/webhook`. O sinal mais recente vira o default do `/api/screening` quando você não passa `?strategy=`.

## Estrutura

```
src/
├── app/
│   ├── page.tsx                   # Dashboard com seleção de estratégia
│   ├── positions/page.tsx         # Posições abertas (auto-poll 15s)
│   └── api/                       # Route handlers (screening, orders, webhook, ...)
├── components/
│   ├── StrategiesTable.tsx        # Tabela adaptativa (1/2/4 pernas)
│   ├── OptionsContextCard.tsx     # Regime, viés multi-TF
│   ├── OptionsMetricsCard.tsx     # PCR, max pain, ATM IV
│   ├── AccountSummary.tsx
│   └── PositionsTable.tsx
└── lib/
    ├── deribit/
    │   ├── client.ts              # OAuth, public + private, placeMultiLeg
    │   └── types.ts
    ├── strategies/
    │   ├── types.ts               # ScreenedTrade, Leg, StrategyConfig
    │   ├── math.ts                # crédito, max loss, breakeven, POP, ROI, score
    │   ├── book.ts                # cache 30s + fallback bid→mark
    │   ├── registry.ts            # STRATEGIES, DEFAULT_CONFIGS, runStrategy()
    │   ├── single/                # sell-put, sell-call
    │   ├── spreads/               # bull-put, bear-call (build.ts compartilhado)
    │   └── neutral/               # short-strangle, iron-condor
    ├── metrics/options-metrics.ts # PCR, max pain, ATM IV
    └── signal-store.ts            # Persistência em JSON
```

## Notas operacionais

- **Cache de book em memória** (30s) reduz chamadas à Deribit ao alternar entre estratégias no dashboard. Process-local — em serverless cada cold start recarrega.
- **Fallback bid → mark**: quando o bid está zerado (comum em vencimentos longos com vol baixa), o screener usa `mark_price`. A tabela marca essas linhas com `⚠ mark` para aviso visual — execução real pode ter slippage.
- **Margem para spreads é estimativa** (`max_loss_usd / spot`). A Deribit cobra menos por reconhecimento de risco-off — para sizing real, validar via `get_margins` antes da operação.
- **Multi-leg não é atômico** — ver seção da API acima.
- **`signal-store.json` em disco** torna o app single-instance. Para escalar, trocar por Redis/Postgres.

## Licença

Sem licença declarada — uso interno.

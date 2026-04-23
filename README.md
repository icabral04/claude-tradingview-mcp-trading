# BTC Options — Lee Lowell

Painel Next.js para venda de prêmio em opções de BTC na **Deribit**, seguindo a metodologia Lee Lowell (delta baixo, IV alto, DTE médio).

- Screening contínuo do book Deribit por delta, IV, DTE, OI e bid mínimo
- Contexto de mercado (regime, viés multi-timeframe, IV rank, PCR, max pain) via Deribit + TradingView
- Sinais direcionais via webhook do TradingView gravados em `signal-store.json`
- Envio e fechamento de ordens na Deribit, com modo `PAPER_TRADING` ligado por padrão

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript 5 strict
- Tailwind 4 (`@tailwindcss/postcss`)
- Deribit API v2 (OAuth `client_credentials`, sem dependência externa)

## Setup

Pré-requisitos: Node.js 20+ e uma API key da Deribit com permissões `read` + `trade` (sem `withdraw`).

```bash
cp .env.example .env.local
npm install
npm run dev
```

Abra http://localhost:3000.

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
npm run lint         # next lint
npm run type-check   # tsc --noEmit
```

Não há suíte de testes automatizada.

## Estratégia

Configuração em [`rules.json`](./rules.json):

| Filtro | Default |
|---|---|
| IV mínimo | 60 |
| Delta | 0.15 – 0.25 |
| DTE | 21 – 45 dias |
| Profit target | 50% do prêmio |
| Open interest mínimo | 10 |
| Bid mínimo (BTC) | 0.0005 |

O viés do TradingView decide o tipo de opção:

- **Bullish** → vende puts (`sell_put`)
- **Bearish** → vende calls (`sell_call`)
- **Neutral** → ambos (`iron_condor`)

O score combina proximidade do delta ao centro do range (40%), IV normalizado (40%) e proximidade dos 30 DTE (20%). As 20 melhores são enriquecidas com `get_margins` da Deribit para calcular ROI anualizado real sobre o colateral.

## Webhook do TradingView

Configure um alerta com mensagem JSON:

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

URL: `POST https://<seu-host>/api/webhook`. O sinal mais recente passa a alimentar `/api/screening` automaticamente — pode ser sobrescrito via query `?bias=bullish|bearish|neutral`.

## Estrutura

```
src/
├── app/
│   ├── page.tsx                  # Dashboard: contexto + screening
│   ├── positions/page.tsx        # Posições abertas (auto-poll 15s)
│   └── api/
│       ├── webhook/              # Recebe alertas do TradingView
│       ├── signal/               # Lê sinal atual + histórico
│       ├── screening/            # Roda Lee Lowell sobre o book
│       ├── orders/               # Envia ordens (sell)
│       ├── orders/close/         # Fecha posição
│       ├── account/              # Resumo de conta
│       ├── positions/            # Posições abertas
│       ├── dvol/                 # IV rank/percentile (DVOL)
│       ├── btc-bias/             # SMA/RSI/ATR + bias 4h via TV
│       ├── options-metrics/      # PCR, max pain, ATM IV
│       └── tv-analysis/          # Regime + biases multi-TF via TV
├── components/                   # Cards e tabelas (Tailwind 4)
└── lib/
    ├── deribit/client.ts         # Cliente Deribit (token cache 30s)
    ├── screening/lee-lowell.ts   # Filtro + score + enriquecimento
    ├── metrics/options-metrics.ts # Métricas agregadas do book
    └── signal-store.ts           # Persistência em arquivo JSON
```

## Notas operacionais

- `signal-store.json` é gravado em disco (`process.cwd()`), o que torna o app **single-instance**. Para escalar, troque por Redis/Postgres antes de subir múltiplas réplicas.
- O cliente Deribit faz cache do `access_token` em memória de processo com buffer de 30s — cold starts em serverless re-autenticam, é esperado.
- O screener envia no máximo 80 instrumentos em paralelo para `get_ticker` para não estourar o rate limit da Deribit.
- Datas de expiração são interpretadas em **08:00 UTC** (horário de settlement da Deribit).

## Licença

Sem licença declarada — uso interno.

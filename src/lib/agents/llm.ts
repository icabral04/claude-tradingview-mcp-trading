import type { HorizonReport } from "./run";

/**
 * Resumo de contexto de mercado passado pro LLM.
 * Nunca é obrigatório — se faltar alguma parte, LLM ainda consegue opinar sobre os picks.
 */
export interface MarketContext {
  btc_price: number | null;
  funding_rate_8h_pct: number | null;
  dxy?: { price: number; change_pct: number } | null;
  us10y?: { yield_pct: number; change_pct: number } | null;
  etf_last_flow_musd: number | null;
  iv_atm_front: number | null;
  iv_atm_back: number | null;
  contango_pp: number | null;
  skew_25d_front_pp: number | null;
  put_wall: { strike: number; oi: number } | null;
  call_wall: { strike: number; oi: number } | null;
  max_pain_front: number | null;
}

export interface LlmExplanation {
  bullets: string[];
  go_no_go: "go" | "neutral" | "wait";
  one_liner: string;
  model: string;
  raw?: string;
}

const SYSTEM_PROMPT = `Você é um analista sênior de opções BTC na Deribit.
Seu trabalho: avaliar picks de venda de prêmio (sell-put naked e bull-put-spread) cruzando:
- Macro: funding, DXY, US10Y, fluxo ETF
- Estrutura de vol: IV ATM, contango, skew 25Δ
- Open Interest: put wall (suporte), call wall (resistência), max pain
- Métricas do próprio trade: ROI anualizado, POP, delta, DTE

Responda SEMPRE em JSON estrito com o schema:
{
  "go_no_go": "go" | "neutral" | "wait",
  "one_liner": string (máx 120 chars, direto ao ponto),
  "bullets": string[] (3 a 5 bullets acionáveis, cada um < 180 chars, em pt-BR)
}

Sem markdown fora do JSON. Sem prefixos tipo "resposta:". Apenas o JSON.`;

function formatPicks(report: HorizonReport): string {
  if (report.picks.length === 0) return "Nenhum pick elegível.";
  return report.picks
    .map((p, i) => {
      const short = p.legs.find((l) => l.direction === "sell");
      const long = p.legs.find((l) => l.direction === "buy");
      const kind = p.strategy === "sell-put" ? "SELL-PUT" : "BULL-PUT-SPREAD";
      const strikePart = long
        ? `${short?.strike}/${long.strike}`
        : `${short?.strike}`;
      return [
        `#${i + 1} ${kind} ${strikePart} · DTE ${p.dte}d`,
        `   IV short ${short?.mark_iv?.toFixed(0) ?? "—"}% · Δ short ${short ? Math.abs(short.delta).toFixed(2) : "—"}`,
        `   crédito $${p.credit_usd} · max loss ${p.max_loss_usd === null ? "∞ (naked)" : `$${p.max_loss_usd}`}`,
        `   ROI a.a. ${p.roi_annual_pct?.toFixed(0) ?? "—"}% · POP ${(p.pop * 100).toFixed(0)}% · score ${p.horizon_score}`,
        p.warnings.length > 0 ? `   ⚠ ${p.warnings.join(" · ")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

function formatContext(ctx: MarketContext): string {
  const lines: string[] = [];
  if (ctx.btc_price !== null) lines.push(`BTC spot: $${ctx.btc_price.toLocaleString()}`);
  if (ctx.funding_rate_8h_pct !== null) {
    const anual = ctx.funding_rate_8h_pct * 3 * 365;
    lines.push(`Funding 8h: ${ctx.funding_rate_8h_pct.toFixed(4)}% (anual ${anual.toFixed(1)}%)`);
  }
  if (ctx.dxy) lines.push(`DXY: ${ctx.dxy.price.toFixed(2)} (${ctx.dxy.change_pct >= 0 ? "+" : ""}${ctx.dxy.change_pct.toFixed(2)}%)`);
  if (ctx.us10y) lines.push(`US10Y: ${ctx.us10y.yield_pct.toFixed(2)}% (${ctx.us10y.change_pct >= 0 ? "+" : ""}${ctx.us10y.change_pct.toFixed(2)}%)`);
  if (ctx.etf_last_flow_musd !== null) lines.push(`ETF BTC flow último dia: ${ctx.etf_last_flow_musd >= 0 ? "+" : ""}$${ctx.etf_last_flow_musd}M`);
  if (ctx.iv_atm_front !== null) lines.push(`IV ATM front: ${ctx.iv_atm_front.toFixed(1)}%`);
  if (ctx.iv_atm_back !== null) lines.push(`IV ATM back: ${ctx.iv_atm_back.toFixed(1)}%`);
  if (ctx.contango_pp !== null) {
    const word = ctx.contango_pp >= 0 ? "contango" : "backwardation";
    lines.push(`Term structure: ${word} ${Math.abs(ctx.contango_pp).toFixed(1)}pp`);
  }
  if (ctx.skew_25d_front_pp !== null) lines.push(`Skew 25Δ front: ${ctx.skew_25d_front_pp >= 0 ? "+" : ""}${ctx.skew_25d_front_pp.toFixed(1)}pp`);
  if (ctx.put_wall) lines.push(`PUT wall: $${ctx.put_wall.strike} (OI ${ctx.put_wall.oi.toFixed(0)})`);
  if (ctx.call_wall) lines.push(`CALL wall: $${ctx.call_wall.strike} (OI ${ctx.call_wall.oi.toFixed(0)})`);
  if (ctx.max_pain_front !== null) lines.push(`Max pain front: $${ctx.max_pain_front}`);
  return lines.length ? lines.join("\n") : "(contexto macro indisponível)";
}

function parseLlmJson(raw: string): { bullets: string[]; go_no_go: "go" | "neutral" | "wait"; one_liner: string } | null {
  let txt = raw.trim();
  const fence = txt.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  if (fence) txt = fence[1];
  const start = txt.indexOf("{");
  const end = txt.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(txt.slice(start, end + 1)) as {
      bullets?: unknown;
      go_no_go?: unknown;
      one_liner?: unknown;
    };
    const bullets = Array.isArray(parsed.bullets)
      ? parsed.bullets.filter((b): b is string => typeof b === "string")
      : [];
    const gng = parsed.go_no_go === "go" || parsed.go_no_go === "wait" ? parsed.go_no_go : "neutral";
    const one = typeof parsed.one_liner === "string" ? parsed.one_liner : "";
    return { bullets, go_no_go: gng, one_liner: one };
  } catch {
    return null;
  }
}

export async function explainWithLlm(
  report: HorizonReport,
  ctx: MarketContext
): Promise<LlmExplanation> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY não configurado. Adicione a chave em .env.local para usar o explicador do agente."
    );
  }
  const model = process.env.AGENT_LLM_MODEL ?? "gpt-4o-mini";

  const userPrompt = [
    `Agente: ${report.label} (${report.subtitle})`,
    `Janela: DTE ${report.dte_min}-${report.dte_max}d`,
    "",
    "CONTEXTO DE MERCADO",
    formatContext(ctx),
    "",
    "TOP PICKS (já pré-filtrados e scoreados)",
    formatPicks(report),
    "",
    `Verdict algorítmico prévio: ${report.verdict.tone.toUpperCase()} — ${report.verdict.headline}`,
    "",
    "Avalie se faz sentido operar AGORA. Cite risco macro concreto se houver. Seja direto.",
  ].join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 200)}`);
  }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = body.choices?.[0]?.message?.content ?? "";
  const parsed = parseLlmJson(raw);
  if (!parsed) {
    return {
      bullets: [raw.slice(0, 300) || "LLM devolveu resposta vazia."],
      go_no_go: "neutral",
      one_liner: "Falha ao parsear JSON",
      model,
      raw,
    };
  }
  return {
    bullets: parsed.bullets,
    go_no_go: parsed.go_no_go,
    one_liner: parsed.one_liner,
    model,
  };
}

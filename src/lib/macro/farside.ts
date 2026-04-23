export interface EtfFlowSnapshot {
  /** Último fluxo líquido diário agregado, em USD milhões */
  last_net_flow_musd: number;
  /** Data aproximada do último dia (string curta) */
  last_date: string;
  /** 5 últimos dias, mais recentes primeiro */
  recent: Array<{ date: string; net_flow_musd: number }>;
}

/**
 * Scraping leve da página de resumo Farside (BTC spot ETF).
 * Página: https://farside.co.uk/bitcoin-etf-flow-all-data/
 * A última linha da tabela "Total" agrega o fluxo líquido diário total.
 *
 * Retorna null em qualquer erro (formato do site muda periodicamente).
 */
export async function getBtcEtfFlows(): Promise<EtfFlowSnapshot | null> {
  try {
    const res = await fetch("https://farside.co.uk/bitcoin-etf-flow-all-data/", {
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Farside renderiza uma tabela com header contendo datas e linha final "Total".
    // Estratégia robusta-ish: encontra linhas <tr> dentro de <table>, extrai textos
    // das <td>, procura a primeira coluna no formato DD MMM YYYY (ex.: "18 Apr 2026").
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    const parseNumber = (s: string): number | null => {
      const cleaned = s.replace(/,/g, "").replace(/\((.*)\)/, "-$1").trim();
      if (cleaned === "-" || cleaned === "" || cleaned.toLowerCase() === "n/a") return 0;
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    };

    const dateRe = /^\d{1,2}\s[A-Za-z]{3}\s\d{4}$/;
    const rows: Array<{ date: string; total: number }> = [];
    let match: RegExpExecArray | null;

    while ((match = rowRegex.exec(html)) !== null) {
      const cellMatches = match[1].matchAll(cellRegex);
      const cells = Array.from(cellMatches, (c) => stripTags(c[1]));
      if (cells.length < 3) continue;
      const first = cells[0];
      if (!dateRe.test(first)) continue;
      const last = cells[cells.length - 1];
      const total = parseNumber(last);
      if (total === null) continue;
      rows.push({ date: first, total });
    }

    if (rows.length === 0) return null;

    rows.sort((a, b) => {
      const da = Date.parse(a.date);
      const db = Date.parse(b.date);
      return db - da;
    });

    const top = rows[0];
    const recent = rows.slice(0, 5).map((r) => ({
      date: r.date,
      net_flow_musd: Math.round(r.total * 10) / 10,
    }));

    return {
      last_net_flow_musd: Math.round(top.total * 10) / 10,
      last_date: top.date,
      recent,
    };
  } catch {
    return null;
  }
}

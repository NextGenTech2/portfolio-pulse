import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface IndexInfo {
  name: string;
  footer: string;
}

const SYMBOLS_MAP: Record<string, IndexInfo> = {
  "^NSEI": { name: "NIFTY 50", footer: "NSE India" },
  "^BSESN": { name: "SENSEX", footer: "BSE India" },
  "^NSEBANK": { name: "BANK NIFTY", footer: "NSE India" },
  "^CRSMID": { name: "MIDCAP 100", footer: "NSE India" },
  "^CNXSC": { name: "SMALLCAP 100", footer: "NSE India" },
  "^GSPC": { name: "S&P 500", footer: "US Markets" },
  "^IXIC": { name: "NASDAQ", footer: "US Markets" },
  "^DJI": { name: "DOW JONES", footer: "US Markets" },
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const symbols = Object.keys(SYMBOLS_MAP).join(",");
    const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance returned status ${response.status}`);
    }

    const data = await response.json();
    const result = data?.spark?.result || [];

    const formattedIndices = Object.keys(SYMBOLS_MAP).map((symbol) => {
      const info = SYMBOLS_MAP[symbol];
      const match = result.find((item: any) => item.symbol === symbol);
      
      let price = null;
      let change = 0;
      let changePercent = 0;

      if (match && match.response && match.response[0]) {
        const meta = match.response[0].meta;
        price = meta.regularMarketPrice;
        const prevClose = meta.previousClose ?? meta.chartPreviousClose;
        if (price !== null && prevClose !== null && prevClose !== undefined) {
          change = price - prevClose;
          changePercent = (change / prevClose) * 100;
        }
      }

      return {
        symbol,
        name: info.name,
        price,
        change,
        changePercent,
        footer: info.footer,
      };
    });

    return new Response(JSON.stringify(formattedIndices), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Get indices error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

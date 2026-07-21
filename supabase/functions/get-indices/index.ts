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
  "^NSEBANK": { name: "NIFTY BANK", footer: "NSE India" },
  "NIFTY_MIDCAP_100.NS": { name: "NIFTY Midcap 100", footer: "NSE India" },
  "^NSMIDCP": { name: "NIFTY NEXT 50", footer: "NSE India" },
  "^CNX100": { name: "NIFTY 100", footer: "NSE India" },
  "^CNXSC": { name: "NIFTY Smallcap 100", footer: "NSE India" },
  "^INDIAVIX": { name: "India VIX", footer: "NSE India" },
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
    const reqUrl = new URL(req.url);
    const customSymbolsParam = reqUrl.searchParams.get("symbols");

    // Mode 1: Fetch live quotes for specific requested stock symbols
    if (customSymbolsParam) {
      const rawSymbols = customSymbolsParam.split(",").map(s => s.trim()).filter(Boolean);
      if (rawSymbols.length === 0) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(rawSymbols.join(","))}`;
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
      const quotesMap: Record<string, any> = {};

      for (const item of result) {
        if (!item || !item.symbol || !item.response || !item.response[0]) continue;
        const meta = item.response[0].meta;
        const price = meta.regularMarketPrice ?? null;
        const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
        
        let change = 0;
        let changePercent = 0;
        if (price !== null && prevClose !== null && prevClose !== 0) {
          change = price - prevClose;
          changePercent = ((price - prevClose) / prevClose) * 100;
        }

        const cleanSymbol = item.symbol.replace(/\.(NS|BO)$/i, "").toUpperCase();
        const info = {
          symbol: item.symbol,
          cleanSymbol,
          price,
          change,
          changePercent,
          isPositive: changePercent >= 0
        };

        quotesMap[item.symbol.toUpperCase()] = info;
        quotesMap[cleanSymbol] = info;
      }

      return new Response(JSON.stringify(quotesMap), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mode 2: Default major market indices
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

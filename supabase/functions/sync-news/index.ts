import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Helper to decode XML entities
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

// Helper to strip HTML tags
function stripHtmlTags(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

// Helper to hash string to a positive bigint-compatible number
function hashStringToId(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(hash);
}

// Helper to fetch and parse Google News RSS
async function fetchGoogleNewsRss(query: string, category: string, tickersInGroup: string[] = []): Promise<any[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
  const articles: any[] = [];

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });

    if (!response.ok) {
      console.warn(`Google News RSS returned status ${response.status} for query: ${query}`);
      return [];
    }

    const xmlText = await response.text();
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
      const itemContent = match[1];

      const titleMatch = itemContent.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = itemContent.match(/<link>([\s\S]*?)<\/link>/);
      const pubDateMatch = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const descriptionMatch = itemContent.match(/<description>([\s\S]*?)<\/description>/);
      const sourceMatch = itemContent.match(/<source[^>]*>([\s\S]*?)<\/source>/);
      const guidMatch = itemContent.match(/<guid[^>]*>([\s\S]*?)<\/guid>/);

      const title = titleMatch ? decodeXmlEntities(titleMatch[1]) : "";
      const link = linkMatch ? linkMatch[1].trim() : "";
      const pubDateStr = pubDateMatch ? pubDateMatch[1] : "";
      const description = descriptionMatch ? decodeXmlEntities(descriptionMatch[1]) : "";
      const source = sourceMatch ? decodeXmlEntities(sourceMatch[1]) : "Google News India";
      const guid = guidMatch ? guidMatch[1].trim() : link;

      const id = hashStringToId(guid || link);
      const datetime = pubDateStr ? Math.floor(Date.parse(pubDateStr) / 1000) : Math.floor(Date.now() / 1000);

      // Find which ticker triggered this match (if checking portfolio)
      let related = "";
      if (tickersInGroup.length > 0) {
        const matchedTickers = tickersInGroup.filter((ticker) => {
          const regex = new RegExp(`\\b${ticker}\\b`, "i");
          return regex.test(title) || regex.test(description);
        });
        related = matchedTickers.join(",");
      }

      articles.push({
        id,
        headline: title,
        summary: stripHtmlTags(description),
        source,
        url: link,
        datetime,
        related,
        category,
      });
    }
  } catch (err: any) {
    console.error(`Failed to fetch Google News RSS for query ${query}:`, err.message);
  }

  return articles;
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const finnhubKey = Deno.env.get("FINNHUB_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const allRecords: any[] = [];

    // --- Part 1: Fetch Global Finnhub News (Macro) ---
    if (finnhubKey) {
      try {
        console.log("Fetching global news from Finnhub...");
        const finnhubUrl = `https://finnhub.io/api/v1/news?category=general&token=${finnhubKey}`;
        const response = await fetch(finnhubUrl);
        if (response.ok) {
          const articles = await response.json();
          if (Array.isArray(articles)) {
            articles.forEach((article: any) => {
              allRecords.push({
                id: article.id,
                headline: article.headline || "",
                summary: article.summary || "",
                source: article.source || "",
                url: article.url || "",
                datetime: article.datetime || Math.floor(Date.now() / 1000),
                related: article.related || "",
                category: article.category || "general",
              });
            });
            console.log(`Aggregated ${articles.length} articles from Finnhub.`);
          }
        }
      } catch (err: any) {
        console.error("Finnhub fetch error:", err.message);
      }
    }

    // --- Part 2: Fetch Indian General Market Business News (Google News RSS) ---
    console.log("Fetching Indian Business news from Google News RSS...");
    const indianGeneralNews = await fetchGoogleNewsRss(
      "Indian stock market OR Sensex OR Nifty business when:3d",
      "indian-market"
    );
    allRecords.push(...indianGeneralNews);
    console.log(`Aggregated ${indianGeneralNews.length} Indian general market articles.`);

    // --- Part 3: Fetch Company-Specific News for User Holdings ---
    console.log("Retrieving unique user holdings from database profiles...");
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("holdings");

    if (profilesError) {
      console.error("Error loading profiles to fetch holdings:", profilesError.message);
    } else if (profiles) {
      const holdingsSet = new Set<string>();
      profiles.forEach((p: any) => {
        if (p.holdings && Array.isArray(p.holdings)) {
          p.holdings.forEach((h: string) => {
            const clean = h.replace(/\.(NS|BO)$/i, "").trim().toUpperCase();
            if (clean && clean.length > 1 && /^[A-Z0-9\-]+$/.test(clean)) {
              holdingsSet.add(clean);
            }
          });
        }
      });

      const uniqueHoldings = Array.from(holdingsSet);
      console.log(`Found ${uniqueHoldings.length} unique holdings:`, uniqueHoldings);

      if (uniqueHoldings.length > 0) {
        // Chunk holdings into groups of 10 to construct efficient search queries
        const chunkSize = 10;
        const promises: Promise<any[]>[] = [];

        for (let i = 0; i < uniqueHoldings.length; i += chunkSize) {
          const chunk = uniqueHoldings.slice(i, i + chunkSize);
          // Query Google News for "holding1 OR holding2 OR holding3 India when:7d"
          const query = `(${chunk.join(" OR ")}) India business when:7d`;
          promises.push(fetchGoogleNewsRss(query, "indian-holdings", chunk));
        }

        const chunkedResults = await Promise.all(promises);
        const holdingsArticles = chunkedResults.flat();
        allRecords.push(...holdingsArticles);
        console.log(`Aggregated ${holdingsArticles.length} articles matching specific portfolio holdings.`);
      }
    }

    // --- Part 4: Upsert to database ---
    if (allRecords.length > 0) {
      // De-duplicate records by ID before upserting
      const uniqueRecordsMap = new Map();
      allRecords.forEach(r => uniqueRecordsMap.set(r.id, r));
      const uniqueRecords = Array.from(uniqueRecordsMap.values());

      console.log(`Upserting ${uniqueRecords.length} total aggregated articles into PostgreSQL news_cache...`);
      const { error: upsertError } = await supabase
        .from("news_cache")
        .upsert(uniqueRecords, { onConflict: "id" });

      if (upsertError) {
        throw upsertError;
      }
      console.log(`Successfully upserted ${uniqueRecords.length} articles.`);
    }

    // --- Part 5: Prune Old news_cache ---
    const threeDaysAgoSeconds = Math.floor(Date.now() / 1000) - (3 * 24 * 60 * 60);
    const { error: deleteError } = await supabase
      .from("news_cache")
      .delete()
      .lt("datetime", threeDaysAgoSeconds);

    if (deleteError) {
      console.warn("Non-blocking pruning error:", deleteError.message);
    } else {
      console.log("Successfully pruned news cache older than 3 days.");
    }

    return new Response(JSON.stringify({ success: true, count: allRecords.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Sync news error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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

// Helper to fetch and parse any RSS feed (including Google News search and direct feeds)
async function fetchRssFeed(url: string, category: string, tickersInGroup: string[] = []): Promise<any[]> {
  const articles: any[] = [];
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      console.warn(`RSS feed returned status ${response.status} for URL: ${url}`);
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

      const title = titleMatch ? decodeXmlEntities(titleMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")) : "";
      const link = linkMatch ? linkMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1").trim() : "";
      const pubDateStr = pubDateMatch ? pubDateMatch[1] : "";
      const descriptionRaw = descriptionMatch ? decodeXmlEntities(descriptionMatch[1]) : "";
      
      // Extract image URL from decoded description or media tags
      let image = "";
      const imgMatch = descriptionRaw.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch) {
        image = imgMatch[1];
      } else {
        // Extract from media:content tag (Livemint format)
        const mediaMatch = itemContent.match(/<media:content[^>]+url=["']([^"']+)["']/i);
        if (mediaMatch) {
          image = mediaMatch[1];
        } else {
          // Extract from media:thumbnail tag (Google News format)
          const thumbMatch = itemContent.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
          if (thumbMatch) {
            image = thumbMatch[1];
          }
        }
      }
      
      // Strip HTML tags for summary
      const summary = stripHtmlTags(descriptionRaw);
      
      // Extract source name (Google News contains <source> tag)
      let source = sourceMatch ? decodeXmlEntities(sourceMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")) : "";
      if (!source) {
        // Fallback for direct publisher feeds
        if (link.includes("moneycontrol.com")) {
          source = "Moneycontrol";
        } else if (link.includes("livemint.com")) {
          source = "Livemint";
        } else if (link.includes("economictimes")) {
          source = "Economic Times";
        } else {
          source = "Indian Business News";
        }
      }

      const id = hashStringToId(link);
      let datetime = pubDateStr ? Math.floor(Date.parse(pubDateStr) / 1000) : Math.floor(Date.now() / 1000);
      if (isNaN(datetime) || datetime <= 0) {
        datetime = Math.floor(Date.now() / 1000);
      }

      // Check if it matches user's holdings
      let related = "";
      if (tickersInGroup.length > 0) {
        const matchedTickers = tickersInGroup.filter((ticker) => {
          const regex = new RegExp(`\\b${ticker}\\b`, "i");
          return regex.test(title) || regex.test(summary);
        });
        if (matchedTickers.length === 0) {
          continue;
        }
        related = matchedTickers.join(",");
      }

      articles.push({
        id,
        headline: title,
        summary,
        source,
        url: link,
        datetime,
        related,
        category,
        image,
      });
    }
  } catch (err: any) {
    console.error(`Failed to fetch RSS feed for URL ${url}:`, err.message);
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
                // Ensure datetime is a valid number; fallback to now if missing/invalid
                datetime: typeof article.datetime === 'number' && !isNaN(article.datetime)
                  ? article.datetime
                  : Math.floor(Date.now() / 1000),
                related: article.related || "",
                category: article.category || "general",
                image: article.image || "",
              });
            });
            console.log(`Aggregated ${articles.length} articles from Finnhub.`);
          }
        }
      } catch (err: any) {
        console.error("Finnhub fetch error:", err.message);
      }
    }

    // List of direct Indian RSS feeds
    const directFeeds = [
      "https://www.moneycontrol.com/rss/latestnews.xml",
      "https://www.moneycontrol.com/rss/buzzingstocks.xml",
      "https://www.livemint.com/rss/markets",
      "https://www.livemint.com/rss/companies"
    ];

    // --- Part 2: Fetch Indian General Market Business News (Google News & Direct Feeds) ---
    console.log("Fetching Indian Business news from RSS feeds...");
    const generalNewsPromises: Promise<any[]>[] = [];
    
    // 1. Google News general search (aggregates from many sources)
    const googleGeneralUrl = `https://news.google.com/rss/search?q=${encodeURIComponent("Indian stock market OR Sensex OR Nifty business when:3d")}&hl=en-IN&gl=IN&ceid=IN:en`;
    generalNewsPromises.push(fetchRssFeed(googleGeneralUrl, "indian-market"));
    
    // 2. Direct feeds
    directFeeds.forEach(url => {
      generalNewsPromises.push(fetchRssFeed(url, "indian-market"));
    });

    const generalNewsResults = await Promise.all(generalNewsPromises);
    const generalNewsArticles = generalNewsResults.flat();
    allRecords.push(...generalNewsArticles);
    console.log(`Aggregated ${generalNewsArticles.length} Indian general market articles.`);

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
        console.log("Fetching RSS feeds for portfolio matching...");
        const companyNewsPromises: Promise<any[]>[] = [];
        
        // 1. Google News search for holdings (provides results from many different sources)
        const chunkSize = 10;
        for (let i = 0; i < uniqueHoldings.length; i += chunkSize) {
          const chunk = uniqueHoldings.slice(i, i + chunkSize);
          const query = `(${chunk.join(" OR ")}) India business when:7d`;
          const googleSearchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
          companyNewsPromises.push(fetchRssFeed(googleSearchUrl, "indian-holdings", chunk));
        }

        // 2. Direct feeds filtered in-memory for holdings
        directFeeds.forEach(url => {
          companyNewsPromises.push(fetchRssFeed(url, "indian-holdings", uniqueHoldings));
        });

        const companyNewsResults = await Promise.all(companyNewsPromises);
        const companyNewsArticles = companyNewsResults.flat();
        allRecords.push(...companyNewsArticles);
        console.log(`Aggregated ${companyNewsArticles.length} articles matching specific portfolio holdings.`);
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

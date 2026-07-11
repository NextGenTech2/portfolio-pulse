import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const HIGH_PRIORITY = ["wins contract", "order", "merger", "acquisition", "approval", "government", "mou", "manufacturing", "jv", "dividend", "bonus", "stock split", "buyback", "sebi", "earnings", "result", "profit"];
const LOW_PRIORITY = ["rumour", "may", "could", "exploring", "sources", "reportedly"];

function calculateImportance(text: string) {
  let score = 5;
  const lowerText = text.toLowerCase();
  for (const kw of HIGH_PRIORITY) {
    if (lowerText.includes(kw)) score += 2;
  }
  for (const kw of LOW_PRIORITY) {
    if (lowerText.includes(kw)) score -= 2;
  }
  return Math.max(1, Math.min(10, score));
}

function getSeverity(score: number) {
  if (score >= 9) return 'CRITICAL';
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  return 'LOW';
}

function getCategories(text: string) {
  const cats = [];
  const lowerText = text.toLowerCase();
  if (lowerText.includes("dividend")) cats.push("Dividend");
  if (lowerText.includes("merger") || lowerText.includes("acquisition")) cats.push("M&A");
  if (lowerText.includes("order") || lowerText.includes("contract")) cats.push("Contract");
  if (lowerText.includes("result") || lowerText.includes("earnings")) cats.push("Results");
  if (lowerText.includes("bonus") || lowerText.includes("split")) cats.push("Corporate Action");
  return cats;
}

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

function stripHtmlTags(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

// Generate deterministic event hash
async function generateEventHash(title: string, dateStr: string): Promise<string> {
  const normalizedTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 30);
  const data = new TextEncoder().encode(`${normalizedTitle}_${dateStr}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function fetchRssFeed(url: string, uniqueHoldings: string[] = []): Promise<any[]> {
  const articles: any[] = [];
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!response.ok) return [];

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
      
      let image = "";
      const imgMatch = descriptionRaw.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch) image = imgMatch[1];
      else {
        const mediaMatch = itemContent.match(/<media:content[^>]+url=["']([^"']+)["']/i);
        if (mediaMatch) image = mediaMatch[1];
        else {
          const thumbMatch = itemContent.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
          if (thumbMatch) image = thumbMatch[1];
        }
      }
      
      const summary = stripHtmlTags(descriptionRaw);
      
      let source = sourceMatch ? decodeXmlEntities(sourceMatch[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")) : "";
      if (!source) {
        if (link.includes("moneycontrol.com")) source = "Moneycontrol";
        else if (link.includes("livemint.com")) source = "Livemint";
        else if (link.includes("economictimes")) source = "Economic Times";
        else source = "Indian Business News";
      }

      let datetime = pubDateStr ? Math.floor(Date.parse(pubDateStr) / 1000) : Math.floor(Date.now() / 1000);
      if (isNaN(datetime) || datetime <= 0) datetime = Math.floor(Date.now() / 1000);
      
      // We group events occurring on the same day for deduplication
      const dateString = new Date(datetime * 1000).toISOString().split('T')[0];
      const event_hash = await generateEventHash(title, dateString);

      // Extract symbols for portfolio matching
      const mentioned_symbols: string[] = [];
      for (const sym of uniqueHoldings) {
        const regex = new RegExp(`\\b${sym}\\b`, "i");
        if (regex.test(title) || regex.test(summary)) {
          mentioned_symbols.push(sym);
        }
      }

      articles.push({
        id: event_hash, // use hash as ID
        event_hash,
        headline: title,
        summary,
        source,
        url: link,
        published_at: new Date(datetime * 1000).toISOString(),
        image_url: image,
        mentioned_symbols,
        categories: getCategories(`${title} ${summary}`)
      });
    }
  } catch (err: any) {
    console.error(`Failed to fetch RSS:`, err.message);
  }
  return articles;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const allRecords: any[] = [];

    // Retrieve unique user holdings from database profiles
    const { data: profiles, error: profilesError } = await supabase.from("profiles").select("holdings");
    const uniqueHoldings = new Set<string>();
    
    if (profiles) {
      profiles.forEach((p: any) => {
        if (p.holdings && Array.isArray(p.holdings)) {
          p.holdings.forEach((h: string) => {
            const clean = h.replace(/\.(NS|BO)$/i, "").trim().toUpperCase();
            if (clean && clean.length > 1) uniqueHoldings.add(clean);
          });
        }
      });
    }
    const uniqueHoldingsArr = Array.from(uniqueHoldings);

    // Fetch Feeds
    const directFeeds = [
      "https://www.moneycontrol.com/rss/latestnews.xml",
      "https://www.moneycontrol.com/rss/buzzingstocks.xml",
      "https://www.livemint.com/rss/markets",
      "https://www.livemint.com/rss/companies"
    ];

    const feedPromises = directFeeds.map(url => fetchRssFeed(url, uniqueHoldingsArr));
    
    // Add google news search for holdings
    const chunkSize = 10;
    for (let i = 0; i < uniqueHoldingsArr.length; i += chunkSize) {
      const chunk = uniqueHoldingsArr.slice(i, i + chunkSize);
      const query = `(${chunk.join(" OR ")}) India business when:3d`;
      const googleSearchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
      feedPromises.push(fetchRssFeed(googleSearchUrl, uniqueHoldingsArr));
    }

    const results = await Promise.all(feedPromises);
    allRecords.push(...results.flat());

    if (allRecords.length > 0) {
      // Deduplicate before insert
      const uniqueRecordsMap = new Map();
      allRecords.forEach(r => uniqueRecordsMap.set(r.event_hash, r));
      const uniqueRecords = Array.from(uniqueRecordsMap.values());

      // Upsert into news_articles and return ONLY newly inserted rows
      // Note: Supabase JS doesn't easily return *only* new rows on upsert with DO NOTHING in PostgREST natively unless we check them.
      // So we'll fetch existing hashes first.
      const hashes = uniqueRecords.map(r => r.event_hash);
      const { data: existing } = await supabase
        .from("news_articles")
        .select("event_hash")
        .in("event_hash", hashes);

      const existingHashes = new Set(existing?.map(e => e.event_hash) || []);
      const newArticles = uniqueRecords.filter(r => !existingHashes.has(r.event_hash));

      if (newArticles.length > 0) {
        console.log(`Inserting ${newArticles.length} new articles into news_articles...`);
        await supabase.from("news_articles").insert(newArticles);

        // Process Rule Engine for new articles
        console.log(`Processing Rule Engine for ${newArticles.length} new articles...`);
        const notificationsToInsert: any[] = [];

        for (const article of newArticles) {
          if (article.mentioned_symbols && article.mentioned_symbols.length > 0) {
            for (const sym of article.mentioned_symbols) {
              // Find users who hold this symbol
              const { data: usersHolding } = await supabase.rpc('get_users_holding', { search_symbol: sym });
              
              if (usersHolding && usersHolding.length > 0) {
                const textTarget = `${article.headline} ${article.summary}`;
                let importanceScore = calculateImportance(textTarget) + 2; // +2 for portfolio relevance
                importanceScore = Math.min(10, importanceScore);
                const severity = getSeverity(importanceScore);
                
                usersHolding.forEach((u: any) => {
                  notificationsToInsert.push({
                    user_id: u.id,
                    notification_type: 'PORTFOLIO',
                    title: article.headline,
                    summary: article.summary,
                    stock_symbol: sym,
                    source: article.source,
                    action_url: article.url,
                    importance: importanceScore,
                    severity: severity,
                    categories: article.categories,
                    reasoning: {
                      reason: `${sym} is in your portfolio`,
                      score_breakdown: `Keyword + Portfolio Relevance`
                    }
                  });
                });
              }
            }
          }
        }

        if (notificationsToInsert.length > 0) {
          console.log(`Creating ${notificationsToInsert.length} notifications...`);
          await supabase.from("notifications").insert(notificationsToInsert);
          // Note: In real life we would trigger the push-worker edge function here via webhooks or another fetch call.
        }
      } else {
        console.log("No new articles to process.");
      }
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

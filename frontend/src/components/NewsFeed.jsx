import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../supabaseClient";
import { 
  RefreshCw, 
  Tag, 
  Newspaper, 
  TrendingUp,
  Bookmark,
  Activity,
  Clock,
  Share2,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  MoreVertical
} from "lucide-react";

// Mock helper to generate dynamic stock quotes matching screenshot values
const getStockPriceForTicker = (ticker = "") => {
  const cleanTicker = ticker.replace(/\.(NS|BO)$/i, "").toUpperCase();
  
  const screenshotQuotes = {
    "SIEMENS": { price: "₹4,156.80", change: "▲ +0.82%", isPositive: true },
    "INDIGO": { price: "₹4,156.80", change: "▲ +0.82%", isPositive: true },
    "MCX": { price: "₹1,678.90", change: "▼ -0.45%", isPositive: false },
    "HCLTECH": { price: "₹1,678.90", change: "▲ +0.82%", isPositive: true },
    "BSE": { price: "₹2,956.45", change: "▲ +1.25%", isPositive: true }
  };
  
  if (screenshotQuotes[cleanTicker]) {
    return screenshotQuotes[cleanTicker];
  }
  
  // Stable hash fallback
  let hash = 0;
  for (let i = 0; i < cleanTicker.length; i++) {
    hash = cleanTicker.charCodeAt(i) + ((hash << 5) - hash);
  }
  const priceBase = Math.abs(hash % 6000) + 500;
  const changePercent = ((hash % 300) / 100).toFixed(2);
  const isPositive = Number(changePercent) >= -0.5;
  const changeVal = Math.abs(Number(changePercent)).toFixed(2);
  const formattedPrice = `₹${priceBase.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formattedChange = `${isPositive ? "▲ +" : "▼ "}${changeVal}%`;
  
  return {
    price: formattedPrice,
    change: formattedChange,
    isPositive
  };
};

const getJaccardSimilarity = (str1, str2) => {
  const tokenize = (str) => {
    const words = str.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/);
    const stopWords = new Set(["the", "and", "to", "of", "a", "in", "for", "on", "with", "is", "at", "by", "from", "as", "it", "that"]);
    return new Set(words.filter(w => w.length > 2 && !stopWords.has(w)));
  };
  
  const set1 = tokenize(str1);
  const set2 = tokenize(str2);
  
  let intersection = 0;
  for (let word of set1) {
    if (set2.has(word)) intersection++;
  }
  
  const union = set1.size + set2.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const clusterArticles = (articles) => {
  const clusters = [];
  
  for (const article of articles) {
    let addedToCluster = false;
    const articleTime = Date.parse(article.published_at);
    const primaryHolding = article.matchedHoldings && article.matchedHoldings.length > 0 ? article.matchedHoldings[0] : null;

    for (const cluster of clusters) {
      if (primaryHolding && cluster.primaryHolding !== primaryHolding) continue;
      
      const clusterTime = Date.parse(cluster.mainArticle.published_at);
      const hoursDiff = Math.abs(clusterTime - articleTime) / (1000 * 60 * 60);
      if (hoursDiff > 48) continue;
      
      const similarity = getJaccardSimilarity(cluster.mainArticle.headline, article.headline);
      if (similarity > 0.12) { 
        cluster.relatedArticles.push(article);
        addedToCluster = true;
        break;
      }
    }
    
    if (!addedToCluster) {
      clusters.push({
        id: article.id,
        primaryHolding,
        mainArticle: article,
        relatedArticles: []
      });
    }
  }
  
  // Only keep clusters grouped if they have at least 3 similar articles in total (1 main + 2 or more related)
  const finalClusters = [];
  for (const cluster of clusters) {
    if (cluster.relatedArticles.length >= 2) {
      finalClusters.push(cluster);
    } else {
      // Flatten the cluster into individual standalone articles
      finalClusters.push({
        id: cluster.mainArticle.id,
        primaryHolding: cluster.primaryHolding,
        mainArticle: cluster.mainArticle,
        relatedArticles: []
      });
      for (const rel of cluster.relatedArticles) {
        const relHolding = rel.matchedHoldings && rel.matchedHoldings.length > 0 ? rel.matchedHoldings[0] : null;
        finalClusters.push({
          id: rel.id,
          primaryHolding: relHolding,
          mainArticle: rel,
          relatedArticles: []
        });
      }
    }
  }

  // Sort final clusters chronologically (newest published_at first)
  finalClusters.sort((a, b) => {
    const timeA = Date.parse(a.mainArticle.published_at);
    const timeB = Date.parse(b.mainArticle.published_at);
    return timeB - timeA;
  });
  
  return finalClusters;
};

export default function NewsFeed({ 
  holdings, 
  filterMode = "curated", 
  savedArticleIds = [], 
  onToggleBookmark 
}) {
  const [news, setNews] = useState([]);
  const [filteredNews, setFilteredNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pullStatus, setPullStatus] = useState("idle");
  const [pullY, setPullY] = useState(0);
  
  // Simple heuristic-based Sentiment Analyzer
  const getSentiment = (headline = "", summary = "") => {
    const text = `${headline} ${summary}`.toLowerCase();
    
    const positiveWords = [
      "buy", "upgrade", "gain", "rise", "positive", "growth", "surges", "soars", 
      "higher", "profitable", "bullish", "jump", "record high", "beats", "strong buy"
    ];
    
    const negativeWords = [
      "sell", "downgrade", "loss", "fall", "negative", "drop", "slumps", "plunges", 
      "lower", "unprofitable", "bearish", "crash", "record low", "misses", "headwinds"
    ];
    
    let posCount = 0;
    let negCount = 0;
    
    positiveWords.forEach(word => {
      if (text.includes(word)) posCount++;
    });
    
    negativeWords.forEach(word => {
      if (text.includes(word)) negCount++;
    });
    
    if (posCount > negCount) {
      return { label: "POSITIVE", color: "positive", icon: <ArrowUpRight size={12} /> };
    } else if (negCount > posCount) {
      return { label: "NEGATIVE", color: "negative", icon: <ArrowDownRight size={12} /> };
    } else {
      return { label: "NEUTRAL", color: "neutral", icon: null };
    }
  };
  
  const touchStart = useRef(0);
  const scrollContainerRef = useRef(null);

  // Fetch cached news from Supabase
  const fetchCachedNews = async (isManualRefresh = false) => {
    if (!isManualRefresh) setLoading(true);
    try {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("news_articles")
        .select("*")
        .gte("published_at", threeDaysAgo)
        .order("published_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      setNews(data || []);
    } catch (error) {
      console.error("Error fetching news cache from Supabase:", error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setPullStatus("idle");
    }
  };

  // Manual Trigger for Desktop users
  const handleManualSync = async () => {
    setLoading(true);
    try {
      console.log("Invoking sync-news Supabase Edge Function...");
      const { error } = await supabase.functions.invoke("sync-news", { method: "POST" });
      if (error) throw error;
    } catch (err) {
      console.warn("Edge function sync failed:", err.message);
    }
    await fetchCachedNews(true);
  };

  useEffect(() => {
    fetchCachedNews();
  }, [holdings]);

  // Apply in-memory filtering when news, holdings, or filterMode change
  useEffect(() => {
    if (!news || news.length === 0) {
      setFilteredNews([]);
      return;
    }

    if (filterMode === "general") {
      setFilteredNews(clusterArticles(news));
      return;
    }

    if (!holdings || holdings.length === 0) {
      setFilteredNews([]);
      return;
    }

    const cleanedHoldings = holdings.map(ticker => {
      const base = ticker.replace(/\.(NS|BO)$/i, "").toUpperCase();
      return { raw: ticker, base };
    });

    const matches = news.filter(article => {
      // 1. Check direct Finnhub related tag or Deno custom populated related column
      if (article.mentioned_symbols && Array.isArray(article.mentioned_symbols)) {
        const relatedList = article.mentioned_symbols.map(r => r.trim().toUpperCase());
        if (cleanedHoldings.some(h => relatedList.includes(h.base))) {
          return true;
        }
      }

      // 2. Check headline and summary text content
      const searchTarget = `${article.headline} ${article.summary}`.toUpperCase();
      return cleanedHoldings.some(h => {
        const escaped = h.base.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}\\b`, "i");
        return regex.test(searchTarget);
      });
    });

    // Enrich articles with matched holdings tags
    const enrichedMatches = matches.map(article => {
      const matchedHoldings = cleanedHoldings
        .filter(h => {
          if (article.mentioned_symbols && Array.isArray(article.mentioned_symbols)) {
            const relatedList = article.mentioned_symbols.map(r => r.trim().toUpperCase());
            if (relatedList.includes(h.base)) return true;
          }
          const searchTarget = `${article.headline} ${article.summary}`.toUpperCase();
          const escaped = h.base.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}\\b`, "i");
          return regex.test(searchTarget);
        })
        .map(h => h.raw);

      return {
        ...article,
        matchedHoldings: Array.from(new Set(matchedHoldings))
      };
    });

    setFilteredNews(clusterArticles(enrichedMatches));
  }, [news, holdings, filterMode]);

  const [liveQuotes, setLiveQuotes] = useState({});
  const fetchedQuotesRef = useRef("");

  // Fetch real-time live stock quotes for article ticker badges
  useEffect(() => {
    if (!filteredNews || filteredNews.length === 0) return;

    const rawHoldings = new Set();
    filteredNews.forEach(cluster => {
      const hList = cluster.mainArticle?.matchedHoldings;
      if (hList && Array.isArray(hList)) {
        hList.forEach(h => rawHoldings.add(h));
      }
    });

    if (rawHoldings.size === 0) return;

    const querySymbols = Array.from(rawHoldings).map(ticker => {
      if (/\.(NS|BO)$/i.test(ticker)) return ticker.toUpperCase();
      return `${ticker.toUpperCase()}.NS`;
    });

    const queryKey = querySymbols.sort().join(",");
    if (fetchedQuotesRef.current === queryKey) return;
    fetchedQuotesRef.current = queryKey;

    const chunkArray = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const fetchLiveQuotesInChunks = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!supabaseUrl) return;

        const symbolChunks = chunkArray(querySymbols, 15);
        const aggregatedQuotesMap = {};

        await Promise.all(
          symbolChunks.map(async (chunk) => {
            try {
              const chunkKey = chunk.join(",");
              const yahooSparkUrl = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${chunkKey}`;
              const proxyUrl = `${supabaseUrl}/functions/v1/image-proxy?url=${encodeURIComponent(yahooSparkUrl)}`;

              const res = await fetch(proxyUrl, {
                headers: {
                  Authorization: `Bearer ${anonKey}`,
                },
              });

              if (res.ok) {
                const data = await res.json();
                const result = data?.spark?.result || [];

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

                  aggregatedQuotesMap[item.symbol.toUpperCase()] = info;
                  aggregatedQuotesMap[cleanSymbol] = info;
                }
              }
            } catch (err) {
              console.warn("Chunk quote fetch error:", err);
            }
          })
        );

        if (Object.keys(aggregatedQuotesMap).length > 0) {
          setLiveQuotes(prev => ({ ...prev, ...aggregatedQuotesMap }));
        }
      } catch (err) {
        console.warn("Error fetching live quotes for news feed:", err.message);
      }
    };

    fetchLiveQuotesInChunks();
  }, [filteredNews]);

  // Pull-to-refresh Touch Handlers
  const handleTouchStart = (e) => {
    const scrollContainer = e.currentTarget.closest(".main-content-scrollable");
    if (!scrollContainer) return;
    if (scrollContainer.scrollTop === 0) {
      touchStart.current = e.touches[0].clientY;
      setPullStatus("pulling");
    }
  };

  const handleTouchMove = (e) => {
    if (pullStatus !== "pulling") return;
    const scrollContainer = e.currentTarget.closest(".main-content-scrollable");
    if (!scrollContainer) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStart.current;

    if (diff > 0) {
      const pullDistance = Math.min(diff * 0.4, 80);
      setPullY(pullDistance);
      e.preventDefault();
    }
  };

  const handleTouchEnd = async () => {
    if (pullStatus !== "pulling") return;

    if (pullY >= 50) {
      setPullStatus("refreshing");
      setRefreshing(true);
      
      try {
        await supabase.functions.invoke("sync-news", { method: "POST" });
      } catch (err) {
        console.warn("Edge function sync failed:", err.message);
      }

      await fetchCachedNews(true);
    } else {
      setPullStatus("idle");
    }
    setPullY(0);
  };

  const toggleBookmark = (e, articleId) => {
    e.preventDefault();
    e.stopPropagation();
    if (onToggleBookmark) {
      onToggleBookmark(articleId);
    }
  };

  const formatTime = (timeValue) => {
    if (!timeValue) return "";
    let ms = Number(timeValue) * 1000;
    if (isNaN(ms) && typeof timeValue === 'string') {
      ms = Date.parse(timeValue);
    }
    const diffMs = Date.now() - ms;
    const diffMins = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric"
    });
  };

  // Helper to choose a gorgeous inline SVG graphic/illustration based on keywords
  const renderFallbackIllustration = (headline = "", summary = "") => {
    const text = `${headline} ${summary}`.toLowerCase();
    
    if (text.includes("saturn") || text.includes("space") || text.includes("irctc") || text.includes("digital")) {
      return (
        <svg className="news-illustration" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="saturnGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#ff9f43" />
              <stop offset="70%" stopColor="#ee5253" />
              <stop offset="100%" stopColor="#5f27cd" />
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="#1a1c24" rx="12"/>
          <circle cx="20" cy="30" r="1" fill="#fff" opacity="0.8"/>
          <circle cx="80" cy="20" r="1.5" fill="#fff" opacity="0.6"/>
          <circle cx="15" cy="75" r="0.8" fill="#fff" opacity="0.9"/>
          <circle cx="70" cy="80" r="1.2" fill="#fff" opacity="0.5"/>
          <circle cx="50" cy="50" r="22" fill="url(#saturnGrad)" />
          <ellipse cx="50" cy="50" rx="38" ry="8" stroke="rgba(255,255,255,0.6)" strokeWidth="3" transform="rotate(-15 50 50)" />
          <ellipse cx="50" cy="50" rx="43" ry="11" stroke="rgba(255,255,255,0.2)" strokeWidth="1" transform="rotate(-15 50 50)" />
        </svg>
      );
    }
    
    if (text.includes("chemical") || text.includes("speciality") || text.includes("himadri") || text.includes("center")) {
      return (
        <svg className="news-illustration" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="chemGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#48dbfb" />
              <stop offset="100%" stopColor="#0abde3" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="#162330" rx="8"/>
          <path d="M42 25 H58 V35 L72 75 A8 8 0 0 1 65 85 H35 A8 8 0 0 1 28 75 L42 35 Z" fill="url(#chemGrad)" opacity="0.8"/>
          <path d="M42 25 H58" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
          <circle cx="50" cy="50" r="4" fill="#fff" opacity="0.6"/>
          <circle cx="42" cy="65" r="3" fill="#fff" opacity="0.7"/>
          <circle cx="58" cy="60" r="5" fill="#fff" opacity="0.5"/>
        </svg>
      );
    }

    if (text.includes("market") || text.includes("compare") || text.includes("leaders") || text.includes("groww") || text.includes("trade") || text.includes("nifty")) {
      return (
        <svg className="news-illustration" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="chartGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#2ebd7f" />
              <stop offset="100%" stopColor="#38ef7d" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="#111c18" rx="8"/>
          <path d="M15 75 L35 55 L55 65 L85 25" stroke="url(#chartGrad)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M85 25 L70 25 M85 25 L85 40" stroke="#38ef7d" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
          <rect x="20" y="65" width="6" height="15" fill="#2ebd7f" opacity="0.3" rx="1"/>
          <rect x="40" y="50" width="6" height="30" fill="#2ebd7f" opacity="0.3" rx="1"/>
          <rect x="60" y="40" width="6" height="40" fill="#2ebd7f" opacity="0.3" rx="1"/>
        </svg>
      );
    }

    return (
      <svg className="news-illustration" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="defGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5f27cd" />
            <stop offset="50%" stopColor="#341f97" />
            <stop offset="100%" stopColor="#0abde3" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#defGrad)" rx="8"/>
        <circle cx="30" cy="30" r="40" fill="#fff" opacity="0.05" />
        <circle cx="80" cy="70" r="30" fill="#000" opacity="0.15" />
      </svg>
    );
  };

  const getSourceIcon = (source = "") => {
    const firstLetter = source.charAt(0).toUpperCase();
    const colors = ["#2ebd7f", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
    const charCode = source.charCodeAt(0) || 0;
    const bg = colors[charCode % colors.length];
    return (
      <span className="source-avatar" style={{ backgroundColor: bg }}>
        {firstLetter}
      </span>
    );
  };

  return (
    <div 
      className="feed-scroll-container" 
      ref={scrollContainerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div 
        className={`ptr-indicator ${pullStatus === "pulling" ? "pulling" : ""} ${pullStatus === "refreshing" ? "refreshing" : ""}`}
        style={{ height: pullStatus === "pulling" ? `${pullY}px` : undefined }}
      >
        <RefreshCw 
          className={pullStatus === "refreshing" ? "spinner" : ""} 
          size={16} 
          style={{ transform: pullStatus === "pulling" ? `rotate(${pullY * 4}deg)` : undefined }} 
        />
        <span>{pullStatus === "refreshing" ? "Updating news feed..." : "Pull to refresh"}</span>
      </div>

      {loading ? (
        <div className="state-container">
          <Activity className="spinner" size={24} style={{ color: "hsl(var(--accent-primary))" }} />
          <h3 className="state-title">Scanning intelligence feed</h3>
          <p className="state-desc">Aggregating and checking your holdings news cache...</p>
        </div>
      ) : !holdings || holdings.length === 0 ? (
        <div className="state-container">
          <TrendingUp size={36} style={{ color: "hsl(var(--text-muted))" }} />
          <h3 className="state-title">No holdings found</h3>
          <p className="state-desc">Upload your portfolio CSV in the Portfolio tab to discover tailored news.</p>
        </div>
      ) : filteredNews.length === 0 ? (
        <div className="state-container">
          <Newspaper size={36} style={{ color: "hsl(var(--text-muted))" }} />
          <h3 className="state-title">No matching portfolio news found</h3>
          <p className="state-desc">We checked recent business highlights, but none mention your holdings yet.</p>
          <button 
            className="btn-sync-large" 
            style={{ marginTop: "1.5rem" }} 
            onClick={handleManualSync}
          >
            Force Sync Global News
          </button>
        </div>
      ) : (
        <div className="feed-articles-wrapper">
          <div className="feed-header-section">
            <span className="feed-title">
              {filterMode === "curated" ? "Curated Feed" : "General Market Highlights"}
            </span>
            <span className="feed-subtitle">({filteredNews.length} Articles)</span>
          </div>

          {filteredNews.map((cluster, index) => {
            const article = cluster.mainArticle;
            const isFeatured = index === 0 && filterMode === "curated";
            const isBookmarked = savedArticleIds.includes(article.id);
            
            const primaryHolding = article.matchedHoldings && article.matchedHoldings.length > 0 
              ? article.matchedHoldings[0] 
              : null;
            const stockQuote = primaryHolding ? getStockPriceForTicker(primaryHolding) : null;
            const cleanTicker = primaryHolding ? primaryHolding.replace(/\.(NS|BO)$/i, "").toUpperCase() : "";

            return (
              <div key={cluster.id} className="story-cluster-container">
                <a 
                  href={article.url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className={`news-card ${isFeatured ? "featured" : "regular"}`}
                >
                  <div className="premium-card-inner">
                    {/* Top Meta Bar: Source • Time + Actions */}
                    <div className="publisher-meta-row">
                      {getSourceIcon(article.source)}
                      <span className="source-name">{article.source}</span>
                      <span className="divider-dot">•</span>
                      <span className="article-time">{formatTime(article.published_at)}</span>
                      
                      <div className="premium-card-actions-inline">
                        <button 
                          className={`btn-card-action-mini bookmark ${isBookmarked ? "active" : ""}`}
                          onClick={(e) => toggleBookmark(e, article.id)}
                          title={isBookmarked ? "Remove Bookmark" : "Save Article"}
                        >
                          <Bookmark size={15} fill={isBookmarked ? "currentColor" : "none"} />
                        </button>
                        <button 
                          className="btn-card-action-mini share"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigator.clipboard.writeText(article.url);
                            alert("Article link copied to clipboard!");
                          }}
                          title="Share Article"
                        >
                          <Share2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* Main Card Content Row: Headline & Stock tag (Left), Thumbnail (Right) */}
                    <div className="card-main-content">
                      <div className="card-headline-column">
                        <h3 className="news-headline">{article.headline}</h3>

                        {cleanTicker && (() => {
                          const quote = liveQuotes[cleanTicker] || liveQuotes[`${cleanTicker}.NS`] || (primaryHolding ? liveQuotes[primaryHolding.toUpperCase()] : null);
                          if (quote && typeof quote.changePercent === "number") {
                            const isPos = quote.isPositive;
                            const symbolPrefix = isPos ? "▲ +" : "▼ ";
                            const formattedPct = `${symbolPrefix}${Math.abs(quote.changePercent).toFixed(2)}%`;
                            
                            return (
                              <div className="stock-tag-row">
                                <span className={`stock-tag-pill ${isPos ? "positive" : "negative"}`}>
                                  {cleanTicker} {formattedPct}
                                </span>
                              </div>
                            );
                          }

                          return (
                            <div className="stock-tag-row">
                              <span className="stock-tag-pill neutral">
                                {cleanTicker}
                              </span>
                            </div>
                          );
                        })()}
                      </div>

                      {/* Right Thumbnail Image */}
                      <div className="premium-card-media">
                        {article.image_url ? (
                          <img 
                            src={article.image_url} 
                            alt="" 
                            className="news-illustration" 
                            onLoad={(e) => {
                              if (e.target.naturalWidth <= 1 && e.target.naturalHeight <= 1) {
                                e.target.style.display = "none";
                                const next = e.target.nextSibling;
                                if (next) next.style.display = "block";
                              }
                            }}
                            onError={(e) => {
                              e.target.style.display = "none";
                              const next = e.target.nextSibling;
                              if (next) next.style.display = "block";
                            }}
                          />
                        ) : null}
                        <div style={{ display: article.image_url ? "none" : "block", width: "100%", height: "100%" }}>
                          {renderFallbackIllustration(article.headline, article.summary)}
                        </div>
                      </div>
                    </div>
                  </div>
                </a>

                {/* Related Articles Carousel */}
                {cluster.relatedArticles.length > 0 && (
                  <div className="related-articles-carousel">
                    {cluster.relatedArticles.map(related => (
                      <a 
                        key={related.id} 
                        href={related.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="related-mini-card"
                      >
                        <div className="related-mini-card-header">
                          {getSourceIcon(related.source)}
                          <span className="source-name">{related.source}</span>
                          <span className="article-time">{formatTime(related.published_at)}</span>
                        </div>
                        <h4 className="related-mini-card-headline">{related.headline}</h4>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

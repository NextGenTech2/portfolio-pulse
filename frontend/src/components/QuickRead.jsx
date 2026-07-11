import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { ArrowLeft, Share2, Bookmark, Activity, BookOpen, AlertTriangle } from "lucide-react";

export default function QuickRead({ holdings, savedArticleIds = [], onToggleBookmark, setActiveTab }) {
  const [news, setNews] = useState([]);
  const [filteredNews, setFilteredNews] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch cached news from Supabase
  const fetchCachedNews = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("news_cache")
        .select("*")
        .order("datetime", { ascending: false })
        .limit(500);

      if (error) throw error;
      setNews(data || []);
    } catch (error) {
      console.error("Error fetching news cache in QuickRead:", error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCachedNews();
  }, [holdings]);

  // Apply in-memory filtering when news or holdings change
  useEffect(() => {
    if (!news || news.length === 0) {
      setFilteredNews([]);
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
      // 1. Check direct related column
      if (article.related) {
        const relatedList = article.related.split(",").map(r => r.trim().toUpperCase());
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

    // Enrich matched articles with holding badges
    const enrichedMatches = matches.map(article => {
      const matchedHoldings = cleanedHoldings
        .filter(h => {
          if (article.related) {
            const relatedList = article.related.split(",").map(r => r.trim().toUpperCase());
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

    setFilteredNews(enrichedMatches);
  }, [news, holdings]);

  const handleShare = (e, article) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(article.url);
    alert("Article link copied to clipboard!");
  };

  const handleBack = () => {
    setActiveTab("home");
  };

  if (loading) {
    return (
      <div className="quick-read-state">
        <Activity className="spinner" size={28} style={{ color: "hsl(var(--accent-primary))", marginBottom: "1rem" }} />
        <p style={{ color: "hsl(var(--text-secondary))", fontSize: "0.85rem" }}>Scanning portfolio intelligence...</p>
      </div>
    );
  }

  if (filteredNews.length === 0) {
    return (
      <div className="quick-read-state">
        <AlertTriangle size={36} style={{ color: "hsl(var(--text-muted))", marginBottom: "1rem" }} />
        <h3 style={{ fontSize: "0.95rem", fontWeight: "700", color: "hsl(var(--text-primary))", marginBottom: "0.5rem" }}>No Portfolio News Found</h3>
        <p style={{ maxWidth: "260px", margin: "0 auto 1.5rem auto", color: "hsl(var(--text-muted))", fontSize: "0.8rem", lineHeight: "1.4" }}>
          We couldn't find any recent news matching your holdings. Upload or update your portfolio in the Portfolio tab.
        </p>
        <button className="btn-minimal" onClick={handleBack}>Go to Home Feed</button>
      </div>
    );
  }

  return (
    <div className="quick-read-scroll-container">
      {filteredNews.map((article) => {
        const isBookmarked = savedArticleIds.includes(article.id);
        const imageUrl = article.image 
          ? article.image
          : null;

        return (
          <div 
            key={article.id} 
            className="quick-read-card"
            style={{
              backgroundImage: imageUrl 
                ? `linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.92) 100%), url(${imageUrl})`
                : "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
            }}
          >
            {/* Fallback Graphic Pattern if no image */}
            {!imageUrl && (
              <div className="quick-read-fallback-pattern">
                <BookOpen size={96} style={{ color: "rgba(255,255,255,0.03)", position: "absolute", top: "25%", left: "50%", transform: "translateX(-50%)" }} />
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "radial-gradient(circle at 80% 20%, rgba(59, 130, 246, 0.15) 0%, transparent 50%)" }} />
              </div>
            )}

            {/* Top Bar Actions */}
            <div className="quick-read-card-header">
              <button className="btn-header-action" onClick={handleBack}>
                <ArrowLeft size={14} />
                <span>Back</span>
              </button>
              <button className="btn-header-action" onClick={(e) => handleShare(e, article)}>
                <Share2 size={14} />
              </button>
            </div>

            {/* Bottom Overlay Card */}
            <div className="quick-read-card-details">
              <div className="quick-read-card-inner">
                {/* Meta details row */}
                <div className="quick-read-meta-row">
                  <span className="quick-read-source">{article.source}</span>
                  {article.matchedHoldings && article.matchedHoldings.length > 0 && (
                    <span className="quick-read-ticker-tag">
                      {article.matchedHoldings[0].replace(/\.(NS|BO)$/i, "").toUpperCase()}
                    </span>
                  )}
                  {/* Bookmark action */}
                  <button 
                    className={`btn-bookmark-action ${isBookmarked ? "active" : ""}`}
                    onClick={() => onToggleBookmark(article.id)}
                    title={isBookmarked ? "Remove Bookmark" : "Save Article"}
                  >
                    <Bookmark size={14} fill={isBookmarked ? "currentColor" : "none"} />
                  </button>
                </div>

                {/* Headline */}
                <h2 className="quick-read-title">{article.headline}</h2>

                {/* Brief Summary */}
                <p className="quick-read-summary">{article.summary}</p>

                {/* Read More button */}
                <a 
                  href={article.url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="quick-read-more-btn"
                >
                  Read More
                </a>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

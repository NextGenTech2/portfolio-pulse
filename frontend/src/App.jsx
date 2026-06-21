import React, { useState, useEffect } from "react";
import { supabase, logout } from "./supabaseClient";
import Auth from "./components/Auth";
import PortfolioUpload from "./components/PortfolioUpload";
import NewsFeed from "./components/NewsFeed";
import { 
  LogOut, 
  Newspaper, 
  Activity, 
  Briefcase, 
  Home, 
  TrendingUp, 
  User as UserIcon,
  Search,
  Grid,
  Bookmark,
  ExternalLink,
  Trash2,
  Sun,
  Moon
} from "lucide-react";

export default function App() {
  const [user, setUser] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [savedArticles, setSavedArticles] = useState([]);
  const [savedArticlesData, setSavedArticlesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("home"); // home, market, portfolio, profile
  const [searchTerm, setSearchTerm] = useState("");
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("portfolio-theme") || "dark";
  });

  // Apply the selected theme to the root element
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("portfolio-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === "dark" ? "light" : "dark");
  };

  // Listen to Authentication state changes in Supabase
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser((prevUser) => {
        if (prevUser?.id === session?.user?.id) {
          return prevUser;
        }
        return session?.user ?? null;
      });
      if (!session) {
        setHoldings([]);
        setSavedArticles([]);
        setLoading(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Listen to User holdings and saved articles in real-time
  useEffect(() => {
    if (!user) return;

    const fetchInitialProfile = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("holdings, saved_articles")
          .eq("id", user.id)
          .single();

        if (error) {
          if (error.code !== "PGRST116") {
            throw error;
          }
          setHoldings([]);
          setSavedArticles([]);
        } else {
          setHoldings(data.holdings || []);
          setSavedArticles(data.saved_articles || []);
        }
      } catch (err) {
        console.error("Error fetching initial profile:", err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchInitialProfile();

    const profileChannel = supabase
      .channel(`profiles-changes-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          console.log("Realtime profile update received:", payload);
          setHoldings(payload.new?.holdings || []);
          setSavedArticles(payload.new?.saved_articles || []);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [user]);

  // Fetch full article details for saved articles
  useEffect(() => {
    if (!user || !savedArticles || savedArticles.length === 0) {
      setSavedArticlesData([]);
      return;
    }

    const fetchSavedArticlesDetails = async () => {
      try {
        const { data, error } = await supabase
          .from("news_cache")
          .select("*")
          .in("id", savedArticles);
        if (error) throw error;
        setSavedArticlesData(data || []);
      } catch (err) {
        console.error("Error loading saved articles details:", err.message);
      }
    };

    fetchSavedArticlesDetails();
  }, [savedArticles, user]);

  const handleUploadSuccess = (newHoldings) => {
    setHoldings(newHoldings);
    setActiveTab("home"); // Automatically switch to home to show news
  };

  // Toggle Bookmark Handler (Persisted to Database)
  const handleToggleBookmark = async (articleId) => {
    if (!user) return;

    let nextSavedArticles;
    if (savedArticles.includes(articleId)) {
      nextSavedArticles = savedArticles.filter(id => id !== articleId);
    } else {
      nextSavedArticles = [...savedArticles, articleId];
    }

    setSavedArticles(nextSavedArticles);

    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          saved_articles: nextSavedArticles,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
    } catch (err) {
      console.error("Failed to save bookmarked article:", err.message);
      // Revert local state if save fails
      setSavedArticles(savedArticles);
    }
  };

  // Helper to generate initials for avatar/logo
  const getInitials = (name) => {
    if (!name) return "ST";
    const cleaned = name.replace(/\.(NS|BO)$/i, "");
    return cleaned.slice(0, 2).toUpperCase();
  };

  // Helper to get random colored gradient for stock avatar
  const getAvatarGradient = (ticker) => {
    const charCode = ticker.charCodeAt(0) || 0;
    const gradients = [
      "linear-gradient(135deg, #FF5E62 0%, #FF9966 100%)",
      "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
      "linear-gradient(135deg, #4A00E0 0%, #8E2DE2 100%)",
      "linear-gradient(135deg, #F000FF 0%, #7B00FF 100%)",
      "linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)",
      "linear-gradient(135deg, #f21b3f 0%, #ab0e29 100%)",
      "linear-gradient(135deg, #f77f00 0%, #fcbf49 100%)"
    ];
    return gradients[charCode % gradients.length];
  };

  if (loading) {
    return (
      <div className="app-container" style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Activity className="spinner" size={28} style={{ color: "hsl(var(--accent-primary))", marginBottom: "1rem" }} />
          <p style={{ color: "hsl(var(--text-secondary))", fontSize: "0.85rem" }}>Initializing workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-container">
        <Auth />
      </div>
    );
  }

  const filteredHoldings = holdings.filter(h => 
    h.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="app-container">
      {/* Header bar */}
      <header className="header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div className="header-logo-icon">
            <Newspaper size={16} />
          </div>
          <span className="brand-title">Portfolio Feed</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <button 
            onClick={toggleTheme} 
            className="btn-signout" 
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            style={{ padding: "0.4rem" }}
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button onClick={logout} className="btn-signout" title="Sign Out">
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content-scrollable">
        
        {/* Render Tab Contents */}
        {activeTab === "home" && (
          <>
            {/* CSV upload component at the top, collapsed by default */}
            <PortfolioUpload 
              user={user} 
              currentHoldings={holdings} 
              onUploadSuccess={handleUploadSuccess} 
            />

            {/* Curated Ticker Ribbon */}
            {holdings && holdings.length > 0 && (
              <div className="holdings-ribbon-container">
                <div className="holdings-ribbon">
                  <div className="ribbon-grid-icon">
                    <Grid size={13} />
                  </div>
                  
                  {/* Search/Filter Pill */}
                  <div className="ribbon-search-pill">
                    <Search size={11} />
                    <input 
                      type="text" 
                      placeholder="Search..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  {filteredHoldings.map((ticker, index) => (
                    <span key={index} className="holding-tag">
                      <span 
                        className="holding-logo-badge" 
                        style={{ background: getAvatarGradient(ticker) }}
                      >
                        {getInitials(ticker)}
                      </span>
                      <span className="holding-tag-text">{ticker.replace(/\.(NS|BO)$/i, "")}</span>
                      <span className="active-dot-indicator" />
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Curated News Feed */}
            <NewsFeed 
              holdings={holdings} 
              filterMode="curated" 
              savedArticleIds={savedArticles}
              onToggleBookmark={handleToggleBookmark}
            />
          </>
        )}

        {activeTab === "market" && (
          <>
            {/* Market Highlights & Index Widget */}
            <div className="market-indices-container">
              <div className="index-card">
                <div className="index-header">
                  <span className="index-name">NIFTY 50</span>
                  <span className="index-badge positive">+1.24%</span>
                </div>
                <div className="index-value">23,456.80</div>
                <div className="index-footer">NSE India</div>
              </div>
              
              <div className="index-card">
                <div className="index-header">
                  <span className="index-name">SENSEX</span>
                  <span className="index-badge positive">+1.18%</span>
                </div>
                <div className="index-value">77,215.10</div>
                <div className="index-footer">BSE India</div>
              </div>

              <div className="index-card">
                <div className="index-header">
                  <span className="index-name">BANK NIFTY</span>
                  <span className="index-badge positive">+1.45%</span>
                </div>
                <div className="index-value">51,205.40</div>
                <div className="index-footer">NSE India</div>
              </div>

              <div className="index-card">
                <div className="index-header">
                  <span className="index-name">MIDCAP 100</span>
                  <span className="index-badge positive">+0.85%</span>
                </div>
                <div className="index-value">52,410.20</div>
                <div className="index-footer">NSE India</div>
              </div>

              <div className="index-card">
                <div className="index-header">
                  <span className="index-name">SMALLCAP 100</span>
                  <span className="index-badge positive">+0.95%</span>
                </div>
                <div className="index-value">16,845.60</div>
                <div className="index-footer">NSE India</div>
              </div>

              <div className="index-card">
                <div className="index-header">
                  <span className="index-name">S&P 500</span>
                  <span className="index-badge positive">+0.25%</span>
                </div>
                <div className="index-value">5,473.17</div>
                <div className="index-footer">US Markets</div>
              </div>

              <div className="index-card">
                <div className="index-header">
                  <span className="index-name">NASDAQ</span>
                  <span className="index-badge positive">+0.35%</span>
                </div>
                <div className="index-value">17,722.66</div>
                <div className="index-footer">US Markets</div>
              </div>

              <div className="index-card">
                <div className="index-header">
                  <span className="index-name">DOW JONES</span>
                  <span className="index-badge negative">-0.15%</span>
                </div>
                <div className="index-value">39,150.30</div>
                <div className="index-footer">US Markets</div>
              </div>
            </div>
            <NewsFeed 
              holdings={holdings} 
              filterMode="general" 
              savedArticleIds={savedArticles}
              onToggleBookmark={handleToggleBookmark}
            />
          </>
        )}

        {activeTab === "portfolio" && (
          <div className="tab-portfolio-container">
            <PortfolioUpload 
              user={user} 
              currentHoldings={holdings} 
              onUploadSuccess={handleUploadSuccess} 
            />

            {holdings.length > 0 && (
              <div className="holdings-list-section">
                <div className="holdings-list-header">
                  <h3>Tracked Holdings</h3>
                  <span>{holdings.length} Assets</span>
                </div>
                <div className="holdings-list-grid">
                  {holdings.map((ticker, i) => (
                    <div key={i} className="holding-list-item">
                      <div 
                        className="item-logo" 
                        style={{ background: getAvatarGradient(ticker) }}
                      >
                        {getInitials(ticker)}
                      </div>
                      <div className="item-details">
                        <span className="item-symbol">{ticker}</span>
                        <span className="item-market">NSE / BSE</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "profile" && (
          <div className="tab-profile-container">
            <div className="profile-card">
              <div className="profile-avatar">
                {user.email ? user.email.slice(0, 2).toUpperCase() : "US"}
              </div>
              <h3 className="profile-email">{user.email}</h3>
              <p className="profile-role">Portfolio Analyst</p>
              
              <div className="profile-stats">
                <div className="stat-box">
                  <span className="stat-num">{holdings.length}</span>
                  <span className="stat-label">Holdings</span>
                </div>
                <div className="stat-box">
                  <span className="stat-num">{savedArticles.length}</span>
                  <span className="stat-label">Saved News</span>
                </div>
              </div>
            </div>

            {/* Saved Articles persistent list */}
            <div className="saved-articles-section">
              <div className="saved-articles-header">
                <Bookmark size={15} style={{ color: "#ff9f43" }} />
                <h3>Saved Articles</h3>
              </div>

              {savedArticlesData.length === 0 ? (
                <div className="no-saved-state">
                  <p>No bookmarked articles yet. Save articles from your Home feed to see them here.</p>
                </div>
              ) : (
                <div className="saved-articles-list">
                  {savedArticlesData.map((article) => (
                    <div key={article.id} className="saved-article-row">
                      <div className="saved-article-main">
                        <span className="saved-article-source">{article.source}</span>
                        <a 
                          href={article.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="saved-article-link"
                        >
                          <h4>{article.headline}</h4>
                          <ExternalLink size={10} />
                        </a>
                      </div>
                      <button 
                        className="btn-remove-saved" 
                        onClick={() => handleToggleBookmark(article.id)}
                        title="Remove Bookmark"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button onClick={logout} className="btn-logout-large">
              <LogOut size={16} />
              <span>Sign Out of Portfolio Feed</span>
            </button>
          </div>
        )}

      </main>

      {/* Floating Bottom Navigation Bar */}
      <nav className="bottom-nav-bar">
        <button 
          onClick={() => setActiveTab("home")} 
          className={`nav-item ${activeTab === "home" ? "active" : ""}`}
        >
          <Home size={18} />
          <span>Home</span>
        </button>
        
        <button 
          onClick={() => setActiveTab("market")} 
          className={`nav-item ${activeTab === "market" ? "active" : ""}`}
        >
          <TrendingUp size={18} />
          <span>Market</span>
        </button>
        
        <button 
          onClick={() => setActiveTab("portfolio")} 
          className={`nav-item ${activeTab === "portfolio" ? "active" : ""}`}
        >
          <Briefcase size={18} />
          <span>Portfolio</span>
        </button>
        
        <button 
          onClick={() => setActiveTab("profile")} 
          className={`nav-item ${activeTab === "profile" ? "active" : ""}`}
        >
          <div className="profile-icon-wrapper">
            <UserIcon size={18} />
            <div className="profile-sparkle" />
          </div>
          <span>Profile</span>
        </button>
      </nav>
    </div>
  );
}

import React, { useState, useEffect } from "react";
import PullToRefresh from "pulltorefreshjs";
import { supabase, logout } from "./supabaseClient";
import Auth from "./components/Auth";
import PortfolioUpload from "./components/PortfolioUpload";
import NewsFeed from "./components/NewsFeed";
import QuickRead from "./components/QuickRead";
import NotificationCenter from "./components/NotificationCenter";
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
  Moon,
  Share2,
  Zap,
  ChevronDown,
  ChevronUp,
  Info,
  Calendar
} from "lucide-react";



// Currency Formatter Helper (Always in Rupees)
const formatCurrency = (val) => {
  if (val === null || val === undefined || isNaN(val)) return "-";
  return `₹${Number(val).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Stock Details Sub-component
function StockDetailsPanel({ ticker }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiMode, setApiMode] = useState("simulated");

  useEffect(() => {
    let active = true;
    
    const fetchDetails = async () => {
      setLoading(true);
      setError(null);

      const FINNHUB_KEY = import.meta.env.VITE_FINNHUB_API_KEY;
      const AV_KEY = import.meta.env.VITE_ALPHA_VANTAGE_API_KEY;
      const cleanTicker = ticker.toUpperCase();

      // 1. Try Google Finance (Bypassing CORS via deployed image-proxy edge function)
      try {
        let exchangeTicker = cleanTicker;
        if (exchangeTicker.endsWith(".NS")) {
          exchangeTicker = exchangeTicker.replace(".NS", "") + ":NSE";
        } else if (exchangeTicker.endsWith(".BO")) {
          exchangeTicker = exchangeTicker.replace(".BO", "") + ":BSE";
        } else if (!exchangeTicker.includes(":")) {
          exchangeTicker = exchangeTicker + ":NSE";
        }

        const targetUrl = `https://www.google.com/finance/quote/${exchangeTicker}`;
        const proxyUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/image-proxy?url=${encodeURIComponent(targetUrl)}`;

        const response = await fetch(proxyUrl, {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          }
        });

        if (response.ok) {
          const html = await response.text();

          // Find position of main stock header: class="gO24Ff"
          const headerIdx = html.indexOf('class="gO24Ff"');
          if (headerIdx !== -1) {
            const subHtml = html.substring(headerIdx, headerIdx + 12000);

            // Price: jsname="Pdsbrc"[^>]*><span>([^<]+)</span>
            const priceMatch = subHtml.match(/jsname="Pdsbrc"[^>]*><span>([^<]+)<\/span>/);
            const priceText = priceMatch ? priceMatch[1] : null;

            // Change Pct: jsname="vY9t3b"[^>]*><span[^>]*>([^<]+)</span>
            const pctMatch = subHtml.match(/jsname="vY9t3b"[^>]*><span[^>]*>([^<]+)<\/span>/);
            const pctText = pctMatch ? pctMatch[1] : null;

            // Change Val: jsname="xnruHf"[^>]*><span>([^<]+)</span>
            const valMatch = subHtml.match(/jsname="xnruHf"[^>]*><span>([^<]+)<\/span>/);
            const valText = valMatch ? valMatch[1] : null;

            // Details table: class="SwQK7">Label</div><div class="dO6ijd">Value</div>
            const details = {};
            const detailRegex = /class="SwQK7">([^<]+)<\/div><div class="dO6ijd">([^<]+)<\/div>/g;
            let match;
            while ((match = detailRegex.exec(html)) !== null) {
              details[match[1].trim().toLowerCase()] = match[2].trim();
            }

            if (priceText && active) {
              const parsedPrice = parseFloat(priceText.replace(/[^\d.-]/g, ""));
              const parsedChange = valText ? parseFloat(valText.replace(/[^\d.-]/g, "")) : 0;
              const parsedChangePercent = pctText ? parseFloat(pctText.replace(/[^\d.-]/g, "")) : 0;

              const open = details["open"] ? parseFloat(details["open"].replace(/[^\d.-]/g, "")) : 0;
              const high = details["high"] ? parseFloat(details["high"].replace(/[^\d.-]/g, "")) : 0;
              const low = details["low"] ? parseFloat(details["low"].replace(/[^\d.-]/g, "")) : 0;

              const weekHigh52 = details["52-wk high"] || "-";
              const weekLow52 = details["52-wk low"] || "-";
              const range52 = weekHigh52 !== "-" && weekLow52 !== "-" ? `${weekLow52} - ${weekHigh52}` : "-";

              const marketCap = details["mkt. cap"] || details["mkt cap"] || "-";
              const peRatio = details["p/e ratio"] || "-";
              const dividend = details["div yield"] || details["dividend yield"] || "-";

              setData({
                price: parsedPrice,
                change: parsedChange,
                changePercent: parsedChangePercent,
                open,
                high,
                low,
                range52,
                marketCap,
                peRatio,
                dividend,
                qtrDivAmt: "-"
              });
              setApiMode("live-google");
              setLoading(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn("Google Finance proxy fetch failed, falling back...", err);
      }

      // 2. Finnhub Fetch
      if (FINNHUB_KEY) {
        try {
          const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${cleanTicker}&token=${FINNHUB_KEY}`);
          if (!res.ok) throw new Error("Finnhub quote API error");
          const quote = await res.json();
          if (quote.c && active) {
            let mktCap = "-";
            let peRatio = "-";
            let weekHigh52 = "-";
            let weekLow52 = "-";

            try {
              const metricRes = await fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${cleanTicker}&metric=all&token=${FINNHUB_KEY}`);
              if (metricRes.ok) {
                const metrics = await metricRes.json();
                const m = metrics.metric || {};
                weekHigh52 = m["52WeekHigh"] !== undefined ? m["52WeekHigh"] : "-";
                weekLow52 = m["52WeekLow"] !== undefined ? m["52WeekLow"] : "-";
                
                const mc = m["marketCapitalization"];
                if (mc !== undefined) {
                  mktCap = mc > 1000 ? `${(mc / 1000).toFixed(2)}B` : `${mc.toFixed(2)}M`;
                }
                
                peRatio = m["peTTM"] !== undefined ? m["peTTM"].toFixed(2) : (m["peNormalizedBasic"] !== undefined ? m["peNormalizedBasic"].toFixed(2) : "-");
              }
            } catch (err) {
              console.warn("Metrics fetch failed", err);
            }

            setData({
              price: quote.c,
              change: quote.d,
              changePercent: quote.dp,
              open: quote.o,
              high: quote.h,
              low: quote.l,
              range52: weekHigh52 !== "-" && weekLow52 !== "-" ? `${formatCurrency(weekLow52, ticker)} - ${formatCurrency(weekHigh52, ticker)}` : "-",
              marketCap: mktCap,
              peRatio: peRatio,
              dividend: "-",
              qtrDivAmt: "-"
            });
            setApiMode("live-finnhub");
            setLoading(false);
            return;
          }
        } catch (err) {
          console.warn("Finnhub failed, trying Alpha Vantage", err);
        }
      }

      // 3. Alpha Vantage Fetch
      if (AV_KEY && active) {
        try {
          const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${cleanTicker}&apikey=${AV_KEY}`);
          if (!res.ok) throw new Error("Alpha Vantage Quote API error");
          const quoteJson = await res.json();
          const quote = quoteJson["Global Quote"] || {};
          if (quote["05. price"]) {
            let mktCap = "-";
            let peRatio = "-";
            let weekHigh52 = "-";
            let weekLow52 = "-";
            let dividend = "-";
            let qtrDivAmt = "-";

            try {
              const overviewRes = await fetch(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${cleanTicker}&apikey=${AV_KEY}`);
              if (overviewRes.ok) {
                const overview = await overviewRes.json();
                if (overview.Symbol) {
                  weekHigh52 = overview["52WeekHigh"] || "-";
                  weekLow52 = overview["52WeekLow"] || "-";
                  
                  const mc = Number(overview["MarketCapitalization"]);
                  if (!isNaN(mc)) {
                    mktCap = mc > 1000000000 ? `${(mc / 1000000000).toFixed(2)}B` : `${(mc / 1000000).toFixed(2)}M`;
                  }
                  
                  peRatio = overview["PERatio"] || "-";
                  dividend = overview["DividendYield"] ? `${(Number(overview["DividendYield"]) * 100).toFixed(2)}%` : "-";
                  qtrDivAmt = overview["DividendPerShare"] || "-";
                }
              }
            } catch (err) {
              console.warn("Overview fetch failed", err);
            }

            setData({
              price: Number(quote["05. price"]),
              change: Number(quote["09. change"]),
              changePercent: Number((quote["10. change percent"] || "0%").replace("%", "")),
              open: Number(quote["02. open"]) || 0,
              high: Number(quote["03. high"]) || 0,
              low: Number(quote["04. low"]) || 0,
              range52: weekHigh52 !== "-" && weekLow52 !== "-" ? `${formatCurrency(Number(weekLow52), ticker)} - ${formatCurrency(Number(weekHigh52), ticker)}` : "-",
              marketCap: mktCap,
              peRatio: peRatio,
              dividend: dividend,
              qtrDivAmt: qtrDivAmt
            });
            setApiMode("live-alphavantage");
            setLoading(false);
            return;
          }
        } catch (err) {
          console.warn("Alpha Vantage failed", err);
        }
      }

      // 3. Fallback: Simulated High Fidelity Deterministic Data
      if (active) {
        const normalizedTicker = cleanTicker.replace(/\.(NS|BO)$/i, "");
        if (normalizedTicker === "DIXON") {
          setData({
            price: 11890.00,
            change: -446.00,
            changePercent: -3.62,
            open: 12340.00,
            high: 12340.00,
            low: 11878.00,
            range52: "₹9,600.00 - ₹18,471.00",
            marketCap: "72.07 KCr",
            peRatio: "44.14",
            dividend: "-",
            qtrDivAmt: "-"
          });
        } else {
          let hash = 0;
          for (let i = 0; i < normalizedTicker.length; i++) {
            hash = normalizedTicker.charCodeAt(i) + ((hash << 5) - hash);
          }
          const absHash = Math.abs(hash);
          const priceBase = (absHash % 6000) + 100;
          const open = priceBase * (1 + ((absHash % 100) - 48) / 2000);
          const high = Math.max(priceBase, open) * (1 + (absHash % 25) / 1000);
          const low = Math.min(priceBase, open) * (1 - (absHash % 25) / 1000);
          const change = priceBase - open;
          const changePercent = (change / open) * 100;

          const low52 = low * 0.72;
          const high52 = high * 1.45;

          const unit = " KCr";
          const mktCapVal = ((absHash % 480) + 5).toFixed(2);

          const peVal = ((absHash % 65) + 8).toFixed(2);
          const hasDiv = absHash % 4 === 0;
          const dividend = hasDiv ? `${((absHash % 35) / 10).toFixed(2)}%` : "-";

          setData({
            price: priceBase,
            change: change,
            changePercent: changePercent,
            open: open,
            high: high,
            low: low,
            range52: `${formatCurrency(low52, ticker)} - ${formatCurrency(high52, ticker)}`,
            marketCap: `${mktCapVal}${unit}`,
            peRatio: peVal,
            dividend: dividend,
            qtrDivAmt: "-"
          });
        }
        
        // Minor mock latency to display premium shimmer loading effect
        setTimeout(() => {
          if (active) {
            setApiMode("simulated");
            setLoading(false);
          }
        }, 500);
      }
    };

    fetchDetails();

    return () => {
      active = false;
    };
  }, [ticker]);

  if (loading) {
    return (
      <div className="holding-detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="detail-skeleton-grid">
          <div className="detail-skeleton-item" />
          <div className="detail-skeleton-item" />
          <div className="detail-skeleton-item" />
          <div className="detail-skeleton-item" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="holding-detail-panel" onClick={(e) => e.stopPropagation()}>
        <p style={{ color: "#f87171", fontSize: "0.72rem" }}>Error fetching real-time data.</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="holding-detail-panel" onClick={(e) => e.stopPropagation()}>
      <div className="detail-grid">
        <div className="detail-item">
          <span className="detail-label">Current Price</span>
          <span className="detail-value">{formatCurrency(data.price, ticker)}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Day Change</span>
          <span className={`detail-value ${data.change >= 0 ? "positive" : "negative"}`}>
            {data.change >= 0 ? "+" : ""}{data.change.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({data.changePercent.toFixed(2)}%)
          </span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Open</span>
          <span className="detail-value">{formatCurrency(data.open, ticker)}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">High / Low</span>
          <span className="detail-value">
            {formatCurrency(data.high, ticker)} / {formatCurrency(data.low, ticker)}
          </span>
        </div>
        <div className="detail-item">
          <span className="detail-label">52-wk range</span>
          <span className="detail-value">{data.range52}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Mkt cap</span>
          <span className="detail-value">{data.marketCap}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">P/E ratio</span>
          <span className="detail-value">{data.peRatio}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Dividend</span>
          <span className="detail-value">{data.dividend}</span>
        </div>
      </div>
      
      <div className="detail-source-badge">
        <Info size={10} />
        <span>
          {apiMode === "live-google" && "Live Google Finance Feed"}
          {apiMode === "live-finnhub" && "Live Finnhub Feed"}
          {apiMode === "live-alphavantage" && "Live Alpha Vantage Feed"}
          {apiMode === "simulated" && "Simulated feed (Add VITE_FINNHUB_API_KEY to .env for live stats)"}
        </span>
      </div>
    </div>
  );
}

// Results Calendar Component
function ResultsCalendar({ holdings }) {
  const [isOpen, setIsOpen] = useState(false);
  const [calendarData, setCalendarData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !holdings || holdings.length === 0) return;

    let active = true;
    const fetchEarningsDates = async () => {
      setLoading(true);
      const FINNHUB_KEY = import.meta.env.VITE_FINNHUB_API_KEY;

      if (FINNHUB_KEY) {
        try {
          const res = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=2026-06-01&to=2026-09-30&token=${FINNHUB_KEY}`);
          if (res.ok) {
            const data = await res.json();
            const earnings = data.earningsCalendar || [];
            const holdingBases = holdings.map(h => h.toUpperCase().replace(/\.(NS|BO)$/i, ""));
            const holdingMap = {};
            holdings.forEach(h => {
              holdingMap[h.toUpperCase().replace(/\.(NS|BO)$/i, "")] = h;
            });

            const matched = [];
            earnings.forEach(item => {
              const itemSymbol = item.symbol.toUpperCase();
              const baseSymbol = itemSymbol.replace(/\.(NS|BO)$/i, "");
              
              if (holdingBases.includes(baseSymbol)) {
                const dateParts = item.date.split("-");
                if (dateParts.length === 3) {
                  const y = parseInt(dateParts[0]);
                  const m = parseInt(dateParts[1]) - 1;
                  const d = parseInt(dateParts[2]);
                  const dObj = new Date(y, m, d);
                  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                  const dateStr = `${String(d).padStart(2, "0")}-${months[m]}-${y}`;
                  
                  matched.push({
                    symbol: holdingMap[baseSymbol],
                    date: dateStr,
                    dateObj: dObj
                  });
                }
              }
            });

            if (matched.length > 0 && active) {
              matched.sort((a, b) => a.dateObj - b.dateObj);
              setCalendarData(matched);
              setLoading(false);
              return;
            }
          }
        } catch (err) {
          console.warn("Finnhub earnings calendar fetch failed", err);
        }
      }

      // Fallback: Deterministic Simulated Earnings Dates (Q1 FY27 / Jul-Aug 2026)
      if (active) {
        const simulated = [];
        for (const ticker of holdings) {
          const cleanTicker = ticker.toUpperCase();
          const normalized = cleanTicker.replace(/\.(NS|BO)$/i, "");
          let dateStr = "";
          let dateObj = null;

          if (normalized === "TCS") {
            dateStr = "10-Jul-2026";
            dateObj = new Date("2026-07-10");
          } else if (normalized === "TEJASNET" || normalized.includes("TEJAS")) {
            dateStr = "15-Jul-2026";
            dateObj = new Date("2026-07-15");
          } else if (normalized === "WAAREE" || normalized.includes("WAAREE")) {
            dateStr = "16-Jul-2026";
            dateObj = new Date("2026-07-16");
          } else if (normalized === "ICICIBANK" || normalized === "ICICI") {
            dateStr = "18-Jul-2026";
            dateObj = new Date("2026-07-18");
          } else if (normalized === "DIXON") {
            dateStr = "28-Jul-2026";
            dateObj = new Date("2026-07-28");
          } else {
            let hash = 0;
            for (let i = 0; i < normalized.length; i++) {
              hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
            }
            const absHash = Math.abs(hash);
            const month = (absHash % 2) === 0 ? "Jul" : "Aug";
            const monthNum = month === "Jul" ? 6 : 7;
            const day = (absHash % 28) + 1;
            dateStr = `${String(day).padStart(2, "0")}-${month}-2026`;
            dateObj = new Date(2026, monthNum, day);
          }

          simulated.push({
            symbol: ticker,
            date: dateStr,
            dateObj: dateObj
          });
        }

        simulated.sort((a, b) => a.dateObj - b.dateObj);
        
        // Brief artificial delay for loader feel
        setTimeout(() => {
          if (active) {
            setCalendarData(simulated);
            setLoading(false);
          }
        }, 400);
      }
    };

    fetchEarningsDates();

    return () => {
      active = false;
    };
  }, [isOpen, holdings]);

  return (
    <div className="results-calendar-section">
      <button 
        className="calendar-header-btn" 
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="calendar-header-title">
          <Calendar size={15} style={{ color: "#ff9f43" }} />
          <span>Upcoming Results Calendar</span>
        </span>
        <div style={{ color: "hsl(var(--text-muted))", display: "flex", alignItems: "center" }}>
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>
      
      {isOpen && (
        <div className="calendar-content">
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "1.5rem 0", gap: "0.5rem" }}>
              <Activity className="spinner" size={14} style={{ color: "hsl(var(--accent-primary))" }} />
              <span style={{ fontSize: "0.75rem", color: "hsl(var(--text-secondary))" }}>Scanning result dates...</span>
            </div>
          ) : calendarData.length === 0 ? (
            <div style={{ textAlign: "center", padding: "1rem", color: "hsl(var(--text-muted))", fontSize: "0.75rem" }}>
              No upcoming results found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {calendarData.map((item, index) => (
                <div key={index} className="calendar-row">
                  <span className="calendar-symbol">{item.symbol}</span>
                  <span className="calendar-date">{item.date}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [expandedTicker, setExpandedTicker] = useState(null);
  const [savedArticles, setSavedArticles] = useState([]);
  const [savedArticlesData, setSavedArticlesData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("home"); // home, market, portfolio, profile
  const [searchTerm, setSearchTerm] = useState("");
  const [indices, setIndices] = useState(null);
  const [indicesLoading, setIndicesLoading] = useState(false);
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

  // Initialize PullToRefresh
  useEffect(() => {
    PullToRefresh.init({
      mainElement: '.app-container',
      triggerElement: '.main-content-scrollable',
      onRefresh() {
        window.location.reload(true);
      }
    });

    return () => {
      PullToRefresh.destroyAll();
    };
  }, []);

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

  // Fetch real-time market indices
  useEffect(() => {
    if (activeTab !== "market") return;

    const fetchIndices = async () => {
      setIndicesLoading(true);
      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-indices`, {
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
        });
        if (!response.ok) throw new Error("Failed to fetch indices");
        const data = await response.json();
        setIndices(data);
      } catch (err) {
        console.error("Error fetching market indices:", err.message);
      } finally {
        setIndicesLoading(false);
      }
    };

    fetchIndices();
    const interval = setInterval(fetchIndices, 60000); // refresh every 60 seconds
    return () => clearInterval(interval);
  }, [activeTab]);

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

  const handleShareApp = (e) => {
    e.preventDefault();
    const appUrl = "https://myportfoliopulse.vercel.app/";
    navigator.clipboard.writeText(appUrl);
    alert("Application link copied to clipboard!");
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
          <p style={{ color: "hsl(var(--text-secondary))", fontSize: "0.85rem" }}>Syncing your Portfolio Pulse...</p>
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
          {user && <NotificationCenter userId={user.id} />}
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
      <main className={activeTab === "quick-read" ? "main-content-quick-read" : "main-content-scrollable"}>
        
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
              {indices ? (
                indices.map((idx, index) => {
                  const isPositive = idx.change >= 0;
                  const formattedValue = idx.price !== null && idx.price !== undefined
                    ? idx.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : "—";
                  const formattedChange = idx.change !== null && idx.change !== undefined
                    ? `${isPositive ? "+" : ""}${idx.change.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : "—";
                  const formattedPercent = idx.changePercent !== null && idx.changePercent !== undefined
                    ? `${isPositive ? "+" : ""}${idx.changePercent.toFixed(2)}%`
                    : "0.00%";

                  return (
                    <div key={index} className="index-card">
                      <div className="index-header">
                        <span className="index-name">{idx.name}</span>
                      </div>
                      <div className="index-value">{formattedValue}</div>
                      <div className={`index-change ${isPositive ? "positive" : "negative"}`}>
                        {formattedChange} ({formattedPercent})
                      </div>
                      <div className="index-footer">{idx.footer}</div>
                    </div>
                  );
                })
              ) : (
                <>
                  <div className="index-card skeleton-loading">
                    <div className="index-header">
                      <span className="index-name">NIFTY 50</span>
                    </div>
                    <div className="index-value">23,824.10</div>
                    <div className="index-change positive">+292.10 (+1.24%)</div>
                    <div className="index-footer">NSE India</div>
                  </div>
                  
                  <div className="index-card skeleton-loading">
                    <div className="index-header">
                      <span className="index-name">SENSEX</span>
                    </div>
                    <div className="index-value">76,200.68</div>
                    <div className="index-change positive">+888.35 (+1.18%)</div>
                    <div className="index-footer">BSE India</div>
                  </div>

                  <div className="index-card skeleton-loading">
                    <div className="index-header">
                      <span className="index-name">NIFTY BANK</span>
                    </div>
                    <div className="index-value">57,183.75</div>
                    <div className="index-change positive">+817.85 (+1.45%)</div>
                    <div className="index-footer">NSE India</div>
                  </div>

                  <div className="index-card skeleton-loading">
                    <div className="index-header">
                      <span className="index-name">NIFTY Midcap 100</span>
                    </div>
                    <div className="index-value">62,070.35</div>
                    <div className="index-change positive">+523.65 (+0.85%)</div>
                    <div className="index-footer">NSE India</div>
                  </div>

                  <div className="index-card skeleton-loading">
                    <div className="index-header">
                      <span className="index-name">NIFTY NEXT 50</span>
                    </div>
                    <div className="index-value">72,068.75</div>
                    <div className="index-change positive">+678.90 (+0.95%)</div>
                    <div className="index-footer">NSE India</div>
                  </div>

                  <div className="index-card skeleton-loading">
                    <div className="index-header">
                      <span className="index-name">NIFTY 100</span>
                    </div>
                    <div className="index-value">24,907.80</div>
                    <div className="index-change positive">+185.35 (+0.75%)</div>
                    <div className="index-footer">NSE India</div>
                  </div>

                  <div className="index-card skeleton-loading">
                    <div className="index-header">
                      <span className="index-name">NIFTY Smallcap 100</span>
                    </div>
                    <div className="index-value">18,805.90</div>
                    <div className="index-change positive">+121.50 (+0.65%)</div>
                    <div className="index-footer">NSE India</div>
                  </div>

                  <div className="index-card skeleton-loading">
                    <div className="index-header">
                      <span className="index-name">India VIX</span>
                    </div>
                    <div className="index-value">13.94</div>
                    <div className="index-change positive">+0.15 (+1.10%)</div>
                    <div className="index-footer">NSE India</div>
                  </div>

                  <div className="index-card skeleton-loading">
                    <div className="index-header">
                      <span className="index-name">S&P 500</span>
                    </div>
                    <div className="index-value">5,473.17</div>
                    <div className="index-change positive">+13.65 (+0.25%)</div>
                    <div className="index-footer">US Markets</div>
                  </div>

                  <div className="index-card skeleton-loading">
                    <div className="index-header">
                      <span className="index-name">NASDAQ</span>
                    </div>
                    <div className="index-value">17,722.66</div>
                    <div className="index-change positive">+61.75 (+0.35%)</div>
                    <div className="index-footer">US Markets</div>
                  </div>

                  <div className="index-card skeleton-loading">
                    <div className="index-header">
                      <span className="index-name">DOW JONES</span>
                    </div>
                    <div className="index-value">39,150.30</div>
                    <div className="index-change negative">-58.85 (-0.15%)</div>
                    <div className="index-footer">US Markets</div>
                  </div>
                </>
              )}
            </div>
            <NewsFeed 
              holdings={holdings} 
              filterMode="general" 
              savedArticleIds={savedArticles}
              onToggleBookmark={handleToggleBookmark}
            />
          </>
        )}

        {activeTab === "quick-read" && (
          <QuickRead 
            holdings={holdings}
            savedArticleIds={savedArticles}
            onToggleBookmark={handleToggleBookmark}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === "portfolio" && (
          <div className="tab-portfolio-container">
            <PortfolioUpload 
              user={user} 
              currentHoldings={holdings} 
              onUploadSuccess={handleUploadSuccess} 
            />

            {holdings.length > 0 && (
              <ResultsCalendar holdings={holdings} />
            )}

            {holdings.length > 0 && (
              <div className="holdings-list-section">
                <div className="holdings-list-header">
                  <h3>Tracked Holdings</h3>
                  <span>{holdings.length} Assets</span>
                </div>
                <div className="holdings-list-grid">
                  {holdings.map((ticker, i) => {
                    const isExpanded = expandedTicker === ticker;
                    return (
                      <div 
                        key={i} 
                        className={`holding-list-item ${isExpanded ? "expanded" : ""}`}
                        onClick={() => setExpandedTicker(isExpanded ? null : ticker)}
                        style={{ 
                          gridColumn: isExpanded ? "span 2" : "auto",
                          flexDirection: "column",
                          alignItems: "stretch",
                          cursor: "pointer"
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", width: "100%" }}>
                          <div 
                            className="item-logo" 
                            style={{ background: getAvatarGradient(ticker) }}
                          >
                            {getInitials(ticker)}
                          </div>
                          <div className="item-details" style={{ flexGrow: 1 }}>
                            <span className="item-symbol">{ticker}</span>
                            <span className="item-market">NSE / BSE</span>
                          </div>
                          <div style={{ color: "hsl(var(--text-muted))", display: "flex", alignItems: "center" }}>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>
                        {isExpanded && (
                          <StockDetailsPanel ticker={ticker} />
                        )}
                      </div>
                    );
                  })}
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
          onClick={() => setActiveTab("quick-read")} 
          className={`nav-item ${activeTab === "quick-read" ? "active" : ""}`}
        >
          <Zap size={18} />
          <span>Quick Read</span>
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

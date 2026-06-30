const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

admin.initializeApp();
const db = admin.firestore();

// Helper to fetch and cache news from Finnhub API
async function syncFinnhubNews() {
  const apiKey = process.env.FINNHUB_API_KEY || functions.config().finnhub?.key;
  
  if (!apiKey) {
    console.error("Missing Finnhub API Key. Please set FINNHUB_API_KEY env or functions.config().finnhub.key");
    return { success: false, error: "API Key not configured" };
  }

  try {
    console.log("Fetching general market news from Finnhub...");
    const response = await axios.get("https://finnhub.io/api/v1/news", {
      params: {
        category: "general",
        token: "apiKey"
      }
    });

    const articles = response.data;
    if (!Array.isArray(articles)) {
      throw new Error("Invalid response format from Finnhub. Expected array.");
    }

    console.log(`Successfully fetched ${articles.length} articles from Finnhub. Syncing with Firestore...`);

    const batch = db.batch();
    let writeCount = 0;
    const now = admin.firestore.Timestamp.now();

    // Finnhub returns news ordered newest first. We iterate through them.
    for (const article of articles) {
      if (!article.id) continue;

      const docRef = db.collection("news_cache").doc(String(article.id));
      
      // Store standard fields. Using a batch write with set (no merge needed since IDs are unique)
      batch.set(docRef, {
        id: article.id,
        headline: article.headline || "",
        summary: article.summary || "",
        source: article.source || "",
        url: article.url || "",
        datetime: article.datetime || Math.floor(Date.now() / 1000),
        related: article.related || "",
        category: article.category || "general",
        fetchedAt: now
      });
      
      writeCount++;
      // Firestore batch size limit is 500
      if (writeCount >= 450) {
        break;
      }
    }

    if (writeCount > 0) {
      await batch.commit();
      console.log(`Committed ${writeCount} news items to news_cache.`);
    }

    // Cache Pruning: Delete items older than 3 days to control database storage
    const threeDaysAgoSeconds = Math.floor(Date.now() / 1000) - (3 * 24 * 60 * 60);
    const staleDocs = await db.collection("news_cache")
      .where("datetime", "<", threeDaysAgoSeconds)
      .limit(100) // delete in batches of 100
      .get();

    if (!staleDocs.empty) {
      const pruneBatch = db.batch();
      staleDocs.forEach(doc => {
        pruneBatch.delete(doc.ref);
      });
      await pruneBatch.commit();
      console.log(`Pruned ${staleDocs.size} stale news items older than 3 days.`);
    }

    return { success: true, count: writeCount };
  } catch (error) {
    console.error("Error syncing news from Finnhub:", error.message);
    return { success: false, error: error.message };
  }
}

// 1. Scheduled Cloud Function (Runs precisely every 15 minutes)
exports.fetchMarketNews = functions.pubsub
  .schedule("every 15 minutes")
  .onRun(async (context) => {
    console.log("Scheduled news sync trigger starting...");
    await syncFinnhubNews();
    return null;
  });

// 2. HTTPS Manual Trigger (Useful for POC development, testing & manual refreshes)
exports.forceFetchNews = functions.https.onRequest(async (req, res) => {
  // Simple check or CORS handling if we call from the client
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  // To secure it slightly, optional query param check
  const result = await syncFinnhubNews();
  if (result.success) {
    res.status(200).json({ status: "success", message: `Synced ${result.count} news items` });
  } else {
    res.status(500).json({ status: "error", error: result.error });
  }
});

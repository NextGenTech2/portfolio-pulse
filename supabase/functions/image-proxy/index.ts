import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const urlObj = new URL(imageUrl);
    if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
      return new Response(JSON.stringify({ error: "Invalid protocol" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const remoteResp = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      }
    });
    
    if (!remoteResp.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch image" }), {
        status: remoteResp.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clone headers but ensure CORS is open for our frontend.
    const headers = new Headers(remoteResp.headers);
    for (const [key, value] of Object.entries(corsHeaders)) {
      headers.set(key, value);
    }
    
    // Disable caching for live quote data
    if (imageUrl.includes("yahoo.com") || imageUrl.includes("finance")) {
      headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      headers.set("Pragma", "no-cache");
      headers.set("Expires", "0");
    } else {
      // Optional caching – let the browser cache for a day.
      headers.set("Cache-Control", "public, max-age=86400");
    }

    // Stream the body directly.
    return new Response(remoteResp.body, {
      status: 200,
      headers,
    });
  } catch (e) {
    console.error("Image proxy error", e);
    return new Response(JSON.stringify({ error: "Invalid URL" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

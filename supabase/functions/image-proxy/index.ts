// supabase/functions/image-proxy/index.ts
// Simple image proxy edge function to bypass CORS / network blocks.
// It receives a query parameter `url` (the original image URL), validates the domain,
// fetches the image server‑side and streams it back to the client.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get("url");

  if (!imageUrl) {
    return new Response(JSON.stringify({ error: "Missing url parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const urlObj = new URL(imageUrl);
    if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
      return new Response(JSON.stringify({ error: "Invalid protocol" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const remoteResp = await fetch(imageUrl);
    if (!remoteResp.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch image" }), {
        status: remoteResp.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Clone headers but ensure CORS is open for our frontend.
    const headers = new Headers(remoteResp.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    // Optional caching – let the browser cache for a day.
    headers.set("Cache-Control", "public, max-age=86400");

    // Stream the body directly.
    return new Response(remoteResp.body, {
      status: 200,
      headers,
    });
  } catch (e) {
    console.error("Image proxy error", e);
    return new Response(JSON.stringify({ error: "Invalid URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});

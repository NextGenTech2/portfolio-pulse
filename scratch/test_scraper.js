const url = "https://dkzaqjvtjromwyebrkbo.supabase.co/functions/v1/image-proxy?url=" + encodeURIComponent("https://www.google.com/finance/quote/AARTISURF:NSE");

fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0'
  }
})
.then(res => res.text())
.then(html => {
  console.log("Fetched HTML length:", html.length);
  const headerIdx = html.indexOf('class="gO24Ff"');
  console.log("headerIdx:", headerIdx);
  if (headerIdx !== -1) {
    const subHtml = html.substring(headerIdx, headerIdx + 12000);
    
    const priceMatch = subHtml.match(/jsname="Pdsbrc"[^>]*><span>([^<]+)<\/span>/);
    const priceText = priceMatch ? priceMatch[1] : null;

    const pctMatch = subHtml.match(/jsname="vY9t3b"[^>]*><span[^>]*>([^<]+)<\/span>/);
    const pctText = pctMatch ? pctMatch[1] : null;

    const valMatch = subHtml.match(/jsname="xnruHf"[^>]*><span>([^<]+)<\/span>/);
    const valText = valMatch ? valMatch[1] : null;

    console.log("Parsed price:", priceText);
    console.log("Parsed pct:", pctText);
    console.log("Parsed val:", valText);

    const details = {};
    const detailRegex = /class="SwQK7">([^<]+)<\/div><div class="dO6ijd">([^<]+)<\/div>/g;
    let match;
    while ((match = detailRegex.exec(html)) !== null) {
      details[match[1].trim().toLowerCase()] = match[2].trim();
    }

    console.log("Parsed details:", details);
  } else {
    console.log("Header class not found in HTML");
  }
})
.catch(err => console.error("Error:", err));

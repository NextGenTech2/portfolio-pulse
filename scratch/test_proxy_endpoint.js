const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremFxanZ0anJvbXd5ZWJya2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3Mjc0MzEsImV4cCI6MjA5NjMwMzQzMX0.FpCCycywS5diSuZxTaPp4uqFpEBrY4blFgHbMbdaX1Y";
const url = "https://dkzaqjvtjromwyebrkbo.supabase.co/functions/v1/image-proxy?url=" + encodeURIComponent("https://www.google.com/finance/quote/AARTISURF:NSE");

fetch(url, {
  headers: {
    'Authorization': `Bearer ${anonKey}`
  }
})
.then(async res => {
  console.log("Status:", res.status);
  console.log("Headers:", Object.fromEntries(res.headers.entries()));
  const text = await res.text();
  console.log("Body length:", text.length);
  if (res.status !== 200) {
    console.log("Error Body:", text);
  } else {
    console.log("Preview of HTML:", text.substring(0, 500));
  }
})
.catch(err => console.error("Fetch Error:", err));

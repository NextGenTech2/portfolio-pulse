import urllib.request
import urllib.parse
import re

target_url = "https://www.google.com/finance/quote/AARTISURF:NSE"
proxy_url = "https://dkzaqjvtjromwyebrkbo.supabase.co/functions/v1/image-proxy?url=" + urllib.parse.quote(target_url)

try:
    req = urllib.request.Request(
        proxy_url, 
        headers={'User-Agent': 'Mozilla/5.0'}
    )
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        
        # Find position of main stock header: class="gO24Ff"
        header_idx = html.find('class="gO24Ff"')
        if header_idx != -1:
            print("Found main stock header at:", header_idx)
            sub_html = html[header_idx:header_idx+10000] # Look at the next 10KB
            
            # 1. Price: jsname="Pdsbrc"[^>]*><span>([^<]+)</span>
            price_match = re.search(r'jsname="Pdsbrc"[^>]*><span>([^<]+)</span>', sub_html)
            price_text = price_match.group(1) if price_match else "Not Found"
            
            # 2. Change Pct: jsname="vY9t3b"[^>]*><span[^>]*>([^<]+)</span>
            pct_match = re.search(r'jsname="vY9t3b"[^>]*><span[^>]*>([^<]+)</span>', sub_html)
            pct_text = pct_match.group(1) if pct_match else "Not Found"
            
            # 3. Change Val: jsname="xnruHf"[^>]*><span>([^<]+)</span>
            val_match = re.search(r'jsname="xnruHf"[^>]*><span>([^<]+)</span>', sub_html)
            val_text = val_match.group(1) if val_match else "Not Found"
            
            print("--- PARSED RESULTS ---")
            print("Price:", price_text.replace("\u20b9", "Rs. "))
            print("Change Pct:", pct_text)
            print("Change Val:", val_text)
        else:
            print("Header class gO24Ff not found")
            
except Exception as e:
    print("Error:", e)

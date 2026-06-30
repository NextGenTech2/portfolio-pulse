import urllib.request
import json

symbols = "^NSEI,^BSESN,^NSEBANK,NIFTY_MIDCAP_100.NS,^NSMIDCP,^CNX100,^CNXSC,^INDIAVIX"
url = f"https://query1.finance.yahoo.com/v7/finance/spark?symbols={symbols}"
print("Fetching from URL:", url)

try:
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    )
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode('utf-8'))
        result = data.get("spark", {}).get("result", [])
        print(f"Total symbols returned: {len(result)}")
        for item in result:
            sym = item.get("symbol")
            resp = item.get("response", [{}])[0]
            meta = resp.get("meta", {})
            price = meta.get("regularMarketPrice")
            prev_close = meta.get("previousClose") or meta.get("chartPreviousClose")
            print(f"Symbol: {sym} | Price: {price} | Prev Close: {prev_close}")
except Exception as e:
    print("Error:", e)

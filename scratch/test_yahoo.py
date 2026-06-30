import urllib.request
import json

url = "https://query1.finance.yahoo.com/v7/finance/quote?symbols=AARTISURF.NS"
print("Fetching directly:", url)
try:
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
    )
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        data = json.loads(html)
        print("Success! Response:")
        print(json.dumps(data, indent=2))
except Exception as e:
    print("Error:", e)

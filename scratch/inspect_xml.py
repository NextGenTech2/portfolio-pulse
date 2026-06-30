import urllib.request

url = "https://www.moneycontrol.com/rss/latestnews.xml"
req = urllib.request.Request(
    url, 
    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
)
with urllib.request.urlopen(req, timeout=10) as response:
    content = response.read().decode('utf-8', errors='ignore')
    # Print raw first 1500 chars containing first item
    start_idx = content.find("<item>")
    if start_idx != -1:
        print(content[start_idx:start_idx+1500])
    else:
        print("No <item> found!")

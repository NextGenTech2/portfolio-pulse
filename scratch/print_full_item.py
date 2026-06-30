import urllib.request
import re

url = "https://news.google.com/rss/search?q=Sensex&hl=en-IN&gl=IN&ceid=IN:en"
req = urllib.request.Request(
    url, 
    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
)
with urllib.request.urlopen(req, timeout=10) as response:
    content = response.read().decode('utf-8', errors='ignore')
    start_idx = content.find("<item>")
    if start_idx != -1:
        item = content[start_idx:content.find("</item>")+7]
        print(item)
    else:
        print("No <item> found!")

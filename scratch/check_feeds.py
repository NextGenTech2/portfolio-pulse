import urllib.request
import re

feeds = [
    "https://www.moneycontrol.com/rss/latestnews.xml",
    "https://www.moneycontrol.com/rss/buzzingstocks.xml",
    "https://www.livemint.com/rss/markets",
    "https://www.livemint.com/rss/companies",
    "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en"
]

for url in feeds:
    print(f"\nFetching {url}...")
    try:
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            status = response.status
            content = response.read()
            print(f"Status: {status}, Content length: {len(content)}")
            
            # Find item count
            items = re.findall(r'<item>', content.decode('utf-8', errors='ignore'))
            print(f"Items found: {len(items)}")
            
            # Print first 2 items
            item_contents = re.findall(r'<item>(.*?)</item>', content.decode('utf-8', errors='ignore'), re.DOTALL)
            for idx, item in enumerate(item_contents[:2]):
                title = re.search(r'<title>(.*?)</title>', item, re.DOTALL)
                link = re.search(r'<link>(.*?)</link>', item, re.DOTALL)
                title_val = title.group(1) if title else "N/A"
                link_val = link.group(1) if link else "N/A"
                print(f"  Item {idx+1}:")
                print(f"    Title: {title_val[:100]}...")
                print(f"    Link: {link_val}")
    except Exception as e:
        print(f"Failed: {e}")

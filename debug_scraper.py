
import sys
import os
# Add current directory to path so we can import backend modules
sys.path.append(os.getcwd())

from playwright.sync_api import sync_playwright
from newspaper import Article
import time
import urllib.parse

def test_scraper():
    print("Starting debug scraper...")
    topic = "AI"
    
    with sync_playwright() as p:
        print("Launching browser...")
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        page = context.new_page()
        
        base_url = "https://news.google.com/search"
        params = {
            'q': topic,
            'hl': 'en-US',
            'gl': 'US',
            'ceid': 'US:en'
        }
        search_url = f"{base_url}?{urllib.parse.urlencode(params)}"
        
        print(f"Navigating to {search_url}...")
        page.goto(search_url, wait_until='networkidle', timeout=60000)
        
        # Take a screenshot to see what's happening
        page.screenshot(path="debug_screenshot.png")
        print("Screenshot saved to debug_screenshot.png")
        
        # Try different selectors
        print("Looking for articles...")
        
        # Selector 1: Standard article links
        links = page.eval_on_selector_all(
            'article a[href^="./articles/"], article a[href^="./read/"]', 
            'elements => elements.map(e => e.href)'
        )
        
        if not links:
            print("Selector 1 failed. Trying generic links...")
            # Fallback: just look for any links inside articles
            links = page.eval_on_selector_all(
                'article a', 
                'elements => elements.map(e => e.href)'
            )
            
        print(f"Found {len(links)} links")
        
        for i, link in enumerate(links[:3]):
            print(f"Processing link {i+1}: {link}")
            try:
                # Decode Google News URL
                from googlenewsdecoder.new_decoderv1 import decode_google_news_url
                try:
                    decoded_url = decode_google_news_url(link)
                    if decoded_url.get("status"):
                        print(f"  Decoded URL: {decoded_url.get('decoded_url')}")
                        actual_url = decoded_url.get('decoded_url')
                    else:
                        print(f"  Decoding failed: {decoded_url.get('message')}")
                        actual_url = link
                except Exception as e:
                    print(f"  Decoding exception: {e}")
                    actual_url = link

                article = Article(actual_url)
                article.download()
                article.parse()
                print(f"  Title: {article.title}")
                print(f"  Date: {article.publish_date}")
            except Exception as e:
                print(f"  Error: {e}")
                
        browser.close()

if __name__ == "__main__":
    try:
        test_scraper()
    except Exception as e:
        print(f"Fatal error: {e}")
        import traceback
        traceback.print_exc()

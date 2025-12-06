
import sys
import os
# Add current directory to path
sys.path.append(os.getcwd())

from backend.database import SessionLocal
from backend.services.news_scraper import NewsScraper

def test_full_scraper():
    print("Testing full NewsScraper...")
    try:
        db = SessionLocal()
        scraper = NewsScraper()
        scraper.scrape_news(db)
        print("Scraping completed successfully")
    except Exception as e:
        print(f"Fatal error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test_full_scraper()

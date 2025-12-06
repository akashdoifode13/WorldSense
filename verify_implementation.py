import sys
import os
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add project root to path
sys.path.append(os.getcwd())

from backend.models import Base, Article, DailySummary
from backend.services.news_scraper import NewsScraper
from backend.services.summarizer import Summarizer
from backend.database import engine

# Re-create tables to ensure schema is up to date
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def test_database_schema():
    print("Testing Database Schema...")
    try:
        # Check if country column exists by trying to insert a record
        article = Article(
            title="Test Article",
            url="http://test.com",
            source="Test Source",
            category="AI",
            country="India",
            published_date=date.today()
        )
        db.add(article)
        db.commit()
        
        saved_article = db.query(Article).filter(Article.country == "India").first()
        assert saved_article is not None
        assert saved_article.country == "India"
        print("✓ Article model has 'country' column")
        
        summary = DailySummary(
            date=date.today(),
            country="India",
            summary_text="Test Summary",
            article_count=1
        )
        db.add(summary)
        db.commit()
        
        saved_summary = db.query(DailySummary).filter(DailySummary.country == "India").first()
        assert saved_summary is not None
        assert saved_summary.country == "India"
        print("✓ DailySummary model has 'country' column")
        
    except Exception as e:
        print(f"❌ Database Schema Test Failed: {e}")
        raise e

def test_scraper_service():
    print("\nTesting Scraper Service...")
    scraper = NewsScraper()
    
    # Mock the _extract_article method to avoid actual network calls
    original_extract = scraper._extract_article
    scraper._extract_article = lambda url: {
        'title': 'Mock Article',
        'description': 'Mock Description',
        'source': 'Mock Source',
        'published_date': date.today()
    }
    
    # Mock _build_google_news_url and page.goto/eval to avoid playwright
    # This is hard to fully mock without a lot of code, so we'll just test the helper methods
    
    # Test URL builder
    url = scraper._build_google_news_url("AI", "US")
    assert "gl=US" in url
    assert "ceid=US" in url
    print("✓ URL builder handles country correctly")
    
    # Test get_articles_by_date filtering
    articles = scraper.get_articles_by_date(db, date.today(), "India")
    assert len(articles) > 0
    assert all(a.country == "India" for a in articles)
    print("✓ get_articles_by_date filters by country")
    
    # Test get_available_dates filtering
    dates = scraper.get_available_dates(db, "India")
    assert date.today() in dates
    print("✓ get_available_dates filters by country")

def test_summarizer_service():
    print("\nTesting Summarizer Service...")
    summarizer = Summarizer()
    
    # Mock LLM client
    summarizer.llm_client.generate_summary = lambda text, d: "Mocked Summary"
    
    # Test generate_daily_summary
    summary = summarizer.generate_daily_summary(db, date.today(), "India")
    assert summary is not None
    assert summary.country == "India"
    assert summary.summary_text == "Mocked Summary"
    print("✓ generate_daily_summary handles country correctly")
    
    # Test get_summary_by_date
    retrieved = summarizer.get_summary_by_date(db, date.today(), "India")
    assert retrieved is not None
    assert retrieved.country == "India"
    print("✓ get_summary_by_date filters by country")

if __name__ == "__main__":
    try:
        test_database_schema()
        test_scraper_service()
        test_summarizer_service()
        print("\n✅ All Backend Tests Passed!")
    except Exception as e:
        print(f"\n❌ Verification Failed: {e}")
        exit(1)

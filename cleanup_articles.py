"""
Script to cleanup existing articles in the database that do not mention the country name in the title.
This fixes the issue of irrelevant news (e.g. India news appearing in Chad feed) caused by loose scraping logic.
"""
import sys
import os
from sqlalchemy.orm import Session
from sqlalchemy import func

# Add project root to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.database import SessionLocal
from backend.models import Article

def cleanup_mismatched_articles():
    db: Session = SessionLocal()
    try:
        print("Starting cleanup of mismatched articles...")
        
        # Get all articles that are NOT 'Global'
        # We process in batches/all at once depending on size. Since volume isn't huge, all at once is fine.
        articles = db.query(Article).filter(Article.country != "Global").all()
        
        total = len(articles)
        print(f"Checking {total} country-specific articles for relevance...")
        
        deleted_count = 0
        
        for article in articles:
            country_name = article.country.lower()
            title = article.title.lower()
            
            # Check if country name is in title
            if country_name not in title:
                # print(f"Deleting irrelavant article for {article.country}: {article.title[:50]}...")
                db.delete(article)
                deleted_count += 1
        
        # Commit deletion
        db.commit()
        
        print(f"\nCleanup Complete!")
        print(f"Total Reviewed: {total}")
        print(f"Total Deleted: {deleted_count}")
        print(f"Remaining Valid Articles: {total - deleted_count}")
        
    except Exception as e:
        print(f"Error during cleanup: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    cleanup_mismatched_articles()

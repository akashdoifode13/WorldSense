#!/usr/bin/env python3
"""
Bulk summary generation script for all countries.
This script generates AI summaries for countries that have scraped data but no summary yet.
"""
import sys
import os
from datetime import date, datetime
from typing import List, Optional
from sqlalchemy import func

# Add project root to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.database import init_db, get_db
from backend.services.summarizer import Summarizer
from backend.models import Article, DailySummary


def get_countries_with_data(db, target_date: Optional[date] = None) -> List[tuple]:
    """
    Get all countries that have articles for a given date.
    
    Args:
        db: Database session
        target_date: Date to check (defaults to latest date)
    
    Returns:
        List of tuples (country, article_count, published_date)
    """
    if target_date:
        # Get countries for specific date
        results = db.query(
            Article.country,
            func.count(Article.id).label('article_count'),
            Article.published_date
        ).filter(
            Article.published_date == target_date
        ).group_by(
            Article.country,
            Article.published_date
        ).all()
    else:
        # Get countries for their latest date
        # First, get the latest date for each country
        subquery = db.query(
            Article.country,
            func.max(Article.published_date).label('max_date')
        ).group_by(Article.country).subquery()
        
        # Then get article counts for those dates
        results = db.query(
            Article.country,
            func.count(Article.id).label('article_count'),
            Article.published_date
        ).join(
            subquery,
            (Article.country == subquery.c.country) &
            (Article.published_date == subquery.c.max_date)
        ).group_by(
            Article.country,
            Article.published_date
        ).all()
    
    return results


def check_summary_exists(db, country: str, target_date: date) -> bool:
    """Check if a summary already exists for a country and date."""
    return db.query(DailySummary).filter(
        DailySummary.country == country,
        DailySummary.date == target_date
    ).first() is not None


def generate_all_summaries(target_date: Optional[date] = None, force: bool = False):
    """
    Generate summaries for all countries that have data.
    
    Args:
        target_date: Date to generate summaries for (defaults to latest for each country)
        force: If True, regenerate even if summary exists
    """
    print("🤖 AI Summary Generation for All Countries")
    print("=" * 80)
    
    # Initialize services
    init_db()
    db = next(get_db())
    summarizer = Summarizer()
    
    # Get countries with data
    countries_data = get_countries_with_data(db, target_date)
    
    if not countries_data:
        print("❌ No countries with data found")
        return
    
    print(f"📊 Found {len(countries_data)} countries with data")
    if target_date:
        print(f"📅 Target date: {target_date}")
    else:
        print(f"📅 Processing latest date for each country")
    print(f"🔄 Force regenerate: {force}")
    print("=" * 80)
    
    results = {
        'generated': [],
        'skipped': [],
        'failed': []
    }
    
    for i, (country, article_count, pub_date) in enumerate(countries_data, 1):
        print(f"\n[{i}/{len(countries_data)}] {country} ({pub_date})")
        print("-" * 80)
        
        # Check if summary exists
        if not force and check_summary_exists(db, country, pub_date):
            print(f"⏭️  Summary already exists, skipping")
            results['skipped'].append((country, pub_date))
            continue
        
        try:
            print(f"📝 Generating summary for {article_count} articles...")
            summary = summarizer.generate_daily_summary(db, pub_date, country)
            
            if summary:
                print(f"✅ Summary generated successfully")
                print(f"   Preview: {summary.summary_text[:100]}...")
                results['generated'].append((country, pub_date, article_count))
            else:
                print(f"❌ Failed to generate summary")
                results['failed'].append((country, pub_date, "No summary returned"))
                
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            results['failed'].append((country, pub_date, str(e)))
    
    # Print summary
    print("\n" + "=" * 80)
    print("📊 SUMMARY GENERATION RESULTS")
    print("=" * 80)
    
    print(f"\n✅ Generated: {len(results['generated'])} summaries")
    for country, pub_date, count in results['generated']:
        print(f"   - {country} ({pub_date}): {count} articles")
    
    print(f"\n⏭️  Skipped: {len(results['skipped'])} (already exist)")
    for country, pub_date in results['skipped']:
        print(f"   - {country} ({pub_date})")
    
    print(f"\n❌ Failed: {len(results['failed'])}")
    for country, pub_date, error in results['failed']:
        print(f"   - {country} ({pub_date}): {error}")
    
    print("\n" + "=" * 80)
    print(f"Total summaries generated: {len(results['generated'])}")
    print("=" * 80)


def generate_summaries_for_countries(countries: List[str], target_date: Optional[date] = None, force: bool = False):
    """
    Generate summaries for specific countries.
    
    Args:
        countries: List of country names
        target_date: Date to generate summaries for (defaults to latest)
        force: If True, regenerate even if summary exists
    """
    print(f"🤖 Generating summaries for {len(countries)} countries")
    print("=" * 80)
    
    # Initialize services
    init_db()
    db = next(get_db())
    summarizer = Summarizer()
    
    for country in countries:
        print(f"\n📍 {country}")
        print("-" * 80)
        
        # Get the date to use
        if target_date:
            date_to_use = target_date
        else:
            # Get latest date for this country
            result = db.query(Article.published_date).filter(
                Article.country == country
            ).order_by(Article.published_date.desc()).first()
            
            if not result:
                print(f"❌ No data found for {country}")
                continue
            
            date_to_use = result[0]
        
        # Check article count
        article_count = db.query(Article).filter(
            Article.country == country,
            Article.published_date == date_to_use
        ).count()
        
        if article_count == 0:
            print(f"❌ No articles found for {date_to_use}")
            continue
        
        # Check if summary exists
        if not force and check_summary_exists(db, country, date_to_use):
            print(f"⏭️  Summary already exists for {date_to_use}, skipping (use --force to regenerate)")
            continue
        
        try:
            print(f"📝 Generating summary for {article_count} articles ({date_to_use})...")
            summary = summarizer.generate_daily_summary(db, date_to_use, country)
            
            if summary:
                print(f"✅ Summary generated successfully")
            else:
                print(f"❌ Failed to generate summary")
                
        except Exception as e:
            print(f"❌ Error: {str(e)}")


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Generate AI summaries for countries with data')
    parser.add_argument('--countries', nargs='+', help='Specific countries to generate summaries for (default: all)')
    parser.add_argument('--date', type=str, help='Target date (YYYY-MM-DD, default: latest for each country)')
    parser.add_argument('--force', action='store_true', help='Regenerate summaries even if they exist')
    
    args = parser.parse_args()
    
    # Parse date
    target_date = None
    if args.date:
        try:
            target_date = date.fromisoformat(args.date)
        except ValueError:
            print(f"❌ Invalid date format: {args.date}. Use YYYY-MM-DD")
            sys.exit(1)
    
    # Run summary generation
    if args.countries:
        generate_summaries_for_countries(args.countries, target_date, args.force)
    else:
        generate_all_summaries(target_date, args.force)

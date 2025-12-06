#!/usr/bin/env python3
"""
Bulk scraping script for all countries.
This script scrapes news data for multiple countries and optionally generates summaries.
"""
import sys
import os
from datetime import date
from typing import List

# Add project root to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.database import init_db, get_db
from backend.services.news_scraper import NewsScraper
from backend.services.summarizer import Summarizer

# List of all countries to scrape (195 countries)
COUNTRIES = [ "Afghanistan",
    "Albania",
    "Algeria",
    "Andorra",
    "Angola",
    "Antigua and Barbuda",
    "Argentina",
    "Armenia",
    "Australia",
    "Austria",
    "Azerbaijan",
    "Bahamas",
    "Bahrain",
    "Bangladesh",
    "Barbados",
    "Belarus",
    "Belgium",
    "Belize",
    "Benin",
    "Bhutan",
    "Bolivia",
    "Bosnia and Herzegovina",
    "Botswana",
    "Brazil",
    "Brunei",
    "Bulgaria",
    "Burkina Faso",
    "Burundi",
    "Cabo Verde",
    "Cambodia",
    "Cameroon",
    "Canada",
    "Central African Republic",
    "Chad",
    "Chile",
    "China",
    "Colombia",
    "Comoros",
    "Congo (Congo-Brazzaville)",
    "Costa Rica",
    "Croatia",
    "Cuba",
    "Cyprus",
    "Czech Republic",
    "Democratic Republic of the Congo",
    "Denmark",
    "Djibouti",
    "Dominica",
    "Dominican Republic",
    "Ecuador",
    "Egypt",
  "El Salvador",
"Equatorial Guinea",
    "Eritrea",
    "Estonia",
    "Eswatini",
    "Ethiopia",
    "Fiji",
    "Finland",
    "France",
    "Gabon",
    "Gambia",
    "Georgia",
    "Germany",
    "Ghana",
    "Greece",
    "Grenada",
    "Guatemala",
    "Guinea",
    "Guinea-Bissau",
    "Guyana",
    "Haiti",
    "Honduras",
    "Hungary",
    "Iceland",
    "India",
    "Indonesia",
    "Iran",
    "Iraq",
    "Ireland",
    "Israel",
    "Italy",
    "Jamaica",
    "Japan",
    "Jordan",
    "Kazakhstan",
    "Kenya",
    "Kiribati",
    "Kuwait",
    "Kyrgyzstan",
    "Laos",
    "Latvia",
    "Lebanon",
    "Lesotho",
    "Liberia",
    "Libya",
    "Liechtenstein",
    "Lithuania",
    "Luxembourg",
    "Madagascar",
    "Malawi",
    "Malaysia",
    "Maldives",
    "Mali",
    "Malta",
    "Marshall Islands",
    "Mauritania",
    "Mauritius",
    "Mexico",
    "Micronesia",
    "Moldova",
    "Monaco",
    "Mongolia",
    "Montenegro",
    "Morocco",
    "Mozambique",
    "Myanmar",
    "Namibia",
    "Nauru",
    "Nepal",
    "Netherlands",
    "New Zealand",
    "Nicaragua",
    "Niger",
    "Nigeria",
    "North Korea",
    "North Macedonia",
    "Norway",
    "Oman",
    "Pakistan",
    "Palau",
    "Palestine",
    "Panama",
    "Papua New Guinea",
    "Paraguay",
    "Peru",
    "Philippines",
    "Poland",
    "Portugal",
    "Qatar",
    "Romania",
    "Russia",
    "Rwanda",
    "Saint Kitts and Nevis",
    "Saint Lucia",
    "Saint Vincent and the Grenadines",
    "Samoa",
    "San Marino",
    "Sao Tome and Principe",
    "Saudi Arabia",
    "Senegal",
    "Serbia",
    "Seychelles",
    "Sierra Leone",
    "Singapore",
    "Slovakia",
    "Slovenia",
    "Solomon Islands",
    "Somalia",
    "South Africa",
    "South Korea",
    "South Sudan",
    "Spain",
    "Sri Lanka",
    "Sudan",
    "Suriname",
    "Sweden",
    "Switzerland",
    "Syria",
    "Taiwan",
    "Tajikistan",
    "Tanzania",
    "Thailand",
    "Timor-Leste",
    "Togo",
    "Tonga",
    "Trinidad and Tobago",
    "Tunisia",
    "Turkey",
    "Turkmenistan",
    "Tuvalu",
    "Uganda",
    "Ukraine",
    "United Arab Emirates",
    "United Kingdom",
    "United States",
    "Uruguay",
    "Uzbekistan",
    "Vanuatu",
    "Vatican City",
    "Venezuela",
    "Vietnam",
    "Yemen",
    "Zambia",
    "Zimbabwe"
]

def scrape_all_countries(target_date: date = None, generate_summaries: bool = False):
    """
    Scrape news for all countries in the list.
    
    Args:
        target_date: Date to scrape for (defaults to today)
        generate_summaries: Whether to generate summaries after scraping
    """
    if target_date is None:
        target_date = date.today()
    
    print(f"🌍 Starting bulk scraping for {len(COUNTRIES)} countries")
    print(f"📅 Target date: {target_date}")
    print(f"📊 Generate summaries: {generate_summaries}")
    print("=" * 80)
    
    # Initialize services
    init_db()
    db = next(get_db())
    scraper = NewsScraper()
    summarizer = Summarizer() if generate_summaries else None
    
    results = {
        'success': [],
        'failed': [],
        'no_articles': []
    }
    
    for i, country in enumerate(COUNTRIES, 1):
        print(f"\n[{i}/{len(COUNTRIES)}] Processing: {country}")
        print("-" * 80)
        
        try:
            # Scrape news
            articles_added = scraper.scrape_news(db, target_date, country)
            
            if articles_added > 0:
                print(f"✅ {country}: Added {articles_added} articles")
                results['success'].append((country, articles_added))
                
                # Generate summary if requested
                if generate_summaries:
                    print(f"📝 Generating summary for {country}...")
                    summary = summarizer.generate_daily_summary(db, target_date, country)
                    if summary:
                        print(f"✅ Summary generated for {country}")
                    else:
                        print(f"⚠️  Failed to generate summary for {country}")
            else:
                print(f"ℹ️  {country}: No new articles found")
                results['no_articles'].append(country)
                
        except Exception as e:
            print(f"❌ {country}: Error - {str(e)}")
            results['failed'].append((country, str(e)))
    
    # Print summary
    print("\n" + "=" * 80)
    print("📊 SCRAPING SUMMARY")
    print("=" * 80)
    print(f"✅ Successful: {len(results['success'])} countries")
    for country, count in results['success']:
        print(f"   - {country}: {count} articles")
    
    print(f"\nℹ️  No articles: {len(results['no_articles'])} countries")
    for country in results['no_articles']:
        print(f"   - {country}")
    
    print(f"\n❌ Failed: {len(results['failed'])} countries")
    for country, error in results['failed']:
        print(f"   - {country}: {error}")
    
    print("\n" + "=" * 80)
    print(f"Total articles scraped: {sum(count for _, count in results['success'])}")
    print("=" * 80)

def scrape_specific_countries(countries: List[str], target_date: date = None, generate_summaries: bool = True):
    """
    Scrape news for specific countries.
    
    Args:
        countries: List of country names to scrape
        target_date: Date to scrape for (defaults to today)
        generate_summaries: Whether to generate summaries after scraping
    """
    if target_date is None:
        target_date = date.today()
    
    print(f"🌍 Starting scraping for {len(countries)} countries")
    print(f"📅 Target date: {target_date}")
    print("=" * 80)
    
    # Initialize services
    init_db()
    db = next(get_db())
    scraper = NewsScraper()
    summarizer = Summarizer() if generate_summaries else None
    
    for country in countries:
        print(f"\n📍 Processing: {country}")
        print("-" * 80)
        
        try:
            articles_added = scraper.scrape_news(db, target_date, country)
            print(f"✅ Added {articles_added} articles for {country}")
            
            if generate_summaries and articles_added > 0:
                print(f"📝 Generating summary...")
                summary = summarizer.generate_daily_summary(db, target_date, country)
                if summary:
                    print(f"✅ Summary generated")
                    
        except Exception as e:
            print(f"❌ Error: {str(e)}")


def get_countries_missing_summaries(target_date: date = None) -> List[str]:
    """
    Find countries that don't have summaries for the given month.
    
    Args:
        target_date: Date to check (defaults to today, normalized to 1st of month)
        
    Returns:
        List of country names missing summaries
    """
    from backend.models import DailySummary
    
    if target_date is None:
        target_date = date.today()
    
    # Normalize to first of month
    target_date = target_date.replace(day=1)
    
    init_db()
    db = next(get_db())
    
    # Get countries that have summaries for this month
    countries_with_summaries = db.query(DailySummary.country).filter(
        DailySummary.date == target_date
    ).distinct().all()
    
    countries_with_summaries = set(row[0] for row in countries_with_summaries)
    
    # Find countries missing summaries
    missing = [c for c in COUNTRIES if c not in countries_with_summaries]
    
    return missing


def scrape_countries_missing_summaries(target_date: date = None):
    """
    Scrape and generate summaries only for countries missing summaries for the current month.
    
    Args:
        target_date: Date to target (defaults to today)
    """
    if target_date is None:
        target_date = date.today()
    
    # Normalize to first of month
    target_date = target_date.replace(day=1)
    
    print(f"🔍 Finding countries missing summaries for {target_date.strftime('%B %Y')}...")
    
    missing_countries = get_countries_missing_summaries(target_date)
    
    if not missing_countries:
        print(f"✅ All {len(COUNTRIES)} countries have summaries for {target_date.strftime('%B %Y')}!")
        return
    
    print(f"📋 Found {len(missing_countries)} countries missing summaries:")
    for i, country in enumerate(missing_countries, 1):
        print(f"   {i}. {country}")
    
    print(f"\n🚀 Starting scraping for missing countries...")
    print("=" * 80)
    
    scrape_specific_countries(missing_countries, target_date, generate_summaries=True)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Bulk scrape news for multiple countries')
    parser.add_argument('--countries', nargs='+', help='Specific countries to scrape (default: all)')
    parser.add_argument('--date', type=str, help='Target date (YYYY-MM-DD, default: today)')
    parser.add_argument('--generate-summaries', action='store_true', help='Generate summaries after scraping')
    parser.add_argument('--missing-only', action='store_true', help='Only scrape countries missing summaries for current month')
    
    args = parser.parse_args()
    
    # Parse date
    target_date = None
    if args.date:
        try:
            target_date = date.fromisoformat(args.date)
        except ValueError:
            print(f"❌ Invalid date format: {args.date}. Use YYYY-MM-DD")
            sys.exit(1)
    
    # Run scraping
    if args.missing_only:
        scrape_countries_missing_summaries(target_date)
    elif args.countries:
        scrape_specific_countries(args.countries, target_date, args.generate_summaries)
    else:
        scrape_all_countries(target_date, args.generate_summaries)

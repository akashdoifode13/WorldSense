# Bulk Country Scraping Script

This script allows you to scrape news data for multiple countries at once.

## Usage

### Scrape all countries (default 50 countries)
```bash
venv/bin/python scrape_all_countries.py
```

### Scrape all countries and generate summaries
```bash
venv/bin/python scrape_all_countries.py --generate-summaries
```

### Scrape specific countries
```bash
venv/bin/python scrape_all_countries.py --countries "India" "United States" "China"
```

### Scrape for a specific date
```bash
venv/bin/python scrape_all_countries.py --date 2025-12-01
```

### Combine options
```bash
venv/bin/python scrape_all_countries.py --countries "India" "Japan" --date 2025-12-01 --generate-summaries
```

## Country List

The script includes 50 major economies by default:
- United States, China, India, Japan, Germany, United Kingdom, France, Brazil, Italy, Canada
- South Korea, Russia, Australia, Spain, Mexico, Indonesia, Netherlands, Saudi Arabia, Turkey, Switzerland
- Poland, Belgium, Sweden, Argentina, Norway, Austria, UAE, Israel, Singapore, Denmark
- South Africa, Ireland, Thailand, Malaysia, Philippines, Vietnam, Bangladesh, Egypt, Pakistan, Chile
- Finland, Portugal, Greece, Czech Republic, Romania, New Zealand, Qatar, Kazakhstan, Hungary, Kuwait

## Notes

- The script uses monthly aggregation (all articles are stored with the 1st of the month as the date)
- Summaries can be generated via the UI after scraping
- The `--generate-summaries` flag will auto-generate summaries during scraping (slower but automated)
- Progress is shown for each country
- A summary report is displayed at the end

## Example Output

```
🌍 Starting bulk scraping for 50 countries
📅 Target date: 2025-12-01
📊 Generate summaries: False
================================================================================

[1/50] Processing: United States
--------------------------------------------------------------------------------
✅ United States: Added 8 articles

[2/50] Processing: China
--------------------------------------------------------------------------------
✅ China: Added 6 articles

...

================================================================================
📊 SCRAPING SUMMARY
================================================================================
✅ Successful: 45 countries
ℹ️  No articles: 3 countries
❌ Failed: 2 countries

Total articles scraped: 287
================================================================================
```

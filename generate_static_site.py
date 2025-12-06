import os
import shutil
import json
import requests
import urllib.parse
from datetime import datetime
from pathlib import Path

# Configuration
API_URL = "http://localhost:8000"
OUTPUT_DIR = "docs"
FRONTEND_DIR = "frontend"

def ensure_dir(path):
    Path(path).mkdir(parents=True, exist_ok=True)

def fetch_and_save(url_path, output_path):
    """Fetch JSON from API and save to file."""
    try:
        response = requests.get(f"{API_URL}{url_path}")
        if response.status_code == 200:
            ensure_dir(os.path.dirname(output_path))
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(response.json(), f, indent=2, ensure_ascii=False)
            # print(f"✓ Saved {url_path} -> {output_path}")
            return True
        else:
            print(f"Start warning: Failed to fetch {url_path}: {response.status_code}")
            return False
    except Exception as e:
        print(f"Error fetching {url_path}: {e}")
        return False

def generate_static_site():
    print(f"🚀 Starting Static Site Generation...")
    
    # 1. Clean and Create Output Dir
    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)
    ensure_dir(OUTPUT_DIR)
    
    # 2. Copy Frontend Assets
    print("📦 Copying frontend assets...")
    shutil.copy(os.path.join(FRONTEND_DIR, "index.html"), os.path.join(OUTPUT_DIR, "index.html"))
    shutil.copy(os.path.join(FRONTEND_DIR, "styles.css"), os.path.join(OUTPUT_DIR, "styles.css"))
    
    # We will modify app.js for static mode during copy, or handle it via a config variable
    # For now, let's just copy it. We'll rely on the frontend detecting environment or a flag.
    # Actually, let's inject a flag into the copied app.js
    with open(os.path.join(FRONTEND_DIR, "app.js"), 'r', encoding='utf-8') as src:
        js_content = src.read()
    
    # Replace default false with true for static mode
    if "var STATIC_MODE = false;" in js_content:
        js_content = js_content.replace("var STATIC_MODE = false;", "var STATIC_MODE = true;")
    else:
        # Fallback if not found (shouldn't happen with correct app.js)
        print("⚠️ Warning: STATIC_MODE declaration not found in app.js, prepending...")
        js_content = "var STATIC_MODE = true;\n" + js_content
    
    with open(os.path.join(OUTPUT_DIR, "app.js"), 'w', encoding='utf-8') as dst:
        dst.write(js_content)
        
    # 3. Generate Data API Snapshots
    print("💾 Generatings API snapshots...")
    
    # Get List of Countries from frontend/app.js (parsing it roughly or defining list here)
    # Ideally we get it from the API if there was an endpoint. 
    # Let's assume standard main countries + Global
    countries = ["Global", "India", "United States", "China", "United Kingdom", "Russia", "Chad", "Japan", "Germany", "Brazil", "Somalia"] 
    # Note: In a real scenario we'd fetch the full list or iterate what's in DB
    
    ensure_dir(os.path.join(OUTPUT_DIR, "api"))

    for country in countries:
        # url-encoded country
        safe_country = urllib.parse.quote(country)
        country_slug = country.replace(" ", "_")
        
        
        # Consolidate Country Metadata into one file
        # Static: api/countries/{country_slug}.json
        # Structure: { last_run: ..., dates: [...], overview: ... }
        
        country_data = {}
        
        # A. Last Run Date
        resp_last_run = requests.get(f"{API_URL}/api/last-run-date?country={safe_country}")
        if resp_last_run.status_code == 200:
            country_data['last_run'] = resp_last_run.json()
            
        # B. Available Dates
        resp_dates = requests.get(f"{API_URL}/api/dates?country={safe_country}")
        if resp_dates.status_code == 200:
            country_data['dates'] = resp_dates.json()
            
        # C. Country Overview (Latest)
        resp_overview = requests.get(f"{API_URL}/api/country-overview?country={safe_country}")
        if resp_overview.status_code == 200:
            country_data['overview'] = resp_overview.json()
            
        # Save consolidated country file
        ensure_dir(os.path.join(OUTPUT_DIR, "api", "countries"))
        with open(os.path.join(OUTPUT_DIR, "api", "countries", f"{country_slug}.json"), 'w', encoding='utf-8') as f:
            json.dump(country_data, f, indent=2, ensure_ascii=False)
        
        # D. Fetch data for ALL available dates (Detailed views)
        if 'dates' in country_data:
            dates = country_data['dates']
            for d in dates:
                date_str = d['date']
                
                # Summary
                # API: /api/summary/{date}?country=...
                # Static: api/summary/{country_slug}/{date}.json
                fetch_and_save(
                    f"/api/summary/{date_str}?country={safe_country}",
                    os.path.join(OUTPUT_DIR, "api", "summary", country_slug, f"{date_str}.json")
                )
                
                # Articles
                # API: /api/articles?date={date}&country=...
                # Static: api/articles/{country_slug}/{date}.json
                fetch_and_save(
                    f"/api/articles?date={date_str}&country={safe_country}",
                    os.path.join(OUTPUT_DIR, "api", "articles", country_slug, f"{date_str}.json")
                )

    # 4. Generate Country Sentiments for Map
    # API: /api/country-sentiments
    # Static: api/world/sentiments.json
    ensure_dir(os.path.join(OUTPUT_DIR, "api", "world"))
    fetch_and_save("/api/country-sentiments", os.path.join(OUTPUT_DIR, "api", "world", "sentiments.json"))

    print("\n✨ Static site generation complete!")
    print(f"📂 Output directory: {os.path.abspath(OUTPUT_DIR)}")
    print("👉 You can now push the 'docs' folder to GitHub to deploy on GitHub Pages.")

if __name__ == "__main__":
    generate_static_site()

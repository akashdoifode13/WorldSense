import os
import json
import requests
import shutil
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import time

API_BASE = "http://localhost:8000"
OUTPUT_DIR = "docs"

# Ensure output directory exists and is clean
if os.path.exists(OUTPUT_DIR):
    shutil.rmtree(OUTPUT_DIR)
os.makedirs(OUTPUT_DIR)
os.makedirs(f"{OUTPUT_DIR}/api/country-overview", exist_ok=True)
os.makedirs(f"{OUTPUT_DIR}/api/articles", exist_ok=True)
os.makedirs(f"{OUTPUT_DIR}/api/summary", exist_ok=True)
os.makedirs(f"{OUTPUT_DIR}/api/export", exist_ok=True)

print(f"📦 Starting static site generation...")

def fetch_and_save(url_path, output_path):
    try:
        response = requests.get(f"{API_BASE}/{url_path}")
        if response.status_code == 200:
            with open(f"{OUTPUT_DIR}/{output_path}", "w") as f:
                # If it's JSON content
                if "application/json" in response.headers.get("Content-Type", ""):
                    json.dump(response.json(), f, indent=2)
                else:
                    f.write(response.text)
            return True
        else:
            print(f"B skipped {url_path}: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Error fetching {url_path}: {e}")
        return False

# 1. Copy Frontend Assets
print("📄 Copying frontend assets...")
shutil.copy("frontend/index.html", f"{OUTPUT_DIR}/index.html")
shutil.copy("frontend/styles.css", f"{OUTPUT_DIR}/styles.css")
shutil.copy("frontend/app.js", f"{OUTPUT_DIR}/app.js")
if os.path.exists("frontend/vendor"):
    shutil.copytree("frontend/vendor", f"{OUTPUT_DIR}/vendor")

# 2. Fetch Base API Data
print("📡 Fetching base API data...")
fetch_and_save("api/country-sentiments", "api/country-sentiments.json")
fetch_and_save("api/last-run-date?country=Global", "api/last-run-date_Global.json")

# Country list for iteration
countries_response = requests.get(f"{API_BASE}/api/country-sentiments")
countries_data = countries_response.json()
if isinstance(countries_data, dict):
    countries = list(countries_data.keys())
else:
    countries = [c['country'] for c in countries_data]
# Ensure major countries are included even if no sentiment data yet (fallback)
default_countries = ["India", "United States", "China", "Russia", "United Kingdom", "Germany", "France", "Japan", "Brazil"]
for c in default_countries:
    if c not in countries:
        countries.append(c)

print(f"🌍 Processing {len(countries)} countries...")

def process_country(country):
    safe_country = country.replace(" ", "_")
    
    # Country Overview
    fetch_and_save(f"api/country-overview?country={country}", f"api/country-overview_{safe_country}.json")
    
    # Last Run Date
    fetch_and_save(f"api/last-run-date?country={country}", f"api/last-run-date_{safe_country}.json")
    
    # Available Dates
    dates_response = requests.get(f"{API_BASE}/api/dates?country={country}")
    if dates_response.status_code == 200:
        dates = dates_response.json()
        with open(f"{OUTPUT_DIR}/api/dates_{safe_country}.json", "w") as f:
            json.dump(dates, f)
            
        # Fetch data for each date_obj
        for date_obj in dates:
            date = date_obj # Default to item if it's a string
            if isinstance(date_obj, dict):
                date = date_obj.get('date')
            
            if date:
                # Articles
                fetch_and_save(f"api/articles/{date}?country={country}", f"api/articles/{date}_{safe_country}.json")
                # Summary
                fetch_and_save(f"api/summary/{date}?country={country}", f"api/summary/{date}_{safe_country}.json")

# Run in parallel
with ThreadPoolExecutor(max_workers=5) as executor:
    list(executor.map(process_country, countries))

# 3. Create CNAME (Optional, creates .nojekyll to prevent Jekyll processing)
with open(f"{OUTPUT_DIR}/.nojekyll", "w") as f:
    f.write("")

print("✅ Static site generation complete! Ready to deploy 'docs/' folder.")

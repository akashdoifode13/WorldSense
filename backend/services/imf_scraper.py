
import asyncio
import httpx
import re
from sqlalchemy.orm import Session
from datetime import datetime
from backend.models import EconomicIndicator, IndicatorMetadata
from backend.database import SessionLocal
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Base URL for IMF Data Mapper API
BASE_URL = "https://www.imf.org/external/datamapper/api/v1/"

async def fetch_imf_metadata(client):
    """Fetch the full list of indicators and their metadata."""
    url = f"{BASE_URL}indicators"
    try:
        response = await client.get(url, timeout=30.0)
        if response.status_code == 200:
            return response.json().get("indicators", {})
        else:
            logger.error(f"Failed to fetch IMF indicators list: {response.status_code}")
            return {}
    except Exception as e:
        logger.error(f"Error fetching IMF indicators list: {e}")
        return {}

async def fetch_imf_indicator_data(client, indicator):
    """Fetch all country data for a single IMF indicator."""
    url = f"{BASE_URL}{indicator}"
    try:
        response = await client.get(url, timeout=30.0)
        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"Failed to fetch IMF data for {indicator}: {response.status_code}")
            return None
    except Exception as e:
        logger.error(f"Error fetching IMF data for {indicator}: {e}")
        return None

def extract_forecast_year(source_text):
    """
    Extract the forecast start year from the source string.
    Example: 'World Economic Outlook (October 2025)' -> 2025
    """
    if not source_text:
        return None
    
    # Look for 4-digit years in the source
    years = re.findall(r'20\d{2}', source_text)
    if years:
        # Return the latest year found in the source string
        return int(max(years))
    return None

def sync_indicator_metadata(metadata_dict, db: Session):
    """Store or update indicator definitions in the database."""
    for code, info in metadata_dict.items():
        if not code or not isinstance(info, dict):
            continue
            
        full_code = f"IMF.{code}"
        label = info.get("label", code)
        
        if not label:
            continue
            
        forecast_year = extract_forecast_year(info.get("source"))
        
        existing = db.query(IndicatorMetadata).filter_by(indicator_code=full_code).first()
        if existing:
            existing.label = info.get("label", code)
            existing.description = info.get("description")
            existing.source = info.get("source")
            existing.unit = info.get("unit")
            existing.dataset = info.get("dataset")
            existing.forecast_start_year = forecast_year
            existing.scraped_at = datetime.utcnow()
        else:
            new_meta = IndicatorMetadata(
                indicator_code=full_code,
                label=info.get("label", code),
                description=info.get("description"),
                source=info.get("source"),
                unit=info.get("unit"),
                dataset=info.get("dataset"),
                forecast_start_year=forecast_year,
                scraped_at=datetime.utcnow()
            )
            db.add(new_meta)
    
    db.commit()
    logger.info(f"Synchronized metadata for {len(metadata_dict)} IMF indicators.")

def process_and_store_imf_values(data, indicator_code, db: Session):
    """Process IMF Data Mapper values and store in DB."""
    if not data or "values" not in data or indicator_code not in data["values"]:
        return
    
    full_code = f"IMF.{indicator_code}"
    all_values = data["values"][indicator_code]
    
    batch_count = 0
    for country_iso3, years_data in all_values.items():
        if len(country_iso3) != 3:
            continue
            
        for year, value in years_data.items():
            if value is None:
                continue
            
            # Use SQLite-friendly bulk or individual upsert
            # In a real app, use 'ON CONFLICT' or a faster bulk method
            existing = db.query(EconomicIndicator).filter_by(
                country_iso3=country_iso3,
                indicator_code=full_code,
                date=str(year)
            ).first()

            if existing:
                existing.value = float(value)
                existing.scraped_at = datetime.utcnow()
            else:
                new_entry = EconomicIndicator(
                    country_iso3=country_iso3,
                    indicator_code=full_code,
                    date=str(year),
                    value=float(value),
                    scraped_at=datetime.utcnow()
                )
                db.add(new_entry)
            
            batch_count += 1
            if batch_count >= 500:
                db.commit()
                batch_count = 0

    db.commit()
    logger.info(f"Stored values for {full_code}")

async def scrape_imf_data(limit=None):
    """
    Main entry point for IMF scraping.
    :param limit: Optional limit on number of indicators to scrape for testing.
    """
    logger.info("Starting Full IMF Data Scrape...")
    db = SessionLocal()
    
    async with httpx.AsyncClient() as client:
        # 1. Sync Metadata First
        metadata = await fetch_imf_metadata(client)
        if not metadata:
            logger.error("No metadata found. Aborting scrape.")
            return
            
        sync_indicator_metadata(metadata, db)
        
        # 2. Fetch Values for indicators
        codes = list(metadata.keys())
        if limit:
            codes = codes[:limit]
            
        for i, code in enumerate(codes):
            logger.info(f"[{i+1}/{len(codes)}] Scraping IMF Indicator: {code}")
            data = await fetch_imf_indicator_data(client, code)
            if data:
                process_and_store_imf_values(data, code, db)
            
            # Prevent rate limiting
            await asyncio.sleep(0.2)

    db.close()
    logger.info("Full IMF Data Scrape Completed.")

if __name__ == "__main__":
    # Test with a small limit
    asyncio.run(scrape_imf_data(limit=5))


import asyncio
import httpx
from sqlalchemy.orm import Session
from datetime import datetime
from backend.models import EconomicIndicator
from backend.database import SessionLocal
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# List of 14 indicators
WB_INDICATORS = [
    'NY.GDP.MKTP.CD', 'NY.GDP.MKTP.KD.ZG', 'NY.GDP.PCAP.CD', 
    'FP.CPI.TOTL.ZG', 'SL.UEM.TOTL.ZS', 'BN.CAB.XOKA.GD.ZS', 
    'NE.EXP.GNFS.ZS', 'NE.IMP.GNFS.ZS', 'BX.KLT.DINV.WD.GD.ZS', 
    'FI.RES.TOTL.CD', 'PA.NUS.FCRF', 'GC.DOD.TOTL.GD.ZS', 
    'NY.GNS.ICTR.ZS', 'NE.GDI.TOTL.ZS'
]

async def fetch_indicator_page(client, indicator, page):
    """Fetch a single page for a given indicator for ALL countries."""
    # Note: date=2000:2025 covers last ~25 years
    # Reduced per_page to 500 to avoid timeouts/errors on large datasets
    url = f"https://api.worldbank.org/v2/country/all/indicator/{indicator}?format=json&date=2000:2025&per_page=500&page={page}"
    try:
        response = await client.get(url, timeout=60.0) # Increased timeout
        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"Failed to fetch {indicator} content p{page}: {response.status_code}")
            return None
    except Exception as e:
        logger.error(f"Error fetching {indicator} p{page}: {e}")
        return None

def process_and_store_data(data, indicator_code, db: Session):
    """Process API response and store in DB."""
    if not data or len(data) < 2 or not data[1]:
        return
    
    records = data[1]
    batch = []
    
    for item in records:
        country_iso3 = item['countryiso3code']
        date = item['date']
        value = item['value']
        
        # Skip if no value or invalid country code
        if value is None or not country_iso3:
            continue

        # Create or update logic is complex in bulk, so we'll check existence or use merge
        # For efficiency in bulk, we can delete existing for this batch or just use merge
        # Given potential volume, let's try to construct objects and use merge
        
        indicator = EconomicIndicator(
            country_iso3=country_iso3,
            indicator_code=indicator_code,
            date=date,
            value=value,
            scraped_at=datetime.utcnow()
        )
        batch.append(indicator)

    # Bulk save - but we need to handle duplicates (upsert). 
    # SQLite doesn't support ON CONFLICT in standard SQLAlchemy add_all easily without specific dialect support.
    # We will use merge to be safe, though slower.
    for obj in batch:
        # Check if exists to avoid 'merge' overhead if possible, or just merge.
        # To be robust, we'll merge.
        existing = db.query(EconomicIndicator).filter_by(
            country_iso3=obj.country_iso3,
            indicator_code=obj.indicator_code,
            date=obj.date
        ).first()

        if existing:
            existing.value = obj.value
            existing.scraped_at = obj.scraped_at
        else:
            db.add(obj)
            
    try:
        db.commit()
    except Exception as e:
        logger.error(f"Commit error: {e}")
        db.rollback()

async def scrape_world_bank_data():
    """Main function to scrape all indicators."""
    logger.info("Starting World Bank Data Scrape...")
    db = SessionLocal()
    
    async with httpx.AsyncClient() as client:
        for indicator in WB_INDICATORS:
            logger.info(f"Processing Indicator: {indicator}")
            
            # Fetch first page to get metadata
            first_page_data = await fetch_indicator_page(client, indicator, 1)
            if not first_page_data or len(first_page_data) < 2:
                continue
                
            metadata = first_page_data[0]
            total_pages = metadata['pages']
            logger.info(f"Total pages for {indicator}: {total_pages}")
            
            # Process page 1
            process_and_store_data(first_page_data, indicator, db)
            
            # Fetch remaining pages
            for page in range(2, total_pages + 1):
                # Add small delay to be nice to API
                await asyncio.sleep(0.1) 
                
                page_data = await fetch_indicator_page(client, indicator, page)
                process_and_store_data(page_data, indicator, db)
                
                if page % 5 == 0:
                    logger.info(f"Processed page {page}/{total_pages} for {indicator}")

    db.close()
    logger.info("World Bank Data Scrape Completed.")

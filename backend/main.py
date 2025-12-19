"""
FastAPI backend for the Signals Insights application.
"""
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel

from backend.database import init_db, get_db
from backend.services.news_scraper import NewsScraper
from backend.services.summarizer import Summarizer
from backend.services.sentiment_analyzer import analyze_sentiment, get_sentiment_color, get_sentiment_label
from backend.models import Article, DailySummary, EconomicIndicator, IndicatorMetadata


# Initialize FastAPI app
app = FastAPI(
    title="Signals Insights API",
    description="Global Economic Intelligence System API",
    version="1.0.0"
)

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
scraper = NewsScraper()
summarizer = Summarizer()


# Pydantic models for API responses
class ArticleResponse(BaseModel):
    id: int
    title: str
    url: str
    source: str
    description: Optional[str]
    category: str
    country: str
    published_date: date
    
    class Config:
        from_attributes = True


class SummaryResponse(BaseModel):
    id: int
    date: date
    country: str
    summary_text: str
    article_count: int
    generated_at: datetime
    sentiment_score: Optional[float] = None
    
    class Config:
        from_attributes = True


class DateResponse(BaseModel):
    date: date
    article_count: int


class ScrapeResponse(BaseModel):
    success: bool
    message: str
    articles_added: int
    date: date
    country: str


class ScrapeRequest(BaseModel):
    target_date: Optional[date] = None
    country: str = "Global"


class ComparativeSummaryRequest(BaseModel):
    countries: List[str]
    target_date: date


# API Routes
@app.on_event("startup")
async def startup_event():
    """Initialize database on startup."""
    init_db()


@app.get("/")
async def root():
    """Serve the frontend."""
    return FileResponse("frontend/index.html")


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "llm_available": summarizer.llm_client.test_connection()
    }


@app.get("/api/config")
async def get_config():
    """Get current application configuration."""
    from backend.config import settings
    return {
        "search_topics": settings.search_topics,
        "news_language": settings.news_language,
        "news_country": settings.news_country,
        "news_max_results": settings.news_max_results,
        "llm_api_url": settings.llm_api_url,
        "llm_model": settings.llm_model,
        "api_host": settings.api_host,
        "api_port": settings.api_port
    }


@app.get("/api/dates", response_model=List[DateResponse])
async def get_dates(country: str = "Global", db: Session = Depends(get_db)):
    """Get all dates that have articles for a specific country."""
    dates = scraper.get_available_dates(db, country)
    
    result = []
    for d in dates:
        count = db.query(Article).filter(
            Article.published_date == d,
            Article.country == country
        ).count()
        result.append(DateResponse(date=d, article_count=count))
    
    return result


@app.get("/api/last-run-date")
async def get_last_run_date(country: str = "Global", db: Session = Depends(get_db)):
    """Get the most recent date with articles for a specific country."""
    # Query for the most recent published_date for the given country
    result = db.query(Article.published_date).filter(
        Article.country == country
    ).order_by(
        Article.published_date.desc()
    ).first()
    
    if not result:
        return {
            "country": country,
            "last_run_date": None,
            "article_count": 0
        }
    
    last_date = result[0]
    
    # Get article count for that date
    article_count = db.query(Article).filter(
        Article.published_date == last_date,
        Article.country == country
    ).count()
    
    return {
        "country": country,
        "last_run_date": last_date,
        "article_count": article_count
    }








from fastapi.responses import FileResponse, StreamingResponse
import json

# ... (existing imports)

@app.post("/api/scrape", response_model=ScrapeResponse)
def scrape_news(
    request: ScrapeRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Trigger news scraping for a specific date and country.
    Automatically generates summary after scraping completes.
    """
    target_date = request.target_date or date.today()
    
    try:
        articles_added = scraper.scrape_news(db, target_date, request.country)
        
        # Generate summary in background after scraping
        if articles_added > 0:
            background_tasks.add_task(summarizer.generate_daily_summary, db, target_date, request.country)
        
        return ScrapeResponse(
            success=True,
            message=f"Successfully scraped news for {target_date} in {request.country}",
            articles_added=articles_added,
            date=target_date,
            country=request.country
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Scraping failed: {str(e)}")


@app.get("/api/scrape/stream")
def scrape_news_stream(
    target_date: Optional[date] = None,
    country: str = "Global",
    db: Session = Depends(get_db)
):
    """
    Stream scraping progress updates.
    """
    def event_generator():
        try:
            for update in scraper.scrape_news_generator(db, target_date, country):
                yield f"data: {json.dumps(update)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/summarize/{date}", response_model=SummaryResponse)
async def generate_summary(date: date, country: str = "Global", db: Session = Depends(get_db)):
    """Generate or update daily summary for a specific date and country."""
    summary = summarizer.generate_daily_summary(db, date, country)
    
    if not summary:
        raise HTTPException(
            status_code=500,
            detail="Failed to generate summary. Make sure articles exist and LLM is available."
        )
    
    # Compute sentiment score if not already present
    if summary.sentiment_score is None and summary.summary_text:
        try:
            sentiment = analyze_sentiment(summary.summary_text)
            summary.sentiment_score = sentiment
            db.commit()
        except Exception as e:
            print(f"Error computing sentiment: {e}")
    
    return summary


@app.post("/api/summarize-comparative")
async def generate_comparative_summary(request: ComparativeSummaryRequest, db: Session = Depends(get_db)):
    """Generate a comparative summary for multiple countries."""
    try:
        summary_text = summarizer.generate_comparative_summary(db, request.target_date, request.countries)
        if not summary_text:
            raise HTTPException(status_code=404, detail="No articles found for the selected countries and date.")
            
        return {
            "date": request.target_date,
            "countries": request.countries,
            "summary_text": summary_text
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate comparative summary: {str(e)}")


@app.post("/api/scrape-and-summarize")
def scrape_and_summarize(
    background_tasks: BackgroundTasks,
    target_date: Optional[date] = None,
    country: str = "Global",
    db: Session = Depends(get_db)
):
    """
    Convenience endpoint to scrape news and generate summary in one call.
    Summary generation happens in the background.
    """
    if target_date is None:
        target_date = date.today()
    
    # Scrape news first
    articles_added = scraper.scrape_news(db, target_date, country)
    
    # Generate summary in background
    background_tasks.add_task(summarizer.generate_daily_summary, db, target_date, country)
    
    return {
        "success": True,
        "message": f"Scraping complete. Summary generation started in background.",
        "articles_added": articles_added,
        "date": target_date,
        "country": country
    }




@app.get("/api/articles", response_model=List[ArticleResponse])
async def get_articles(date: date, country: str = "Global", db: Session = Depends(get_db)):
    """
    Get articles for a specific date and country.
    """
    articles = scraper.get_articles_by_date(db, date, country)
    return articles


@app.get("/api/summary/{date}", response_model=SummaryResponse)
async def get_summary(date: date, country: str = "Global", db: Session = Depends(get_db)):
    """
    Get summary for a specific date and country.
    """
    summary = summarizer.get_summary_by_date(db, date, country)
    if not summary:
        # Return empty response instead of 404 to handle frontend gracefully
        return {
            "id": 0,
            "date": date,
            "country": country,
            "summary_text": "",
            "article_count": 0,
            "generated_at": datetime.now()
        }
    return summary
@app.get("/api/country-overview")
async def get_country_overview(country: str = "Global", db: Session = Depends(get_db)):
    """
    Get overview for a country: last run date, summary, and articles.
    Returns the most recent data available for the country.
    """
    # Get last run date
    result = db.query(Article.published_date).filter(
        Article.country == country
    ).order_by(
        Article.published_date.desc()
    ).first()
    
    if not result:
        return {
            "country": country,
            "last_run_date": None,
            "summary": None,
            "articles": [],
            "article_count": 0
        }
    
    last_date = result[0]
    
    # Get summary for last date
    summary = summarizer.get_summary_by_date(db, last_date, country)
    
    # Get articles for last date
    articles = scraper.get_articles_by_date(db, last_date, country)
    
    summary_data = None
    if summary:
        summary_data = {
            "id": summary.id,
            "summary_text": summary.summary_text,
            "article_count": summary.article_count,
            "generated_at": summary.generated_at.isoformat()
        }
    
    return {
        "country": country,
        "last_run_date": last_date.isoformat(),
        "summary": summary_data,
        "articles": [ArticleResponse.from_orm(a).dict() for a in articles],
        "article_count": len(articles)
    }


@app.get("/api/country-sentiments")
async def get_country_sentiments(db: Session = Depends(get_db)):
    """
    Get all countries with their latest sentiment scores for map coloring.
    Returns a map of country names to sentiment data.
    """
    from sqlalchemy import func
    
    # Get latest summary for each country (subquery for max date per country)
    subquery = db.query(
        DailySummary.country,
        func.max(DailySummary.date).label('max_date')
    ).group_by(DailySummary.country).subquery()
    
    # Join to get full summary data
    summaries = db.query(DailySummary).join(
        subquery,
        (DailySummary.country == subquery.c.country) &
        (DailySummary.date == subquery.c.max_date)
    ).all()
    
    result = {}
    for summary in summaries:
        # Compute sentiment if not already done
        if summary.sentiment_score is None and summary.summary_text:
            try:
                summary.sentiment_score = analyze_sentiment(summary.summary_text)
                db.commit()
            except Exception as e:
                print(f"Error computing sentiment for {summary.country}: {e}")
                continue
        
        if summary.sentiment_score is not None:
            result[summary.country] = {
                "score": summary.sentiment_score,
                "color": get_sentiment_color(summary.sentiment_score),
                "label": get_sentiment_label(summary.sentiment_score),
                "date": summary.date.isoformat()
            }
    
    return result


@app.get("/api/export/sentiments")
async def export_sentiments(format: str = "csv", country: str = None, db: Session = Depends(get_db)):
    """
    Export sentiment data.
    - If country is provided: Exports ALL historical data for that country.
    - If no country (Global): Exports LATEST summary for ALL countries.
    """
    from io import StringIO
    import csv as csv_module
    from fastapi.responses import Response as FastAPIResponse
    from backend.services.sentiment_analyzer import get_sentiment_label
    
    if country and country.lower() != "global":
        # Export historical data for specific country
        summaries = db.query(DailySummary).filter(
            DailySummary.country == country
        ).order_by(DailySummary.date.desc()).all()
        filename = f"{country.lower().replace(' ', '_')}_history.csv"
    else:
        # Export latest data for all countries (Global view)
        subquery = db.query(
            DailySummary.country,
            func.max(DailySummary.date).label('max_date')
        ).group_by(DailySummary.country).subquery()
        
        summaries = db.query(DailySummary).join(
            subquery,
            (DailySummary.country == subquery.c.country) &
            (DailySummary.date == subquery.c.max_date)
        ).all()
        filename = "global_economic_summary.csv"
    
    if format == "json":
        data = []
        for s in summaries:
            data.append({
                "country": s.country,
                "date": s.date.isoformat(),
                "sentiment_score": s.sentiment_score,
                "sentiment_label": get_sentiment_label(s.sentiment_score) if s.sentiment_score else "Unknown",
                "article_count": s.article_count
            })
        return data
    
    # CSV format
    output = StringIO()
    writer = csv_module.writer(output)
    writer.writerow(["Country", "Date", "Sentiment Score", "Sentiment Label", "Article Count"])
    
    for s in summaries:
        label = get_sentiment_label(s.sentiment_score) if s.sentiment_score else "Unknown"
        writer.writerow([
            s.country,
            s.date.isoformat(),
            s.sentiment_score or "",
            label,
            s.article_count
        ])
    
    csv_content = output.getvalue()
    return FastAPIResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# ===== World Bank & IMF Data Endpoints =====
from backend.services.worldbank_scraper import scrape_world_bank_data, WB_INDICATORS
from backend.services.imf_scraper import scrape_imf_data
from backend.models import EconomicIndicator
from sqlalchemy import func

@app.post("/api/scrape/worldbank")
async def trigger_worldbank_scrape(background_tasks: BackgroundTasks):
    """Trigger background scraping of World Bank data."""
    background_tasks.add_task(scrape_world_bank_data)
    return {"message": "World Bank data scraping started in background."}

@app.post("/api/scrape/imf")
async def trigger_imf_scrape(background_tasks: BackgroundTasks):
    """Trigger background scraping of IMF data."""
    background_tasks.add_task(scrape_imf_data)
    return {"message": "IMF data scraping started in background."}


@app.get("/api/indicators/metadata")
async def get_indicators_metadata(db: Session = Depends(get_db)):
    """Get metadata for all tracked indicators (World Bank & IMF)."""
    # 1. Start with hardcoded WB indicators
    metadata = {
        code: {
            "label": cfg["label"],
            "unit": cfg.get("suffix", ""),
            "source": "World Bank",
            "better": cfg.get("better")
        } for code, cfg in WB_INDICATORS.items()
    }
    
    # 2. Add IMF indicators from Database
    db_meta = db.query(IndicatorMetadata).all()
    for meta in db_meta:
        metadata[meta.indicator_code] = {
            "label": meta.label,
            "unit": meta.unit,
            "source": meta.source,
            "better": "high" if "growth" in meta.label.lower() else "low" if "unemployment" in meta.label.lower() or "inflation" in meta.label.lower() or "debt" in meta.label.lower() else None,
            "forecast_start_year": meta.forecast_start_year
        }
        
    return metadata

@app.get("/api/economic-data/{iso3}")
async def get_economic_data(iso3: str, db: Session = Depends(get_db)):
    """Get latest economic indicators for a country."""
    # Subquery to get max date per indicator for this country
    subquery = db.query(
        EconomicIndicator.indicator_code,
        func.max(EconomicIndicator.date).label('max_date')
    ).filter(
        EconomicIndicator.country_iso3 == iso3
    ).group_by(EconomicIndicator.indicator_code).subquery()
    
    # Join to get values
    results = db.query(EconomicIndicator).join(
        subquery,
        (EconomicIndicator.indicator_code == subquery.c.indicator_code) &
        (EconomicIndicator.date == subquery.c.max_date)
    ).filter(
        EconomicIndicator.country_iso3 == iso3
    ).all()
    
    # Format response to match what frontend expects from WB API
    # Frontend expects: [{indicator: {id: "..."}}, {value: ..., date: ...}]
    # We will return list of objects that match rendering logic
    formatted_data = []
    for item in results:
        formatted_data.append({
            "indicator": {"id": item.indicator_code},
            "countryiso3code": item.country_iso3,
            "date": item.date,
            "value": item.value
        })
        
    return formatted_data

@app.get("/api/economic-history/{iso3}/{indicator_code}")
async def get_economic_history(iso3: str, indicator_code: str, db: Session = Depends(get_db)):
    """Get historical data for an indicator (last 30 entries)."""
    results = db.query(EconomicIndicator).filter(
        EconomicIndicator.country_iso3 == iso3,
        EconomicIndicator.indicator_code == indicator_code
    ).order_by(EconomicIndicator.date.desc()).limit(30).all()
    
    # Format for frontend chart
    return [
        {
            "date": item.date,
            "value": item.value
        }
        for item in results
    ]


# Country URL routes - must be before static mount
# Maps lowercase country names to their proper names
COUNTRY_SLUGS = {
    "india": "India", "china": "China", "usa": "United States", "united-states": "United States",
    "uk": "United Kingdom", "united-kingdom": "United Kingdom", "japan": "Japan",
    "germany": "Germany", "france": "France", "brazil": "Brazil", "russia": "Russia",
    "australia": "Australia", "canada": "Canada", "mexico": "Mexico", "italy": "Italy",
    "spain": "Spain", "south-korea": "South Korea", "indonesia": "Indonesia",
    "netherlands": "Netherlands", "saudi-arabia": "Saudi Arabia", "turkey": "Turkey",
    "switzerland": "Switzerland", "poland": "Poland", "sweden": "Sweden", "belgium": "Belgium",
    "argentina": "Argentina", "norway": "Norway", "austria": "Austria", "uae": "United Arab Emirates",
    "united-arab-emirates": "United Arab Emirates", "nigeria": "Nigeria", "israel": "Israel",
    "south-africa": "South Africa", "ireland": "Ireland", "denmark": "Denmark", "singapore": "Singapore",
    "malaysia": "Malaysia", "philippines": "Philippines", "pakistan": "Pakistan", "egypt": "Egypt",
    "vietnam": "Vietnam", "bangladesh": "Bangladesh", "thailand": "Thailand", "iran": "Iran",
    "ethiopia": "Ethiopia", "global": "Global"
}

# Static file routes - must be BEFORE the catch-all country route
from fastapi.responses import FileResponse as StaticFileResponse

@app.get("/styles.css")
async def serve_css():
    return StaticFileResponse("frontend/styles.css", media_type="text/css")

@app.get("/app.js")
async def serve_js():
    return StaticFileResponse("frontend/app.js", media_type="application/javascript")

@app.get("/vendor/{filepath:path}")
async def serve_vendor(filepath: str):
    return StaticFileResponse(f"frontend/vendor/{filepath}")


@app.get("/{country_slug}")
async def country_page(country_slug: str):
    """
    Serve the frontend for country-specific URLs like /india, /china, etc.
    """
    from fastapi.responses import HTMLResponse
    
    # Skip if it looks like a file request
    if "." in country_slug:
        raise HTTPException(status_code=404, detail="Not found")
    
    # Check if it's a valid country slug
    country_slug_lower = country_slug.lower().replace(" ", "-")
    
    # Also check if it matches any country name directly
    country_name = COUNTRY_SLUGS.get(country_slug_lower)
    
    if not country_name:
        # Try to find by matching country name
        for slug, name in COUNTRY_SLUGS.items():
            if name.lower().replace(" ", "-") == country_slug_lower:
                country_name = name
                break
    
    if not country_name:
        # Try to use the slug as-is with title case
        country_name = country_slug.replace("-", " ").title()
    
    # Read the HTML file and inject the country
    with open("frontend/index.html", "r") as f:
        html_content = f.read()
    
    # Inject a script to auto-select the country
    inject_script = f"""
    <script>
        window.INITIAL_COUNTRY = "{country_name}";
    </script>
    </head>"""
    
    html_content = html_content.replace("</head>", inject_script)
    
    return HTMLResponse(content=html_content)


# Mount static files for frontend (must be last)
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    from backend.config import settings
    
    uvicorn.run(
        "backend.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True
    )

"""
Database models for storing news articles and daily summaries.
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Date, Index, Float
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class Article(Base):
    """Model for storing individual news articles."""
    __tablename__ = "articles"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    url = Column(String(1000), nullable=False, unique=True)
    source = Column(String(200))
    description = Column(Text)
    category = Column(String(100))  # Economic topics: GDP, Inflation, Monetary Policy, Fiscal Policy, etc.
    country = Column(String(100), default="Global", nullable=False)
    published_date = Column(Date, nullable=False, index=True)
    scraped_at = Column(DateTime, default=datetime.utcnow)
    
    # Create composite index for efficient queries
    __table_args__ = (
        Index('idx_date_category_country', 'published_date', 'category', 'country'),
    )
    
    def __repr__(self):
        return f"<Article(title='{self.title[:50]}...', country='{self.country}', published={self.published_date})>"


class DailySummary(Base):
    """Model for storing AI-generated economic analysis summaries."""
    __tablename__ = "daily_summaries"
    
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    country = Column(String(100), default="Global", nullable=False)
    summary_text = Column(Text, nullable=False)
    article_count = Column(Integer, default=0)
    generated_at = Column(DateTime, default=datetime.utcnow)
    # Sentiment score from -1.0 (very negative) to +1.0 (very positive)
    sentiment_score = Column(Float, nullable=True, default=None)
    
    # Ensure one summary per country per day
    __table_args__ = (
        Index('idx_summary_date_country', 'date', 'country', unique=True),
    )
    
    def __repr__(self):
        return f"<DailySummary(date={self.date}, country='{self.country}', articles={self.article_count})>"


class EconomicIndicator(Base):
    """Model for storing World Bank economic indicators."""
    __tablename__ = "economic_indicators"
    
    id = Column(Integer, primary_key=True, index=True)
    country_iso3 = Column(String(3), nullable=False, index=True)
    indicator_code = Column(String(50), nullable=False, index=True)
    date = Column(String(10), nullable=False)  # Year (e.g., "2024")
    value = Column(Float, nullable=True)
    scraped_at = Column(DateTime, default=datetime.utcnow)
    
    # Ensure unique constraint for upsert
    __table_args__ = (
        Index('idx_indicator_unique', 'country_iso3', 'indicator_code', 'date', unique=True),
    )
    
    def __repr__(self):
        return f"<EconomicIndicator(country='{self.country_iso3}', code='{self.indicator_code}', date='{self.date}', value={self.value})>"


class IndicatorMetadata(Base):
    """Model for storing metadata for economic indicators (labels, sources, units)."""
    __tablename__ = "indicator_metadata"
    
    id = Column(Integer, primary_key=True, index=True)
    indicator_code = Column(String(50), nullable=False, unique=True, index=True)
    label = Column(String(200), nullable=False)
    description = Column(Text)
    source = Column(String(500))
    unit = Column(String(100))
    dataset = Column(String(50))
    # Year beyond which values are considered forecasts (e.g., 2025)
    forecast_start_year = Column(Integer, nullable=True)
    
    scraped_at = Column(DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f"<IndicatorMetadata(code='{self.indicator_code}', label='{self.label}')>"

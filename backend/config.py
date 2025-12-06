"""
Configuration management for the Signals Insights application.
"""
import os
from typing import List
from pydantic_settings import BaseSettings
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # LLM Configuration
    llm_provider: str = os.getenv("LLM_PROVIDER", "local")  # "local" or "gemini"
    llm_api_url: str = os.getenv("LLM_API_URL", "http://localhost:1234/v1/chat/completions")
    llm_model: str = os.getenv("LLM_MODEL", "openai/gpt-oss-20b")
    llm_temperature: float = float(os.getenv("LLM_TEMPERATURE", "0.7"))
    llm_max_tokens: int = int(os.getenv("LLM_MAX_TOKENS", "-1"))
    
    # Gemini Configuration
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash-lite")
    
    # Database Configuration
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./data/signals.db")
    
    # News Scraping Configuration
    news_language: str = os.getenv("NEWS_LANGUAGE", "en")
    news_country: str = os.getenv("NEWS_COUNTRY", "US")
    news_max_results: int = int(os.getenv("NEWS_MAX_RESULTS", "100"))
    
    # API Configuration
    api_host: str = os.getenv("API_HOST", "0.0.0.0")
    api_port: int = int(os.getenv("API_PORT", "8000"))
    
    # Search Topics - Economic News
    search_topics_str: str = "GDP,Inflation,Monetary Policy,Fiscal Policy,Economy,Central Bank,Interest Rates,Trade Policy,Economic Growth,Unemployment,Currency Exchange Rates"
    
    model_config = {
        "env_file": ".env",
        "case_sensitive": False,
        "extra": "allow"
    }
    
    @property
    def search_topics(self) -> List[str]:
        """Parse search topics from comma-separated string."""
        topics_str = os.getenv("SEARCH_TOPICS", self.search_topics_str)
        return [topic.strip() for topic in topics_str.split(",")]


# Global settings instance
settings = Settings()

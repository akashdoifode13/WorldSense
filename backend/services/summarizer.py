"""
Daily summarization service using the local LLM.
"""
from datetime import date
from sqlalchemy.orm import Session
from backend.models import Article, DailySummary
from backend.services.llm_client import LLMClient
from typing import Optional


class Summarizer:
    """Service for generating Monthly summaries from articles."""
    
    def __init__(self):
        self.llm_client = LLMClient()
    
    def generate_daily_summary(self, db: Session, target_date: date, country: str = "Global") -> Optional[DailySummary]:
        """
        You are a senior economic analyst providing a comprehensive monthly economic analysis for {country}.

Incorporate the following latest economic, bond market, stock market, and yield curve news headlines and summaries in your analysis:

{news_summary}

**Important: Do not include a "References" or "Bibliography" section in your analysis text.  A references section will be added programmatically by the application.**

Provide a detailed analysis covering:

**Executive Summary:** Briefly summarize the current economic situation, key challenges, and outlook. Aim for a more detailed summary, expanding on key points.

**Macroeconomic Indicators:** Analyze key macroeconomic indicators such as GDP growth, inflation, unemployment, interest rates, and exchange rates. Provide current figures and trends. Elaborate on the interlinkages between these indicators where possible.

**Sector Analysis:** Examine the performance of key economic sectors (e.g., manufacturing, services, agriculture, technology). Identify strengths, weaknesses, and opportunities in each sector. Provide more granular insights into sector-specific challenges and opportunities.

**Policy Environment:** Discuss relevant government policies and regulations impacting the economy, including fiscal policy, monetary policy, and trade policy. Analyze the effectiveness and potential impacts of these policies in greater detail.

**Financial Market Analysis:** Analyze the current conditions of the bond market, stock market, and yield curve, including recent trends and their potential impact on the economy. Explore the relationships between these markets and the broader economy.

**Risks and Opportunities:** Identify potential economic risks and challenges as well as opportunities for growth and development.  Provide a more in-depth discussion of both short-term and long-term risks and opportunities.

**Economic Outlook:** Provide a forward-looking perspective on the country's economic prospects for the next 1-3 years. Include forecasts and potential scenarios.  Expand the outlook section with more detailed scenario analysis and potential policy recommendations.


Format the report in markdown with clear headers and subheaders. Be concise and data-driven, but provide more comprehensive explanations and details within each section to increase the overall length and depth of the analysis. Highlight key findings and important data points using bold or italic text.  When referencing news items, please use bracketed numbers like [1], [2], etc., corresponding to the news items listed above as superscript. The references will be listed at the end of the analysis in a numbered list format, do not generate them yourself. Aim for a more substantial and detailed output.
        
        """
        # Get all articles for this date and country
        articles = db.query(Article).filter(
            Article.published_date == target_date,
            Article.country == country
        ).all()
        
        if not articles:
            print(f"⚠ No articles found for {target_date}")
            return None
        
        # Format articles data for the LLM
        articles_text = self._format_articles(articles)
        
        print(f"\n📝 Generating summary for {target_date} in {country} ({len(articles)} articles)...")
        
        # Generate summary using LLM
        summary_text = self.llm_client.generate_summary(articles_text, str(target_date), country)
        
        if not summary_text:
            print("⚠ Failed to generate summary (LLM unavailable)")
            return None
        
        # Check if summary already exists
        existing = db.query(DailySummary).filter(
            DailySummary.date == target_date,
            DailySummary.country == country
        ).first()
        
        if existing:
            # Update existing summary
            existing.summary_text = summary_text
            existing.article_count = len(articles)
            db.commit()
            print(f"✓ Updated summary for {target_date}\n")
            return existing
        else:
            # Create new summary
            summary = DailySummary(
                date=target_date,
                country=country,
                summary_text=summary_text,
                article_count=len(articles)
            )
            db.add(summary)
            db.commit()
            print(f"✓ Created summary for {target_date}\n")
            return summary
    
    def get_summary_by_date(self, db: Session, target_date: date, country: str = "Global") -> Optional[DailySummary]:
        """Get summary for a specific date and country, or month if 1st is requested."""
        if target_date.day == 1:
            from sqlalchemy import extract
            # Try 1st of month first (New Convention)
            summary = db.query(DailySummary).filter(
                DailySummary.date == target_date,
                DailySummary.country == country
            ).first()
            
            if not summary:
                # Try any summary in that month (Old Convention) - get latest
                summary = db.query(DailySummary).filter(
                    extract('year', DailySummary.date) == target_date.year,
                    extract('month', DailySummary.date) == target_date.month,
                    DailySummary.country == country
                ).order_by(DailySummary.date.desc()).first()
            return summary
        else:
            return db.query(DailySummary).filter(
                DailySummary.date == target_date,
                DailySummary.country == country
            ).first()

    def generate_comparative_summary(self, db: Session, target_date: date, countries: list) -> Optional[str]:
        """
        Generate a comparative economic analysis for a group of countries.
        """
        # Get articles for all selected countries
        all_articles = db.query(Article).filter(
            Article.published_date == target_date,
            Article.country.in_(countries)
        ).all()
        
        if not all_articles:
            print(f"⚠ No articles found for comparative summary on {target_date}")
            return None
            
        # Format articles grouped by country
        formatted_text = self._format_comparative_articles(all_articles)
        
        print(f"\n📊 Generating comparative summary for {', '.join(countries)} ({len(all_articles)} articles)...")
        
        # Generate using LLM
        summary_text = self.llm_client.generate_comparative_summary(formatted_text, str(target_date), countries)
        return summary_text

    def _format_comparative_articles(self, articles: list) -> str:
        """Format articles grouped by country for comparative analysis."""
        grouped = {}
        for article in articles:
            if article.country not in grouped:
                grouped[article.country] = []
            grouped[article.country].append(article)
            
        formatted = []
        for country, country_articles in grouped.items():
            formatted.append(f"\n# Economic News: {country}")
            for i, article in enumerate(country_articles, 1):
                formatted.append(f"## {i}. {article.title}")
                if article.description:
                    formatted.append(f"Summary: {article.description}")
        
        return "\n".join(formatted)
    
    def _format_articles(self, articles: list) -> str:
        """Format articles into a structured text for the LLM."""
        formatted = []
        
        # Group by category
        categories = {}
        for article in articles:
            cat = article.category or "General"
            if cat not in categories:
                categories[cat] = []
            categories[cat].append(article)
        
        # Format each category
        for category, cat_articles in categories.items():
            formatted.append(f"\n## {category}\n")
            for i, article in enumerate(cat_articles, 1):
                formatted.append(f"{i}. **{article.title}**")
                formatted.append(f"   Source: {article.source}")
                if article.description:
                    formatted.append(f"   {article.description}")
                formatted.append(f"   URL: {article.url}\n")
        
        return "\n".join(formatted)

"""
News scraper using requests + BeautifulSoup (simpler and more reliable).
"""
from newspaper import Article as NewsArticle, Config
from datetime import datetime, date
from typing import List, Optional
from sqlalchemy.orm import Session
from backend.config import settings
from backend.models import Article
import time
import urllib.parse
import random
import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed

class NewsScraper:
    """Service for scraping news using requests and BeautifulSoup."""

    USER_AGENTS = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ]

    def __init__(self):
        self.language = settings.news_language
        self.country = settings.news_country.upper()
        self.max_results = settings.news_max_results
        self.search_topics = settings.search_topics

    def scrape_news_generator(self, db: Session, target_date: Optional[date] = None, country: str = "Global"):
        """
        Generator that yields status updates while scraping.
        """
        today = date.today()
        
        if target_date is None:
            target_date = today
        elif target_date > today:
            # Don't allow future dates - cap to today
            target_date = today
        
        articles_added = 0
        yield {"status": "info", "message": f"Starting news scrape for {target_date} in {country}..."}
        
        for topic in self.search_topics:
            topic = topic.strip()
            yield {"status": "info", "message": f"Searching for: {topic} {country if country != 'Global' else ''}"}
            
            time.sleep(random.uniform(1, 2))
            
            try:
                if country != "Global":
                    search_query = f"{topic} {country} news"
                else:
                    search_query = f"{topic} news"
                
                # Get search results
                article_links = self._search_news(search_query)
                
                yield {"status": "info", "message": f"Found {len(article_links)} links for {topic}"}
                
                if not article_links:
                    yield {"status": "warning", "message": f"No articles found for {topic}"}
                    continue
                
                count = 0
                
                with ThreadPoolExecutor(max_workers=3) as executor:
                    future_to_url = {
                        executor.submit(self._process_article_concurrent, url): url 
                        for url in article_links
                    }
                    
                    for future in as_completed(future_to_url):
                        original_url = future_to_url[future]
                        time.sleep(random.uniform(0.5, 1.5))
                        
                        try:
                            result = future.result()
                            if not result:
                                continue
                                
                            real_url = result['real_url']
                            article_data = result['article_data']
                            
                            parsed_url = urllib.parse.urlparse(real_url)
                            domain = parsed_url.netloc.replace('www.', '')
                            path = parsed_url.path
                            if len(path) > 40: path = path[:37] + "..."
                            
                            yield {"status": "visiting", "message": f"Analyzed {domain}{path}", "url": real_url}

                            if article_data:
                                # Strict Filtering: Title MUST contain country name if country is provided
                                if country != "Global":
                                    title_lower = article_data['title'].lower()
                                    country_lower = country.lower()
                                    
                                    if country_lower not in title_lower:
                                        yield {"status": "skipped", "message": f"Skipped: Title missing country name '{country}'"}
                                        continue

                                raw_date = article_data.get('published_date')
                                if not raw_date:
                                    raw_date = target_date
                                
                                # Prevent future dates - cap to today
                                if raw_date > today:
                                    raw_date = today
                                
                                final_date = raw_date.replace(day=1)

                                exists = db.query(Article).filter(
                                    ((Article.url == original_url) | (Article.url == real_url)),
                                    Article.published_date == final_date
                                ).first()

                                if exists:
                                    yield {"status": "skipped", "message": f"Skipped: Duplicate for date {final_date} - {domain}..."}
                                    continue

                                article = Article(
                                    title=article_data['title'],
                                    url=real_url,
                                    source=article_data['source'],
                                    description=article_data['description'],
                                    category=topic,
                                    country=country,
                                    published_date=final_date 
                                )
                                
                                db.add(article)
                                db.commit()
                                articles_added += 1
                                count += 1
                                yield {"status": "success", "message": f"Saved: {article_data['title'][:50]}..."}
                            else:
                                yield {"status": "skipped", "message": f"Skipped: No content {domain}..."}
                                
                        except Exception as e:
                            db.rollback()
                            yield {"status": "skipped", "message": f"Skipped: Error {str(e)[:20]}..."}
                            continue
                
                yield {"status": "info", "message": f"Completed {topic}: Added {count} articles"}
            
            except Exception as e:
                yield {"status": "error", "message": f"Error scraping {topic}: {str(e)}"}
                db.rollback()
                continue
        
        yield {"status": "complete", "articles_added": articles_added}

    def _search_news(self, query: str, max_results: int = 10) -> List[str]:
        """
        Search for news articles using multiple sources.
        Try DuckDuckGo Lite first, fallback to Bing News.
        """
        # Try DuckDuckGo Lite first
        try:
            links = self._search_duckduckgo_lite(query, max_results)
            if links:
                return links
        except Exception:
            pass
        
        # Fallback to Bing News
        try:
            links = self._search_bing_news(query, max_results)
            if links:
                return links
        except Exception:
            pass
        
        return []

    def _search_duckduckgo_lite(self, query: str, max_results: int = 10) -> List[str]:
        """Search using DuckDuckGo Lite."""
        url = f"https://lite.duckduckgo.com/lite/?q={urllib.parse.quote(query)}"
        headers = {
            'User-Agent': random.choice(self.USER_AGENTS),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        links = []
        
        # Find result links in lite version
        for link in soup.find_all('a', href=True):
            href = link.get('href', '')
            if href.startswith('http') and 'duckduckgo.com' not in href:
                links.append(href)
                if len(links) >= max_results:
                    break
        
        return links

    def _search_bing_news(self, query: str, max_results: int = 10) -> List[str]:
        """Search using Bing News as fallback."""
        url = f"https://www.bing.com/news/search?q={urllib.parse.quote(query)}&form=TNSA02"
        headers = {
            'User-Agent': random.choice(self.USER_AGENTS),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
        }
        
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.text, 'html.parser')
        links = []
        
        # Bing news uses specific classes
        for article in soup.find_all('a', class_='title'):
            href = article.get('href', '')
            if href.startswith('http'):
                links.append(href)
                if len(links) >= max_results:
                    break
        
        # Alternative selector
        if len(links) < 3:
            for link in soup.find_all('a', href=True):
                href = link.get('href', '')
                if href.startswith('http') and 'bing.com' not in href and 'microsoft.com' not in href:
                    links.append(href)
                    if len(links) >= max_results:
                        break
        
        return links

    def _process_article_concurrent(self, article_url: str) -> Optional[dict]:
        """Helper to process article in thread."""
        try:
            article_data = self._extract_article(article_url)
            
            return {
                'original_url': article_url,
                'real_url': article_url,
                'article_data': article_data
            }
        except Exception:
            return None

    def scrape_news(self, db: Session, target_date: Optional[date] = None, country: str = "Global") -> int:
        articles_added = 0
        for update in self.scrape_news_generator(db, target_date, country):
            if update["status"] == "complete":
                articles_added = update["articles_added"]
            elif update["status"] == "info":
                print(update["message"])
        return articles_added
    
    # Domains that use JavaScript rendering and can't be parsed by newspaper3k
    SKIP_DOMAINS = [
        'msn.com',
        'facebook.com', 
        'twitter.com',
        'x.com',
        'instagram.com',
        'linkedin.com',
        'youtube.com',
    ]

    def _extract_article(self, url: str) -> Optional[dict]:
        try:
            # Skip domains that don't work with newspaper3k
            url_lower = url.lower()
            for domain in self.SKIP_DOMAINS:
                if domain in url_lower:
                    return None
            
            conf = Config()
            conf.browser_user_agent = random.choice(self.USER_AGENTS)
            conf.request_timeout = 15
            
            article = NewsArticle(url, config=conf)
            article.download()
            article.parse()
            
            title = article.title or ""
            
            # Skip if title is empty, generic, or just the domain name
            if not title or len(title) < 10:
                return None
            
            # Skip generic titles that indicate parsing failure
            generic_titles = ['msn', 'home', 'news', 'error', '404', 'not found', 'access denied']
            if title.lower().strip() in generic_titles:
                return None
            
            description = ""
            if article.text:
                description = article.text[:300] + "..." if len(article.text) > 300 else article.text
            
            # Skip if no meaningful content
            if not description or len(description) < 50:
                return None
            
            source = article.source_url or "Unknown"
            if '//' in source:
                source = source.split('//')[1].split('/')[0]
            
            published_date = None
            if article.publish_date:
                published_date = article.publish_date.date()
            
            return {
                'title': title.strip(),
                'description': description.strip(),
                'source': source,
                'published_date': published_date
            }
        
        except Exception:
            return None

    def get_articles_by_date(self, db: Session, target_date: date, country: str = "Global") -> List[Article]:
        if target_date.day == 1:
            # Monthly view - get all articles for this month
            from sqlalchemy import extract
            return db.query(Article).filter(
                extract('year', Article.published_date) == target_date.year,
                extract('month', Article.published_date) == target_date.month,
                Article.country == country
            ).order_by(Article.category, Article.scraped_at).all()
        else:
            # Specific day view
            return db.query(Article).filter(
                Article.published_date == target_date,
                Article.country == country
            ).order_by(Article.category, Article.scraped_at).all()

    def get_available_dates(self, db: Session, country: str = "Global") -> List[date]:
        result = db.query(Article.published_date).filter(
            Article.country == country
        ).distinct().order_by(
            Article.published_date.desc()
        ).all()
        return [row[0] for row in result]
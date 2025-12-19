"""
Local LLM client for generating summaries using the LLM at localhost:1234 or Gemini API.
"""
import requests
import time
import threading
from typing import Optional, Dict, Any
from backend.config import settings

# Try to import google.genai, but don't fail if not installed (for local-only setups)
try:
    from google import genai
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False


class RateLimiter:
    """Simple rate limiter to ensure we don't exceed N calls per minute."""
    
    def __init__(self, calls_per_minute: int):
        self.calls_per_minute = calls_per_minute
        self.interval = 60.0 / calls_per_minute
        self.last_call_time = 0
        self.lock = threading.Lock()
    
    def wait(self):
        """Wait if necessary to respect the rate limit."""
        with self.lock:
            current_time = time.time()
            elapsed = current_time - self.last_call_time
            
            if elapsed < self.interval:
                sleep_time = self.interval - elapsed
                print(f"⏳ Rate limit: Waiting {sleep_time:.2f}s...")
                time.sleep(sleep_time)
            
            self.last_call_time = time.time()


class LLMClient:
    """Client for interacting with LLM APIs (Local or Gemini)."""
    
    def __init__(self):
        self.provider = settings.llm_provider
        
        # Local LLM settings
        self.api_url = settings.llm_api_url
        self.model = settings.llm_model
        self.temperature = settings.llm_temperature
        self.max_tokens = settings.llm_max_tokens
        
        # Gemini settings
        self.gemini_key = settings.gemini_api_key
        self.gemini_model = settings.gemini_model
        self.gemini_client = None
        
        # Rate limiter for Gemini (10 calls per minute)
        self.rate_limiter = RateLimiter(10)
        
        if self.provider == "gemini":
            if not HAS_GEMINI:
                print("⚠ google-genai package not installed. Falling back to local LLM.")
                self.provider = "local"
            elif not self.gemini_key:
                print("⚠ GEMINI_API_KEY not set. Falling back to local LLM.")
                self.provider = "local"
            else:
                try:
                    self.gemini_client = genai.Client(api_key=self.gemini_key)
                    print(f"✓ Initialized Gemini client with model: {self.gemini_model}")
                except Exception as e:
                    print(f"⚠ Failed to initialize Gemini client: {e}. Falling back to local LLM.")
                    self.provider = "local"
    
    def generate_summary(self, articles_data: str, date: str, country: str = "Global") -> Optional[str]:
        """
        Generate a daily summary from articles data.
        
        Args:
            articles_data: Formatted string of articles with titles and descriptions
            date: Date string for context
            country: Country name for context (default: "Global")
            
        Returns:
            Generated summary text or None if LLM is unavailable
        """
        country_context = f" for {country}" if country != "Global" else ""
        
        if self.provider == "gemini":
            return self._generate_with_gemini(articles_data, date, country_context)
        else:
            return self._generate_with_local(articles_data, date, country_context)

    def _generate_with_gemini(self, articles_data: str, date: str, country_context: str) -> Optional[str]:
        """Generate summary using Gemini API."""
        prompt = f"""You are an expert economic analyst. Your task is to create a comprehensive, well-organized daily summary of economic news and signals{country_context}.

Today's date is {date}.

Guidelines:
1. Organize the summary into clear sections (e.g., "GDP & Economic Growth", "Inflation & Monetary Policy", "Fiscal Policy & Government Actions", "Trade & International Relations", "Labor Market & Unemployment", "Currency & Exchange Rates")
2. Highlight the most significant economic developments, trends, and policy changes
3. Keep the summary to approximately 1 page (500-700 words)
4. Use clear, professional language appropriate for economic analysis
5. Focus on insights and implications, not just listing articles
6. Identify any emerging patterns or themes across multiple articles
7. Include relevant economic indicators and their implications

Format the output in clean markdown with headers, bullet points where appropriate.

Based on the following economic news articles from {date}{country_context}, create a comprehensive daily economic analysis summary:

{articles_data}

Please provide a well-structured economic analysis summary following the guidelines."""

        try:
            # Apply rate limiting
            self.rate_limiter.wait()
            
            response = self.gemini_client.models.generate_content(
                model=self.gemini_model,
                contents=prompt,
            )
            return response.text
        except Exception as e:
            print(f"⚠ Error calling Gemini API: {e}")
            return None

    def _generate_with_local(self, articles_data: str, date: str, country_context: str) -> Optional[str]:
        """Generate summary using local LLM."""
        system_prompt = f"""You are an expert economic analyst. Your task is to create a comprehensive, well-organized daily summary of economic news and signals{country_context}.

Today's date is {date}.

Guidelines:
1. Organize the summary into clear sections (e.g., "GDP & Economic Growth", "Inflation & Monetary Policy", "Fiscal Policy & Government Actions", "Trade & International Relations", "Labor Market & Unemployment", "Currency & Exchange Rates")
2. Highlight the most significant economic developments, trends, and policy changes
3. Keep the summary to approximately 1 page (500-700 words)
4. Use clear, professional language appropriate for economic analysis
5. Focus on insights and implications, not just listing articles
6. Identify any emerging patterns or themes across multiple articles
7. Include relevant economic indicators and their implications

Format the output in clean markdown with headers, bullet points where appropriate."""

        user_prompt = f"""Based on the following economic news articles from {date}{country_context}, create a comprehensive daily economic analysis summary:

{articles_data}

Please provide a well-structured economic analysis summary following the guidelines."""

        try:
            response = requests.post(
                self.api_url,
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    "temperature": self.temperature,
                    "max_tokens": self.max_tokens,
                    "stream": False
                },
                timeout=120  # 2 minute timeout for summary generation
            )
            
            if response.status_code == 200:
                result = response.json()
                return result.get("choices", [{}])[0].get("message", {}).get("content", "")
            else:
                print(f"⚠ LLM API returned status {response.status_code}: {response.text}")
                return None
                
        except requests.exceptions.ConnectionError:
            print("⚠ LLM API is not available. Make sure the LLM server is running at localhost:1234")
            return None
        except requests.exceptions.Timeout:
            print("⚠ LLM API request timed out")
            return None
        except Exception as e:
            print(f"⚠ Error calling LLM API: {e}")
            return None

    def generate_comparative_summary(self, articles_data: str, date: str, countries: list) -> Optional[str]:
        """
        Generate a comparative economic summary for multiple countries.
        """
        countries_str = ", ".join(countries)
        
        prompt = f"""You are a senior global economic strategist. Your task is to provide a side-by-side comparative analysis of the economic landscape in {countries_str}.
        
        Today's date is {date}.
        
        Guidelines:
        1. **Comparative Framework**: Do not just list summaries for each country. Instead, compare them across themes like "Monetary Policy Divergence", "Inflation Trends", "Global Trade Positioning", and "Growth Outlook".
        2. **Relative Strengths**: Identify which countries are showing relative strength or weakness compared to the others in the group.
        3. **Interconnections**: Discuss how economic shifts in one of these countries might impact the others (e.g., trade flows, currency pressure).
        4. **Data Driven**: Reference specific developments from the news provided.
        5. **Layout**: Use clear markdown headers and a structured approach that emphasizes comparison.
        
        Based on the following news data for {date}, generate a high-level comparative economic summary:
        
        {articles_data}
        
        Provide a sophisticated, professional comparative analysis."""

        if self.provider == "gemini":
            try:
                self.rate_limiter.wait()
                response = self.gemini_client.models.generate_content(
                    model=self.gemini_model,
                    contents=prompt,
                )
                return response.text
            except Exception as e:
                print(f"⚠ Error calling Gemini API: {e}")
                return None
        else:
            # Local LLM fallback
            try:
                response = requests.post(
                    self.api_url,
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": "You are a senior global economic strategist specializing in cross-country benchmarking."},
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": self.temperature,
                        "max_tokens": self.max_tokens,
                        "stream": False
                    },
                    timeout=120
                )
                if response.status_code == 200:
                    result = response.json()
                    return result.get("choices", [{}])[0].get("message", {}).get("content", "")
                return None
            except Exception as e:
                print(f"⚠ Error calling Local LLM: {e}")
                return None
    
    def test_connection(self) -> bool:
        """Test if the LLM API is available."""
        if self.provider == "gemini":
            try:
                # Apply rate limiting
                self.rate_limiter.wait()
                
                response = self.gemini_client.models.generate_content(
                    model=self.gemini_model,
                    contents="Hello",
                )
                return True
            except Exception as e:
                print(f"Gemini connection test failed: {e}")
                return False
        else:
            try:
                response = requests.post(
                    self.api_url,
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": "Hello"}],
                        "temperature": 0.7,
                        "max_tokens": 10,
                        "stream": False
                    },
                    timeout=10
                )
                return response.status_code == 200
            except:
                return False

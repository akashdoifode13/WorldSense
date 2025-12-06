# Signals Insights - AI News Intelligence System

🧠 An intelligent news scraping and analysis platform that automatically collects AI/ML news from Google News, generates daily summaries using a local LLM, and provides an interactive calendar UI for browsing historical insights.

## Features

- 🔍 **Automated News Scraping**: Collects news from Google News across 4 categories (AI, Generative AI, LLM trends, ML trends)
- 🤖 **AI-Powered Summaries**: Generates comprehensive daily summaries using your local LLM
- 📅 **Interactive Calendar UI**: Beautiful calendar interface to browse news by date
- 🎨 **Premium Design**: Modern dark/light theme with glassmorphism and smooth animations
- 💾 **SQLite Storage**: Persistent local storage for all articles and summaries
- ⚡ **FastAPI Backend**: High-performance REST API with async support

## Prerequisites

1. **Python 3.9+**
2. **Local LLM Server** running at `http://localhost:1234/v1/chat/completions`
   - The system assumes you have an LLM server running locally
   - Example: LM Studio, Ollama, or similar with OpenAI-compatible API

## Installation

### 1. Clone or Navigate to Project Directory

```bash
cd "/Users/akash/AntiGravity/Signals Insights"
```

### 2. Create Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment

The `.env` file has been created with default settings. Modify if needed:

```env
LLM_API_URL=http://localhost:1234/v1/chat/completions
LLM_MODEL=openai/gpt-oss-20b
DATABASE_URL=sqlite:///./data/signals.db
```

## Usage

### Starting the Application

```bash
# Make sure your virtual environment is activated
source venv/bin/activate

# Start the backend server
python -m uvicorn backend.main:app --reload --port 8000
```

The application will be available at: **http://localhost:8000**

### Using the Application

1. **Open Browser**: Navigate to `http://localhost:8000`
2. **Scrape News**: Click "Scrape Today's News" button to collect articles
3. **View Calendar**: See highlighted dates with available data
4. **Browse Articles**: Click any highlighted date to view articles
5. **Generate Summary**: Click "Generate Summary" to create AI-powered daily summary

### API Endpoints

- `GET /api/health` - Health check and LLM availability
- `GET /api/dates` - Get all dates with articles
- `GET /api/articles/{date}` - Get articles for specific date (YYYY-MM-DD)
- `GET /api/summary/{date}` - Get summary for specific date
- `POST /api/scrape` - Trigger news scraping
- `POST /api/summarize/{date}` - Generate summary for date

### Command-Line Scraping

```bash
# Scrape today's news
curl -X POST http://localhost:8000/api/scrape

# Generate summary for today
curl -X POST http://localhost:8000/api/summarize/$(date +%Y-%m-%d)
```

## Project Structure

```
Signals Insights/
├── backend/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Configuration management
│   ├── database.py          # Database setup
│   ├── models.py            # SQLAlchemy models
│   └── services/
│       ├── news_scraper.py  # Google News scraper
│       ├── llm_client.py    # LLM API client
│       └── summarizer.py    # Summary generation
├── frontend/
│   ├── index.html           # Main UI
│   ├── styles.css           # Premium styling
│   └── app.js               # Frontend logic
├── data/
│   └── signals.db           # SQLite database (auto-created)
├── requirements.txt         # Python dependencies
├── .env                     # Environment configuration
└── README.md               # This file
```

## Automated Scheduling (Optional)

To automatically scrape news daily, you can set up a cron job:

```bash
# Edit crontab
crontab -e

# Add this line to scrape daily at 9 AM
0 9 * * * curl -X POST http://localhost:8000/api/scrape
```

## Troubleshooting

### LLM Not Available

- Ensure your local LLM server is running at localhost:1234
- Test with: `curl http://localhost:1234/v1/chat/completions -H "Content-Type: application/json" -d '{"model":"openai/gpt-oss-20b","messages":[{"role":"user","content":"test"}],"temperature":0.7,"max_tokens":10,"stream":false}'`

### No Articles Found

- Check internet connection
- Google News might be temporarily blocking requests - wait and try again
- Try modifying search topics in `.env`

### Database Errors

- Delete `data/signals.db` and restart the application to recreate

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy, Python 3.9+
- **Scraping**: gnews, feedparser
- **Database**: SQLite
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **AI**: Local LLM (OpenAI-compatible API)

## License

MIT License - Feel free to use and modify!

---

Built with ❤️ for AI news enthusiasts

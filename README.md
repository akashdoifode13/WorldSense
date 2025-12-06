# World Sense - Global Economic Intelligence

🌍 An intelligent economic monitoring platform that aggregates global news signals, analyzes sentiment using AI, and visualizes economic outlooks on an interactive world map.

## Features

- �️ **Global Sentiment Map**: Interactive 3D-style world map visualizing economic sentiment (Green = Positive, Red = Negative)
- 📊 **AI-Powered Analysis**: Automatically scrapes and analyzes news signals to generate country-specific economic overviews.
- � **Trend Detection**: Identifies rising and falling economic confidence across 195+ countries.
- 📱 **Responsive Design**: Modern, glassmorphism-based UI with dark/light mode support.
- � **Static Demo Mode**: Fully viable as a static site on GitHub Pages (Serverless).

## Live Demo

**[View Live Demo](https://akash.github.io/Global-Economist/)** *(Replace with your actual URL)*

---

## Installation (Local Development)

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/Global-Economist.git
cd Global-Economist
```

### 2. Create Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
# .\venv\Scripts\activate # On Windows
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure Environment

Create a `.env` file in the root directory:

```env
# Optional: External LLM API (if using custom backend)
LLM_API_URL=http://localhost:1234/v1/chat/completions
LLM_MODEL=openai/gpt-oss-20b
DATABASE_URL=sqlite:///./data/signals.db
```

---

## Usage

### Running Locally (Full Backend)

Start the FastApi backend to enable live scraping and AI generation:

```bash
# Start the server
python -m uvicorn backend.main:app --reload --port 8000
```

Access the app at: **http://localhost:8000**

### Generating Static Site (For GitHub Pages)

To create a read-only version of the site for hosting on GitHub Pages:

1. ensure the backend is running (see above).
2. Run the generator script:

```bash
python3 generate_static_site.py
```

This will create a `docs/` folder containing the static frontend and frozen API data.

---

## Deployment

### Deploying to GitHub Pages

1. Generate the static site (see above).
2. Commit the `docs/` folder:
   ```bash
   git add docs
   git commit -m "Update static site content"
   git push origin main
   ```
3. Go to your GitHub Repository Settings -> **Pages**.
4. Set the **Source** to `Deploy from a branch`.
5. Select the `main` branch and the `/docs` folder.
6. Click **Save**.

---

## Project Structure

```
Global Economist/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── models.py            # Database models
│   └── services/            # Scraper & AI services
├── frontend/
│   ├── index.html           # Main UI
│   ├── app.js               # Frontend logic (Static + Dynamic support)
│   └── styles.css           # Styling
├── docs/                    # Generated static site (for GitHub Pages)
├── generate_static_site.py  # Static site generator script
├── data/
│   └── signals.db           # SQLite database
├── requirements.txt         # Python dependencies
└── README.md                # This file
```

## Tech Stack

- **Frontend**: Vanilla JS, HTML5, CSS3, jsVectorMap
- **Backend**: FastAPI, Python 3.11
- **Database**: SQLite, SQLAlchemy
- **AI/ML**: Integrated Sentiment Analysis

## License

MIT License - Feel free to use and modify!

---

Built with ❤️ for Global Economics

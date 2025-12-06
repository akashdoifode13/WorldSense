let currentDate = new Date();
let selectedDate = null;
let selectedCountry = 'Global';
let datesWithData = new Set();
let currentTheme = 'dark';
let map = null;

// ===== API Configuration =====
const IS_STATIC = window.location.hostname.includes('github.io');
const API_BASE = IS_STATIC ? '/WorldSense/api' : window.location.origin;

// Helper to construct API URLs depending on mode
function getApiUrl(endpoint, params = {}) {
    if (!IS_STATIC) {
        // Dynamic Mode: /api/endpoint?param=value
        const url = new URL(`${window.location.origin}/api/${endpoint}`);
        Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
        return url.toString();
    } else {
        // Static Mode: /api/endpoint_param1_param2.json
        // Flatten params into filename
        let filename = endpoint;
        const paramKeys = Object.keys(params).sort(); // Sort for consistency

        if (paramKeys.length > 0) {
            // Special handling for specific endpoints to match generator logic
            if (endpoint === 'articles' || endpoint === 'summary') {
                // api/articles/YYYY-MM-DD?country=X -> api/articles/YYYY-MM-DD_X.json
                // The endpoint arg already contains date path "articles/2024-01-01"
                const datePart = endpoint.split('/')[1];
                const typePart = endpoint.split('/')[0];
                const country = params.country || 'Global';
                const safeCountry = country.replace(/ /g, '_');
                return `${API_BASE}/${typePart}/${datePart}_${safeCountry}.json`;
            }

            // Standard query params: api/endpoint?country=X -> api/endpoint_X.json
            const values = paramKeys.map(key => {
                if (key === 'country') return params[key].replace(/ /g, '_');
                return params[key];
            });
            filename += '_' + values.join('_');
        }

        return `${API_BASE}/${filename}.json`;
    }
}

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
    if (IS_STATIC) {
        console.log('🚀 Running in Static Demo Mode on GitHub Pages');
        document.body.classList.add('static-mode');
        // Disable scrape/generate buttons in static mode
        const scrapeBtn = document.getElementById('scrapeBtn');
        if (scrapeBtn) {
            scrapeBtn.title = "Not available in Demo Mode";
            scrapeBtn.disabled = true;
            scrapeBtn.style.opacity = '0.5';
        }
    }
    initializeApp();
});

// Also initialize map when window is fully loaded (after all scripts)
window.addEventListener('load', () => {
    // Ensure map initializes after all resources are loaded
    if (!map) {
        setTimeout(() => {
            initMap();
        }, 300);
    }
});

// ===== Core Logic =====
async function initializeApp() {
    // 1. Load available dates for Global (default)
    await loadAvailableDates();

    // 2. Load last run date
    await loadLastRunDate();

    // 3. Check for specific country in URL (e.g. /india)
    // In Static mode, we can't rely on server routing, but we can check hash or query if needed
    // For now support standard clean URL if supported by 404 hack, or just default to Global
    if (!IS_STATIC && window.INITIAL_COUNTRY) {
        const countryCode = getCountryCode(window.INITIAL_COUNTRY);
        if (countryCode) {
            // Defer selection until map is ready
            selectedCountry = window.INITIAL_COUNTRY;
            // We'll let map init handle the visual selection
        }
    }

    // 4. Setup Event Listeners
    setupEventListeners();
}

async function initMap() {
    // Fetch sentiment data for coloring
    await fetchCountrySentiments();

    map = new jsVectorMap({
        selector: "#world-map",
        map: "world",
        backgroundColor: "transparent",
        draggable: true,
        zoomButtons: true,
        zoomOnScroll: true,
        regionsSelectable: true,
        regionsSelectableOne: true,
        bindTouchEvents: true,

        // Initial configuration
        regionStyle: {
            initial: {
                fill: currentTheme === 'dark' ? '#2d3748' : '#e2e8f0',
                stroke: currentTheme === 'dark' ? '#1a202c' : '#cbd5e0',
                strokeWidth: 0.5,
                fillOpacity: 1
            },
            hover: {
                fillOpacity: 0.8,
                cursor: 'pointer'
            },
            selected: {
                fill: '#3b82f6' // Blue for selected
            }
        },

        // Tooltip customization
        onRegionTooltipShow(event, tooltip, code) {
            const countryName = getCountryName(code);
            const sentiment = countrySentiments[countryName];

            let sentimentHtml = '';
            if (sentiment) {
                const color = getSentimentColor(sentiment.score);
                const score = sentiment.score.toFixed(2);
                const label = getSentimentLabel(sentiment.score);
                // Also show article count if available
                const count = sentiment.article_count || 0;

                sentimentHtml = `
                    <div class="map-tooltip-sentiment">
                        <div class="tooltip-score">
                            <span class="tooltip-dot" style="background-color: ${color}"></span>
                            ${label} (${score})
                        </div>
                        <div class="tooltip-articles">${count} articles</div>
                    </div>
                `;
            }

            tooltip.text(
                `<div class="map-tooltip-content">
                    <strong>${countryName}</strong>
                    ${sentimentHtml}
                </div>`,
                true // Allow HTML
            );
        },

        // Click handler
        onRegionClick(event, code) {
            const countryName = getCountryName(code);
            console.log(`Region clicked: ${countryName} (${code})`);
            selectCountry(countryName, code);
        },

        // Loaded handler
        onLoaded(map) {
            window.mapInstance = map; // Global reference

            // If we have an initial country selection, apply it now
            if (selectedCountry && selectedCountry !== 'Global') {
                const code = getCountryCode(selectedCountry);
                if (code) {
                    map.setSelectedRegions([code]);
                }
            }

            // Re-apply colors after a short delay to ensure DOM is ready
            setTimeout(() => {
                applySentimentColors();

                // Hide loading overlay
                const loadingOverlay = document.getElementById('mapLoadingOverlay');
                if (loadingOverlay) {
                    loadingOverlay.classList.add('hidden');
                }
            }, 100);
        }
    });
}

// Helper: Get color based on sentiment score
function getSentimentColor(score) {
    if (score === null || score === undefined) return '#cbd5e0'; // Gray 300
    if (score <= -0.6) return '#ef4444'; // Red 500
    if (score <= -0.2) return '#fca5a5'; // Red 300
    if (score < 0.2) return '#94a3b8';   // Slate 400 (Neutral)
    if (score < 0.6) return '#86efac';   // Green 300
    return '#22c55e';                    // Green 500
}

// Helper: Get label based on sentiment score
function getSentimentLabel(score) {
    if (score === null || score === undefined) return 'Unknown';
    if (score <= -0.6) return 'Very Negative';
    if (score <= -0.2) return 'Negative';
    if (score < 0.2) return 'Neutral';
    if (score < 0.6) return 'Positive';
    return 'Very Positive';
}

// Fetch sentiment data for all countries to color the map
async function fetchCountrySentiments() {
    try {
        const url = getApiUrl('country-sentiments');
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to load sentiments');

        const data = await response.json();

        countrySentiments = {};

        // Handle dictionary format (current backend) or array (legacy/future proof)
        if (Array.isArray(data)) {
            data.forEach(item => {
                const score = item.sentiment_score !== undefined ? item.sentiment_score : item.score;
                countrySentiments[item.country] = {
                    score: score,
                    label: item.sentiment_label || item.label || getSentimentLabel(score),
                    color: item.color || getSentimentColor(score),
                    article_count: item.article_count
                };
            });
        } else {
            // Dictionary format: { "Country": { score: X, ... } }
            countrySentiments = data;
        }

        // Calculate stats
        let totalAnalyzed = 0;
        let positiveCount = 0;
        let negativeCount = 0;

        Object.values(countrySentiments).forEach(item => {
            const score = item.score !== undefined ? item.score : item.sentiment_score;
            if (score !== null && score !== undefined) {
                totalAnalyzed++;
                if (score > 0.2) positiveCount++;
                if (score < -0.2) negativeCount++;
            }
        });

        // Store for stats
        window.dashboardStats = { totalAnalyzed, positiveCount, negativeCount };

        // Update dashboard stats
        updateDashboardStats();

        console.log(`Loaded sentiments for ${Object.keys(countrySentiments).length} countries`);

    } catch (error) {
        console.error('Error loading country sentiments:', error);
    }
}

// Load dates that have data
async function loadAvailableDates() {
    try {
        const url = getApiUrl('dates', { country: selectedCountry });
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to load dates');

        const dates = await response.json();
        datesWithData = new Set(dates); // YYYY-MM-DD format

        // If we have data, set current date to latest
        if (datesWithData.size > 0 && !selectedDate) {
            const latestDateStr = Array.from(datesWithData).sort().pop();
            if (latestDateStr) {
                const latestDate = new Date(latestDateStr);
                // Adjust timezone
                latestDate.setMinutes(latestDate.getMinutes() + latestDate.getTimezoneOffset());
                currentDate = latestDate; // For calendar
                // Don't auto-select date here, let user click or logic decide
            }
        }

    } catch (error) {
        console.error('Error loading dates:', error);
    }
}

async function loadLastRunDate() {
    try {
        const url = getApiUrl('last-run-date', { country: selectedCountry });
        const response = await fetch(url);
        // ... rest of function logic matches original, but uses new response
        if (!response.ok) throw new Error('Failed to load last run date');

        const data = await response.json();
        const lastUpdatedEl = document.getElementById('lastUpdatedDate');

        if (data.last_run_date) {
            const lastDate = new Date(data.last_run_date);
            // Adjust for timezone
            lastDate.setMinutes(lastDate.getMinutes() + lastDate.getTimezoneOffset());
            // Format as 'Dec 2025' or 'Dec, 2025'
            const options = { year: 'numeric', month: 'short' };
            lastUpdatedEl.textContent = lastDate.toLocaleDateString('en-US', options);
        } else {
            lastUpdatedEl.textContent = 'No data yet';
        }
    } catch (error) {
        console.error('Error loading last run date:', error);
        document.getElementById('lastUpdatedDate').textContent = '-';
    }
}

async function loadCountryOverview() {
    try {
        const url = getApiUrl('country-overview', { country: selectedCountry });
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to load country overview');

        const data = await response.json();

        // Update summary if exists
        const summaryCard = document.getElementById('countrySummaryCard');
        const summaryContent = document.getElementById('countrySummaryContent');
        const summaryDateLabel = document.getElementById('summaryDateLabel');

        // Check for specific date summary from loadCountryOverviewForDate
        // But here we are loading general overview which usually has latest summary

        if (data.latest_summary) {
            summaryContent.innerHTML = marked.parse(data.latest_summary.summary_text);
            summaryDateLabel.textContent = new Date(data.latest_summary.date).toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric'
            });
            summaryCard.classList.remove('hidden');
        } else {
            summaryCard.classList.add('hidden');
        }

        // Display recent signals (articles)
        const signalsGrid = document.getElementById('signalsGrid');
        signalsGrid.innerHTML = '';

        if (data.recent_articles && data.recent_articles.length > 0) {
            data.recent_articles.forEach(article => {
                const signalCard = createSignalCard(article);
                signalsGrid.appendChild(signalCard);
            });
        } else {
            signalsGrid.innerHTML = '<div class="no-data">No recent signals found.</div>';
        }

        // Show the overview section
        document.getElementById('countryOverview').classList.remove('hidden');

    } catch (error) {
        console.error('Error loading country overview:', error);
        document.getElementById('countryOverview').classList.add('hidden');
    }
}

async function loadCountryOverviewForDate(dateStr) {
    try {
        // In static mode, this maps to api/summary/YYYY-MM-DD_Country.json
        const url = getApiUrl(`summary/${dateStr}`, { country: selectedCountry });
        const summaryResponse = await fetch(url);

        if (summaryResponse.ok) {
            const summary = await summaryResponse.json();

            // Update the country summary card
            const summaryCard = document.getElementById('countrySummaryCard');
            const summaryContent = summaryCard.querySelector('.summary-content');

            if (summaryContent && summary.summary_text) {
                summaryContent.innerHTML = marked.parse(summary.summary_text);
                summaryCard.classList.remove('hidden');
            }
        }
    } catch (error) {
        console.error('Error loading summary for date:', error);
    }
}

async function loadDailyData(date) {
    const dateStr = formatDate(date);
    showLoading('Loading articles...');

    try {
        // Load articles
        const articlesUrl = getApiUrl(`articles/${dateStr}`, { country: selectedCountry });
        const articlesResponse = await fetch(articlesUrl);
        if (!articlesResponse.ok) throw new Error('Failed to load articles');

        const articles = await articlesResponse.json();
        displayArticles(articles);

        // Try to load summary (redundant with loadCountryOverviewForDate but keeps existing logic)
        try {
            const summaryUrl = getApiUrl(`summary/${dateStr}`, { country: selectedCountry });
            const summaryResponse = await fetch(summaryUrl);
            if (summaryResponse.ok) {
                const summary = await summaryResponse.json();
                displaySummary(summary.summary_text);
            } else {
                // No summary yet
                if (!document.getElementById('countrySummaryCard').querySelector('.summary-content').innerHTML) {
                    document.getElementById('summaryCard').classList.add('hidden');
                }
            }
        } catch (e) {
            // Summary failure shouldn't break page
        }

    } catch (error) {
        showToast('Error loading daily data: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// ... rest of script ...
// Update scrapeNews and generateSummary to block in static mode

async function scrapeNews() {
    if (IS_STATIC) {
        showToast('Scraping is not available in Demo Mode', 'info');
        return;
    }
    // ... original code ...
}

async function generateSummary() {
    if (IS_STATIC) {
        showToast('Generation is not available in Demo Mode', 'info');
        return;
    }
    // ... original code ...
}



// If we have data, set current date to latest
if (datesWithData.size > 0) {
    const latestDateStr = Array.from(datesWithData).sort().pop();
    if (latestDateStr) {
        currentDate = new Date(latestDateStr);
        // Adjust for timezone to avoid jumping back a day
        currentDate.setMinutes(currentDate.getMinutes() + currentDate.getTimezoneOffset());
    }
}


// ===== Event Listeners =====
function setupEventListeners() {
    document.getElementById('backToCalendar').addEventListener('click', showCalendarView);
    document.getElementById('backToMap').addEventListener('click', showMapView);
    document.getElementById('scrapeBtn').addEventListener('click', scrapeNews);
    document.getElementById('generateSummaryBtn').addEventListener('click', generateSummary);
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('logoHome').addEventListener('click', showMapView);

    // Share button
    const shareBtn = document.getElementById('shareBtn');
    if (shareBtn) {
        shareBtn.addEventListener('click', shareCountryLink);
    }

    // Export button
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportData);
    }

    // Search
    const searchInput = document.getElementById('countrySearch');
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keypress', handleSearchKeypress);

    // Date picker
    const datePicker = document.getElementById('datePicker');
    datePicker.addEventListener('change', handleDatePickerChange);

    // Make calendar container clickable
    const datePickerContainer = document.getElementById('datePickerContainer');
    if (datePickerContainer) {
        datePickerContainer.addEventListener('click', () => {
            datePicker.showPicker(); // Modern browsers
        });
    }

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            document.getElementById('searchSuggestions').classList.add('hidden');
        }
    });

    // Make selectCountry global so it can be called from inline onclick handlers
    window.selectCountry = selectCountry;
}

// Copy share link to clipboard
async function shareCountryLink() {
    const country = selectedCountry || 'Global';
    // Create clean URL like /india instead of ?country=India
    const slug = country.toLowerCase().replace(/\s+/g, '-');
    const url = `${window.location.origin}/${slug}`;

    try {
        await navigator.clipboard.writeText(url);

        // Show feedback
        const shareBtn = document.getElementById('shareBtn');
        const icon = shareBtn.querySelector('.material-symbols-outlined');
        const originalIcon = icon.textContent;
        icon.textContent = 'check';
        shareBtn.title = 'Link copied!';

        setTimeout(() => {
            icon.textContent = originalIcon;
            shareBtn.title = 'Copy share link';
        }, 2000);
    } catch (err) {
        console.error('Failed to copy link:', err);
        // Fallback: show alert with URL
        prompt('Copy this link:', url);
    }
}

// Export sentiment data as CSV
function exportData() {
    let url = `${API_BASE}/api/export/sentiments?format=csv`;

    // If a specific country is selected (and not Global), export that country's history
    if (selectedCountry && selectedCountry !== 'Global') {
        url += `&country=${encodeURIComponent(selectedCountry)}`;
    }

    // Trigger download
    // Use window.open to avoid navigation issues and force download behavior
    window.open(url, '_blank');
}

function handleSearchKeypress(e) {
    if (e.key === 'Enter') {
        const query = e.target.value.trim().toLowerCase();
        if (!query) return;

        // Find best match
        const countriesToSearch = allCountries.length > 0 ? allCountries : COUNTRY_LIST;
        const match = countriesToSearch.find(c => c.name.toLowerCase() === query) ||
            countriesToSearch.find(c => c.name.toLowerCase().startsWith(query));

        if (match) {
            selectCountry(match.name, match.code);
            // Hide suggestions
            document.getElementById('searchSuggestions').classList.add('hidden');
            // Unfocus input
            e.target.blur();
        }
    }
}

function handleDatePickerChange(e) {
    e.preventDefault();
    e.stopPropagation();

    const selectedDateValue = e.target.value;
    if (!selectedDateValue) return;

    // Handle YYYY-MM format from month picker
    let date;
    if (selectedDateValue.length === 7) { // YYYY-MM
        date = new Date(selectedDateValue + '-01T00:00:00');
    } else {
        date = new Date(selectedDateValue + 'T00:00:00');
    }

    // Normalize to 1st of month for monthly aggregation
    date.setDate(1);
    const dateStr = formatDate(date);

    // Update current date and selected date
    currentDate = new Date(date);
    selectedDate = date;

    // Clear ALL existing content before loading new data
    const summaryCard = document.getElementById('countrySummaryCard');
    if (summaryCard) {
        summaryCard.classList.add('hidden');
        const summaryContent = summaryCard.querySelector('.summary-content');
        if (summaryContent) summaryContent.innerHTML = '';
    }

    const articlesGrid = document.getElementById('articlesGrid');
    if (articlesGrid) articlesGrid.innerHTML = '';

    const signalsGrid = document.getElementById('signalsGrid');
    if (signalsGrid) signalsGrid.innerHTML = '';

    // Also clear the country overview section (Recent Signals)
    const countryOverview = document.getElementById('countryOverview');
    if (countryOverview) {
        countryOverview.classList.add('hidden');
    }

    // Update the date display
    const options = { year: 'numeric', month: 'long' };
    const selectedDateEl = document.getElementById('selectedDate');
    if (selectedDateEl) {
        selectedDateEl.textContent = date.toLocaleDateString('en-US', options);
    }

    // Check if date has data and load it
    if (datesWithData.has(dateStr)) {
        // Show the country overview section
        if (countryOverview) {
            countryOverview.classList.remove('hidden');
        }

        // Load data for this date
        loadDailyData(date);

        // Also load country overview for this specific date
        loadCountryOverviewForDate(dateStr);
    } else {
        // No data available - keep everything hidden
        showToast('No data available for this date', 'info');
    }
}



// ===== Theme Management =====
function setTheme(theme) {
    currentTheme = theme;
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        document.getElementById('themeIcon').textContent = 'light_mode';
    } else {
        document.body.classList.remove('dark-theme');
        document.getElementById('themeIcon').textContent = 'dark_mode';
    }
    localStorage.setItem('theme', theme);
}

function toggleTheme() {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);

    // Reinitialize map with new colors safely
    const mapElement = document.getElementById('world-map');

    if (map) {
        try {
            // Correct way to destroy map in v1.6.0+
            if (typeof map.destroy === 'function') {
                map.destroy();
            }
            // Fallback for other versions
            else if (map.root && typeof map.root.dispose === 'function') {
                map.root.dispose();
            }
        } catch (e) {
            console.warn("Map destroy error:", e);
        }

        map = null;
        // Clean any leftover SVG HTML manually just in case
        if (mapElement) mapElement.innerHTML = '';

        // Re-init after a delay
        setTimeout(() => {
            initMap();
        }, 100);
    }
}
// ===== Map Functions =====
let mapInitRetries = 0;
const MAX_MAP_RETRIES = 50; // Max 5 seconds of retries
let countrySentiments = {}; // Store sentiment data for countries
let countryArticleCounts = {}; // Store article counts per country

// Update the last updated timestamp
function updateLastUpdated() {
    const lastUpdatedEl = document.getElementById('lastUpdated');
    if (!lastUpdatedEl) return;

    // Find the most recent date from sentiments
    let latestDate = null;
    for (const country in countrySentiments) {
        const date = countrySentiments[country].date;
        if (date && (!latestDate || date > latestDate)) {
            latestDate = date;
        }
    }

    if (latestDate) {
        const dateObj = new Date(latestDate);
        const formatted = dateObj.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
        });
        lastUpdatedEl.textContent = `Data from ${formatted} • ${Object.keys(countrySentiments).length} countries analyzed`;
    } else {
        lastUpdatedEl.textContent = 'No data available';
    }

    // Update dashboard stats
    updateDashboardStats();
}

// Update dashboard statistics cards
function updateDashboardStats() {
    let positiveCount = 0;
    let negativeCount = 0;
    let totalCount = 0;

    for (const country in countrySentiments) {
        const sentiment = countrySentiments[country];
        totalCount++;

        if (sentiment.score > 0) {
            positiveCount++;
        } else if (sentiment.score < 0) {
            negativeCount++;
        }
    }

    // Update DOM elements
    const positiveEl = document.getElementById('positiveCount');
    const negativeEl = document.getElementById('negativeCount');
    const totalEl = document.getElementById('totalCountries');

    if (positiveEl) positiveEl.textContent = positiveCount;
    if (negativeEl) negativeEl.textContent = negativeCount;
    if (totalEl) totalEl.textContent = totalCount;
}

// Show top movers (countries with extreme sentiments)
function showTopMovers() {
    // Get sorted countries by sentiment score
    const sortedCountries = Object.entries(countrySentiments)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.score - a.score);

    // Get top 5 positive and top 5 negative
    const topPositive = sortedCountries.slice(0, 5);
    const topNegative = sortedCountries.slice(-5).reverse();

    // Create modal or alert with top movers
    let message = '📈 TOP POSITIVE OUTLOOK:\n';
    topPositive.forEach((c, i) => {
        message += `${i + 1}. ${c.name}: ${(c.score * 100).toFixed(0)}%\n`;
    });

    message += '\n📉 TOP NEGATIVE OUTLOOK:\n';
    topNegative.forEach((c, i) => {
        message += `${i + 1}. ${c.name}: ${(c.score * 100).toFixed(0)}%\n`;
    });

    alert(message);
}

// Make showTopMovers global for onclick
window.showTopMovers = showTopMovers;

// Show/hide loading overlay
function setMapLoading(loading, message = 'Analyzing global sentiment...') {
    const overlay = document.getElementById('mapLoadingOverlay');
    const loadingText = overlay?.querySelector('.loading-text');

    if (overlay) {
        if (loading) {
            overlay.classList.remove('hidden');
            if (loadingText) loadingText.textContent = message;
        } else {
            overlay.classList.add('hidden');
        }
    }
}



// Get color for a country based on sentiment
function getCountryColor(countryName) {
    const sentiment = countrySentiments[countryName];
    if (sentiment && sentiment.color) {
        return sentiment.color;
    }
    return '#d1d5db'; // Default gray
}

// Build region colors object for jsVectorMap (code -> color)
function buildRegionColors() {
    const regionColors = {};

    for (const country of COUNTRY_LIST) {
        const sentiment = countrySentiments[country.name];
        if (sentiment && sentiment.color) {
            regionColors[country.code] = sentiment.color;
        }
    }

    console.log('Built region colors for', Object.keys(regionColors).length, 'countries');
    return regionColors;
}

// Apply sentiment colors to map regions after map is initialized
function applySentimentColors() {
    if (!map) return;

    const regionColors = buildRegionColors();

    // Get the SVG element inside the map container
    const mapContainer = document.getElementById('world-map');
    if (!mapContainer) return;

    const svg = mapContainer.querySelector('svg');
    if (!svg) return;

    // Find all path elements (regions)
    const paths = svg.querySelectorAll('path[data-code]');
    let coloredCount = 0;

    paths.forEach(path => {
        const code = path.getAttribute('data-code');
        if (code && regionColors[code]) {
            path.style.fill = regionColors[code];
            coloredCount++;
        }
    });

    console.log(`Applied sentiment colors to ${coloredCount} countries`);
}



async function selectCountry(countryName, code) {
    console.log('Selecting country:', countryName, code);
    selectedCountry = countryName;
    document.getElementById('selectedCountryName').textContent = countryName;

    // Update browser URL to clean format like /india
    const slug = countryName.toLowerCase().replace(/\s+/g, '-');
    const newUrl = `/${slug}`;
    window.history.pushState({ country: countryName }, countryName, newUrl);

    // Update map selection (with error handling to prevent blocking view switch)
    if (map) {
        try {
            map.clearSelectedRegions();
            if (code) {
                map.setSelectedRegions([code]);
            }
        } catch (error) {
            console.warn('Map selection error (non-critical):', error);
        }
    }

    showCalendarView();

    // Load country overview (summary and signals for last run date)
    await loadCountryOverview();

    // Load data for this country
    await loadAvailableDates();
    await loadLastRunDate();
    // renderCalendar(); // Removed - no longer needed

    // Clear search and suggestions
    const searchInput = document.getElementById('countrySearch');
    searchInput.value = '';
    document.getElementById('searchSuggestions').classList.add('hidden');
}

// ===== Data State =====
let allCountries = []; // Store all available countries for search

// Comprehensive country list for search (with common names and codes)
const COUNTRY_LIST = [
    { name: 'Afghanistan', code: 'AF' },
    { name: 'Albania', code: 'AL' },
    { name: 'Algeria', code: 'DZ' },
    { name: 'Andorra', code: 'AD' },
    { name: 'Angola', code: 'AO' },
    { name: 'Antigua and Barbuda', code: 'AG' },
    { name: 'Argentina', code: 'AR' },
    { name: 'Armenia', code: 'AM' },
    { name: 'Australia', code: 'AU' },
    { name: 'Austria', code: 'AT' },
    { name: 'Azerbaijan', code: 'AZ' },
    { name: 'Bahamas', code: 'BS' },
    { name: 'Bahrain', code: 'BH' },
    { name: 'Bangladesh', code: 'BD' },
    { name: 'Barbados', code: 'BB' },
    { name: 'Belarus', code: 'BY' },
    { name: 'Belgium', code: 'BE' },
    { name: 'Belize', code: 'BZ' },
    { name: 'Benin', code: 'BJ' },
    { name: 'Bhutan', code: 'BT' },
    { name: 'Bolivia', code: 'BO' },
    { name: 'Bosnia and Herzegovina', code: 'BA' },
    { name: 'Botswana', code: 'BW' },
    { name: 'Brazil', code: 'BR' },
    { name: 'Brunei', code: 'BN' },
    { name: 'Bulgaria', code: 'BG' },
    { name: 'Burkina Faso', code: 'BF' },
    { name: 'Burundi', code: 'BI' },
    { name: 'Cabo Verde', code: 'CV' },
    { name: 'Cambodia', code: 'KH' },
    { name: 'Cameroon', code: 'CM' },
    { name: 'Canada', code: 'CA' },
    { name: 'Central African Republic', code: 'CF' },
    { name: 'Chad', code: 'TD' },
    { name: 'Chile', code: 'CL' },
    { name: 'China', code: 'CN' },
    { name: 'Colombia', code: 'CO' },
    { name: 'Comoros', code: 'KM' },
    { name: 'Congo (Congo-Brazzaville)', code: 'CG' },
    { name: 'Costa Rica', code: 'CR' },
    { name: 'Croatia', code: 'HR' },
    { name: 'Cuba', code: 'CU' },
    { name: 'Cyprus', code: 'CY' },
    { name: 'Czech Republic', code: 'CZ' },
    { name: 'Democratic Republic of the Congo', code: 'CD' },
    { name: 'Denmark', code: 'DK' },
    { name: 'Djibouti', code: 'DJ' },
    { name: 'Dominica', code: 'DM' },
    { name: 'Dominican Republic', code: 'DO' },
    { name: 'Ecuador', code: 'EC' },
    { name: 'Egypt', code: 'EG' },
    { name: 'El Salvador', code: 'SV' },
    { name: 'Equatorial Guinea', code: 'GQ' },
    { name: 'Eritrea', code: 'ER' },
    { name: 'Estonia', code: 'EE' },
    { name: 'Eswatini', code: 'SZ' },
    { name: 'Ethiopia', code: 'ET' },
    { name: 'Fiji', code: 'FJ' },
    { name: 'Finland', code: 'FI' },
    { name: 'France', code: 'FR' },
    { name: 'Gabon', code: 'GA' },
    { name: 'Gambia', code: 'GM' },
    { name: 'Georgia', code: 'GE' },
    { name: 'Germany', code: 'DE' },
    { name: 'Ghana', code: 'GH' },
    { name: 'Greece', code: 'GR' },
    { name: 'Grenada', code: 'GD' },
    { name: 'Guatemala', code: 'GT' },
    { name: 'Guinea', code: 'GN' },
    { name: 'Guinea-Bissau', code: 'GW' },
    { name: 'Guyana', code: 'GY' },
    { name: 'Haiti', code: 'HT' },
    { name: 'Honduras', code: 'HN' },
    { name: 'Hungary', code: 'HU' },
    { name: 'Iceland', code: 'IS' },
    { name: 'India', code: 'IN' },
    { name: 'Indonesia', code: 'ID' },
    { name: 'Iran', code: 'IR' },
    { name: 'Iraq', code: 'IQ' },
    { name: 'Ireland', code: 'IE' },
    { name: 'Israel', code: 'IL' },
    { name: 'Italy', code: 'IT' },
    { name: 'Jamaica', code: 'JM' },
    { name: 'Japan', code: 'JP' },
    { name: 'Jordan', code: 'JO' },
    { name: 'Kazakhstan', code: 'KZ' },
    { name: 'Kenya', code: 'KE' },
    { name: 'Kiribati', code: 'KI' },
    { name: 'Kuwait', code: 'KW' },
    { name: 'Kyrgyzstan', code: 'KG' },
    { name: 'Laos', code: 'LA' },
    { name: 'Latvia', code: 'LV' },
    { name: 'Lebanon', code: 'LB' },
    { name: 'Lesotho', code: 'LS' },
    { name: 'Liberia', code: 'LR' },
    { name: 'Libya', code: 'LY' },
    { name: 'Liechtenstein', code: 'LI' },
    { name: 'Lithuania', code: 'LT' },
    { name: 'Luxembourg', code: 'LU' },
    { name: 'Madagascar', code: 'MG' },
    { name: 'Malawi', code: 'MW' },
    { name: 'Malaysia', code: 'MY' },
    { name: 'Maldives', code: 'MV' },
    { name: 'Mali', code: 'ML' },
    { name: 'Malta', code: 'MT' },
    { name: 'Marshall Islands', code: 'MH' },
    { name: 'Mauritania', code: 'MR' },
    { name: 'Mauritius', code: 'MU' },
    { name: 'Mexico', code: 'MX' },
    { name: 'Micronesia', code: 'FM' },
    { name: 'Moldova', code: 'MD' },
    { name: 'Monaco', code: 'MC' },
    { name: 'Mongolia', code: 'MN' },
    { name: 'Montenegro', code: 'ME' },
    { name: 'Morocco', code: 'MA' },
    { name: 'Mozambique', code: 'MZ' },
    { name: 'Myanmar', code: 'MM' },
    { name: 'Namibia', code: 'NA' },
    { name: 'Nauru', code: 'NR' },
    { name: 'Nepal', code: 'NP' },
    { name: 'Netherlands', code: 'NL' },
    { name: 'New Zealand', code: 'NZ' },
    { name: 'Nicaragua', code: 'NI' },
    { name: 'Niger', code: 'NE' },
    { name: 'Nigeria', code: 'NG' },
    { name: 'North Korea', code: 'KP' },
    { name: 'North Macedonia', code: 'MK' },
    { name: 'Norway', code: 'NO' },
    { name: 'Oman', code: 'OM' },
    { name: 'Pakistan', code: 'PK' },
    { name: 'Palau', code: 'PW' },
    { name: 'Palestine', code: 'PS' },
    { name: 'Panama', code: 'PA' },
    { name: 'Papua New Guinea', code: 'PG' },
    { name: 'Paraguay', code: 'PY' },
    { name: 'Peru', code: 'PE' },
    { name: 'Philippines', code: 'PH' },
    { name: 'Poland', code: 'PL' },
    { name: 'Portugal', code: 'PT' },
    { name: 'Qatar', code: 'QA' },
    { name: 'Romania', code: 'RO' },
    { name: 'Russia', code: 'RU' },
    { name: 'Rwanda', code: 'RW' },
    { name: 'Saint Kitts and Nevis', code: 'KN' },
    { name: 'Saint Lucia', code: 'LC' },
    { name: 'Saint Vincent and the Grenadines', code: 'VC' },
    { name: 'Samoa', code: 'WS' },
    { name: 'San Marino', code: 'SM' },
    { name: 'Sao Tome and Principe', code: 'ST' },
    { name: 'Saudi Arabia', code: 'SA' },
    { name: 'Senegal', code: 'SN' },
    { name: 'Serbia', code: 'RS' },
    { name: 'Seychelles', code: 'SC' },
    { name: 'Sierra Leone', code: 'SL' },
    { name: 'Singapore', code: 'SG' },
    { name: 'Slovakia', code: 'SK' },
    { name: 'Slovenia', code: 'SI' },
    { name: 'Solomon Islands', code: 'SB' },
    { name: 'Somalia', code: 'SO' },
    { name: 'South Africa', code: 'ZA' },
    { name: 'South Korea', code: 'KR' },
    { name: 'South Sudan', code: 'SS' },
    { name: 'Spain', code: 'ES' },
    { name: 'Sri Lanka', code: 'LK' },
    { name: 'Sudan', code: 'SD' },
    { name: 'Suriname', code: 'SR' },
    { name: 'Sweden', code: 'SE' },
    { name: 'Switzerland', code: 'CH' },
    { name: 'Syria', code: 'SY' },
    { name: 'Taiwan', code: 'TW' },
    { name: 'Tajikistan', code: 'TJ' },
    { name: 'Tanzania', code: 'TZ' },
    { name: 'Thailand', code: 'TH' },
    { name: 'Timor-Leste', code: 'TL' },
    { name: 'Togo', code: 'TG' },
    { name: 'Tonga', code: 'TO' },
    { name: 'Trinidad and Tobago', code: 'TT' },
    { name: 'Tunisia', code: 'TN' },
    { name: 'Turkey', code: 'TR' },
    { name: 'Turkmenistan', code: 'TM' },
    { name: 'Tuvalu', code: 'TV' },
    { name: 'Uganda', code: 'UG' },
    { name: 'Ukraine', code: 'UA' },
    { name: 'United Arab Emirates', code: 'AE' },
    { name: 'United Kingdom', code: 'GB' },
    { name: 'United States', code: 'US' },
    { name: 'Uruguay', code: 'UY' },
    { name: 'Uzbekistan', code: 'UZ' },
    { name: 'Vanuatu', code: 'VU' },
    { name: 'Vatican City', code: 'VA' },
    { name: 'Venezuela', code: 'VE' },
    { name: 'Vietnam', code: 'VN' },
    { name: 'Yemen', code: 'YE' },
    { name: 'Zambia', code: 'ZM' },
    { name: 'Zimbabwe', code: 'ZW' }
];

// ... (inside initializeApp)

async function initializeApp() {
    setupEventListeners();

    // Check theme preference first
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);

    // Initialize country data for search
    initializeCountryData();

    // 1. SHOW the view first (Ensures the div has width/height)
    showMapView();

    // 2. Initialize Map with a tiny delay to allow layout to paint
    setTimeout(() => {
        initMap();
    }, 100);

    // Load initial data for Global
    await loadAvailableDates();

    // 3. Set Date Logic (Now correctly INSIDE the function)
    if (datesWithData.size > 0) {
        const latestDateStr = Array.from(datesWithData).sort().pop();
        if (latestDateStr) {
            currentDate = new Date(latestDateStr);
            // Adjust for timezone to avoid jumping back a day
            currentDate.setMinutes(currentDate.getMinutes() + currentDate.getTimezoneOffset());
        }
    }
}

function initializeCountryData() {
    // Start with predefined country list for immediate search functionality
    allCountries = [...COUNTRY_LIST];

    // Also try to extract countries from the map data for completeness
    if (typeof jsVectorMap !== 'undefined' && jsVectorMap.maps && jsVectorMap.maps.world) {
        try {
            const paths = jsVectorMap.maps.world.paths;
            const mapCountries = Object.entries(paths).map(([code, data]) => ({
                name: data.name || data,
                code: code
            }));

            // Merge map countries with predefined list (avoid duplicates)
            const existingNames = new Set(allCountries.map(c => c.name.toLowerCase()));
            mapCountries.forEach(country => {
                if (!existingNames.has(country.name.toLowerCase())) {
                    allCountries.push(country);
                }
            });

            console.log(`Loaded ${allCountries.length} countries for search (${COUNTRY_LIST.length} predefined + ${mapCountries.length} from map)`);
        } catch (error) {
            console.warn('Error extracting countries from map data:', error);
            console.log(`Using ${allCountries.length} predefined countries for search`);
        }
    } else {
        console.log(`Using ${allCountries.length} predefined countries for search`);
        // Retry if map data isn't loaded yet
        setTimeout(initializeCountryData, 1000);
    }
}

// ... (rest of code)

function handleSearchInput(e) {
    const query = e.target.value.trim().toLowerCase();
    const suggestionsEl = document.getElementById('searchSuggestions');

    if (query.length < 1) {
        suggestionsEl.classList.add('hidden');
        return;
    }

    // Use the pre-loaded countries list (or fallback to predefined list)
    const countriesToSearch = allCountries.length > 0 ? allCountries : COUNTRY_LIST;

    if (countriesToSearch.length > 0) {
        const matches = countriesToSearch.filter(country => {
            const name = country.name.toLowerCase();
            // Check if query matches at the start (higher priority) or anywhere in the name
            return name.startsWith(query) || name.includes(query);
        });

        // Sort: exact matches first, then start matches, then by name length
        matches.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();

            // Exact match first
            if (aName === query && bName !== query) return -1;
            if (bName === query && aName !== query) return 1;

            // Then start matches
            if (aName.startsWith(query) && !bName.startsWith(query)) return -1;
            if (bName.startsWith(query) && !aName.startsWith(query)) return 1;

            // Then by length
            return aName.length - bName.length;
        });

        const topMatches = matches.slice(0, 8); // Show more results

        if (topMatches.length > 0) {
            suggestionsEl.innerHTML = topMatches.map(match => {
                // Escape HTML and highlight matching part
                const escapedName = match.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                const highlightedName = escapedName.replace(regex, '<span class="match">$1</span>');
                const safeName = match.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                return `<div class="suggestion-item" data-country-name="${safeName}" data-country-code="${match.code}">${highlightedName}</div>`;
            }).join('');
            suggestionsEl.classList.remove('hidden');
        } else {
            suggestionsEl.classList.add('hidden');
        }
    } else {
        suggestionsEl.classList.add('hidden');
    }
}

// Add click handler for search suggestions
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('suggestion-item')) {
        const countryName = e.target.getAttribute('data-country-name');
        const countryCode = e.target.getAttribute('data-country-code');
        if (countryName && countryCode) {
            selectCountry(countryName, countryCode);
        }
    }
});

// ===== Calendar Functions =====
// renderCalendar and changeYear removed as grid is removed.

// ===== Date Selection =====
async function selectDate(date) {
    selectedDate = date;
    const dateStr = formatDate(date);

    // Check if date has data
    if (!datesWithData.has(dateStr)) {
        showToast('No articles found for this date', 'error');
        return;
    }

    showDailyView(date);
    await loadDailyData(date);
}

// ===== View Management =====
function showMapView() {
    document.getElementById('mapView').classList.remove('hidden');
    document.getElementById('calendarView').classList.add('hidden');
    document.getElementById('dailyView').classList.add('hidden');
    document.getElementById('countryOverview').classList.add('hidden');
    selectedDate = null;
    selectedCountry = 'Global';

    // Reset URL to root
    window.history.pushState({}, 'Global Economic Analysis', '/');

    // Initialize map if it doesn't exist
    if (!map) {
        setTimeout(() => {
            initMap();
        }, 200);
    }
}

function showCalendarView() {
    const mapView = document.getElementById('mapView');
    const calendarView = document.getElementById('calendarView');
    const dailyView = document.getElementById('dailyView');

    mapView.classList.add('hidden');
    calendarView.classList.remove('hidden');
    dailyView.classList.add('hidden');

    selectedDate = null;
    // renderCalendar(); // Removed - calendar grid no longer exists
}

function showDailyView(date) {
    document.getElementById('calendarView').classList.add('hidden');
    document.getElementById('dailyView').classList.remove('hidden');

    const options = { year: 'numeric', month: 'long' };
    document.getElementById('selectedDate').textContent = date.toLocaleDateString('en-US', options);
}

// ===== API Functions =====
let articleCounts = {}; // Store article counts per date



function displayCountrySummary(summaryText, dateStr) {
    const card = document.getElementById('countrySummaryCard');
    const content = document.getElementById('countrySummaryContent');
    const dateLabel = document.getElementById('summaryDateLabel');

    // Set date label
    if (dateStr) {
        const date = new Date(dateStr);
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        dateLabel.textContent = date.toLocaleDateString('en-US', options);
    }

    // Configure marked.js options
    marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: true,
        mangle: false,
        highlight: function (code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(code, { language: lang }).value;
                } catch (err) { }
            }
            return hljs.highlightAuto(code).value;
        }
    });

    // Parse Markdown to HTML
    content.innerHTML = marked.parse(summaryText);

    // Highlight code blocks
    content.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });

    card.classList.remove('hidden');
}

function displayCountryArticles(articles) {
    const container = document.getElementById('countryArticlesList');
    const count = document.getElementById('countryArticleCount');
    const section = document.getElementById('countryArticlesSection');

    count.textContent = `${articles.length} signal${articles.length !== 1 ? 's' : ''}`;
    section.classList.remove('hidden');

    // Show only first 10 articles in overview, rest can be viewed by clicking date
    const displayArticles = articles.slice(0, 10);
    const hasMore = articles.length > 10;

    container.innerHTML = displayArticles.map(article => `
        <div class="article-card" onclick="window.open('${escapeHtml(article.url)}', '_blank')">
            <span class="article-category">${escapeHtml(article.category)}</span>
            <h4 class="article-title">${escapeHtml(article.title)}</h4>
            <p class="article-source">
                <span class="material-symbols-outlined" style="font-size: 16px;">public</span>
                ${escapeHtml(article.source)}
            </p>
            ${article.description ? `<p class="article-description">${escapeHtml(article.description)}</p>` : ''}
        </div>
    `).join('') + (hasMore ? `<div class="article-card-more">+ ${articles.length - 10} more signals available. Select a date from calendar to view all.</div>` : '');
}



// ===== Display Functions =====
function displayArticles(articles) {
    const container = document.getElementById('articlesList');
    const count = document.getElementById('articleCount');

    count.textContent = `${articles.length} article${articles.length !== 1 ? 's' : ''}`;

    container.innerHTML = articles.map(article => `
        <div class="article-card" onclick="window.open('${escapeHtml(article.url)}', '_blank')">
            <span class="article-category">${escapeHtml(article.category)}</span>
            <h4 class="article-title">${escapeHtml(article.title)}</h4>
            <p class="article-source">
                <span class="material-symbols-outlined" style="font-size: 16px;">public</span>
                ${escapeHtml(article.source)}
            </p>
            ${article.description ? `<p class="article-description">${escapeHtml(article.description)}</p>` : ''}
        </div>
    `).join('');
}

function displaySummary(summaryText) {
    const card = document.getElementById('summaryCard');
    const content = document.getElementById('summaryContent');

    // Configure marked.js options
    marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: true,
        mangle: false,
        highlight: function (code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    return hljs.highlight(code, { language: lang }).value;
                } catch (err) { }
            }
            return hljs.highlightAuto(code).value;
        }
    });

    // Parse Markdown to HTML
    content.innerHTML = marked.parse(summaryText);

    // Highlight code blocks
    content.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
    });

    card.classList.remove('hidden');
}

// ===== UI Helpers =====
function showLoading(text) {
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

function showToast(message, type = 'info', duration = 4000) {
    const toast = document.getElementById('toast');
    const messageEl = document.getElementById('toastMessage');

    messageEl.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, duration);
}

// ===== Utility Functions =====
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

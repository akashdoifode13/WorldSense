var STATIC_MODE = false; // Default to dynamic mode

let currentDate = new Date();
let selectedDate = null;
let selectedCountry = 'Global';
let datesWithData = new Set();
let currentTheme = 'dark';
let map = null;

// ===== API Configuration =====
const API_BASE = window.location.origin;

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
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

// function initializeApp() removed (duplicate)

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

    // Regenerate Summary button
    const regenBtn = document.getElementById('regenerateSummaryBtn');
    if (regenBtn) {
        regenBtn.addEventListener('click', regenerateSummary);
    }

    // Create Summary button (Placeholder)
    const createBtn = document.getElementById('createSummaryBtn');
    if (createBtn) {
        createBtn.addEventListener('click', regenerateSummary); // Reuse same function
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

// Load country overview for a specific date
async function loadCountryOverviewForDate(dateStr) {
    if (!dateStr) return;

    // Show loading state
    const summaryContent = document.getElementById('countrySummaryContent');
    if (summaryContent) {
        summaryContent.innerHTML = '<div class="loading-spinner"><span class="material-symbols-outlined spin">refresh</span> Loading analysis...</div>';
    }

    try {
        const country = selectedCountry || 'Global';
        // Use the country-overview endpoint which might support date filtering, 
        // OR use separate endpoints. 
        // Based on backend/main.py (Step 686), /api/country-overview takes 'country' but gets LATEST date.
        // We need specific date. 
        // Creating parallel fetch for summary and articles is safer if overview doesn't support date.

        // 1. Fetch Summary
        const summaryPromise = fetchAPI(`/api/summary/${dateStr}?country=${encodeURIComponent(country)}`);

        // 2. Fetch Articles (need endpoint for this)
        // Backend main.py (Step 686) showed get_country_overview uses get_articles_by_date.
        // Let's assume we can GET /api/articles?date=... or similar?
        // Actually, let's use the pattern from the other logic block: fetch articles separately.
        const articlesPromise = fetchAPI(`/api/articles?date=${dateStr}&country=${encodeURIComponent(country)}`);

        const [summaryRes, articlesRes] = await Promise.all([summaryPromise, articlesPromise]);

        // Handle Summary
        const summaryCard = document.getElementById('countrySummaryCard');
        const summaryPlaceholder = document.getElementById('generateSummaryPlaceholder');
        const summaryDateLabel = document.getElementById('summaryDateLabel');

        if (summaryRes.ok) {
            const summary = await summaryRes.json();
            if (summary && summary.summary_text) {
                // Show Summary
                if (summaryCard) summaryCard.classList.remove('hidden');
                if (summaryPlaceholder) summaryPlaceholder.classList.add('hidden');

                if (summaryContent) summaryContent.innerHTML = marked.parse(summary.summary_text);

                if (summary.generated_at && summaryDateLabel) {
                    const genDate = new Date(summary.generated_at);
                    summaryDateLabel.textContent = `Generated: ${genDate.toLocaleDateString()}`;
                }
            } else {
                // No summary text -> Show Placeholder
                if (summaryCard) summaryCard.classList.add('hidden');
                if (summaryPlaceholder) summaryPlaceholder.classList.remove('hidden');
            }
        } else {
            // Error or 404 -> Show Placeholder
            if (summaryCard) summaryCard.classList.add('hidden');
            if (summaryPlaceholder) summaryPlaceholder.classList.remove('hidden');
        }

        // Handle Articles
        let articleCount = 0;
        if (articlesRes.ok) {
            const articles = await articlesRes.json();
            articleCount = articles.length;
            displayCountryArticles(articles);
        } else {
            displayCountryArticles([]);
        }

        // Update placeholder button state based on articles
        const createBtn = document.getElementById('createSummaryBtn');
        if (createBtn && summaryPlaceholder && !summaryPlaceholder.classList.contains('hidden')) {
            if (articleCount === 0) {
                createBtn.disabled = true;
                createBtn.innerHTML = '<span class="material-symbols-outlined">block</span> No Articles to Analyze';
                createBtn.title = "Cannot generate summary without articles";
            } else {
                createBtn.disabled = false;
                createBtn.innerHTML = '<span class="material-symbols-outlined">auto_awesome</span> Generate Summary';
                createBtn.title = "";
            }
        }

    } catch (error) {
        console.error('Error loading country overview:', error);
        showToast('Failed to load data', 'error');
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

// Fetch country sentiments from API
async function fetchCountrySentiments() {
    try {
        const response = await fetchAPI('/api/country-sentiments');
        if (response.ok) {
            countrySentiments = await response.json();
            console.log('Loaded sentiment data for', Object.keys(countrySentiments).length, 'countries');
            updateLastUpdated();
            return countrySentiments;
        }
    } catch (error) {
        console.warn('Error fetching country sentiments:', error);
    }
    return {};
}

// Fetch article counts for all countries (for tooltip)
async function fetchArticleCounts() {
    try {
        // We can derive this from existing country overview calls or add a new endpoint
        // For now, we'll show the count from the sentiment data dates
        console.log('Article counts will be fetched per country on hover');
    } catch (error) {
        console.warn('Error fetching article counts:', error);
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

async function initMap() {
    // Prevent re-initialization
    if (map) return;

    const mapElement = document.getElementById('world-map');

    // Safety check: if element has 0 height, wait and try again
    if (!mapElement || mapElement.offsetHeight === 0) {
        setTimeout(initMap, 200);
        return;
    }

    // Show loading overlay
    setMapLoading(true, 'Loading global economic data...');

    // Clear previous content
    mapElement.innerHTML = '';

    // Fetch sentiment data before initializing map
    await fetchCountrySentiments();

    try {
        // --- CONFIGURATION WITH SENTIMENT COLORING ---
        map = new jsVectorMap({
            selector: '#world-map',
            map: 'world',

            // Look and Feel options
            backgroundColor: 'transparent',
            draggable: true,
            zoomButtons: true,
            zoomOnScroll: true,

            // Region (Country) Styling
            regionStyle: {
                initial: {
                    fill: '#d1d5db', // Default gray color
                    stroke: '#6b7280', // Border color
                    strokeWidth: 0.5,
                    fillOpacity: 1
                },
                hover: {
                    fillOpacity: 0.8,
                    cursor: 'pointer'
                },
                selected: {
                    fill: '#1f2937' // Dark gray when selected
                }
            },

            // Add Tooltips with sentiment info
            showTooltip: true,
            onRegionTooltipShow: function (event, tooltip, code) {
                const country = COUNTRY_LIST.find(c => c.code === code);
                const countryName = country ? country.name : code;
                const sentiment = countrySentiments[countryName];

                let tooltipContent = `<strong>${countryName}</strong>`;

                if (sentiment) {
                    const scoreFormatted = (sentiment.score * 100).toFixed(0);
                    const scoreSign = sentiment.score >= 0 ? '+' : '';
                    tooltipContent += `<br><span style="color: ${sentiment.color};">● ${sentiment.label}</span>`;
                    tooltipContent += `<br><small>Score: ${scoreSign}${scoreFormatted}%</small>`;
                }

                tooltip.text(tooltipContent, true);
            },

            // Marker Styling
            markerStyle: {
                initial: {
                    fill: '#000000ff',
                    stroke: '#fff',
                    r: 5
                },
                hover: {
                    fill: '#050505ff',
                    stroke: '#fff',
                    r: 7
                }
            },

            // Connect click event to your App Logic
            onRegionClick: function (event, code) {
                console.log("Clicked country code:", code);

                // 1. Try to find in our standardized COUNTRY_LIST first (by code)
                const standardCountry = COUNTRY_LIST.find(c => c.code === code);

                let countryName;
                if (standardCountry) {
                    countryName = standardCountry.name;
                } else {
                    // 2. Fallback to map data
                    if (map && typeof map.getRegionName === 'function') {
                        countryName = map.getRegionName(code);
                    } else if (jsVectorMap.maps.world.paths[code]) {
                        countryName = jsVectorMap.maps.world.paths[code].name;
                    }
                }

                if (countryName) {
                    selectCountry(countryName, code);
                }
            }
        });

        console.log("Map initialized successfully");

        // Apply sentiment colors after a short delay to ensure SVG is rendered
        setTimeout(() => {
            applySentimentColors();
            setMapLoading(false);
        }, 100);

    } catch (error) {
        console.error("Map failed to load:", error);
        setMapLoading(false);
    }
}

async function selectCountry(countryName, code) {
    console.log('Selecting country:', countryName, code);
    selectedCountry = countryName;
    document.getElementById('selectedCountryName').textContent = countryName;

    // Update browser URL
    const slug = countryName.toLowerCase().replace(/\s+/g, '-');

    if (STATIC_MODE) {
        // In static mode, use query params to avoid 404s on refresh and relative path issues
        const newUrl = `?country=${encodeURIComponent(countryName)}`;
        window.history.pushState({ country: countryName }, countryName, newUrl);
    } else {
        const newUrl = `/${slug}`;
        window.history.pushState({ country: countryName }, countryName, newUrl);
    }

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

    // 4. Handle deep linking (Load initial country)
    let initialCountry = null;
    if (STATIC_MODE) {
        const params = new URLSearchParams(window.location.search);
        if (params.has('country')) {
            initialCountry = decodeURIComponent(params.get('country'));
        }
    } else if (window.INITIAL_COUNTRY && window.INITIAL_COUNTRY !== 'Global') {
        initialCountry = window.INITIAL_COUNTRY;
    }

    if (initialCountry && initialCountry !== 'Global') {
        // Wait for map initialization before selecting
        setTimeout(() => {
            const countryEntry = COUNTRY_LIST.find(c => c.name.toLowerCase() === initialCountry.toLowerCase());
            const code = countryEntry ? countryEntry.code : null;
            selectCountry(initialCountry, code);
        }, 500);
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

async function loadLastRunDate() {
    try {
        const response = await fetchAPI(`/api/last-run-date?country=${encodeURIComponent(selectedCountry)}`);
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
        const response = await fetchAPI(`/api/country-overview?country=${encodeURIComponent(selectedCountry)}`);
        if (!response.ok) throw new Error('Failed to load country overview');

        const data = await response.json();

        const overviewEl = document.getElementById('countryOverview');
        overviewEl.classList.remove('hidden');

        if (data.last_run_date) {
            // Set date picker to the latest month
            const latestDate = new Date(data.last_run_date);
            const year = latestDate.getFullYear();
            const month = String(latestDate.getMonth() + 1).padStart(2, '0');
            const dateStr = `${year}-${month}-${String(latestDate.getDate()).padStart(2, '0')}`;

            const datePicker = document.getElementById('datePicker');
            datePicker.value = `${year}-${month}`;

            selectedDate = latestDate; // Update global state

            // Reuse the main loading logic which handles everything correctly
            await loadCountryOverviewForDate(data.last_run_date);

        } else {
            // No data yet - set date picker to current month and show empty state
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const datePicker = document.getElementById('datePicker');
            datePicker.value = `${year}-${month}`;

            selectedDate = today;

            // Trigger load with today's date to show the "No Data" placeholder
            const dateStr = `${year}-${month}-${String(today.getDate()).padStart(2, '0')}`;
            await loadCountryOverviewForDate(dateStr);
        }
    } catch (error) {
        console.error('Error loading country overview:', error);

        // Fallback
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        document.getElementById('datePicker').value = `${year}-${month}`;
        document.getElementById('countryOverview').classList.remove('hidden');
    }
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

async function loadAvailableDates() {
    try {
        const response = await fetchAPI(`/api/dates?country=${encodeURIComponent(selectedCountry)}`);
        if (!response.ok) throw new Error('Failed to load dates');

        const dates = await response.json();
        datesWithData = new Set(dates.map(d => d.date));

        // Store article counts
        articleCounts = {};
        dates.forEach(d => {
            articleCounts[d.date] = d.article_count || 0;
        });
    } catch (error) {
        console.error('Error loading dates:', error);
    }
}

async function loadDailyData(date) {
    const dateStr = formatDate(date);
    showLoading('Loading articles...');

    try {
        // Load daily signals
        try {
            const articlesResponse = await fetchAPI(`/api/articles?date=${dateStr}&country=${encodeURIComponent(selectedCountry)}`);
            if (articlesResponse.ok) {
                const articles = await articlesResponse.json();
                displayCountryArticles(articles);
            }
        } catch (e) { console.error(e); }

        // Load daily summary
        try {
            const summaryResponse = await fetchAPI(`/api/summary/${dateStr}?country=${encodeURIComponent(selectedCountry)}`);
            if (summaryResponse.ok) {
                const summary = await summaryResponse.json();
                displayCountrySummary(summary.summary_text, dateStr);
            } else {
                document.getElementById('countrySummaryCard').classList.add('hidden');
            }
        } catch (e) {
            document.getElementById('countrySummaryCard').classList.add('hidden');
        }
    } catch (error) {
        showToast('Error loading daily data: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function scrapeNews() {
    const btn = document.getElementById('scrapeBtn');
    const originalText = btn.innerHTML; // Store original text to restore later
    btn.disabled = true;

    if (STATIC_MODE) {
        showToast('Refresh is not available in Demo Mode', 'warning');
        btn.innerHTML = originalText;
        btn.disabled = false;
        return;
    }

    showLoading(`Initializing scraper for ${selectedCountry}...`);
    showToast('Refreshing data... this may take a minute', 'info');


    const loadingText = document.getElementById('loadingText');
    const logContainer = document.createElement('div');
    logContainer.className = 'scraping-log';
    loadingText.appendChild(logContainer);

    try {
        const eventSource = new EventSource(`${API_BASE}/api/scrape/stream?country=${encodeURIComponent(selectedCountry)}`);

        eventSource.onmessage = async function (event) {
            const data = JSON.parse(event.data);

            if (data.status === 'complete') {
                eventSource.close();
                const today = new Date();
                const todayStr = formatDate(today);

                showToast(`✓ Scraping Complete! Identified ${data.articles_added} new signals. Generating summary...`, 'success', 6000);
                await loadAvailableDates();
                await loadLastRunDate();

                // Auto-generate summary for today after scraping
                if (data.articles_added > 0) {
                    try {
                        // Generate summary in background
                        fetchAPI(`${API_BASE}/api/summarize/${todayStr}?country=${encodeURIComponent(selectedCountry)}`, {
                            method: 'POST'
                        }).catch(err => console.error('Summary generation started in background'));

                        // Wait a bit then load overview
                        setTimeout(async () => {
                            await loadCountryOverview();
                        }, 5000);
                    } catch (err) {
                        console.error('Error triggering summary generation:', err);
                        await loadCountryOverview();
                    }
                } else {
                    await loadCountryOverview();
                }

                // renderCalendar(); // Removed - calendar grid no longer exists
                btn.disabled = false;
                hideLoading();
            } else if (data.status === 'error') {
                eventSource.close();
                showToast('Error: ' + data.message, 'error');
                btn.disabled = false;
                hideLoading();
            } else if (data.status === 'skipped') {
                // Show skipped messages in a lighter color or specific style if needed
                const statusLine = document.createElement('div');
                statusLine.className = 'log-line skipped';
                statusLine.textContent = `> ${data.message}`;
                statusLine.style.opacity = '0.7'; // Make skipped less prominent

                // Keep only last 8 lines
                while (logContainer.children.length > 7) {
                    logContainer.removeChild(logContainer.firstChild);
                }

                logContainer.appendChild(statusLine);
            } else {
                // Update loading text with current action
                const statusLine = document.createElement('div');
                statusLine.className = 'log-line';
                statusLine.textContent = `> ${data.message}`;

                // Keep only last 8 lines
                while (logContainer.children.length > 7) {
                    logContainer.removeChild(logContainer.firstChild);
                }

                logContainer.appendChild(statusLine);
            }
        };

        eventSource.onerror = function () {
            eventSource.close();
            btn.disabled = false;
            hideLoading();
            // Only show error if we didn't complete normally
            // (EventSource sometimes triggers error on close)
        };

    } catch (error) {
        showToast('Error starting scraper: ' + error.message, 'error');
        btn.disabled = false;
        hideLoading();
    }
}

async function generateSummary() {
    if (!selectedDate) {
        showToast('Please select a date first', 'warning');
        return;
    }

    const btn = document.getElementById('regenerateSummaryBtn');
    const originalContent = btn.innerHTML;

    // Set loading state
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined spin">refresh</span> Generating...';

    try {
        const country = selectedCountry || 'Global';
        const dateStr = formatDate(selectedDate);

        // Show user feedback that this might take a moment
        showToast(`Regenerating analysis for ${country}...`, 'info');

        if (STATIC_MODE) {
            showToast('Generation is disabled in Static Mode', 'warning');
            throw new Error('Static Mode');
        }

        const response = await fetchAPI(`${API_BASE}/api/summarize/${dateStr}?country=${encodeURIComponent(country)}`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('Failed to regenerate summary');
        }

        const data = await response.json();

        // Reload data to show new summary
        await loadCountryOverviewForDate(dateStr);
        showToast('Analysis updated successfully!', 'success');

    } catch (error) {
        console.error('Error generating summary:', error);
        showToast('Failed to generate summary. Please try again.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
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

function displayCountrySummary(summaryText, dateStr) {
    const summaryCard = document.getElementById('countrySummaryCard');
    const summaryContent = document.getElementById('countrySummaryContent');
    const summaryPlaceholder = document.getElementById('generateSummaryPlaceholder');
    const summaryDateLabel = document.getElementById('summaryDateLabel');

    if (summaryText) {
        // Show Summary
        if (summaryCard) summaryCard.classList.remove('hidden');
        if (summaryPlaceholder) summaryPlaceholder.classList.add('hidden');

        if (summaryContent) summaryContent.innerHTML = marked.parse(summaryText);

        if (summaryDateLabel) {
            const genDate = new Date(dateStr); // Assuming dateStr is the generation date
            summaryDateLabel.textContent = `Generated: ${genDate.toLocaleDateString()}`;
        }
    } else {
        // No summary text -> Show Placeholder
        if (summaryCard) summaryCard.classList.add('hidden');
        if (summaryPlaceholder) summaryPlaceholder.classList.remove('hidden');
    }
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

// Regenerate summary for current selection
// Regenerate summary for current selection
async function regenerateSummary() {
    if (!selectedDate) {
        showToast('Please select a date first', 'warning');
        return;
    }

    const btn = document.getElementById('regenerateSummaryBtn');
    const originalContent = btn.innerHTML;

    // Set loading state
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined spin">refresh</span> Generating...';

    try {
        const country = selectedCountry || 'Global';
        const dateStr = formatDate(selectedDate);

        // Show user feedback that this might take a moment
        showToast(`Regenerating analysis for ${country}...`, 'info');

        if (STATIC_MODE) {
            showToast('Generation is disabled in Static Mode', 'warning');
            throw new Error('Static Mode');
        }

        const response = await fetchAPI(`${API_BASE}/api/summarize/${dateStr}?country=${encodeURIComponent(country)}`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error('Failed to regenerate summary');
        }

        const data = await response.json();

        // Reload data to show new summary
        await loadCountryOverviewForDate(dateStr);
        showToast('Analysis updated successfully!', 'success');

    } catch (error) {
        console.error('Error generating summary:', error);
        if (error.message !== 'Static Mode') {
            showToast('Failed to generate summary. Please try again.', 'error');
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}

// ===== Data Handling & Static Mode Support =====
// STATIC_MODE is auto-injected as true by generate_static_site.py
// ===== Data Handling & Static Mode Support =====
// STATIC_MODE flag handled at top of file

// Helper to fetch data from API (Dynamic) or JSON files (Static)
async function fetchAPI(endpoint, options) {
    let url = endpoint;
    const isFullUrl = endpoint.startsWith('http');

    // Extract relative path if full URL matches API_BASE
    let relativeEndpoint = endpoint;
    if (isFullUrl && endpoint.startsWith(API_BASE)) {
        relativeEndpoint = endpoint.replace(API_BASE, '');
    }

    if (STATIC_MODE) {
        // Map dynamic endpoints to static file structure
        try {
            // Create a dummy base to parse relative URLs
            const urlObj = new URL(relativeEndpoint, 'http://dummy.com');
            const path = urlObj.pathname;
            const params = new URLSearchParams(urlObj.search);

            // 1. Consolidated Country Data (Last Run, Dates, Overview)
            if (path.includes('/api/last-run-date') || path.includes('/api/dates') || path.includes('/api/country-overview')) {
                const country = params.get('country') || 'Global';
                const consolidatedUrl = `./api/countries/${country.replace(/ /g, '_')}.json`;

                // Fetch the consolidated file
                return fetch(consolidatedUrl).then(async (res) => {
                    if (!res.ok) return res;
                    const data = await res.json();

                    // Extract the relevant part based on the requested path
                    let result = {};
                    if (path.includes('/api/last-run-date')) result = data.last_run || {};
                    else if (path.includes('/api/dates')) result = data.dates || [];
                    else if (path.includes('/api/country-overview')) result = data.overview || {};

                    // Return a mocked Response object with the extracted data
                    return new Response(JSON.stringify(result), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    });
                });
            }

            // 4. Summary (Specific Date)
            else if (path.includes('/api/summary')) {
                // /api/summary/2025-11-01
                const parts = path.split('/');
                const date = parts[parts.length - 1];
                const country = params.get('country') || 'Global';
                url = `./api/summary/${country.replace(/ /g, '_')}/${date}.json`;
            }
            // 5. Articles (Specific Date)
            else if (path.includes('/api/articles')) {
                const country = params.get('country') || 'Global';
                const date = params.get('date');
                url = `./api/articles/${country.replace(/ /g, '_')}/${date}.json`;
            }
            // 6. Country Sentiments (Map)
            else if (path.includes('/api/country-sentiments')) {
                url = `./api/world/sentiments.json`;
            }

            console.log(`[Static] Mapping ${relativeEndpoint} -> ${url}`);
        } catch (e) {
            console.warn('[Static] Mapping failed:', e);
        }
    } else {
        // Dynamic Mode: use full URL
        if (!isFullUrl) {
            url = `${API_BASE}${endpoint}`;
        }
    }

    // Pass options (method, headers, body) to fetch
    return fetch(url, options);
}

// Remove interactive buttons in Static Mode
function cleanupUIForStaticMode() {
    if (!STATIC_MODE) return;

    console.log('[Static Mode] Cleaning up UI elements...');

    // List of IDs to remove
    const elementsToRemove = [
        'scrapeBtn',              // Header "Refresh"
        'regenerateSummaryBtn',   // Summary Card "Regenerate"
        'generateSummaryBtn',     // Daily View "Generate"
        'createSummaryBtn'        // Placeholder "Generate"
    ];

    elementsToRemove.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none'; // Safer than remove() to avoid JS errors if referenced elsewhere
        }
    });

    // Update Placeholder text to be static-friendly
    const placeholder = document.getElementById('generateSummaryPlaceholder');
    if (placeholder) {
        const title = placeholder.querySelector('h3');
        const desc = placeholder.querySelector('p');
        if (title) title.textContent = "Data Not Available";
        if (desc) desc.textContent = "No analysis was generated for this period in the demo dataset.";
    }
}

// Call cleanup on load
document.addEventListener('DOMContentLoaded', () => {
    if (STATIC_MODE) {
        cleanupUIForStaticMode();
    }
});

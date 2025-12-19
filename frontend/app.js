var STATIC_MODE = false; // Default to dynamic mode

let currentDate = new Date();
let selectedDate = null;
let selectedCountry = 'Global';
let datesWithData = new Set();
let currentTheme = 'dark';
let map = null;

// ===== State Management =====
let comparisonCountries = []; // Array of country names for benchmarking
let chartTooltip = null;
let indicatorMetadata = {}; // Dynamic indicator metadata from backend
let showAllIndicators = false; // Toggle for showing all indicators vs top 10
let indicatorSearchQuery = ''; // Current search query for indicators

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

    // Benchmark Comparison
    const compareSearch = document.getElementById('compareSearch');
    const compareSuggestions = document.getElementById('compareSuggestions');
    const clearComparison = document.getElementById('clearComparison');

    if (compareSearch) {
        compareSearch.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (query.length < 2) {
                compareSuggestions.classList.add('hidden');
                return;
            }

            const results = COUNTRY_LIST.filter(c => c.name.toLowerCase().includes(query)).map(c => c.name);
            if (results.length > 0) {
                compareSuggestions.innerHTML = results.map(c => `<div class="suggestion-item">${c}</div>`).join('');
                compareSuggestions.classList.remove('hidden');
            } else {
                compareSuggestions.classList.add('hidden');
            }
        });

        compareSuggestions.addEventListener('click', (e) => {
            const item = e.target.closest('.suggestion-item');
            if (item) {
                const country = item.textContent;
                if (!comparisonCountries.includes(country) && comparisonCountries.length < 4) {
                    comparisonCountries.push(country);
                    renderComparisonChips();
                    loadBenchmarkedData();
                }
                compareSearch.value = '';
                compareSuggestions.classList.add('hidden');
            }
        });
    }

    if (clearComparison) {
        clearComparison.addEventListener('click', () => {
            comparisonCountries = [];
            compareSearch.value = '';
            renderComparisonChips();
            loadBenchmarkedData();
        });
    }

    // Indicator search
    const indicatorSearch = document.getElementById('indicatorSearch');
    const clearIndicatorSearch = document.getElementById('clearIndicatorSearch');
    if (indicatorSearch) {
        indicatorSearch.addEventListener('input', handleIndicatorSearch);
    }
    if (clearIndicatorSearch) {
        clearIndicatorSearch.addEventListener('click', () => {
            indicatorSearch.value = '';
            indicatorSearchQuery = '';
            clearIndicatorSearch.classList.add('hidden');
            document.getElementById('indicatorSearchResults').classList.add('hidden');
            loadBenchmarkedData();
        });
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
        regenBtn.addEventListener('click', generateSummary);
    }

    // Create Summary button (Placeholder)
    const createBtn = document.getElementById('createSummaryBtn');
    if (createBtn) {
        createBtn.addEventListener('click', generateSummary);
    }

    // Comparison CTA button
    const compareSummariesBtn = document.getElementById('compareSummariesBtn');
    if (compareSummariesBtn) {
        compareSummariesBtn.addEventListener('click', generateSummary);
    }

    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            document.getElementById('searchSuggestions').classList.add('hidden');
            if (compareSuggestions) compareSuggestions.classList.add('hidden');
        }
    });

    // Make selectCountry global so it can be called from inline onclick handlers
    window.selectCountry = selectCountry;
}

function renderComparisonChips() {
    const chipContainer = document.getElementById('comparisonChips');
    const clearComparison = document.getElementById('clearComparison');

    if (!chipContainer) return;

    chipContainer.innerHTML = '';

    if (comparisonCountries.length > 0) {
        if (clearComparison) clearComparison.classList.remove('hidden');

        comparisonCountries.forEach((country, index) => {
            const chip = document.createElement('div');
            chip.className = 'chip';
            chip.innerHTML = `
                <span>${country}</span>
                <span class="material-symbols-outlined chip-remove" data-index="${index}">close</span>
            `;
            chipContainer.appendChild(chip);
        });

        // Add listeners to remove buttons
        chipContainer.querySelectorAll('.chip-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                comparisonCountries.splice(index, 1);
                renderComparisonChips();
                loadBenchmarkedData();
                updateSummaryVisibility(); // Update CTA text and visibility
            });
        });
    } else {
        if (clearComparison) clearComparison.classList.add('hidden');
    }

    updateSummaryVisibility();
}

function updateSummaryVisibility() {
    const primaryCard = document.getElementById('countrySummaryCard');
    const primaryPlaceholder = document.getElementById('generateSummaryPlaceholder');
    const comparativePlaceholder = document.getElementById('comparativeSummaryPlaceholder');
    const comparativeText = document.getElementById('comparativeSummaryText');

    if (comparisonCountries.length > 0) {
        // Benchmarking Mode - Hide single country outcomes
        if (primaryCard) primaryCard.classList.add('hidden');
        if (primaryPlaceholder) primaryPlaceholder.classList.add('hidden');

        if (comparativePlaceholder) {
            comparativePlaceholder.classList.remove('hidden');
            if (comparativeText) {
                const names = [selectedCountry, ...comparisonCountries];
                if (names.length === 2) {
                    comparativeText.textContent = `Generate a side-by-side economic analysis for ${names[0]} and ${names[1]}.`;
                } else if (names.length > 2) {
                    const last = names.pop();
                    comparativeText.textContent = `Generate a side-by-side economic analysis for ${names.join(', ')} and ${last}.`;
                }
            }
        }
    } else {
        // Single Country Mode
        if (comparativePlaceholder) comparativePlaceholder.classList.add('hidden');

        // Restore single country layout
        if (!selectedCountry || selectedCountry === 'Global') return;

        // Ensure overview and its components are visible if they have content
        if (primaryCard) {
            const hasContent = document.getElementById('countrySummaryContent').innerHTML.trim() !== '';
            if (hasContent) {
                primaryCard.classList.remove('hidden');
            }
        }
    }
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
    const summaryCard = document.getElementById('countrySummaryCard');
    const summaryPlaceholder = document.getElementById('generateSummaryPlaceholder');
    const comparativePlaceholder = document.getElementById('comparativeSummaryPlaceholder');
    const summaryContent = document.getElementById('countrySummaryContent');

    if (comparisonCountries.length > 0) {
        // In comparison mode, always prioritize the comparative CTA
        updateSummaryVisibility();
        return;
    }

    if (comparativePlaceholder) comparativePlaceholder.classList.add('hidden');

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
        console.error('Error loading country overview data:', error);
        showToast('Failed to load analysis for the selected month.', 'error');
        // Unhide core section so buttons/header remain visible
        const overviewEl = document.getElementById('countryOverview');
        if (overviewEl) overviewEl.classList.remove('hidden');
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
    showAllIndicators = false; // Reset indicator expansion when changing countries
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

    // Load overview and metadata in parallel for speed
    await Promise.all([
        loadCountryOverview(),
        loadAvailableDates()
    ]);

    // Clear search and suggestions
    const searchInput = document.getElementById('countrySearch');
    if (searchInput) searchInput.value = '';
    const suggestions = document.getElementById('searchSuggestions');
    if (suggestions) suggestions.classList.add('hidden');
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
    { name: 'Libya', code: 'LBY' },
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
    { name: 'Mexico', code: 'MEX' },
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
    { name: 'Serbia', code: 'SRB' },
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
    { name: 'Tanzania', code: 'TZA' },
    { name: 'Thailand', code: 'THA' },
    { name: 'Timor-Leste', code: 'TL' },
    { name: 'Togo', code: 'TGO' },
    { name: 'Tonga', code: 'TON' },
    { name: 'Trinidad and Tobago', code: 'TTO' },
    { name: 'Tunisia', code: 'TUN' },
    { name: 'Turkey', code: 'TUR' },
    { name: 'Turkmenistan', code: 'TKM' },
    { name: 'Tuvalu', code: 'TUV' },
    { name: 'Uganda', code: 'UGA' },
    { name: 'Ukraine', code: 'UKR' },
    { name: 'United Arab Emirates', code: 'ARE' },
    { name: 'United Kingdom', code: 'GBR' },
    { name: 'United States', code: 'USA' },
    { name: 'Uruguay', code: 'URY' },
    { name: 'Uzbekistan', code: 'UZB' },
    { name: 'Vanuatu', code: 'VUT' },
    { name: 'Vatican City', code: 'VAT' },
    { name: 'Venezuela', code: 'VEN' },
    { name: 'Vietnam', code: 'VNM' },
    { name: 'Yemen', code: 'YEM' },
    { name: 'Zambia', code: 'ZMB' },
    { name: 'Zimbabwe', code: 'ZWE' }
];

// ... (inside initializeApp)

async function initializeApp() {
    setupEventListeners();

    // Check theme preference first
    const savedTheme = localStorage.getItem('theme') || 'dark';
    setTheme(savedTheme);

    // Initialize country data for search
    initializeCountryData();

    // Load indicator metadata
    await loadIndicatorMetadata();

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

function handleIndicatorSearch(e) {
    const query = e.target.value.trim();
    indicatorSearchQuery = query;

    const clearBtn = document.getElementById('clearIndicatorSearch');
    if (query) {
        clearBtn?.classList.remove('hidden');
    } else {
        clearBtn?.classList.add('hidden');
    }

    // Reload dashboard with search filter
    loadBenchmarkedData();
}

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

    if (mapView) mapView.classList.add('hidden');
    if (calendarView) calendarView.classList.remove('hidden');
    if (dailyView) dailyView.classList.add('hidden');
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
            const lastDate = parseIsoDate(data.last_run_date);
            if (lastDate && !isNaN(lastDate.getTime())) {
                // Format as 'Dec 2025' or 'Dec, 2025'
                const options = { year: 'numeric', month: 'short' };
                lastUpdatedEl.textContent = lastDate.toLocaleDateString('en-US', options);
            } else {
                lastUpdatedEl.textContent = 'No data yet';
            }
        } else {
            lastUpdatedEl.textContent = 'No data yet';
        }
    } catch (error) {
        console.error('Error loading last run date:', error);
        document.getElementById('lastUpdatedDate').textContent = '-';
    }
}

// ===== World Bank API Integration =====
const WB_INDICATORS = {
    'NY.GDP.MKTP.CD': { label: 'GDP', format: 'currency', compact: true, better: 'high' },
    'NY.GDP.MKTP.KD.ZG': { label: 'GDP Growth', format: 'percent', better: 'high' },
    'NY.GDP.PCAP.CD': { label: 'GDP per Capita', format: 'currency', compact: true, better: 'high' },
    'FP.CPI.TOTL.ZG': { label: 'Inflation', format: 'percent', better: 'low' },
    'SL.UEM.TOTL.ZS': { label: 'Unemployment', format: 'percent', better: 'low' },
    'BN.CAB.XOKA.GD.ZS': { label: 'Current Account', format: 'percent', suffix: ' of GDP', better: 'high' },
    'NE.EXP.GNFS.ZS': { label: 'Exports', format: 'percent', suffix: ' of GDP', better: 'high' },
    'NE.IMP.GNFS.ZS': { label: 'Imports', format: 'percent', suffix: ' of GDP', better: 'low' },
    'BX.KLT.DINV.WD.GD.ZS': { label: 'FDI Inflows', format: 'percent', suffix: ' of GDP', better: 'high' },
    'FI.RES.TOTL.CD': { label: 'Reserves', format: 'currency', compact: true, better: 'high' },
    'GC.DOD.TOTL.GD.ZS': { label: 'Gov Debt', format: 'percent', suffix: ' of GDP', better: 'low' },
    'NY.GNS.ICTR.ZS': { label: 'Gross Savings', format: 'percent', suffix: ' of GDP', better: 'high' },
    'NE.GDI.TOTL.ZS': { label: 'Capital Formation', format: 'percent', suffix: ' of GDP', better: 'high' },

    // IMF Indicators (Forecasts & Higher Frequency)
    'IMF.NGDP_RPCH': { label: 'Real GDP Growth (IMF)', format: 'percent', better: 'high', source: 'IMF' },
    'IMF.PCPIPCH': { label: 'Inflation Rate (IMF)', format: 'percent', better: 'low', source: 'IMF' },
    'IMF.LUR': { label: 'Unemployment Rate (IMF)', format: 'percent', better: 'low', source: 'IMF' },
    'IMF.BCA_NGDPD': { label: 'Current Account (IMF)', format: 'percent', suffix: ' of GDP', better: 'high', source: 'IMF' },
    'IMF.GGXWDG_NGDP': { label: 'Gross Debt (IMF)', format: 'percent', suffix: ' of GDP', better: 'low', source: 'IMF' }
};

// Load dynamic indicator metadata from backend
async function loadIndicatorMetadata() {
    try {
        const response = await fetch(`${API_BASE}/api/indicators/metadata`);
        if (response.ok) {
            indicatorMetadata = await response.json();
            console.log('Loaded metadata for', Object.keys(indicatorMetadata).length, 'indicators');
        } else {
            console.warn('Failed to load indicator metadata, using fallback');
            indicatorMetadata = { ...WB_INDICATORS };
        }
    } catch (error) {
        console.error('Error loading indicator metadata:', error);
        indicatorMetadata = { ...WB_INDICATORS };
    }
}

// Map ISO2 to ISO3 codes
const COUNTRY_ISO3 = {
    'AF': 'AFG', 'AL': 'ALB', 'DZ': 'DZA', 'AD': 'AND', 'AO': 'AGO', 'AG': 'ATG', 'AR': 'ARG', 'AM': 'ARM', 'AU': 'AUS', 'AT': 'AUT',
    'AZ': 'AZE', 'BS': 'BHS', 'BH': 'BHR', 'BD': 'BGD', 'BB': 'BRB', 'BY': 'BLR', 'BE': 'BEL', 'BZ': 'BLZ', 'BJ': 'BEN', 'BT': 'BTN',
    'BO': 'BOL', 'BA': 'BIH', 'BW': 'BWA', 'BR': 'BRA', 'BN': 'BRN', 'BG': 'BGR', 'BF': 'BFA', 'BI': 'BDI', 'CV': 'CPV', 'KH': 'KHM',
    'CM': 'CMR', 'CA': 'CAN', 'CF': 'CAF', 'TD': 'TCD', 'CL': 'CHL', 'CN': 'CHN', 'CO': 'COL', 'KM': 'COM', 'CG': 'COG', 'CR': 'CRI',
    'HR': 'HRV', 'CU': 'CUB', 'CY': 'CYP', 'CZ': 'CZE', 'CD': 'COD', 'DK': 'DNK', 'DJ': 'DJI', 'DM': 'DMA', 'DO': 'DOM', 'EC': 'ECU',
    'EG': 'EGY', 'SV': 'SLV', 'GQ': 'GNQ', 'ER': 'ERI', 'EE': 'EST', 'SZ': 'SWZ', 'ET': 'ETH', 'FJ': 'FJI', 'FI': 'FIN', 'FR': 'FRA',
    'GA': 'GAB', 'GM': 'GMB', 'GE': 'GEO', 'DE': 'DEU', 'GH': 'GHA', 'GR': 'GRC', 'GD': 'GRD', 'GT': 'GTM', 'GN': 'GIN', 'GW': 'GNB',
    'GY': 'GUY', 'HT': 'HTI', 'HN': 'HND', 'HU': 'HUN', 'IS': 'ISL', 'IN': 'IND', 'ID': 'IDN', 'IR': 'IRN', 'IQ': 'IRQ', 'IE': 'IRL',
    'IL': 'ISR', 'IT': 'ITA', 'JM': 'JAM', 'JP': 'JPN', 'JO': 'JOR', 'KZ': 'KAZ', 'KE': 'KEN', 'KI': 'KIR', 'KW': 'KWT', 'KG': 'KGZ',
    'LA': 'LAO', 'LV': 'LVA', 'LB': 'LBN', 'LS': 'LSO', 'LR': 'LBR', 'LY': 'LBY', 'LI': 'LIE', 'LT': 'LTU', 'LU': 'LUX', 'MG': 'MDG',
    'MW': 'MWI', 'MY': 'MYS', 'MV': 'MDV', 'ML': 'MLI', 'MT': 'MLT', 'MH': 'MHL', 'MR': 'MRT', 'MU': 'MUS', 'MX': 'MEX', 'FM': 'FSM',
    'MD': 'MDA', 'MC': 'MCO', 'MN': 'MNG', 'ME': 'MNE', 'MA': 'MAR', 'MZ': 'MOZ', 'MM': 'MMR', 'NA': 'NAM', 'NR': 'NRU', 'NP': 'NPL',
    'NL': 'NLD', 'NZ': 'NZL', 'NI': 'NIC', 'NE': 'NER', 'NG': 'NGA', 'KP': 'PRK', 'MK': 'MKD', 'NO': 'NOR', 'OM': 'OMN', 'PK': 'PAK',
    'PW': 'PLW', 'PS': 'PSE', 'PA': 'PAN', 'PG': 'PNG', 'PY': 'PRY', 'PE': 'PER', 'PH': 'PHL', 'PL': 'POL', 'PT': 'PRT', 'QA': 'QAT',
    'RO': 'ROU', 'RU': 'RUS', 'RW': 'RWA', 'KN': 'KNA', 'LC': 'LCA', 'VC': 'VCT', 'WS': 'WSM', 'SM': 'SMR', 'ST': 'STP', 'SA': 'SAU',
    'SN': 'SEN', 'RS': 'SRB', 'SC': 'SYC', 'SL': 'SLE', 'SG': 'SGP', 'SK': 'SVK', 'SI': 'SVN', 'SB': 'SLB', 'SO': 'SOM', 'ZA': 'ZAF',
    'KR': 'KOR', 'SS': 'SSD', 'ES': 'ESP', 'LK': 'LKA', 'SD': 'SDN', 'SR': 'SUR', 'SE': 'SWE', 'CH': 'CHE', 'SY': 'SYR', 'TW': 'TWN',
    'TJ': 'TJK', 'TZ': 'TZA', 'TH': 'THA', 'TL': 'TLS', 'TG': 'TGO', 'TO': 'TON', 'TT': 'TTO', 'TN': 'TUN', 'TR': 'TUR', 'TM': 'TKM',
    'TV': 'TUV', 'UG': 'UGA', 'UA': 'UKR', 'AE': 'ARE', 'GB': 'GBR', 'US': 'USA', 'UY': 'URY', 'UZ': 'UZB', 'VU': 'VUT', 'VA': 'VAT',
    'VE': 'VEN', 'VN': 'VNM', 'YE': 'YEM', 'ZM': 'ZMB', 'ZW': 'ZWE'
};

function getIso3(iso2) {
    return COUNTRY_ISO3[iso2] || null;
}

function formatValue(value, config) {
    if (value === null || value === undefined) return 'N/A';

    let formatted = value;
    if (config.format === 'percent') {
        formatted = value.toFixed(1) + '%';
    } else if (config.format === 'currency') {
        if (config.compact) {
            if (value >= 1e12) formatted = '$' + (value / 1e12).toFixed(1) + 'T';
            else if (value >= 1e9) formatted = '$' + (value / 1e9).toFixed(1) + 'B';
            else if (value >= 1e6) formatted = '$' + (value / 1e6).toFixed(1) + 'M';
            else formatted = '$' + Math.round(value).toLocaleString();
        } else {
            formatted = '$' + Math.round(value).toLocaleString();
        }
    } else if (config.format === 'number') {
        formatted = value.toFixed(config.decimals || 0);
    }

    if (config.suffix) formatted += config.suffix;
    return formatted;
}

function getIndicatorColor(indicatorId, value) {
    if (value === null || value === undefined) return '';

    const config = indicatorMetadata[indicatorId] || WB_INDICATORS[indicatorId];
    if (!config || !config.better) return '';

    if (config.better === 'high') {
        if (value > 0) return 'text-success';
        if (value < 0) return 'text-error';
    } else if (config.better === 'low') {
        // Special logic for Inflation/Unemployment
        if (indicatorId.includes('CPI') || indicatorId.includes('UEM') || indicatorId.includes('LUR') || indicatorId.includes('debt')) {
            if (value > 6) return 'text-error';
            if (value < 3) return 'text-success';
        } else {
            if (value > 0) return 'text-error';
            if (value < 0) return 'text-success';
        }
    }

    return '';
}

async function loadWorldBankData(iso3, isComparison = false) {
    const dashboard = document.getElementById('economicDashboard');

    if (!iso3 && !isComparison) {
        dashboard.innerHTML = '<p style="text-align: center; color: var(--md-sys-color-secondary); grid-column: 1/-1;">Select a country to view data</p>';
        return;
    }

    if (!isComparison) {
        dashboard.classList.remove('hidden');
        dashboard.innerHTML = '<div class="loading-spinner" style="margin: 20px auto;"></div>';
    }

    // Fetch from Local Backend
    const url = `${API_BASE}/api/economic-data/${iso3}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        return data; // Return data for caller to handle parallel loads
    } catch (error) {
        console.error('World Bank API Error:', error);
        if (!isComparison) {
            dashboard.innerHTML = '<p style="text-align: center; color: var(--md-sys-color-error); grid-column: 1/-1;">Failed to load economic data</p>';
        }
        return null;
    }
}

async function loadBenchmarkedData() {
    if (!selectedCountry || selectedCountry === 'Global') {
        document.getElementById('economicDashboard').classList.add('hidden');
        return;
    }

    const primaryEntry = COUNTRY_LIST.find(c => c.name === selectedCountry || c.name.toLowerCase() === selectedCountry.toLowerCase());
    const iso3Primary = primaryEntry ? getIso3(primaryEntry.code) : null;

    if (!iso3Primary) return;

    // Show loading state
    const dashboard = document.getElementById('economicDashboard');
    dashboard.classList.remove('hidden');
    dashboard.innerHTML = '<div class="loading-spinner" style="margin: 20px auto;"></div>';

    const promises = [loadWorldBankData(iso3Primary, false)];

    // Add all comparison countries
    comparisonCountries.forEach(countryName => {
        const countryEntry = COUNTRY_LIST.find(c => c.name === countryName);
        if (countryEntry) {
            const iso3 = getIso3(countryEntry.code);
            promises.push(loadWorldBankData(iso3, true));
        }
    });

    const results = await Promise.all(promises);
    const primaryData = results[0];
    const compareResults = results.slice(1);

    renderEconomicDashboard(primaryData, compareResults);
}

function renderEconomicDashboard(primaryData, compareResults = []) {
    const dashboard = document.getElementById('economicDashboard');
    dashboard.innerHTML = '';

    const primaryMap = {};
    primaryData?.forEach(item => {
        if (item.indicator?.id) primaryMap[item.indicator.id] = item;
    });

    const comparisonMaps = compareResults.map(data => {
        const map = {};
        data?.forEach(item => {
            if (item.indicator?.id) map[item.indicator.id] = item;
        });
        return map;
    });

    // Use dynamic metadata from backend (fallback to WB_INDICATORS if not loaded)
    const allIndicators = Object.keys(indicatorMetadata).length > 0 ? indicatorMetadata : WB_INDICATORS;

    // Sort indicators by data recency (most recent first), then alphabetically
    const sortedIds = Object.keys(allIndicators).sort((a, b) => {
        const aData = primaryMap[a];
        const bData = primaryMap[b];

        // Get years for comparison
        const aYear = aData && aData.date ? parseInt(aData.date) : 0;
        const bYear = bData && bData.date ? parseInt(bData.date) : 0;

        // Sort by year descending (most recent first)
        if (aYear !== bYear) {
            return bYear - aYear;
        }

        // If same year or no data, sort alphabetically by label
        return allIndicators[a].label.localeCompare(allIndicators[b].label);
    });

    // Apply search filter with token-based matching and scoring
    let filteredIds = sortedIds;
    if (indicatorSearchQuery) {
        const query = indicatorSearchQuery.toLowerCase().trim();
        const tokens = query.split(/\s+/); // Split by whitespace

        // Score each indicator based on match quality
        const scoredResults = sortedIds.map(id => {
            const config = allIndicators[id];
            const label = config.label.toLowerCase();
            const unit = (config.unit || '').toLowerCase();
            const idLower = id.toLowerCase();

            let score = 0;
            let matchedTokens = 0;

            // Check if all tokens are present
            const allTokensMatch = tokens.every(token => {
                if (label.includes(token) || unit.includes(token) || idLower.includes(token)) {
                    matchedTokens++;
                    return true;
                }
                return false;
            });

            if (!allTokensMatch) return null; // Skip if not all tokens match

            // Scoring system (higher is better)
            // 1000 points: Exact label match
            if (label === query) score += 1000;

            // 500 points: Label starts with query
            if (label.startsWith(query)) score += 500;

            // 300 points: Label contains exact query phrase
            if (label.includes(query)) score += 300;

            // 100 points per token that matches in label (vs unit or id)
            tokens.forEach(token => {
                if (label.includes(token)) score += 100;
            });

            // 50 points: All tokens match in label
            if (tokens.every(token => label.includes(token))) score += 50;

            // 20 points per matched token
            score += matchedTokens * 20;

            // 10 points: Unit match
            if (unit.includes(query)) score += 10;

            return { id, score };
        }).filter(result => result !== null);

        // Sort by score (descending) and extract IDs
        filteredIds = scoredResults
            .sort((a, b) => b.score - a.score)
            .map(result => result.id);

        // Show search results info
        const resultsInfo = document.getElementById('indicatorSearchResults');
        if (resultsInfo) {
            resultsInfo.textContent = `Found ${filteredIds.length} indicator${filteredIds.length !== 1 ? 's' : ''}`;
            resultsInfo.classList.remove('hidden');
        }
    } else {
        document.getElementById('indicatorSearchResults')?.classList.add('hidden');
    }

    // Apply limit: show only 9 by default unless expanded or searching
    const displayIds = (showAllIndicators || indicatorSearchQuery) ? filteredIds : filteredIds.slice(0, 9);
    displayIds.forEach(id => {
        const config = allIndicators[id];
        const itemP = primaryMap[id];
        const valP = itemP ? itemP.value : null;
        const dateP = itemP ? itemP.date : '';

        // Check if ANY country has data for this indicator
        const hasData = valP !== null || comparisonMaps.some(map => map[id] && map[id].value !== null);

        if (hasData) {
            const card = document.createElement('div');
            card.className = 'dashboard-card';
            card.onclick = () => openIndicatorHistory(id);

            // Determine source badge
            const isImf = id.startsWith('IMF.') || (config.source && config.source.includes('IMF'));
            const isWB = config.source && config.source.includes('World Bank');

            let content = `
                <div class="metric-header">
                    <div>
                        <span class="metric-label">${config.label}</span>
                        ${config.unit ? `<div class="metric-unit">${config.unit}</div>` : ''}
                    </div>
                    <div style="display: flex; gap: 4px;">
                        ${isWB ? '<span class="source-badge wb">WB</span>' : ''}
                        ${isImf ? '<span class="source-badge imf">IMF</span>' : ''}
                    </div>
                </div>
            `;

            if (comparisonCountries.length > 0) {
                // Multi-Country Comparison
                const compactConfig = { ...config, compact: true };
                const numCountries = comparisonCountries.length + 1;

                // Determine layout based on country count
                const columns = numCountries > 3 ? 2 : numCountries;
                content += `<div class="metric-comparison" style="grid-template-columns: repeat(${columns}, 1fr); gap: 12px 8px;">`;

                // Gather all values for comparison logic
                const entries = [
                    { name: selectedCountry, value: valP, date: dateP, isPrimary: true }
                ];
                comparisonCountries.forEach((name, idx) => {
                    const item = comparisonMaps[idx][id];
                    entries.push({
                        name: name,
                        value: item ? item.value : null,
                        date: item ? item.date : ''
                    });
                });

                // Find Leader
                let leaderIdx = -1;
                if (config.better) {
                    let bestVal = config.better === 'high' ? -Infinity : Infinity;
                    entries.forEach((entry, idx) => {
                        if (entry.value !== null) {
                            if (config.better === 'high' && entry.value > bestVal) {
                                bestVal = entry.value;
                                leaderIdx = idx;
                            } else if (config.better === 'low' && entry.value < bestVal) {
                                bestVal = entry.value;
                                leaderIdx = idx;
                            }
                        }
                    });
                }

                entries.forEach((entry, idx) => {
                    const iso3 = COUNTRY_LIST.find(c => c.name === entry.name || c.name.toLowerCase() === entry.name.toLowerCase())?.code || entry.name.substring(0, 3);
                    const isoCode = COUNTRY_ISO3[iso3] || iso3;
                    const formatted = formatValue(entry.value, compactConfig);
                    const colorClass = getIndicatorColor(id, entry.value);
                    const isLeader = idx === leaderIdx;

                    // Use forecast_start_year from metadata if available
                    const forecastThreshold = config.forecast_start_year || new Date().getFullYear();
                    const isForecast = entry.date && parseInt(entry.date) > forecastThreshold;

                    content += `
                        <div class="metric-column ${isLeader ? 'leader' : ''}" style="position: relative;">
                            <span class="country-indicator">${isoCode}</span>
                            <span class="metric-value ${colorClass}" style="font-size: 1rem;">${formatted}</span>
                            <span class="metric-year">${entry.date} ${isForecast ? '<span class="forecast-badge">Forecast</span>' : ''}</span>
                            ${isLeader ? '<span class="material-symbols-outlined leader-indicator">check_circle</span>' : ''}
                        </div>
                    `;
                });

                content += `</div>`;
            } else {
                // Single Country View
                const formatted = formatValue(valP, config);
                const colorClass = getIndicatorColor(id, valP);
                const forecastThreshold = config.forecast_start_year || new Date().getFullYear();
                const isForecast = dateP && parseInt(dateP) > forecastThreshold;

                content += `
                    <div class="metric-header-single">
                        <span class="metric-year">${dateP} ${isForecast ? '<span class="forecast-badge">Forecast</span>' : ''}</span>
                    </div>
                    <div class="metric-value ${colorClass}">${formatted}</div>
                `;
            }

            card.innerHTML = content;

            // Add shimmer effect
            card.classList.add('shimmer-entrance');
            setTimeout(() => {
                card.classList.remove('shimmer-entrance');
            }, 3000);

            dashboard.appendChild(card);
        }
    });

    // Add "Explore All Indicators" button if there are more than 9 and not searching
    if (!showAllIndicators && !indicatorSearchQuery && filteredIds.length > 9) {
        const exploreBtn = document.createElement('div');
        exploreBtn.className = 'dashboard-card explore-card';
        exploreBtn.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px;">
                <span class="material-symbols-outlined" style="font-size: 48px; color: var(--md-sys-color-primary);">insights</span>
                <span style="font-weight: 600; color: var(--md-sys-color-on-surface);">Explore All Indicators</span>
                <span style="font-size: 0.85rem; color: var(--md-sys-color-secondary);">${filteredIds.length - 9} more available</span>
            </div>
        `;
        exploreBtn.onclick = () => {
            showAllIndicators = true;
            loadBenchmarkedData(); // Reload to show all
        };
        dashboard.appendChild(exploreBtn);
    }

    if (dashboard.children.length === 0) {
        dashboard.innerHTML = '<p style="text-align: center; color: var(--md-sys-color-secondary); grid-column: 1/-1;">No recent economic data available</p>';
    }
}

// ===== Indicator History Modal =====
let currentChartData = null;

async function openIndicatorHistory(indicatorId) {
    const modal = document.getElementById('indicatorModal');
    const chartContainer = document.getElementById('modalChartContainer');
    const modalTitle = document.getElementById('modalTitle');

    // Use dynamic metadata from backend (fallback to WB_INDICATORS if not loaded)
    const allIndicators = Object.keys(indicatorMetadata).length > 0 ? indicatorMetadata : WB_INDICATORS;
    const config = allIndicators[indicatorId] || { label: indicatorId };

    // Set title with unit if available
    let titleText = `${config.label} History (Last 30 Years)`;
    if (config.unit) {
        titleText = `${config.label}\n${config.unit}`;
    }
    modalTitle.textContent = titleText;
    modal.classList.remove('hidden');
    chartContainer.innerHTML = '<div class="loading-spinner" style="margin: 100px auto;"></div>';

    // Get Primary ISO3
    const primaryEntry = COUNTRY_LIST.find(c => c.name === selectedCountry || c.name.toLowerCase() === selectedCountry.toLowerCase());
    const iso3Primary = primaryEntry ? getIso3(primaryEntry.code) : null;

    if (!iso3Primary) return;

    try {
        const promises = [fetch(`${API_BASE}/api/economic-history/${iso3Primary}/${indicatorId}`).then(r => r.json())];

        comparisonCountries.forEach(countryName => {
            const countryEntry = COUNTRY_LIST.find(c => c.name === countryName);
            if (countryEntry) {
                const iso3 = getIso3(countryEntry.code);
                promises.push(fetch(`${API_BASE}/api/economic-history/${iso3}/${indicatorId}`).then(r => r.json()));
            }
        });

        const results = await Promise.all(promises);
        const primaryHistory = results[0] ? results[0].reverse() : [];
        const compareHistories = results.slice(1).map(r => r ? r.reverse() : null);

        if (primaryHistory.length > 0) {
            renderIndicatorChart(primaryHistory, compareHistories, config);
        } else {
            chartContainer.innerHTML = '<p style="text-align: center; color: var(--md-sys-color-secondary); padding-top: 100px;">No historical data available</p>';
        }
    } catch (error) {
        console.error('History API error:', error);
        chartContainer.innerHTML = '<p class="error-text">Failed to load historical data</p>';
    }
}

function renderIndicatorChart(primaryData, compareHistories = [], config) {
    const container = document.getElementById('modalChartContainer');
    container.innerHTML = '';

    if (primaryData.length < 2) {
        container.innerHTML = '<p style="text-align: center; color: var(--md-sys-color-secondary); padding-top: 100px;">Not enough data for chart</p>';
        return;
    }

    const margin = { top: 40, right: 30, bottom: 60, left: 60 };
    const width = container.clientWidth;
    const height = container.clientHeight;
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // determine min/max across all datasets
    const allValues = [...primaryData.map(d => d.value)];
    compareHistories.forEach(data => {
        if (data) allValues.push(...data.map(d => d.value));
    });

    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const dataRange = maxVal - minVal || 1;

    // Add some padding to Y axis
    const yMin = minVal - (dataRange * 0.15);
    const yMax = maxVal + (dataRange * 0.15);
    const yRange = yMax - yMin;

    const colors = [
        '#2d3436', // Deep Graphite for Primary
        '#8b5cf6', // Purple
        '#10b981', // Emerald
        '#f59e0b', // Amber
        '#ef4444'  // Red
    ];

    // SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'chart-svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    // Helper to generate points and path string
    const getChartElements = (data) => {
        let pathD = '';
        const points = [];
        data.forEach((item, index) => {
            const x = margin.left + (index / (data.length - 1)) * chartWidth;
            const y = margin.top + chartHeight - ((item.value - yMin) / yRange) * chartHeight;
            points.push({ x, y, value: item.value, date: item.date });
            if (index === 0) pathD += `M ${x} ${y}`;
            else pathD += ` L ${x} ${y}`;
        });
        return { pathD, points };
    };

    // Draw Axis Lines
    const axesGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', margin.left);
    xAxis.setAttribute('y1', height - margin.bottom);
    xAxis.setAttribute('x2', width - margin.right);
    xAxis.setAttribute('y2', height - margin.bottom);
    xAxis.setAttribute('class', 'chart-axis-line');
    axesGroup.appendChild(xAxis);

    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', margin.left);
    yAxis.setAttribute('y1', margin.top);
    yAxis.setAttribute('x2', margin.left);
    yAxis.setAttribute('y2', height - margin.bottom);
    yAxis.setAttribute('class', 'chart-axis-line');
    axesGroup.appendChild(yAxis);
    svg.appendChild(axesGroup);

    // Create Tooltip
    let tooltip = document.getElementById('chartTooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'chartTooltip';
        tooltip.className = 'chart-tooltip hidden';
        container.appendChild(tooltip);
    }
    tooltip.classList.add('hidden');

    // Get forecast threshold from config
    const forecastYear = config.forecast_start_year || new Date().getFullYear();

    // Add shaded forecast region
    const firstYear = parseInt(primaryData[0].date);
    const lastYear = parseInt(primaryData[primaryData.length - 1].date);

    if (lastYear > forecastYear) {
        // Calculate x position for forecast threshold
        const forecastIndex = primaryData.findIndex(d => parseInt(d.date) > forecastYear);
        if (forecastIndex > 0) {
            const forecastStartX = margin.left + (forecastIndex / (primaryData.length - 1)) * chartWidth;
            const forecastRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            forecastRect.setAttribute('x', forecastStartX);
            forecastRect.setAttribute('y', margin.top);
            forecastRect.setAttribute('width', (width - margin.right) - forecastStartX);
            forecastRect.setAttribute('height', chartHeight);
            forecastRect.setAttribute('fill', 'rgba(147, 51, 234, 0.05)'); // Light purple tint
            forecastRect.setAttribute('stroke', 'rgba(147, 51, 234, 0.2)');
            forecastRect.setAttribute('stroke-width', '1');
            forecastRect.setAttribute('stroke-dasharray', '3,3');
            svg.appendChild(forecastRect);

            // Add "FORECAST" label
            const forecastLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            forecastLabel.setAttribute('x', forecastStartX + 10);
            forecastLabel.setAttribute('y', margin.top + 20);
            forecastLabel.setAttribute('class', 'chart-forecast-label');
            forecastLabel.style.fontSize = '11px';
            forecastLabel.style.fill = 'rgba(147, 51, 234, 0.6)';
            forecastLabel.style.fontWeight = '600';
            forecastLabel.textContent = 'FORECAST';
            svg.appendChild(forecastLabel);
        }
    }

    // Draw Lines (solid lines for all data - no dashing)
    const primaryElements = getChartElements(primaryData);
    const primaryPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    primaryPath.setAttribute('d', primaryElements.pathD);
    primaryPath.setAttribute('class', 'chart-line');
    primaryPath.style.stroke = colors[0];
    svg.appendChild(primaryPath);

    // Draw comparison lines
    const comparisonElements = compareHistories.map((history, idx) => {
        if (!history || history.length < 2) return null;

        const elements = getChartElements(history);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', elements.pathD);
        path.setAttribute('class', 'chart-line comparison');
        path.style.stroke = colors[idx + 1];
        svg.appendChild(path);

        return elements;
    });

    // Label Placement Data
    const labelRequests = [];

    // Render Points and Tooltips handler
    const renderPointsGroup = (elements, isCompare = false, colorIndex = 0) => {
        elements.points.forEach((point, i) => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', point.x);
            circle.setAttribute('cy', point.y);
            circle.setAttribute('r', 3);
            circle.setAttribute('class', `chart-point ${isCompare ? 'comparison' : ''}`);

            circle.addEventListener('mouseenter', () => {
                const formattedVal = formatValue(point.value, config);
                const country = isCompare ? comparisonCountries[colorIndex - 1] : selectedCountry;
                tooltip.innerHTML = `<strong>${point.date}</strong><br/><span style="color: ${colors[colorIndex]}">●</span> ${country}: ${formattedVal}`;
                tooltip.classList.remove('hidden');

                let left = point.x - (tooltip.offsetWidth / 2);
                let top = point.y - 45;
                if (left < 0) left = 5;
                if (left + tooltip.offsetWidth > width) left = width - tooltip.offsetWidth - 5;
                tooltip.style.left = `${left}px`;
                tooltip.style.top = `${top}px`;
            });
            circle.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));
            circle.style.fill = 'white';
            circle.style.stroke = colors[colorIndex];
            circle.style.strokeWidth = '2';
            svg.appendChild(circle);

            // Record label request for the last point
            if (i === elements.points.length - 1) {
                const country = isCompare ? comparisonCountries[colorIndex - 1] : selectedCountry;
                const iso3 = COUNTRY_LIST.find(c => c.name === country || c.name.toLowerCase() === country.toLowerCase())?.code || country.substring(0, 3);
                const isoCode = COUNTRY_ISO3[iso3] || iso3;

                const formatted = formatValue(point.value, { ...config, compact: true });
                labelRequests.push({
                    x: point.x + 5,
                    y: point.y,
                    color: colors[colorIndex],
                    text: `${isoCode}: ${formatted}`
                });
            }

            // X axis labels (years)
            if (i === 0 || i === elements.points.length - 1 || i === Math.floor(elements.points.length / 2)) {
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('x', point.x);
                text.setAttribute('y', height - margin.bottom + 20);
                text.setAttribute('class', 'chart-axis-text');
                text.textContent = point.date;
                svg.appendChild(text);
            }
        });
    };

    renderPointsGroup(primaryElements, false, 0);
    comparisonElements.forEach((elements, idx) => {
        if (elements) renderPointsGroup(elements, true, idx + 1);
    });

    // Vertical Nudging for Labels
    labelRequests.sort((a, b) => a.y - b.y);
    const minHeightDiff = 20;
    for (let i = 1; i < labelRequests.length; i++) {
        const prev = labelRequests[i - 1];
        const curr = labelRequests[i];
        if (curr.y - prev.y < minHeightDiff) {
            curr.y = prev.y + minHeightDiff;
        }
    }

    // Now render the labels
    labelRequests.forEach(req => {
        const valLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        valLabel.setAttribute('x', req.x);
        valLabel.setAttribute('y', req.y + 4);
        valLabel.setAttribute('text-anchor', 'start');
        valLabel.setAttribute('class', 'chart-value-text');
        valLabel.style.fill = req.color;
        valLabel.textContent = req.text;
        svg.appendChild(valLabel);
    });


    // Y axis labels (Min/Max)
    const maxText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    maxText.setAttribute('x', margin.left - 8);
    maxText.setAttribute('y', margin.top + 5);
    maxText.setAttribute('text-anchor', 'end');
    maxText.setAttribute('class', 'chart-axis-text');
    maxText.textContent = formatValue(maxVal, { ...config, compact: true });
    svg.appendChild(maxText);

    const minText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    minText.setAttribute('x', margin.left - 8);
    minText.setAttribute('y', height - margin.bottom - 5);
    minText.setAttribute('text-anchor', 'end');
    minText.setAttribute('class', 'chart-axis-text');
    minText.textContent = formatValue(minVal, { ...config, compact: true });
    svg.appendChild(minText);

    container.appendChild(svg);

    // Draw Legend
    const legend = document.createElement('div');
    legend.className = 'chart-legend';

    let legendHtml = `
        <div class="legend-item">
            <span class="legend-line" style="background: ${colors[0]}"></span>
            <span>${selectedCountry}</span>
        </div>
    `;

    comparisonCountries.forEach((country, idx) => {
        legendHtml += `
            <div class="legend-item">
                <span class="legend-line" style="background: ${colors[idx + 1]}"></span>
                <span>${country}</span>
            </div>
        `;
    });

    legend.innerHTML = legendHtml;
    container.appendChild(legend);
}

function closeModal() {
    document.getElementById('indicatorModal').classList.add('hidden');
}

// Close on overlay click
document.getElementById('indicatorModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('indicatorModal')) {
        closeModal();
    }
});

// Close on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

async function loadCountryOverview() {
    // Show containers immediately
    const overviewEl = document.getElementById('countryOverview');
    if (overviewEl) overviewEl.classList.remove('hidden');

    // Reset comparison when selecting a new primary country
    comparisonCountries = [];
    renderComparisonChips();

    // Start loading World Bank Data (Charts) in parallel
    if (selectedCountry && selectedCountry !== 'Global') {
        loadBenchmarkedData();
    } else {
        const dashboard = document.getElementById('economicDashboard');
        if (dashboard) dashboard.classList.add('hidden');
    }

    try {
        const response = await fetchAPI(`/api/country-overview?country=${encodeURIComponent(selectedCountry)}`);
        if (!response.ok) throw new Error('Failed to load country overview');

        const data = await response.json();

        // 1. Handle Last Run Date & Date Picker
        const lastUpdatedEl = document.getElementById('lastUpdatedDate');
        if (data.last_run_date) {
            const latestDate = parseIsoDate(data.last_run_date);
            if (latestDate && !isNaN(latestDate.getTime())) {
                selectedDate = latestDate;
                const year = latestDate.getFullYear();
                const month = String(latestDate.getMonth() + 1).padStart(2, '0');
                const datePicker = document.getElementById('datePicker');
                if (datePicker) datePicker.value = `${year}-${month}`;

                // Update "Last updated" text
                if (lastUpdatedEl) {
                    const options = { year: 'numeric', month: 'short' };
                    lastUpdatedEl.textContent = latestDate.toLocaleDateString('en-US', options);
                }
            }
        } else {
            selectedDate = new Date();
            const year = selectedDate.getFullYear();
            const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
            const datePicker = document.getElementById('datePicker');
            if (datePicker) datePicker.value = `${year}-${month}`;
            if (lastUpdatedEl) lastUpdatedEl.textContent = 'No data yet';
        }

        // 2. Handle Summary & Articles (Data already provided in overview!)
        if (data.summary) {
            displayCountrySummary(data.summary.summary_text, data.summary.generated_at);
        } else {
            // No summary provided, show placeholder
            displayCountrySummary(null, null);
        }

        if (data.articles) {
            displayCountryArticles(data.articles);
        } else {
            displayCountryArticles([]);
        }

        // Ensure everything is visible
        updateSummaryVisibility();

    } catch (error) {
        console.error('Error loading country overview:', error);

        // Fallback: If overview fails, at least show empty state
        if (overviewEl) overviewEl.classList.remove('hidden');
        displayCountrySummary(null, null);
        displayCountryArticles([]);
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

async function generateSummary(e) {
    if (!selectedDate) {
        showToast('Please select a date first', 'warning');
        return;
    }

    // Support multiple buttons as triggers
    const triggerBtn = e ? e.currentTarget : null;
    const defaultBtn = document.getElementById('regenerateSummaryBtn');
    const btn = triggerBtn || defaultBtn;
    const originalContent = btn ? btn.innerHTML : '';

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined spin">refresh</span> Generating...';
    }

    try {
        const country = selectedCountry || 'Global';
        const dateStr = formatDate(selectedDate);

        // Show user feedback that this might take a moment
        showToast(`Regenerating analysis...`, 'info');

        if (STATIC_MODE) {
            showToast('Generation is disabled in Static Mode', 'warning');
            throw new Error('Static Mode');
        }

        let response;
        if (comparisonCountries.length > 0) {
            // Comparative Summary
            const allCountries = [country, ...comparisonCountries];
            response = await fetchAPI(`${API_BASE}/api/summarize-comparative`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    countries: allCountries,
                    target_date: dateStr
                })
            });
        } else {
            // Single Country Summary
            response = await fetchAPI(`${API_BASE}/api/summarize/${dateStr}?country=${encodeURIComponent(country)}`, {
                method: 'POST'
            });
        }

        if (!response.ok) {
            throw new Error('Failed to regenerate summary');
        }

        const data = await response.json();

        // If comparative, display directly. If single, load overview date.
        if (comparisonCountries.length > 0) {
            const comparativePlaceholder = document.getElementById('comparativeSummaryPlaceholder');
            if (comparativePlaceholder) comparativePlaceholder.classList.add('hidden');
            displayCountrySummary(data.summary_text, data.generated_at || new Date().toISOString());
        } else {
            await loadCountryOverviewForDate(dateStr);
        }
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

// Safe Date Parsing helper
function parseIsoDate(isoStr) {
    if (!isoStr) return null;
    // Handle YYYY-MM-DD
    const parts = isoStr.split('-');
    if (parts.length >= 3) {
        // Use local time constructor to avoid timezone shifts
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
    return new Date(isoStr);
}

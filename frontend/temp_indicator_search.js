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

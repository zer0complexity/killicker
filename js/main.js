import TrackView from './trackView.js';

// module-level singleton map (created in main.js and injected into TrackView)
let map = null;

// Array of TrackView instances
// Each entry: { id, tv, filter }
const trackViews = [];

/**
 * Factory to create and register a TrackView.
 * options:
 *  - id: optional identifier
 *  - filter: optional function (latestFile, jsonData) => boolean
 *  - source: optional shorthand string; if provided, a filter is created to match the filename
 * Returns { trackView, id, unregister }
 */
function createTrackView(options = {}) {
    if (!map) {
        throw new Error('createTrackView called before map initialization; call after initMap completes');
    }
    const { id = cryptoRandomId(), filter, source } = options;
    const tv = new TrackView(map);
    const entry = {
        id,
        tv,
        filter: filter || (source ? ((latestFile) => latestFile === source) : null),
    };
    trackViews.push(entry);

    function unregister() {
        const i = trackViews.findIndex(e => e.id === id);
        if (i !== -1) {
            // remove from array and call any cleanup on the TrackView if present
            const [removed] = trackViews.splice(i, 1);
            if (removed && typeof removed.tv.destroy === 'function') {
                try { removed.tv.destroy(); } catch (err) { console.error('Error destroying TrackView:', err); }
            }
            return true;
        }
        return false;
    }

    return { trackView: tv, id, unregister };
}


// small helper to generate an id when none provided
function cryptoRandomId() {
    try {
        return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
    } catch (e) {
        return Math.random().toString(36).slice(2, 10);
    }
}


async function initMap() {
    // Request libraries when needed, not in the script tag.
    const { Map, InfoWindow } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");

    const position = { lat: 44.74979194815116, lng: -79.8512010048997 };    // Wye Heritage Marina

    // The map, centered at position
    return new google.maps.Map(document.getElementById("map"), {
        zoom: 14,
        center: position,
        mapId: "cf429fad5670f355c2f94461",
        disableDefaultUI: true,
        mapTypeId: 'terrain',
    });
}


async function fetchAndProcessJsonFile(url, callback) {
    try {
        const urlObject = new URL(url, window.location.href);
        const response = await fetch(urlObject.href);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        response.json().then(data => callback(data));
    } catch (error) {
        console.error("Error fetching or processing JSON file:", error);
    }
}

function getNewData(dataUrl = null) {
    if (!map) {
        console.warn('Map not initialized yet; skipping data fetch');
        return;
    }
    fetchAndProcessJsonFile(`${dataUrl}/files.json`, (data) => {
        if (data.files && data.files.length > 0) {
            const latestFile = data.files.at(-1);
            fetchAndProcessJsonFile(`${dataUrl}/${latestFile}`, (jsonData) => {
                if (jsonData.points) {
                    if (trackViews.length === 0) {
                        console.warn('No TrackView instances registered to render points');
                        return;
                    }
                    // Route the stream to TrackViews whose filter matches (or all if no filter)
                    trackViews.forEach(entry => {
                        try {
                            if (!entry.filter || entry.filter(latestFile, jsonData)) {
                                entry.tv.processPoints(jsonData.points);
                            }
                        } catch (err) {
                            console.error('Error processing points in TrackView:', err);
                        }
                    });
                }
            });
        }
    });
}


initMap().then((m) => {
    // assign module-level singleton map
    map = m;
    map.addListener('zoom_changed', () => {
        const zoom = map.getZoom();
        if (zoom) {
            trackViews.forEach(entry => {
                entry.tv.updateMarkerSizes(zoom);
            });
        }
    });
    TrackView.infoWindow = new google.maps.InfoWindow;

    const { trackView: initialTv } = createTrackView();

    let dataUrl = '';
    if (window.location.href.includes('https://zer0complexity.github.io')) {
        console.log('Using GitHub Pages data URL');
        dataUrl = 'https://zer0complexity.github.io/killicker-data';
    } else {
        console.log('Using local data URL');
        dataUrl = 'killicker-data';
    }
    getNewData(dataUrl);  // Initial data fetch
    const intervalId = setInterval(() => getNewData(dataUrl), 10000);  // Fetch new data every 10 seconds
});

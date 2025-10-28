import Logger from './logger.js';
import MapMenu from './mapMenu.js';
import TrackManager from './trackManager.js';
import TrackView from './trackView.js';


// module-level singletons (created in main.js)
let map = null;
let trackManager = null;
const activeTrackViews = new Map(); // trackId -> trackView

/**
 * Factory to create a TrackView for a specific track.
 * @param {string} trackId - ID of the track to display
 * @param {string} trackColour - Color for the track
 * @returns {Promise<Object>} Promise of object containing trackView and trackId
 */
async function createTrackView(trackId, trackColour) {
    if (!map) {
        throw new Error('createTrackView called before map initialization; call after initMap completes');
    }
    if (!trackManager) {
        throw new Error('createTrackView called before TrackManager initialization');
    }

    const tv = new TrackView(map, trackColour);

    // Get track points from TrackManager (fetches if not cached)
    const points = await trackManager.getTrackPoints(trackId);
    tv.processPoints(points);

    // Store the TrackView
    activeTrackViews.set(trackId, tv);

    return { trackView: tv, trackId };
}

async function initMap() {
    // Request libraries when needed, not in the script tag.
    const { Map, InfoWindow } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");

    const position = { lat: 44.74979194815116, lng: -79.8512010048997 };    // Wye Heritage Marina

    // The map, centered at position
    return new google.maps.Map(document.getElementById("map"), {
        zoom: 12,
        center: position,
        mapId: "cf429fad5670f355c2f94461",
        disableDefaultUI: true,
        mapTypeId: 'terrain',
    });
}

async function initTrackManager() {
    let dataUrl = '';
    let pollInterval = 60000; // 60 seconds
    let logger = null;
    if (window.location.href.includes('https://zer0complexity.github.io')) {
        dataUrl = 'https://zer0complexity.github.io/killicker-data';
        logger = new Logger(Logger.ENVIRONMENTS.PROD, "TrackManager");
    } else {
        dataUrl = 'killicker-data';
        pollInterval = 5000; // 5 seconds
        logger = new Logger(Logger.ENVIRONMENTS.DEV, "TrackManager");
    }

    trackManager = new TrackManager(dataUrl, pollInterval, logger);

    // Start polling tracks.json globally
    trackManager.startPollingTracks();
}

// Initialize the application
initMap().then(async (m) => {
    // assign module-level singleton map
    map = m;
    map.addListener('idle', () => {
        // Update marker visibility for all TrackViews
        activeTrackViews.forEach(tv => tv.updateMarkers());
    });

    // Initialize TrackManager and create initial TrackView
    await initTrackManager();

    const liveTrackColour = "#ff9000";
    const trackColours = [
        "#ff1a1a",
        "#ff7a1a",
        "#ffd21a",
        "#aaff1a",
        "#1aff7a",
        "#1affd2",
        "#1aaaff",
        "#1a5aff",
        "#7a1aff",
        "#d21aff",
        "#ff1aa6",
        "#ff1a5a",
        "#ff4c1a",
        "#ffb31a",
        "#5aff1a",
        "#1aff4c"
    ];
    // Create the map menu UI and populate with tracks
    const menu = new MapMenu(map, trackManager.getTracks(), async (trackId, checked) => {
        try {
            if (checked) {
                // create TrackView if not already active
                if (!activeTrackViews.has(trackId)) {
                    const idx = trackManager.getTracks().findIndex(track => track.id === trackId);
                    const trackColour = trackColours[idx % trackColours.length];
                    await createTrackView(trackId, trackColour);
                    // Update the menu swatch to reflect the colour used for this TrackView
                    menu.setTrackSwatch(trackId, trackColour);
                }
            } else {
                // destroy if active
                const tv = activeTrackViews.get(trackId);
                if (tv) {
                    try { tv.destroy(); } catch (e) { /* ignore */ }
                    activeTrackViews.delete(trackId);
                    // Release track points reference in TrackManager
                    trackManager.releaseTrackPoints(trackId);
                    // remove colour swatch from the menu for this track
                    menu.removeTrackSwatch(trackId);
                }
            }
        } catch (err) {
            console.error('Error handling menu change:', err);
        }
    });

    // Keep the menu in sync with tracks.json changes
    trackManager.registerTracksListener(menu.setTracks.bind(menu));
});

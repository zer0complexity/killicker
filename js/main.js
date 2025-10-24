import TrackView from './trackView.js';
import TrackManager from './trackManager.js';
import MapMenu from './mapMenu.js';

// module-level singletons (created in main.js)

let map = null;
let trackManager = null;
const trackViews = []; // Array to keep TrackView instances (for updateMarkers)
const activeTrackViews = new Map(); // trackId -> { trackView, unregister }

/**
 * Factory to create and register a TrackView.
 * @param {Object} options - Configuration options
 * @param {string} options.trackId - ID of the track to display (if not provided, uses latest track)
 * @returns {Promise<Object>} Promise of object containing trackView and unregister function
 */
async function createTrackView(options = {}) {
    if (!map) {
        throw new Error('createTrackView called before map initialization; call after initMap completes');
    }
    if (!trackManager) {
        throw new Error('createTrackView called before TrackManager initialization');
    }

    let { trackId, trackColour } = options;

    // If no trackId provided, use the latest track
    if (!trackId) {
        const tracks = trackManager.getTracks();
        if (tracks.length === 0) {
            throw new Error('No tracks available');
        }
        trackId = tracks[tracks.length - 1].id;
    }

    const tv = new TrackView(map, trackColour);

    // Register listener for track updates
    const unregister = await trackManager.registerListener(trackId, (points) => {
        tv.processPoints(points);
    });

    // Start polling for this track
    trackManager.startPollingTrack(trackId);

    // Add to the array of TrackViews
    trackViews.push(tv);
    // Track active by trackId so we can destroy later
    activeTrackViews.set(trackId, { trackView: tv, unregister });

    return { trackView: tv, trackId, unregister };
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
    if (window.location.href.includes('https://zer0complexity.github.io')) {
        console.log('Using GitHub Pages data URL');
        dataUrl = 'https://zer0complexity.github.io/killicker-data';
    } else {
        console.log('Using local data URL');
        dataUrl = 'killicker-data';
    }

    try {
        const response = await fetch(`${dataUrl}/tracks.json`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        trackManager = new TrackManager(data);

        // Start polling for the latest track
        if (data.tracks && data.tracks.length > 0) {
            const latestTrack = data.tracks.at(-1);
            await trackManager.fetchTrackPoints(latestTrack.id);
            trackManager.startPollingTrack(latestTrack.id);  // Poll every 10 seconds
        }
    } catch (error) {
        console.error("Error initializing TrackManager:", error);
        throw error;
    }
}

// Initialize the application
initMap().then(async (m) => {
    // assign module-level singleton map
    map = m;
    map.addListener('idle', () => {
        // Update marker visibility for all TrackViews
        trackViews.forEach(tv => tv.updateMarkers());
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
                    await createTrackView({ trackId, trackColour: trackColours[idx % trackColours.length] });
                }
            } else {
                // unregister and destroy if active
                const entry = activeTrackViews.get(trackId);
                if (entry) {
                    try { entry.unregister(); } catch (e) { /* ignore */ }
                    try { entry.trackView.destroy(); } catch (e) { /* ignore */ }
                    activeTrackViews.delete(trackId);
                    // also remove from trackViews array
                    const idx = trackViews.findIndex(tv => tv === entry.trackView);
                    if (idx !== -1) trackViews.splice(idx, 1);
                }
            }
        } catch (err) {
            console.error('Error handling menu change:', err);
        }
    });

    // Create an initial TrackView for the latest track and check the box
    // const initial = await createTrackView();
    // menu.setChecked(initial.trackId, true);
});

import Logger from './logger.js';
import MapMenu from './mapMenu.js';
import TrackManager from './trackManager.js';
import TrackView from './trackView.js';


// module-level singletons (created in main.js)
let map = null;
let trackManager = null;
const activeTrackViews = new Map(); // trackId -> { trackView, unregister }

/**
 * Factory to create and register a TrackView for a specific track.
 * @param {string} trackId - ID of the track to display
 * @param {string} trackColour - Color for the track
 * @returns {Promise<Object>} Promise of { trackView, trackId, unregister }
 */
async function createTrackView(trackId, trackColour) {
    if (!map) {
        throw new Error('createTrackView called before map initialization; call after initMap completes');
    }
    if (!trackManager) {
        throw new Error('createTrackView called before TrackManager initialization');
    }

    const tv = new TrackView(map, trackColour);

    // Register a listener so TrackView receives initial and subsequent updates
    const unregister = await trackManager.registerListener(trackId, (points) => {
        tv.processPoints(points);
    });

    activeTrackViews.set(trackId, { trackView: tv, unregister });

    return { trackView: tv, trackId, unregister };
}

async function initMap() {
    // Request libraries when needed, not in the script tag.
    // Load required Google Maps libraries (symbols are used via global google namespace)
    await google.maps.importLibrary("maps");
    await google.maps.importLibrary("marker");

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
    const { dataUrl, pollInterval, logger } = getRuntimeConfig();
    trackManager = new TrackManager(dataUrl, pollInterval, logger);

    // Start polling tracks.json globally
    trackManager.startPollingTracks();
}

// Small helper to configure runtime (data URL, poll interval, logger)
function getRuntimeConfig() {
    const isProd = window.location.href.includes('https://zer0complexity.github.io');
    return {
        dataUrl: isProd ? 'https://zer0complexity.github.io/killicker-data' : 'killicker-data',
        pollInterval: isProd ? 60000 : 5000,
        logger: new Logger(isProd ? Logger.ENVIRONMENTS.PROD : Logger.ENVIRONMENTS.DEV, 'TrackManager'),
    };
}

// Initialize the application
initMap().then(async (m) => {
    // assign module-level singleton map
    map = m;
    map.addListener('idle', () => {
        // Update marker visibility for all TrackViews
        activeTrackViews.forEach(entry => entry.trackView.updateMarkers());
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
    const trackColourCache = new Map(); // trackId -> colour

    // Helper: compute or return cached colour for a track
    const getTrackColour = (trackId) => {
        if (trackId === trackManager.getLiveTrackId()) return liveTrackColour;
        if (trackColourCache.has(trackId)) return trackColourCache.get(trackId);
        const idx = trackManager.getTracks().findIndex(t => t.id === trackId);
        const colour = trackColours[(idx >= 0 ? idx : 0) % trackColours.length];
        trackColourCache.set(trackId, colour);
        return colour;
    };

    // Helpers to activate/deactivate a track view and keep menu swatch in sync
    const activateTrack = async (trackId, explicitColour) => {
        if (!trackId || activeTrackViews.has(trackId)) return;
        const colour = explicitColour || getTrackColour(trackId);
        await createTrackView(trackId, colour);
        menu.setTrackSwatch(trackId, colour);
    };
    const deactivateTrack = (trackId) => {
        if (!trackId) return;
        const entry = activeTrackViews.get(trackId);
        if (!entry) return;
        entry.unregister();
        entry.trackView.destroy();
        activeTrackViews.delete(trackId);
        menu.removeTrackSwatch(trackId);
    };
    // Create the map menu UI and populate with tracks
    const menu = new MapMenu(
        map, 
        trackManager.getTracks(), 
        async (trackId, checked) => {
            try {
                if (checked) await activateTrack(trackId);
                else deactivateTrack(trackId);
            } catch (err) {
                console.error('Error handling menu change:', err);
            }
        },
        {
            hasLiveTrack: trackManager.hasLiveTrack(),
            liveTrackId: trackManager.getLiveTrackId(),
            onLiveTrackFollowChange: async (checked) => {
                const liveTrackId = trackManager.getLiveTrackId();
                if (!liveTrackId) return;
                try {
                    if (checked) await activateTrack(liveTrackId, liveTrackColour);
                    else deactivateTrack(liveTrackId);
                } catch (err) {
                    console.error('Error handling live track follow change:', err);
                }
            }
        }
    );

    // Keep the menu in sync with tracks.json changes
    trackManager.registerTracksListener(menu.setTracks.bind(menu));

    // Keep the menu in sync with live track changes
    trackManager.registerLiveTrackListener((liveTrackId) => {
        menu.setLiveTrack(liveTrackId !== null, liveTrackId);
    });
});

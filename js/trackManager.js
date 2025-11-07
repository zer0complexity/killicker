// TrackManager module: manages track metadata and per-track point listeners.
//
// Behavior notes:
// - The TrackManager polls `update.json` and `tracks.json` to detect changes.
// - When `tracks.json` changes, TrackManager groups the tracks into sections
//   (by year derived from the first 4 characters of the track id) and notifies
//   registered tracks listeners once per section with the signature
//   `(sectionId, tracksArray)`.
// - Per-track listeners registered via registerListener(trackId, listener)
//   receive the full points array on registration and incremental point arrays
//   (deltas) when new points are appended.
export default class TrackManager {
    constructor(baseUrl, pollInterval, logger) {
        // Map: sectionId (e.g., year) -> Array<track metadata>
        this.tracks = new Map();
        // Map: trackId -> { points: Array, listeners: Set<Function> }
        this.trackData = new Map();
        // timer for polling tracks.json
        this.tracksPollTimer = null;
        // listeners for full tracks list changes
        this.tracksListeners = new Set();
        // listeners for live track changes
        this.liveTrackListeners = new Set();
        // base URL provided by main.js
        this.baseUrl = baseUrl?.replace(/\/$/, '') || '';
        this.pollInterval = pollInterval;
        this.logger = logger;
        this.lastTracksUpdate = new Date(0);
        this.liveTrackId = null;
        // Cache of sectionId -> tracks array (for yearly files)
        this.sectionTracks = new Map();
        // Per-section (year) last-edited timestamps cache
        this.sectionTimestamps = new Map();
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.trackData.clear();
        if (this.tracksPollTimer) {
            clearInterval(this.tracksPollTimer);
            this.tracksPollTimer = null;
        }
        // Unregister all listeners
        this.tracksListeners.clear();
        this.liveTrackListeners.clear();
    }

    /**
     * Register a listener for a track's points.
     * Listener is invoked with the full points array on register and when the count increases.
     * When the last listener is removed, cached points are cleared.
     * @param {string} trackId
     * @param {(points: Array) => void} listener
     * @returns {Function} unregister function
     */
    async registerListener(trackId, listener) {
        let data = this.trackData.get(trackId);
        if (!data) {
            data = { points: [], listeners: new Set() };
            this.trackData.set(trackId, data);
        }
        data.listeners.add(listener);

        if (data.points.length > 0) {
            try { listener(data.points); } catch (e) { this.logger.error('Listener error:', e); }
        } else {
            try {
                const points = await this._fetchTrackPoints(trackId);
                data.points = points;
                try { listener(points); } catch (e) { this.logger.error('Listener error:', e); }
            } catch (e) {
                this.logger.error(`Failed to fetch initial points for ${trackId}:`, e);
            }
        }

        return () => {
            const d = this.trackData.get(trackId);
            if (!d) return;
            d.listeners.delete(listener);
            if (d.listeners.size === 0) {
                this.trackData.delete(trackId);
                this.logger.debug(`No listeners remain for ${trackId}; cache cleared.`);
            }
        };
    }

    // (ref-count release removed; cache cleanup now handled by unregister in registerListener)

    /**
     * Get metadata for a section's tracks
     * @param {string} sectionId - section id (e.g., year like "2025"). If omitted, returns empty array.
     * @returns {Array} Array of track metadata objects for the section
     */
    getTracks(sectionId) {
        if (!sectionId) return [];
        if (this.tracks instanceof Map) {
            const list = this.tracks.get(String(sectionId));
            return Array.isArray(list) ? list : [];
        }
        // Fallback for older shape where this.tracks might be an array: filter by derived year
        if (Array.isArray(this.tracks)) {
            return this.tracks.filter(t => (typeof t.id === 'string' && t.id.slice(0,4) === String(sectionId)));
        }
        return [];
    }

    /**
     * Get the distance of a specific track
     * @param {string} trackId
     * @returns {number|null} Distance in meters, or null if not found
     */
    getTrackDistance(trackId) {
        if (!trackId || typeof trackId !== 'string' || trackId.length < 4) return null;
        // Track IDs are in the format YYYYMMDD-HHmm; derive section/year from first 4 chars
        const year = trackId.slice(0,4);
        const list = this.getTracks(year);
        const track = list.find(t => t.id === trackId);
        return track ? (track.Distance || null) : null;
    }

    /**
     * Register a listener for changes to the tracks index.
     * Listeners will be invoked once per section with the signature: (sectionId, tracksArray).
     * The TrackManager groups the full tracks index into sections (by year derived from track id)
     * and notifies listeners for each section when tracks.json changes. On registration the
     * listener is immediately invoked for existing sections.
     * @param {Function} listener - Function(sectionId: string, tracksArray: Array)
     * @returns {Function} Unregister function
     */
    registerTracksListener(listener) {
        // Add to set and immediately invoke listener for cached yearly sections
        this.tracksListeners.add(listener);
        try {
            for (const [sectionId, jsonStr] of this.sectionTracks.entries()) {
                try {
                    const tracks = jsonStr ? JSON.parse(jsonStr) : null;
                    console.log(`Immediate tracks listener call for section ${sectionId}:`, tracks);
                    if (tracks && tracks.length > 0) listener(sectionId, tracks);
                } catch (e) {
                    this.logger.error('tracks listener immediate call failed for section ' + sectionId, e);
                }
            }
        } catch (e) {
            this.logger.error('tracks listener immediate grouping failed', e);
        }
        return () => { this.tracksListeners.delete(listener); };
    }

    /**
     * Check if there is currently a live track
     * @returns {boolean}
     */
    hasLiveTrack() {
        return this.liveTrackId !== null;
    }

    /**
     * Get the current live track ID
     * @returns {string|null}
     */
    getLiveTrackId() {
        return this.liveTrackId;
    }

    /**
     * Register a listener for live track changes
     * @param {Function} listener - Function(liveTrackId: string|null) called when live track changes
     * @returns {Function} Unregister function
     */
    registerLiveTrackListener(listener) {
        return this._registerAndCall(this.liveTrackListeners, () => this.liveTrackId, 'live track', listener);
    }

    /**
     * Start polling update.json and tracks.json to detect when new tracks are added
     * and when track point counts increase for tracks with listeners.
     */
    startPollingTracks() {
        if (this.tracksPollTimer) {
            clearInterval(this.tracksPollTimer);
            this.tracksPollTimer = null;
        }
        const poll = async () => {
            this.logger.debug(`Polling update.json for latest tracks.json timestamp...`);
            try {
                // Fetch update.json to check for tracks.json and live track updates
                const updateData = await this._fetchJson('update.json');

                // Check for per-year updates listed in update.json. The update.json file
                // now contains section ids (years like "2025") with an { edited: ISO } field
                // for each yearly tracks file that is available. For each year from 2025 to
                // the current UTC year, compare timestamps and fetch the yearly file if
                // the timestamp is newer than our cache. Missing or empty files remove the section.
                const now = new Date();
                const currentYear = now.getUTCFullYear();
                const aggregated = [];
                const seenIds = new Set();

                // Track whether we fetched any updated sections this poll
                let anySectionChanged = false;

                for (let year = 2025; year <= currentYear; year++) {
                    const yearKey = String(year);
                    const yearMeta = updateData[yearKey];
                    const editedIso = yearMeta?.edited;
                    let editedTs = null;
                    if (editedIso) {
                        try { editedTs = new Date(editedIso); } catch (e) { editedTs = null; }
                    }

                    const prevTs = this.sectionTimestamps.get(yearKey) || new Date(0);

                    if (editedTs && editedTs > prevTs) {
                        // Yearly file updated — fetch it
                        const rel = `${year}.json`;
                        try {
                            const data = await this._fetchJson(rel);
                            const tracksForYear = Array.isArray(data.tracks) ? data.tracks : [];
                            if (tracksForYear.length > 0) {
                                const nextJson = JSON.stringify(tracksForYear);
                                const prevJson = this.sectionTracks.get(yearKey);
                                if (!prevJson || prevJson !== nextJson) {
                                    this.sectionTracks.set(yearKey, nextJson);
                                    this._safeNotify(this.tracksListeners, 'tracks', yearKey, tracksForYear);
                                    anySectionChanged = true;
                                }
                                // Update timestamp cache
                                this.sectionTimestamps.set(yearKey, editedTs);
                                // Ensure the per-section tracks Map is updated
                                this.tracks.set(yearKey, tracksForYear);
                                // Add to aggregated list
                                for (const t of tracksForYear) {
                                    if (!seenIds.has(t.id)) {
                                        aggregated.push(t);
                                        seenIds.add(t.id);
                                    }
                                }
                                // continue to next year
                                continue;
                            }
                            // File fetched but contains no tracks — remove section if present
                            if (this.sectionTracks.has(yearKey)) {
                                this.sectionTracks.delete(yearKey);
                                this.sectionTimestamps.delete(yearKey);
                                this._safeNotify(this.tracksListeners, 'tracks', yearKey, null);
                                // Remove from per-section tracks Map
                                this.tracks.delete(yearKey);
                                anySectionChanged = true;
                            }
                        } catch (e) {
                            // Fetch failure — remove existing section if any
                            if (this.sectionTracks.has(yearKey)) {
                                this.sectionTracks.delete(yearKey);
                                this.sectionTimestamps.delete(yearKey);
                                this._safeNotify(this.tracksListeners, 'tracks', yearKey, null);
                                // Remove from per-section tracks Map
                                this.tracks.delete(yearKey);
                                anySectionChanged = true;
                            }
                        }
                    } else if (!editedTs) {
                        // No metadata for this year in update.json — if we previously had a section, remove it
                        if (this.sectionTracks.has(yearKey)) {
                            this.sectionTracks.delete(yearKey);
                            this.sectionTimestamps.delete(yearKey);
                            this._safeNotify(this.tracksListeners, 'tracks', yearKey, null);
                            // Remove from per-section tracks Map
                            this.tracks.delete(yearKey);
                            anySectionChanged = true;
                        }
                    } else {
                        // Year exists in update.json but timestamp not newer than cached; we still want to
                        // include previously-cached tracks in the aggregated list
                        const prevJson = this.sectionTracks.get(yearKey);
                        if (prevJson) {
                            try {
                                const tracksForYear = JSON.parse(prevJson);
                                // Ensure per-section tracks Map contains the cached list
                                this.tracks.set(yearKey, tracksForYear);
                                for (const t of tracksForYear) {
                                    if (!seenIds.has(t.id)) {
                                        aggregated.push(t);
                                        seenIds.add(t.id);
                                    }
                                }
                            } catch (e) {
                                // ignore parse errors here
                            }
                        }
                    }
                }

                // If any section changed, or if we have aggregated tracks from cached sections,
                // update this.tracks and refresh per-track listeners.
                if (anySectionChanged || aggregated.length > 0) {
                    aggregated.sort((a, b) => (a.id < b.id ? 1 : -1));
                    // Update lastTracksUpdate and refresh per-track listeners for aggregated list
                    this.lastTracksUpdate = new Date();
                    for (const meta of aggregated) {
                        await this._refreshIfIncreased(meta.id, meta.pointCount || 0);
                    }
                }
                // otherwise nothing changed

                // Check for live track updates (if applicable)
                const liveTrackId = updateData.live?.id || null;
                if (liveTrackId !== this.liveTrackId) {
                    // Track identity changed; update metadata and notify listeners
                    if (liveTrackId) {
                        this.logger.info(`Live track updated to ${liveTrackId}`);
                    } else {
                        this.logger.info(`Live track cleared`);
                    }
                    this.liveTrackId = liveTrackId;
                        this._safeNotify(this.liveTrackListeners, 'live track', this.liveTrackId);
                }
                if (liveTrackId) {
                    const liveCount = updateData.live.pointCount || 0;
                    await this._refreshIfIncreased(liveTrackId, liveCount);
                }
            } catch (err) {
                this.logger.error('Error polling tracks.json:', err);
            }
        };
        // Initial poll immediately
        poll();
        // Schedule periodic polls
        this.tracksPollTimer = setInterval(poll, this.pollInterval);
    }

    /**
     * Fetch tracks.json and return the new tracks array
     * @param {Date} updateTimestamp - Timestamp of the last update from update.json
     * @returns {Array<Object>} Array of track metadata objects
     */
    async _fetchTracks(updateTimestamp) {
        try {
            const data = await this._fetchJson('tracks.json');
            this.lastTracksUpdate = updateTimestamp;
            return data.tracks || [];
        } catch (error) {
            this.logger.error('Error fetching tracks.json:', error);
            throw error;
        }
    }

    /**
     * Internal helper to fetch full points array for a track
     * @param {string} trackId
     * @returns {Promise<Array>}
     */
    async _fetchTrackPoints(trackId) {
        this.logger.debug(`Fetching points for track ${trackId}...`);
        const data = await this._fetchJson(`${trackId}.json`);
        return data.points || [];
    }

    /**
     * Notify tracks list listeners and update internal list cache
     * @param {Array} nextTracks
     */
    _notifyTracksList(nextTracks) {
        // Group tracks into sections by year derived from track id and notify listeners per section
        const groups = new Map();
        for (const t of nextTracks) {
            const year = (typeof t.id === 'string' && t.id.length >= 4) ? t.id.slice(0, 4) : 'other';
            if (!groups.has(year)) groups.set(year, []);
            groups.get(year).push(t);
        }
        // Replace internal tracks Map with grouped sections
        this.tracks = groups;
        for (const [sectionId, list] of groups.entries()) {
            this._safeNotify(this.tracksListeners, 'tracks', sectionId, list);
        }
    }

    /**
     * Refresh a specific track if the reported newCount exceeds cached length.
     * Notifies that track's listeners with only the delta points.
     * @param {string} trackId
     * @param {number} newCount
     */
    async _refreshIfIncreased(trackId, newCount) {
        const d = this.trackData.get(trackId);
        if (!d || !d.listeners || d.listeners.size === 0) return;
        const oldCount = d.points?.length || 0;
        if (newCount <= oldCount) return;
        try {
            const points = await this._fetchTrackPoints(trackId);
            const newPoints = points.slice(oldCount);
            d.points = points;
            if (newPoints.length > 0) this._safeNotify(d.listeners, `track ${trackId}`, newPoints);
        } catch (e) {
            this.logger.error(`Failed to refresh points for ${trackId}:`, e);
        }
    }

    /**
     * Safely notify a set of listeners with the provided args. Errors are logged and do not stop the loop.
     * Listeners may be called with multiple arguments depending on the event (for example
     * tracks listeners are called as `(sectionId, tracksArray)`).
     * @param {Set<Function>} listeners
     * @param {string} label - descriptive label for error logging context
     * @param {...*} args - arguments to pass to each listener
     */
    _safeNotify(listeners, label, ...args) {
        if (!listeners || listeners.size === 0) return;
        listeners.forEach(fn => {
            try {
                fn(...args);
            } catch (e) {
                this.logger.error(`Error in ${label} listener:`, e);
            }
        });
    }

    /**
     * Helper to register a simple listener set that should be invoked immediately with current value.
     * Returns an unregister function.
     * @param {Set<Function>} listenersSet
     * @param {Function} getCurrentValue - () => any
     * @param {string} label
     * @param {Function} listener
     */
    _registerAndCall(listenersSet, getCurrentValue, label, listener) {
        listenersSet.add(listener);
        try {
            listener(getCurrentValue());
        } catch (e) {
            this.logger.error(`${label} listener immediate call failed`, e);
        }
        return () => { listenersSet.delete(listener); };
    }

    /**
     * Fetch and parse JSON from a relative path under baseUrl
     * @param {string} relativePath
     */
    async _fetchJson(relativePath) {
        const response = await fetch(`${this.baseUrl}/${relativePath}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return response.json();
    }
}

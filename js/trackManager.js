// TrackManager module: manages track data and updates.
export default class TrackManager {
    constructor(baseUrl, pollInterval, logger) {
        this.tracks = [];
        // Map: trackId -> { points: Array, listeners: Set<Function> }
        this.trackData = new Map();
        // timer for polling tracks.json
        this.tracksPollTimer = null;
        // listeners for full tracks list changes
        this.tracksListeners = new Set();
        // base URL provided by main.js
        this.baseUrl = baseUrl?.replace(/\/$/, '') || '';
        this.pollInterval = pollInterval;
        this.logger = logger;
        this.lastTracksUpdate = new Date(0);
        this.liveTrackId = null;
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
     * Get metadata for all tracks
     * @returns {Array} Array of track metadata objects
     */
    getTracks() {
        return this.tracks;
    }

    /**
     * Register a listener for changes to the full tracks list (tracks.json)
     * @param {Function} listener - Function(tracksArray)
     * @returns {Function} Unregister function
     */
    registerTracksListener(listener) {
        this.tracksListeners.add(listener);
        // call immediately with current state
        try {
            listener(this.getTracks());
        }
        catch (e) {
            this.logger.error('tracks listener immediate call failed', e);
        }
        return () => { this.tracksListeners.delete(listener); };
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
                const updateResponse = await fetch(`${this.baseUrl}/update.json`);
                if (!updateResponse.ok) throw new Error(`HTTP error! status: ${updateResponse.status}`);
                const updateData = await updateResponse.json();

                // Check if tracks.json has been updated (new tracks added or point counts changed)
                const updateTimestamp = new Date(updateData.tracks?.edited);
                if (updateTimestamp > this.lastTracksUpdate) {
                    const nextTracks = await this._fetchTracks(updateTimestamp);

                    // First, notify tracks list listeners (separate concern)
                    this._notifyTracksList(nextTracks);

                    // Then, refresh any per-track listeners where counts increased
                    for (const meta of nextTracks) {
                        await this._refreshIfIncreased(meta.id, meta.pointCount || 0);
                    }
                }

                // Check for live track updates (if applicable)
                const liveTrackId = updateData.live?.id;
                if (liveTrackId) {
                    const liveCount = updateData.live.pointCount || 0;
                    if (liveTrackId !== this.liveTrackId) {
                        // Track identity changed; update metadata and proceed to refresh
                        this.logger.info(`Live track updated to ${liveTrackId}`);
                        this.liveTrackId = liveTrackId;
                    }
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
            const response = await fetch(`${this.baseUrl}/tracks.json`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
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
        const response = await fetch(`${this.baseUrl}/${trackId}.json`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return data.points || [];
    }

    /**
     * Notify tracks list listeners and update internal list cache
     * @param {Array} nextTracks
     */
    _notifyTracksList(nextTracks) {
        this.tracks = nextTracks;
        this._safeNotify(this.tracksListeners, this.tracks, 'tracks');
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
            if (newPoints.length > 0) this._safeNotify(d.listeners, newPoints, `track ${trackId}`);
        } catch (e) {
            this.logger.error(`Failed to refresh points for ${trackId}:`, e);
        }
    }

    /**
     * Safely notify a set of listeners with a payload. Errors are logged and do not stop the loop.
     * @param {Set<Function>} listeners
     * @param {*} payload
     * @param {string} label - descriptive label for error logging context
     */
    _safeNotify(listeners, payload, label) {
        if (!listeners || listeners.size === 0) return;
        listeners.forEach(fn => {
            try {
                fn(payload);
            } catch (e) {
                this.logger.error(`Error in ${label} listener:`, e);
            }
        });
    }
}

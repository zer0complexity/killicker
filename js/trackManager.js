// TrackManager module: manages track data and updates.
export default class TrackManager {
    constructor(baseUrl, pollInterval, logger) {
        this.tracks = [];
        // Map: trackId -> { listeners: Set<Function>, points: Array }
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
    }

    /**
     * Register a listener for track points
     * @param {string} trackId - The ID of the track to listen for
     * @param {Function} listener - Function(points) to call with track points
     * @returns {Function} Unregister function
     */
    async registerListener(trackId, listener) {
        let trackData = this.trackData.get(trackId);
        if (!trackData) {
            trackData = {
                listeners: new Set(),
                points: []  // Store all points for the track
            };
            this.trackData.set(trackId, trackData);
        }
        trackData.listeners.add(listener);

        // If we already have points for this track, invoke the listener immediately
        if (trackData.points.length > 0) {
            try {
                listener(trackData.points);
            } catch (error) {
                this.logger.error(`Error invoking listener with existing points for track ${trackId}:`, error);
            }
        } else {
            // If no points yet, fetch them immediately (tracks are static, one-time fetch)
            try {
                await this.fetchTrackPoints(trackId);
            } catch (error) {
                this.logger.error(`Error fetching initial points for track ${trackId}:`, error);
            }
        }

        return () => {
            const data = this.trackData.get(trackId);
            if (data) {
                data.listeners.delete(listener);
                if (data.listeners.size === 0) {
                    this.logger.debug(`No more listeners for track ${trackId}, removing track data.`);
                    this.trackData.delete(trackId);
                }
            }
        };
    }

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
     * Fetch points for a specific track (one-time, tracks are static)
     * @param {string} trackId - The ID of the track to fetch
     * @returns {Promise} Promise that resolves when points are fetched
     */
    async fetchTrackPoints(trackId) {
        this.logger.debug(`Fetching points for track ${trackId}...`);
        try {
            const response = await fetch(`${this.baseUrl}/${trackId}.json`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            if (data.points && data.points.length > 0) {
                const trackData = this.trackData.get(trackId);
                if (trackData) {
                    trackData.points = data.points;
                    this.notifyListeners(trackId, data.points);
                }
            }
        } catch (error) {
            this.logger.error(`Error fetching track points for ${trackId}:`, error);
            throw error;
        }
    }

    /**
     * Start polling update.json and tracks.json to detect when new tracks are added
     */
    startPollingTracks() {
        if (this.tracksPollTimer) {
            clearInterval(this.tracksPollTimer);
            this.tracksPollTimer = null;
        }
        const poll = async () => {
            this.logger.debug(`Polling update.json for latest tracks.json timestamp...`);
            try {
                // Fetch update.json to check if tracks.json has been updated
                const updateResponse = await fetch(`${this.baseUrl}/update.json`);
                if (!updateResponse.ok) throw new Error(`HTTP error! status: ${updateResponse.status}`);
                const updateData = await updateResponse.json();

                // Check if tracks.json has been updated (new tracks added)
                const updateTimestamp = new Date(updateData.tracks?.edited);
                if (updateTimestamp > this.lastTracksUpdate) {
                    const nextTracks = await this._fetchTracks(updateTimestamp);

                    // Update tracks list and notify listeners
                    this.tracks = nextTracks;
                    this.tracksListeners.forEach(fn => {
                        try { fn(this.tracks); } catch (e) { this.logger.error('Error in tracks listener:', e); }
                    });
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
     * Clean up resources
     */
    destroy() {
        this.trackData.clear();
        if (this.tracksPollTimer) {
            clearInterval(this.tracksPollTimer);
            this.tracksPollTimer = null;
        }
    }

    // Private method to notify listeners with track points
    notifyListeners(trackId, points) {
        const trackData = this.trackData.get(trackId);
        if (trackData?.listeners) {
            trackData.listeners.forEach(listener => {
                try {
                    listener(points);
                } catch (error) {
                    this.logger.error(`Error in track ${trackId} listener:`, error);
                }
            });
        }
    }
}

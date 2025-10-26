// TrackManager module: manages track data and updates.
export default class TrackManager {
    constructor(baseUrl, pollInterval, logger) {
        this.tracks = [];
        // Map: trackId -> { pointCount: number, listeners: Set<Function>, points: Array }
        this.trackData = new Map();
        // timer for polling tracks.json
        this.tracksPollTimer = null;
        // listeners for full tracks list changes
        this.tracksListeners = new Set();
        // cache of last known pointCount per track from tracks.json
        this.tracksPointCounts = new Map(this.tracks.map(t => [t.id, t.pointCount || 0]));
        // base URL provided by main.js
        this.baseUrl = baseUrl?.replace(/\/$/, '') || '';
        this.pollInterval = pollInterval;
        this.logger = logger;
        this.lastUpdate = new Date(0);
    }

    /**
     * Register a listener for track point updates
     * @param {string} trackId - The ID of the track to listen for
     * @param {Function} listener - Function(newPoints) to call when new points arrive
     * @returns {Function} Unregister function
     */
    async registerListener(trackId, listener) {
        let trackData = this.trackData.get(trackId);
        if (!trackData) {
            trackData = {
                pointCount: 0,
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
            // If no points yet, fetch them immediately
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
     * Fetch points for a specific track
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
            if (data.points) {
                const trackData = this.trackData.get(trackId) || {
                    pointCount: 0,
                    listeners: new Set(),
                    points: []
                };
                const newPoints = data.points.slice(trackData.pointCount);

                if (newPoints.length > 0) {
                    trackData.pointCount = data.points.length;
                    trackData.points = data.points; // Store all points
                    this.notifyListeners(trackId, newPoints);
                }
            }
        } catch (error) {
            this.logger.error(`Error fetching track points for ${trackId}:`, error);
            throw error;
        }
    }

    /**
     * Start polling tracks.json and notify listeners when it changes.
     * Also detect pointCount changes and fetch new points for tracks with listeners.
     */
    startPollingTracks() {
        if (this.tracksPollTimer) {
            clearInterval(this.tracksPollTimer);
            this.tracksPollTimer = null;
        }
        const poll = async () => {
            this.logger.debug(`Polling last-tracks-update for latest update timestamp...`);
            try {
                // Fetch last-tracks-update first and compare against this.lastUpdate
                const lastUpdateResponse = await fetch(`${this.baseUrl}/last-tracks-update`);
                if (!lastUpdateResponse.ok) throw new Error(`HTTP error! status: ${lastUpdateResponse.status}`);
                const lastUpdateData = await lastUpdateResponse.text();
                const lastUpdate = new Date(lastUpdateData);
                if (lastUpdate <= this.lastUpdate) {
                    return;
                }
                this.lastUpdate = lastUpdate;

                this.logger.debug(`Polling for tracks.json`);
                const response = await fetch(`${this.baseUrl}/tracks.json`);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                const nextTracks = data.tracks || [];

                // Compare pointCounts to detect changes
                const nextCounts = new Map(nextTracks.map(t => [t.id, t.pointCount || 0]));

                // Notify point listeners only when pointCount changes
                for (const [trackId, newCount] of nextCounts.entries()) {
                    const oldCount = this.tracksPointCounts.get(trackId) ?? 0;
                    if (newCount > oldCount) {
                        // Only fetch if there are listeners for this track
                        const td = this.trackData.get(trackId);
                        if (td && td.listeners && td.listeners.size > 0) {
                            await this.fetchTrackPoints(trackId);
                        } else {
                            // update cached count even if no listeners; points will be fetched on first registration
                            this.tracksPointCounts.set(trackId, newCount);
                        }
                    }
                }

                // Update tracks list and cached counts
                this.tracks = nextTracks;
                this.tracksPointCounts = nextCounts;
                this.tracksListeners.forEach(fn => {
                    try { fn(this.tracks); } catch (e) { this.logger.error('Error in tracks listener:', e); }
                });
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
     * Clean up resources
     */
    destroy() {
        this.trackData.clear();
        if (this.tracksPollTimer) {
            clearInterval(this.tracksPollTimer);
            this.tracksPollTimer = null;
        }
    }

    // Private method to notify listeners of new points
    notifyListeners(trackId, newPoints) {
        const trackData = this.trackData.get(trackId);
        if (trackData?.listeners) {
            // Update cached pointCount from points array length if greater
            if (Array.isArray(trackData.points)) {
                this.tracksPointCounts.set(trackId, trackData.points.length);
            }
            trackData.listeners.forEach(listener => {
                try {
                    listener(newPoints);
                } catch (error) {
                    this.logger.error(`Error in track ${trackId} listener:`, error);
                }
            });
        }
    }
}

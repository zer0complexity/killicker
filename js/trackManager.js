// TrackManager module: manages track data and updates.
export default class TrackManager {
    constructor(baseUrl, pollInterval, logger) {
        this.tracks = [];
        // Map: trackId -> { points: Array, refCount: number }
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
        this.liveTrack = null;
        this.liveTrackListeners = new Set();
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
     * Get points for a specific track (fetches if not cached, increments reference count)
     * @param {string} trackId - The ID of the track
     * @returns {Promise<Array>} Promise that resolves to the track points array
     */
    async getTrackPoints(trackId) {
        let trackData = this.trackData.get(trackId);
        
        // If already cached, increment reference count and return
        if (trackData) {
            trackData.refCount++;
            this.logger.debug(`Track ${trackId} refCount incremented to ${trackData.refCount}`);
            return trackData.points;
        }

        // Otherwise fetch and cache with refCount = 1
        this.logger.debug(`Fetching points for track ${trackId}...`);
        try {
            const response = await fetch(`${this.baseUrl}/${trackId}.json`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const points = data.points || [];
            this.trackData.set(trackId, { points, refCount: 1 });
            this.logger.debug(`Track ${trackId} cached with refCount = 1`);
            return points;
        } catch (error) {
            this.logger.error(`Error fetching track points for ${trackId}:`, error);
            throw error;
        }
    }

    /**
     * Release a reference to track points (decrements reference count, removes cache if count reaches 0)
     * @param {string} trackId - The ID of the track
     */
    releaseTrackPoints(trackId) {
        const trackData = this.trackData.get(trackId);
        if (!trackData) {
            this.logger.warn(`Attempted to release track ${trackId} but it's not cached`);
            return;
        }

        trackData.refCount--;
        this.logger.debug(`Track ${trackId} refCount decremented to ${trackData.refCount}`);

        if (trackData.refCount <= 0) {
            this.trackData.delete(trackId);
            this.logger.debug(`Track ${trackId} removed from cache (refCount reached 0)`);
        }
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
                // Fetch update.json to check for tracks.json and live track updates
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

                // Check for live track updates (if applicable)
                const liveTrackId = updateData.liveTrack?.id;
                if (liveTrackId && liveTrackId !== this.liveTrack?.id) {
                    this.logger.info(`Live track updated to ${liveTrackId}`);
                    this.liveTrack = {
                        id: liveTrackId,
                        pointCount: updateData.liveTrack.pointCount || 0
                    };
                    this.notifyLiveTrackListeners(this.liveTrack);
                    // Optionally, notify listeners about live track change here
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
     * Notify live track listeners of an update
     * @param {Object} liveTrack - The live track metadata
     */
    _notifyLiveTrackListeners(liveTrack) {
        this.liveTrackListeners.forEach(listener => {
            try {
                listener(liveTrack);
            } catch (error) {
                this.logger.error('Error in live track listener:', error);
            }
        });
    }
}

// TrackManager module: manages track data and updates.
export default class TrackManager {
    constructor(tracksJson) {
        this.tracks = tracksJson.tracks || [];
        // Map: trackId -> { pointCount: number, listeners: Set<Function> }
        this.trackData = new Map();
        this.fetchInterval = null;
        this.pollingInterval = 10000; // default polling interval in ms
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
                console.error(`Error invoking listener with existing points for track ${trackId}:`, error);
            }
        } else {
            // If no points yet, fetch them immediately
            try {
                await this.fetchTrackPoints(trackId);
            } catch (error) {
                console.error(`Error fetching initial points for track ${trackId}:`, error);
            }
        }

        return () => {
            const data = this.trackData.get(trackId);
            if (data) {
                data.listeners.delete(listener);
                if (data.listeners.size === 0) {
                    this.trackData.delete(trackId);
                    this.stopPollingTrack(trackId);
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
     * Fetch points for a specific track
     * @param {string} trackId - The ID of the track to fetch
     * @returns {Promise} Promise that resolves when points are fetched
     */
    async fetchTrackPoints(trackId) {
        try {
            let dataUrl = '';
            if (window.location.href.includes('https://zer0complexity.github.io')) {
                dataUrl = 'https://zer0complexity.github.io/killicker-data';
            } else {
                dataUrl = 'killicker-data';
            }

            const response = await fetch(`${dataUrl}/${trackId}.json`);
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
            console.error(`Error fetching track points for ${trackId}:`, error);
            throw error;
        }
    }

    /**
     * Start polling for a specific track
     * @param {string} trackId - The ID of the track to poll
     */
    startPollingTrack(trackId) {
        // Only start polling if we have listeners for this track
        if (!this.trackData.has(trackId)) {
            return;
        }

        if (this.fetchInterval) {
            clearInterval(this.fetchInterval);
        }

        this.fetchInterval = setInterval(async () => {
            try {
                await this.fetchTrackPoints(trackId);
            } catch (error) {
                console.error(`Error polling track ${trackId}:`, error);
            }
        }, this.pollingInterval);
    }

    /**
     * Stop polling for a specific track
     */
    stopPollingTrack(trackId) {
        if (this.fetchInterval) {
            clearInterval(this.fetchInterval);
            this.fetchInterval = null;
        }
    }

    /**
     * Clean up resources
     */
    destroy() {
        this.trackData.clear();
        if (this.fetchInterval) {
            clearInterval(this.fetchInterval);
            this.fetchInterval = null;
        }
    }

    // Private method to notify listeners of new points
    notifyListeners(trackId, newPoints) {
        const trackData = this.trackData.get(trackId);
        if (trackData?.listeners) {
            trackData.listeners.forEach(listener => {
                try {
                    listener(newPoints);
                } catch (error) {
                    console.error(`Error in track ${trackId} listener:`, error);
                }
            });
        }
    }
}
// TrackView module: handles rendering polyline and markers on a Google Map.
export default class TrackView {

    static domParser = new DOMParser();
    static circleDiameterPixels = 32;
    static arrowSvgCache = null;

    static async loadArrowSvg(colour) {
        if (!TrackView.arrowSvgCache) {
            try {
                const response = await fetch('images/arrow_up.svg');
                TrackView.arrowSvgCache = await response.text();
            } catch (error) {
                console.error('Failed to load arrow_up.svg:', error);
                // Fallback to a simple arrow
                TrackView.arrowSvgCache = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="${TrackView.circleDiameterPixels}" height="${TrackView.circleDiameterPixels}" viewBox="0 0 128 128">
                        <polygon points="64,8 120,120 8,120" fill="FILL_COLOR"/>
                    </svg>
                `;
            }
        }
        // Replace FILL_COLOR placeholder with actual color
        return TrackView.arrowSvgCache.replace(/FILL_COLOR/g, colour);
    }

    constructor(map, trackColour) {
        this.map = map;
        this.trackColour = trackColour;
        this.trackPoints = [];
        this.infoWindow = new google.maps.InfoWindow();
        this.markers = [];
        this.prevPointData = null;

        // create the polyline
        this.track = new google.maps.Polyline({
            geodesic: true,
            clickable: false,
            strokeColor: trackColour,
            strokeOpacity: 1.0,
            strokeWeight: 6,
        });
        this.track.setMap(this.map);
    }

    addPointToTrack(position, centerMap) {
        this.trackPoints.push(position);
        this.track.setPath(this.trackPoints);
        if (centerMap) {
            this.map.setCenter(position);
        }
    }

    placeMarker(pointData, svg) {
        const pointElement = TrackView.domParser.parseFromString(svg, 'image/svg+xml').documentElement;

        // Set dimensions for the arrow
        pointElement.setAttribute('width', TrackView.circleDiameterPixels);
        pointElement.setAttribute('height', TrackView.circleDiameterPixels);

        // Rotate the arrow around its center if COG (radians) is present
        let angle = null;
        if (pointData && typeof pointData.COG === 'number' && isFinite(pointData.COG)) {
            angle = (pointData.COG * (180 / Math.PI)) % 360; // radians -> degrees
            if (angle < 0) angle += 360;
        }
        if (angle !== null) {
            // Prefer transforming the outer <g> that contains the geometry
            const outerGroup = pointElement.querySelector('g');
            if (outerGroup) {
                const existing = outerGroup.getAttribute('transform') || '';
                const rotateStr = ` rotate(${angle} 64 64)`; // viewBox center
                outerGroup.setAttribute('transform', `${existing}${rotateStr}`.trim());
            } else {
                // Fallback: use CSS transform on the root SVG
                pointElement.style.transformBox = 'fill-box';
                pointElement.style.transformOrigin = '50% 50%';
                pointElement.style.transform = `rotate(${angle}deg)`;
            }
        }

        const marker = new google.maps.marker.AdvancedMarkerElement({
            map: this.getMapForMarker(pointData.position),
            position: pointData.position,
            title: pointData.timestamp || '',
            content: pointElement,
            anchorLeft: '-50%',
            anchorTop: '-50%',
            gmpClickable: true,
        });
        this.setMarkerDiameter(marker, TrackView.getMarkerDiameter(this.map.getZoom()));
        marker.addListener("click", () => {
            if (this.infoWindow.anchor === marker) {
                this.infoWindow.close();
            } else {
                const ts = pointData.timestamp ? new Date(pointData.timestamp).toUTCString() : 'No timestamp';
                const metadataLines = [];
                for (const key in pointData) {
                    if (key !== 'position' && key !== 'timestamp' && pointData[key] !== undefined) {
                        const convertedValue = TrackView.convertValue(key, pointData[key]);
                        metadataLines.push(`<strong>${key}:</strong> ${convertedValue.value}${convertedValue.unit}`);
                    }
                }
                this.infoWindow.setContent(`
                    <html>
                        <strong>${ts}</strong><br>
                        ${metadataLines.join('<br>')}
                    </html>
                `);
                this.infoWindow.open(marker.map, marker);
            }
        });

        return marker;
    }

    static convertValue(key, value) {
        switch (key) {
            case 'Depth':
                return { value: value < 42000000 ? (value * 3.28084).toFixed(value > 3 ? 0 : 1) : '--', unit: ' ft' };
            case 'AWA':
                return { value: (Math.abs(value) * (180 / Math.PI)).toFixed(0), unit: `° ${value < 0 ? 'port' : 'starboard'}` };
            case 'AWS':
            case 'SOG':
                return { value: (value * 1.94384).toFixed(1), unit: ' knots' };
            case 'COG':
                return { value: (value * (180 / Math.PI)).toFixed(0), unit: '° T' };
            default:
                return { value: value, unit: '' };
        }
    }

    /**
     * Process an array of point objects from the data source and render any new points
     */
    async processPoints(points) {
        if (!points || points.length === 0) return;

        // Load arrow SVG once
        const arrowSvg = await TrackView.loadArrowSvg(this.trackColour);

        // Treat incoming points as a delta to append
        points.forEach(element => {
            if (this.markers.length > 0 && this.prevPointData) {
                this.markers.at(-1).setMap(null);  // Remove the last transparent marker
                this.markers.pop();
                this.markers.push(this.placeMarker(this.prevPointData, arrowSvg));
            }
            this.addPointToTrack(element.position, this.markers.length === 0);
            this.prevPointData = element;
            this.markers.push(this.placeMarker(element, arrowSvg));
        });
    }

    updateMarkers() {
        const zoom = this.map.getZoom();
        const diameter = TrackView.getMarkerDiameter(zoom);
        this.markers.forEach(element => {
            const svg = element.content;
            this.setMarkerDiameter(element, diameter);
            element.setMap(this.getMapForMarker(element.position));
        });
    }

    setMarkerDiameter(marker, diameter) {
        const svg = marker.content;
        svg.setAttribute('width', diameter);
        svg.setAttribute('height', diameter);
    }

    getMapForMarker(position) {
        const zoom = this.map.getZoom();
        const bounds = this.map.getBounds();
        if (bounds.contains(position) && zoom >= 11) {
            return this.map;
        } else {
            return null;
        }
    }

    static getMarkerDiameter(zoom) {
        return TrackView.circleDiameterPixels * (zoom / 20);
    }

    // Remove all visuals from the map and clear internal state to allow GC
    destroy() {
        try {
            // remove markers
            if (this.markers && this.markers.length) {
                this.markers.forEach(m => {
                    try { m.setMap(null); } catch (e) { /* ignore */ }
                });
                this.markers.length = 0;
            }
            // remove polyline
            if (this.track) {
                try { this.track.setMap(null); } catch (e) { /* ignore */ }
                this.track = null;
            }
            // close this instance's info window
            if (this.infoWindow) {
                try { this.infoWindow.close(); } catch (e) { /* ignore */ }
                this.infoWindow = null;
            }
            // clear other references
            this.trackPoints = [];
            this.prevPointData = null;
            this.map = null;
        } catch (err) {
            console.error('Error destroying TrackView:', err);
        }
    }
}

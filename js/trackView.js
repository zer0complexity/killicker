// TrackView module: handles rendering polyline and markers on a Google Map.
export default class TrackView {

    static domParser = new DOMParser();
    static circleDiameterPixels = 32;

    static circleSvg(colour = '#FF9000') {
        return `
            <svg xmlns="http://www.w3.org/2000/svg" width="${TrackView.circleDiameterPixels}" height="${TrackView.circleDiameterPixels}" viewBox="0 0 200 200">
                <path stroke="#000000" stroke-width="4" fill="${colour}" d="M 100 50 A 50 50 0 1 1 100 150 A 50 50 0 1 1 100 50"/>
            </svg>
        `;
    }
    static circleSvgTransparent = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${TrackView.circleDiameterPixels}" height="${TrackView.circleDiameterPixels}" viewBox="0 0 200 200">
            <path stroke="#00000000" stroke-width="4" fill="#FF900000" d="M 100 50 A 50 50 0 1 1 100 150 A 50 50 0 1 1 100 50"/>
        </svg>
    `;

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
            strokeColor: trackColour, // "#FF9000",
            strokeOpacity: 1.0,
            strokeWeight: 6,
            icons: [
                {
                    icon: {
                        path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                        fillColor: "#FF0050",
                        fillOpacity: 1,
                        strokeColor: "#000000",
                        strokeWeight: 2,
                        anchor: new google.maps.Point(0, 1),
                    },
                    offset: '100%',
                    repeat: '0px',
                }
            ]
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
    processPoints(points) {
        if (!points || points.length === 0) return;
        const trackLength = this.track.getPath().length;
        if (points.length > trackLength) {
            points.slice(trackLength, points.length).forEach(element => {
                const trackColour = TrackView.circleSvg(this.trackColour);
                if (this.markers.length > 0 && this.prevPointData) {
                    this.markers.at(-1).setMap(null);  // Remove the last transparent marker
                    this.markers.pop();
                    this.markers.push(this.placeMarker(this.prevPointData, trackColour));
                }
                this.addPointToTrack(element.position, this.markers.length === 0);
                this.prevPointData = element;
                if (this.markers.length === 0) {
                    this.markers.push(this.placeMarker(element, trackColour));
                } else {
                    this.markers.push(this.placeMarker(element, TrackView.circleSvgTransparent));
                }
            });
        }
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
        if (bounds.contains(position) && zoom >= 10) {
            return this.map;
        } else {
            return null;
        }
    }

    static getMarkerDiameter(zoom) {
        return TrackView.circleDiameterPixels * (zoom / 14);
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

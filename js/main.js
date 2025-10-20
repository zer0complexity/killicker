let trackPoints = [];
let track = null;
const domParser = new DOMParser();
const circleSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 200 200">
        <path stroke="#000000" stroke-width="4" fill="#FF9000" d="M 100 50 A 50 50 0 1 1 100 150 A 50 50 0 1 1 100 50"/>
    </svg>
`;
const circleSvgTransparent = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 200 200">
        <path stroke="#00000000" stroke-width="4" fill="#FF900000" d="M 100 50 A 50 50 0 1 1 100 150 A 50 50 0 1 1 100 50"/>
    </svg>
`;
let infoWindow = null;
let markers = [];
let prevPointData = null;


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
    });
}


async function fetchAndProcessJsonFile(url, callback) {
    try {
        const urlObject = new URL(url, window.location.href);
        const response = await fetch(urlObject.href);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        response.json().then(data => callback(data));
    } catch (error) {
        console.error("Error fetching or processing JSON file:", error);
    }
}

function getNewData(map, dataUrl = null) {
    fetchAndProcessJsonFile(`${dataUrl}/files.json`, (data) => {
        if (data.files && data.files.length > 0) {
            const latestFile = data.files.at(-1);
            fetchAndProcessJsonFile(`${dataUrl}/${latestFile}`, (jsonData) => {
                const trackLength = track.getPath().length;
                if (jsonData.points && jsonData.points.length > trackLength) {
                    jsonData.points.slice(trackLength, jsonData.points.length).forEach(element => {
                        if (markers.length > 0 && prevPointData) {
                            markers.at(-1).setMap(null);  // Remove the last transparent marker
                            markers.pop();
                            markers.push(placeMarker(prevPointData, circleSvg, map));
                        }
                        addPointToTrack(element.position, map, markers.length === 0);
                        prevPointData = element;
                        // Add a transparent marker at the current position to allow info window interaction, unless it's the first point
                        if (markers.length === 0) {
                            markers.push(placeMarker(element, circleSvg, map));
                        } else {
                            markers.push(placeMarker(element, circleSvgTransparent, map));
                        }
                    });
                }
            });
        }
    });
}


function addPointToTrack(position, map, centerMap) {
    trackPoints.push(position);
    track.setPath(trackPoints);
    if (centerMap) {
        map.setCenter(position);
    }
}


function placeMarker(pointData, svg, map) {
    const pointElement = domParser.parseFromString(svg, 'image/svg+xml').documentElement;

    const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: pointData.position,
        title: pointData.timestamp || '',
        content: pointElement,
        anchorLeft: '-50%',
        anchorTop: '-50%',
        gmpClickable: true,
    });
    marker.addListener("click", () => {
        if (infoWindow.anchor === marker) {
            infoWindow.close();
        } else {
            const ts = pointData.timestamp ? new Date(pointData.timestamp).toUTCString() : 'No timestamp';
            const metadataLines = [];
            for (const key in pointData) {
                if (key !== 'position' && key !== 'timestamp' && pointData[key] !== undefined) {
                    const convertedValue = convertValue(key, pointData[key]);
                    metadataLines.push(`<strong>${key}:</strong> ${convertedValue.value}${convertedValue.unit}`);
                }
            }
            infoWindow.setContent(`
                <html>
                    <strong>${ts}</strong><br>
                    ${metadataLines.join('<br>')}
                </html>
            `);
            infoWindow.open(marker.map, marker);
        }
    });

    return marker;
}


function convertValue(key, value) {
    // Add conversions as needed
    switch (key) {
        case 'Depth':
            // SignalK depth is in meters
            return { value: value < 42000000 ? (value * 3.28084).toFixed(value > 3 ? 0 : 1) : '--', unit: ' ft' };
        case 'AWA':
            // SignalK AWA is in radians
            return {
                value: (Math.abs(value) * (180 / Math.PI)).toFixed(0), unit: `° ${value < 0 ? 'port' : 'starboard'}`
            };
        case 'AWS':
        case 'SOG':
            // SignalK AWS is in m/s
            return { value: (value * 1.94384).toFixed(1), unit: ' knots' };
        case 'COG':
            // SignalK COG is in radians
            return { value: (value * (180 / Math.PI)).toFixed(0), unit: '° T' };
        default:
            return { value: value, unit: '' };
    }
}


initMap().then((map) => {
    track = new google.maps.Polyline({
        geodesic: true,
        clickable: false,
        strokeColor: "#FF9000",
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
    track.setMap(map);
    infoWindow = new google.maps.InfoWindow();

    let dataUrl = '';
    if (window.location.href.includes('https://zer0complexity.github.io')) {
        console.log('Using GitHub Pages data URL');
        dataUrl = 'https://zer0complexity.github.io/killicker-data';
    } else {
        console.log('Using local data URL');
        dataUrl = 'killicker-data';
    }
    dataUrl = 'https://zer0complexity.github.io/killicker-data';
    getNewData(map, dataUrl);  // Initial data fetch
    const intervalId = setInterval(getNewData, 10000, map, dataUrl);  // Fetch new data every 10 seconds
});

let pointCount = 0;
let trackPoints = [];
let track = null;
const domParser = new DOMParser();
const circleSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 200 200">
        <path stroke="#000000" stroke-width="4" fill="#FF9000" d="M 100 50 A 50 50 0 1 1 100 150 A 50 50 0 1 1 100 50"/>
    </svg>
`;
let prevPointData = null;

async function initMap() {
    // Request libraries when needed, not in the script tag.
    const { Map } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");

    const position = { lat: 44.74979194815116, lng: -79.8512010048997 };    // Wye Heritage Marina

    // The map, centered at position
    return new google.maps.Map(document.getElementById("map"), {
        zoom: 8,
        // center: position,
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

function getNewData(map) {
    fetchAndProcessJsonFile('data/files.json', (data) => {
        if (data.files && data.files.length > 0) {
            const latestFile = data.files.at(-1);
            fetchAndProcessJsonFile(`data/${latestFile}`, (jsonData) => {
                if (jsonData.points && jsonData.points.length > pointCount) {
                    jsonData.points.slice(pointCount, jsonData.points.length).forEach(element => {
                        placeMarker(prevPointData, element, map);
                        prevPointData = element;
                    });
                    pointCount = jsonData.points.length;
                }
            });
        }
    });
}


function placeMarker(prevPointData, pointData, map) {
    const pointElement = domParser.parseFromString(circleSvg, 'image/svg+xml').documentElement;

    if (prevPointData) {
        const marker = new google.maps.marker.AdvancedMarkerElement({
            map,
            position: prevPointData.position,
            title: 'Uluru\nAnd another line.',
            content: pointElement,
            anchorLeft: '-50%',
            anchorTop: '-50%',
        });
    }

    trackPoints.push(pointData.position);
    track.setPath(trackPoints);
    map.setCenter(pointData.position);
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

    getNewData(map);  // Initial data fetch
    const intervalId = setInterval(getNewData, 5000, map);
});

let pointCount = 0;

async function initMap() {
    // Request libraries when needed, not in the script tag.
    const { Map } = await google.maps.importLibrary("maps");
    const { AdvancedMarkerElement, PinElement } = await google.maps.importLibrary("marker");

    const position = { lat: 44.74979194815116, lng: -79.8512010048997 };    // Wye Heritage Marina

    // The map, centered at position
    return new google.maps.Map(document.getElementById("map"), {
        zoom: 14,
        center: position,
        mapId: "cf429fad5670f355c2f94461",
        disableDefaultUI: true,
    });
}


async function fetchAndProcessJsonFile(url, callback) {
    try {
        const urlObject = new URL(url, window.location.href);
        console.log("Fetching URL:", urlObject.href);
        const response = await fetch(urlObject.href);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const jsonData = await response.json();

        callback(jsonData);
    } catch (error) {
        console.error("Error fetching or processing JSON file:", error);
    }
}

function getNewData(map) {
    fetchAndProcessJsonFile('data/files.json', (data) => {
        if (data.files && data.files.length > 0) {
            const latestFile = data.files.at(-1);
            console.log("Latest file:", latestFile);
            fetchAndProcessJsonFile(`data/${latestFile}`, (jsonData) => {
                if (jsonData.points && jsonData.points.length > pointCount) {
                    jsonData.points.slice(pointCount, jsonData.points.length).forEach(element => {
                        console.log("New point:", element);
                        placeMarker(element, map);
                    });
                    pointCount = jsonData.points.length;
                    console.log(`New points added. Total points: ${pointCount}`);
                } else {
                    console.log("No new points added.");
                }
            });
        } else {
            console.log("No files found in files.json");
        }
    });
}


function placeMarker(pointData, map) {
    console.log("Map:", map);
    const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: pointData.position,
        title: 'Uluru',
    });
    map.setCenter(pointData.position);
}


initMap().then((map) => {
    console.log("Map initialized:", map);
    getNewData(map);  // Initial data fetch
    const intervalId = setInterval(getNewData, 5000, map);
});

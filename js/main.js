
async function initMap() {
    // Request libraries when needed, not in the script tag.
    const { Map } = await google.maps.importLibrary("maps");

    const position = { lat: 44.74979194815116, lng: -79.8512010048997 };    // Wye Heritage Marina

    // The map, centered at position
    let map = new google.maps.Map(document.getElementById("map"), {
        zoom: 14,
        center: position,
        mapId: "cf429fad5670f355c2f94461",
        disableDefaultUI: true,
    });
}

initMap();
let pointCount = 0;

async function initMap() {
    // Request libraries when needed, not in the script tag.
    const { Map } = await google.maps.importLibrary("maps");

    const position = { lat: 44.74979194815116, lng: -79.8512010048997 };    // Wye Heritage Marina

    // The map, centered at position
    const map = new google.maps.Map(document.getElementById("map"), {
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
        // console.log("JSON data:", jsonData);

        callback(jsonData);
    } catch (error) {
        console.error("Error fetching or processing JSON file:", error);
    }
}


function getNewData() {
    fetchAndProcessJsonFile('data/files.json', (data) => {
        if (data.files && data.files.length > 0) {
            const latestFile = data.files.at(-1);
            console.log("Latest file:", latestFile);
            fetchAndProcessJsonFile(`data/${latestFile}`, (jsonData) => {
                if (jsonData.points && jsonData.points.length > pointCount) {
                    jsonData.points.slice(pointCount, jsonData.points.length).forEach(element => {
                        console.log("New point:", element);
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


// Bootstrap loader for the Google Maps JavaScript API
(g=>{var h,a,k,p="The Google Maps JavaScript API",c="google",l="importLibrary",q="__ib__",m=document,b=window;b=b[c]||(b[c]={});var d=b.maps||(b.maps={}),r=new Set,e=new URLSearchParams,u=()=>h||(h=new Promise(async(f,n)=>{await (a=m.createElement("script"));e.set("libraries",[...r]+"");for(k in g)e.set(k.replace(/[A-Z]/g,t=>"_"+t[0].toLowerCase()),g[k]);e.set("callback",c+".maps."+q);a.src=`https://maps.${c}apis.com/maps/api/js?`+e;d[q]=f;a.onerror=()=>h=n(Error(p+" could not load."));a.nonce=m.querySelector("script[nonce]")?.nonce||"";m.head.append(a)}));d[l]?console.warn(p+" only loads once. Ignoring:",g):d[l]=(f,...n)=>r.add(f)&&u().then(()=>d[l](f,...n))})({
    key: "GOOGLE_MAPS_API_KEY",
    v: "weekly",
    // Use the 'v' parameter to indicate the version to use (weekly, beta, alpha, etc.).
    // Add other bootstrap parameters as needed, using camel case.
});
initMap();
const intervalId = setInterval(getNewData, 5000);

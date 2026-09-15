/**
 * nearbyPlaces.js
 * ---------------
 * Finds real hospitals near a given lat/lng, anywhere in the world, using
 * OpenStreetMap's free Overpass API (no API key needed). This replaces a
 * fixed local list so "nearest hospital" is genuinely accurate wherever a
 * report actually comes from - not just the one demo city bundled with
 * data/hospitals.json.
 *
 * Falls back to the local data/hospitals.json list if:
 *  - the network request fails or times out
 *  - the query returns zero results (e.g. very remote area, or the demo
 *    environment's network blocks external calls)
 * This fallback must NEVER throw or block report submission.
 *
 * Shelters are intentionally NOT fetched live: unlike hospitals, emergency
 * shelters generally aren't in a consistent public registry (they're often
 * set up ad hoc during a disaster), so data/shelters.json stays the source
 * of truth - edit it with real shelters for your area/organization.
 */

const https = require("https");

const OVERPASS_HOST = "overpass-api.de";
const OVERPASS_PATH = "/api/interpreter";
const REQUEST_TIMEOUT_MS = 6000;
const SEARCH_RADIUS_M = 8000; // 8km

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Queries Overpass for amenity=hospital nodes/ways within SEARCH_RADIUS_M of
 * (lat, lng). Resolves to an array (possibly empty) - never rejects.
 */
function fetchLiveHospitals(lat, lng) {
  return new Promise((resolve) => {
    const query = `[out:json][timeout:5];
(
  node["amenity"="hospital"](around:${SEARCH_RADIUS_M},${lat},${lng});
  way["amenity"="hospital"](around:${SEARCH_RADIUS_M},${lat},${lng});
);
out center 20;`;

    const postData = "data=" + encodeURIComponent(query);
    const options = {
      hostname: OVERPASS_HOST,
      path: OVERPASS_PATH,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
        "User-Agent": "RescueLink-Hackathon-Demo/1.0 (contact: demo@example.com)",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const elements = Array.isArray(json.elements) ? json.elements : [];
          const hospitals = elements
            .map((el) => {
              const hLat = el.lat ?? el.center?.lat;
              const hLng = el.lon ?? el.center?.lon;
              if (hLat == null || hLng == null) return null;
              return {
                id: "OSM-" + el.id,
                name: el.tags?.name || "Unnamed Hospital",
                lat: hLat,
                lng: hLng,
                type: el.tags?.operator_type === "government" ? "Government" : "Unknown",
                emergency: el.tags?.emergency === "yes",
                contact: el.tags?.phone || el.tags?.["contact:phone"] || "Not listed",
                specialties: [],
                source: "openstreetmap",
              };
            })
            .filter(Boolean);
          resolve(hospitals);
        } catch (err) {
          resolve([]);
        }
      });
    });
    req.on("error", () => resolve([]));
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      resolve([]);
    });
    req.write(postData);
    req.end();
  });
}

/**
 * Returns the nearest `n` hospitals to (lat, lng), preferring live OSM data
 * and falling back to the provided local list if OSM is unavailable/empty.
 * Every returned item includes distanceKm and etaMinutes.
 */
async function nearestHospitals(lat, lng, localHospitalsFallback, n, etaFn) {
  let pool = await fetchLiveHospitals(lat, lng);
  let source = "openstreetmap";
  if (!pool.length) {
    pool = localHospitalsFallback;
    source = "local";
  }
  const ranked = pool
    .map((item) => {
      const distanceKm = Math.round(haversineKm(lat, lng, item.lat, item.lng) * 10) / 10;
      return { ...item, distanceKm, etaMinutes: etaFn(distanceKm) };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, n);
  return { hospitals: ranked, source };
}

module.exports = { nearestHospitals, fetchLiveHospitals };

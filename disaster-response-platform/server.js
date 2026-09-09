try { require("dotenv").config(); } catch (e) { /* dotenv optional - falls back to process.env */ }

const path = require("path");
const fs = require("fs");
const https = require("https");
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const { classifySeverity } = require("./severityEngine");
const { getChatbotReply } = require("./chatbotEngine");
const { sendEmailAlert } = require("./alertEngine");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "data", "reports.json");
const SHELTERS_FILE = path.join(__dirname, "data", "shelters.json");
const HOSPITALS_FILE = path.join(__dirname, "data", "hospitals.json");
const RESPONDERS_FILE = path.join(__dirname, "data", "responders.json");
const AUDIO_DIR = path.join(__dirname, "public", "uploads", "audio");

// Ensure the audio upload folder exists (created at runtime, not committed).
fs.mkdirSync(AUDIO_DIR, { recursive: true });

// Map common browser recording MIME types to file extensions.
const AUDIO_EXT_BY_MIME = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

// Default map center (Vizianagaram, Andhra Pradesh) - used as a last-resort
// fallback so "nearest shelters/hospitals" still has something to show even
// when an address can't be geocoded and no GPS coordinates were captured.
const DEFAULT_LAT = 18.1067;
const DEFAULT_LNG = 83.4126;

app.use(cors());
// Voice recordings arrive as base64 inside JSON, so allow a larger body
// than the default 100kb (a short 30-60s clip is typically well under 5mb).
app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ---------- simple JSON-file persistence ----------
function loadReports() {
  try {
    if (!fs.existsSync(DB_FILE)) return [];
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    return raw.trim() ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to load reports.json, starting fresh:", err.message);
    return [];
  }
}

function saveReports(reports) {
  fs.writeFileSync(DB_FILE, JSON.stringify(reports, null, 2), "utf-8");
}

let reports = loadReports();

function loadJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

// ---------- Helpers ----------
function sortReportsByPriority(list) {
  return [...list].sort((a, b) => {
    if (b.severity.score !== a.severity.score) return b.severity.score - a.severity.score;
    return new Date(a.createdAt) - new Date(b.createdAt); // older first if tie
  });
}

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

function nearestN(lat, lng, items, n = 1) {
  return [...items]
    .map((item) => {
      const distanceKm = Math.round(haversineKm(lat, lng, item.lat, item.lng) * 10) / 10;
      return { ...item, distanceKm, etaMinutes: estimateEtaMinutes(distanceKm) };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, n);
}

// Average speed assumption for a responder travelling to the scene, plus a
// fixed "getting ready to leave" buffer. This is a ROUGH ESTIMATE for
// planning purposes only - it is not based on any real vehicle's live GPS,
// since this demo has no real responders to track. Roads, weather, and
// disaster conditions can make real travel much slower than this assumes.
const AVG_RESPONSE_SPEED_KMH = 25;
const DISPATCH_PREP_MINUTES = 8;

function estimateEtaMinutes(distanceKm) {
  const travelMinutes = (distanceKm / AVG_RESPONSE_SPEED_KMH) * 60;
  return Math.max(5, Math.round(travelMinutes + DISPATCH_PREP_MINUTES));
}

function nearestResponder(lat, lng) {
  const responders = loadJSON(RESPONDERS_FILE);
  const available = responders.filter((r) => r.available);
  if (!available.length || lat == null || lng == null) return null;

  return [...available]
    .map((r) => {
      const distanceKm = Math.round(haversineKm(lat, lng, r.lat, r.lng) * 10) / 10;
      return {
        ...r,
        distanceKm,
        etaMinutes: estimateEtaMinutes(distanceKm),
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

/**
 * Saves a base64-encoded voice recording to disk and returns a public URL
 * for it (or null if the input is missing/invalid). Used so illiterate or
 * low-literacy users can report an emergency by voice instead of typing -
 * the raw audio is always kept for a human responder to listen to, even
 * when browser speech-to-text isn't available or the transcript is empty.
 */
function saveVoiceRecording(reportId, audioData, audioMimeType) {
  try {
    if (!audioData || typeof audioData !== "string") return null;
    const ext = AUDIO_EXT_BY_MIME[audioMimeType] || "webm";
    const filename = `${reportId}.${ext}`;
    const filePath = path.join(AUDIO_DIR, filename);
    // audioData is a data URL ("data:audio/webm;base64,AAAA...") or raw base64
    const base64 = audioData.includes(",") ? audioData.split(",")[1] : audioData;
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    return `/uploads/audio/${filename}`;
  } catch (err) {
    console.error("Failed to save voice recording:", err.message);
    return null;
  }
}

/**
 * Free geocoding via OpenStreetMap's Nominatim search API (no API key needed).
 * Used when a citizen types an address instead of granting GPS location, so
 * "nearest shelters/hospitals" still works. Resolves to null on any failure
 * (network issue, no results, timeout) so callers can fall back gracefully -
 * this must never crash a report submission.
 */
function geocodeAddress(address) {
  return new Promise((resolve) => {
    if (!address || typeof address !== "string" || !address.trim()) {
      return resolve(null);
    }
    const query = encodeURIComponent(address.trim());
    const options = {
      hostname: "nominatim.openstreetmap.org",
      path: `/search?format=json&limit=1&q=${query}`,
      headers: {
        // Nominatim's usage policy requires a descriptive User-Agent.
        "User-Agent": "RescueLink-Hackathon-Demo/1.0 (contact: demo@example.com)",
      },
    };
    const req = https.get(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (Array.isArray(json) && json.length > 0) {
            resolve({ lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon) });
          } else {
            resolve(null);
          }
        } catch (err) {
          resolve(null);
        }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(4000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

// ---------- Routes ----------

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", useLLM: process.env.USE_LLM === "true" });
});

// Shelters & hospitals
app.get("/api/shelters", (req, res) => {
  res.json(loadJSON(SHELTERS_FILE));
});
app.get("/api/hospitals", (req, res) => {
  res.json(loadJSON(HOSPITALS_FILE));
});
app.get("/api/responders", (req, res) => {
  res.json(loadJSON(RESPONDERS_FILE));
});

// Nearest shelters/hospitals to a point
app.get("/api/nearest", (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: "lat and lng query params required" });
  }
  const shelters = loadJSON(SHELTERS_FILE);
  const hospitals = loadJSON(HOSPITALS_FILE);
  res.json({
    shelters: nearestN(lat, lng, shelters, 1),
    hospitals: nearestN(lat, lng, hospitals, 1),
  });
});

// List all reports (sorted by priority)
app.get("/api/reports", (req, res) => {
  res.json(sortReportsByPriority(reports));
});

// Stats for dashboard header
app.get("/api/stats", (req, res) => {
  const total = reports.length;
  const critical = reports.filter((r) => r.severity.level === "Critical").length;
  const high = reports.filter((r) => r.severity.level === "High").length;
  const pending = reports.filter((r) => r.status === "pending").length;
  const resolved = reports.filter((r) => r.status === "resolved").length;
  res.json({ total, critical, high, pending, resolved });
});

// Submit a new emergency report
app.post("/api/reports", async (req, res) => {
  try {
    const {
      text, lat, lng, address, name, phone, language, peopleCount,
      emergencyType, audioData, audioMimeType,
    } = req.body;

    const hasText = typeof text === "string" && text.trim().length > 0;
    const hasAudio = typeof audioData === "string" && audioData.length > 0;

    if (!hasText && !hasAudio) {
      return res.status(400).json({ error: "Report text or a voice recording is required" });
    }

    // If someone recorded a voice message but the browser couldn't
    // transcribe it (unsupported browser, or they simply didn't speak
    // clearly), still create a triage-able report rather than rejecting it -
    // a responder can listen to the attached audio directly.
    const effectiveText = hasText
      ? text.trim()
      : "[Voice message attached - no automatic transcript available. Please listen to the recording.]";

    const severity = await classifySeverity(effectiveText, emergencyType);

    // Resolve a usable lat/lng in priority order:
    // 1. GPS coordinates from the browser (most accurate)
    // 2. Geocoded from the typed address via Nominatim (free, no API key)
    // 3. Fall back to the platform's default map center, so "nearest help"
    //    still returns something rather than nothing.
    let finalLat = typeof lat === "number" ? lat : null;
    let finalLng = typeof lng === "number" ? lng : null;
    let locationSource = finalLat != null && finalLng != null ? "gps" : "none";

    if ((finalLat == null || finalLng == null) && address) {
      const geo = await geocodeAddress(address);
      if (geo) {
        finalLat = geo.lat;
        finalLng = geo.lng;
        locationSource = "geocoded";
      }
    }

    if ((finalLat == null || finalLng == null) && address) {
      // Address was given but couldn't be geocoded (typo, offline, rate
      // limited, etc.) - use the default center as an approximate fallback
      // so nearest-help lookups still work for the demo.
      finalLat = DEFAULT_LAT;
      finalLng = DEFAULT_LNG;
      locationSource = "approximate";
    }

    const id = "REQ-" + Date.now().toString(36).toUpperCase();
    const audioUrl = hasAudio ? saveVoiceRecording(id, audioData, audioMimeType) : null;

    const report = {
      id,
      text: effectiveText,
      isVoiceReport: hasAudio,
      hadTranscript: hasText, // true if speech-to-text (or typing) produced usable text
      audioUrl, // e.g. "/uploads/audio/REQ-XXXX.webm", or null
      lat: finalLat,
      lng: finalLng,
      locationSource, // 'gps' | 'geocoded' | 'approximate' | 'none'
      address: address || null,
      name: name || "Anonymous",
      phone: phone || null,
      language: language || "en",
      peopleCount: peopleCount || null,
      emergencyType: emergencyType || null,
      severity,
      status: "pending", // pending -> dispatched -> resolved
      assignedResponder: null,
      responderDistanceKm: null,
      responderEtaMinutes: null,
      dispatchedAt: null,
      arrivedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    reports.push(report);
    saveReports(reports);

    io.emit("new-report", report);
    io.emit("stats-update");

    // Include nearest help in the response for the citizen UI
    let nearest = { shelters: [], hospitals: [] };
    let nearestResponderForRequest = null;
    if (finalLat != null && finalLng != null) {
      const shelters = loadJSON(SHELTERS_FILE);
      const hospitals = loadJSON(HOSPITALS_FILE);
      nearest = {
        shelters: nearestN(finalLat, finalLng, shelters, 1),
        hospitals: nearestN(finalLat, finalLng, hospitals, 1),
      };
      nearestResponderForRequest = nearestResponder(finalLat, finalLng);
    }

    // Fire-and-forget real email alert to a configured responder inbox (see
    // alertEngine.js). Never awaited into the response - a slow/broken SMTP
    // server must never delay or break report submission for the citizen.
    sendEmailAlert(report, nearest).catch(() => {});

    res.status(201).json({ report, nearest, responder: nearestResponderForRequest });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error while processing report" });
  }
});

// Clear all reports (used by the authority dashboard's "Clear all" action).
// Intentionally simple/unauthenticated - this is a hackathon demo reset
// button, not a production admin API.
app.delete("/api/reports", (req, res) => {
  // Best-effort cleanup of any saved voice recordings so they don't pile up.
  reports.forEach((r) => {
    if (r.audioUrl) {
      const filePath = path.join(__dirname, "public", r.audioUrl.replace(/^\//, ""));
      fs.unlink(filePath, () => {}); // ignore errors (e.g. already missing)
    }
  });
  reports = [];
  saveReports(reports);
  io.emit("reports-cleared");
  io.emit("stats-update");
  res.json({ cleared: true });
});

// Update a report's status (used by authority dashboard)
app.patch("/api/reports/:id", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ["pending", "dispatched", "resolved"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "status must be one of " + validStatuses.join(", ") });
  }
  const idx = reports.findIndex((r) => r.id === id);
  if (idx === -1) return res.status(404).json({ error: "Report not found" });

  const report = reports[idx];

  if (status === "dispatched" && report.status !== "dispatched") {
    const responder = nearestResponder(report.lat, report.lng);
    if (responder) {
      report.assignedResponder = {
        id: responder.id,
        name: responder.name,
        role: responder.role,
        contact: responder.contact,
        baseLat: responder.lat,
        baseLng: responder.lng,
      };
      report.responderDistanceKm = responder.distanceKm;
      report.responderEtaMinutes = responder.etaMinutes;
      report.dispatchedAt = new Date().toISOString();
      report.arrivedAt = null;
    }
  }

  if (status === "resolved") {
    report.arrivedAt = report.arrivedAt || new Date().toISOString();
  }

  report.status = status;
  report.updatedAt = new Date().toISOString();
  saveReports(reports);

  io.emit("update-report", report);
  io.emit("stats-update");

  res.json(reports[idx]);
});

// Chatbot endpoint
app.post("/api/chatbot", (req, res) => {
  const { message, language, emergencyType } = req.body;
  const classification = message
    ? require("./severityEngine").classifyRuleBased(message, emergencyType)
    : null;
  const reply = getChatbotReply(message, language, classification ? classification.disasterType : null);
  res.json({
    reply,
    detected: classification
      ? { disasterType: classification.disasterType, level: classification.level, score: classification.score }
      : null,
  });
});

// Socket connection log (useful for demo / debugging)
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.on("disconnect", () => console.log("Client disconnected:", socket.id));
});

// Fallback to index.html for any non-API route (simple SPA-ish routing)
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

server.listen(PORT, () => {
  console.log(`\n🚨  Disaster Response Platform running at http://localhost:${PORT}\n`);
  console.log(`   USE_LLM=${process.env.USE_LLM === "true" ? "ON (Anthropic API)" : "OFF (rule-based engine)"}`);
});

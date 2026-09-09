// ================= Globals =================
const socket = io();
let map, markersLayer;
let userLocation = null; // {lat, lng}
let allReports = [];
let sheltersData = [];
let hospitalsData = [];
let selectedEmergencyType = null; // 'flood' | 'cyclone' | 'fire' | 'earthquake' | 'medical' | 'landslide' | 'other'

// ================= Voice recording =================
// Lets people who can't read/write report an emergency by speaking instead
// of typing. Two things happen in parallel when recording starts:
//  1. MediaRecorder captures the raw audio, so a responder can always listen
//     to it directly, regardless of browser support for transcription.
//  2. The Web Speech API (where supported - mainly Chrome/Edge/Android) live
//     transcribes speech to text and fills the description field, so most
//     users get a fully text-searchable report with zero typing.
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBase64 = null;
let recordedMimeType = null;
let speechRecognizer = null;
let isRecording = false;

const SPEECH_LANG_BY_UI_LANG = { en: "en-IN", hi: "hi-IN", te: "te-IN" };

function getSpeechRecognitionClass() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

async function startRecording() {
  if (isRecording) return;
  const recordBtn = document.getElementById("recordBtn");
  const recordStatus = document.getElementById("recordStatus");
  const liveTranscript = document.getElementById("liveTranscript");

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };
    mediaRecorder.onstop = async () => {
      const mimeType = mediaRecorder.mimeType || "audio/webm";
      const blob = new Blob(audioChunks, { type: mimeType });
      recordedMimeType = mimeType;
      recordedAudioBase64 = await blobToBase64(blob);
      const preview = document.getElementById("voicePreview");
      preview.src = URL.createObjectURL(blob);
      preview.style.display = "block";
      document.getElementById("reRecordBtn").style.display = "inline-block";
      stream.getTracks().forEach((t) => t.stop());
    };
    mediaRecorder.start();
    isRecording = true;
    recordBtn.classList.add("recording");
    document.getElementById("recordBtnLabel").textContent = t("btn_stop_recording");
    recordStatus.textContent = t("recording_status");

    // Start live speech-to-text alongside recording, if the browser supports it.
    const SpeechRecognitionClass = getSpeechRecognitionClass();
    if (SpeechRecognitionClass) {
      speechRecognizer = new SpeechRecognitionClass();
      speechRecognizer.lang = SPEECH_LANG_BY_UI_LANG[currentLang] || "en-IN";
      speechRecognizer.continuous = true;
      speechRecognizer.interimResults = true;
      let finalTranscript = document.getElementById("reportText").value
        ? document.getElementById("reportText").value + " "
        : "";

      speechRecognizer.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const chunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += chunk + " ";
          } else {
            interim += chunk;
          }
        }
        document.getElementById("reportText").value = finalTranscript.trim();
        liveTranscript.textContent = interim ? "… " + interim : "";
      };
      speechRecognizer.onerror = () => {
        liveTranscript.textContent = "";
      };
      try {
        speechRecognizer.start();
      } catch (e) {
        speechRecognizer = null;
      }
    } else {
      liveTranscript.textContent = t("no_speech_support");
    }
  } catch (err) {
    recordStatus.textContent = t("mic_denied");
  }
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;
  const recordBtn = document.getElementById("recordBtn");
  recordBtn.classList.remove("recording");
  document.getElementById("recordBtnLabel").textContent = t("btn_record");
  document.getElementById("recordStatus").textContent = t("recording_saved");
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  if (speechRecognizer) {
    try { speechRecognizer.stop(); } catch (e) { /* noop */ }
    speechRecognizer = null;
  }
  document.getElementById("liveTranscript").textContent = "";
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result); // data URL, stripped server-side
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

document.getElementById("recordBtn").addEventListener("click", () => {
  if (isRecording) stopRecording();
  else startRecording();
});

document.getElementById("reRecordBtn").addEventListener("click", () => {
  recordedAudioBase64 = null;
  recordedMimeType = null;
  document.getElementById("voicePreview").style.display = "none";
  document.getElementById("voicePreview").removeAttribute("src");
  document.getElementById("reRecordBtn").style.display = "none";
  document.getElementById("recordStatus").textContent = "";
  startRecording();
});

function resetVoiceRecording() {
  recordedAudioBase64 = null;
  recordedMimeType = null;
  audioChunks = [];
  const preview = document.getElementById("voicePreview");
  preview.style.display = "none";
  preview.removeAttribute("src");
  document.getElementById("reRecordBtn").style.display = "none";
  document.getElementById("recordStatus").textContent = "";
  document.getElementById("liveTranscript").textContent = "";
}

// ================= Emergency type chips =================
document.querySelectorAll("#emergencyTypeChips .chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const alreadyActive = chip.classList.contains("active");
    document.querySelectorAll("#emergencyTypeChips .chip").forEach((c) => c.classList.remove("active"));
    if (!alreadyActive) {
      chip.classList.add("active");
      selectedEmergencyType = chip.dataset.type;
    } else {
      selectedEmergencyType = null; // tap again to deselect
    }
  });
});

// ================= Tabs =================
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "map") {
      setTimeout(() => map && map.invalidateSize(), 100);
    }
    if (btn.dataset.tab === "dashboard") {
      refreshDashboard();
    }
  });
});

// ================= Language =================
document.getElementById("langSelect").value = currentLang;
document.getElementById("langSelect").addEventListener("change", (e) => setLanguage(e.target.value));
function onLanguageChanged() {
  renderReportsTable(allReports);
  renderStats();
}
applyI18n();

// ================= Offline banner =================
window.addEventListener("offline", () => (document.getElementById("connBanner").style.display = "block"));
window.addEventListener("online", () => (document.getElementById("connBanner").style.display = "none"));

// ================= Geolocation =================
document.getElementById("useLocationBtn").addEventListener("click", () => {
  const statusEl = document.getElementById("locationStatus");
  statusEl.textContent = t("locating");
  if (!navigator.geolocation) {
    statusEl.textContent = t("location_denied");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      statusEl.textContent = t("location_found");
    },
    () => {
      statusEl.textContent = t("location_denied");
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
});

// ================= Report submission =================
document.getElementById("reportForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = document.getElementById("reportText").value;
  const name = document.getElementById("reporterName").value;
  const phone = document.getElementById("reporterPhone").value;
  const peopleCount = document.getElementById("peopleCount").value;
  const address = document.getElementById("addressText").value;

  if (!text.trim() && !recordedAudioBase64) {
    alert(t("need_text_or_voice"));
    return;
  }

  if (isRecording) stopRecording(); // don't submit mid-recording

  const payload = {
    text,
    name,
    phone,
    peopleCount: peopleCount ? parseInt(peopleCount, 10) : null,
    address,
    language: currentLang,
    emergencyType: selectedEmergencyType,
    lat: userLocation ? userLocation.lat : null,
    lng: userLocation ? userLocation.lng : null,
    audioData: recordedAudioBase64,
    audioMimeType: recordedMimeType,
  };

  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  const originalText = submitBtn.textContent;
  submitBtn.textContent = "…";

  try {
    const res = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to submit");
    showResult(data.report, data.nearest, data.responder);
    e.target.reset();
    document.getElementById("peopleCount").value = 1;
    document.getElementById("locationStatus").textContent = "";
    document.querySelectorAll("#emergencyTypeChips .chip").forEach((c) => c.classList.remove("active"));
    selectedEmergencyType = null;
    userLocation = null;
    resetVoiceRecording();
  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});

function showResult(report, nearest, suggestedResponder = null) {
  const card = document.getElementById("resultCard");
  card.style.display = "block";
  document.getElementById("severityBadgeWrap").innerHTML =
    `<span class="severity-badge severity-${report.severity.level}">${report.severity.level} · ${report.severity.score}/10</span>`;
  document.getElementById("resultId").textContent = "Request ID: " + report.id;

  const locationNotes = {
    gps: "",
    geocoded: "📍 Location matched from the address you typed.",
    approximate: "📍 Couldn't pinpoint your exact address — showing help near the general area. Try adding a landmark or city name, or use \"Use my current location\" instead.",
    none: "⚠ No location captured — nearest help can't be shown. Try typing an address or allowing location access.",
  };
  const noteText = locationNotes[report.locationSource] || "";
  document.getElementById("locationNote").textContent = noteText;

  let html = "";
  if (nearest && nearest.shelters && nearest.shelters.length) {
    html += `<div class="help-block"><h4>🏠 ${t("nearest_shelters")}</h4>`;
    nearest.shelters.forEach((s) => {
      html += `<div class="help-item"><span>${s.name}</span><span>${s.distanceKm} km · ~${s.etaMinutes} ${t("min_eta")}</span></div>`;
    });
    html += `</div>`;
  }
  if (nearest && nearest.hospitals && nearest.hospitals.length) {
    html += `<div class="help-block"><h4>🏥 ${t("nearest_hospitals")}</h4>`;
    nearest.hospitals.forEach((h) => {
      html += `<div class="help-item"><span>${h.name}</span><span>${h.distanceKm} km · ~${h.etaMinutes} ${t("min_eta")}</span></div>`;
    });
    html += `</div>`;
  }
  if (report.assignedResponder) {
    html += `<div class="help-block responder-box">
      <h4>🚓 Rescue Officer Dispatched</h4>
      <div class="help-item"><span>${escapeHtml(report.assignedResponder.name)}</span><span>ETA ~${report.responderEtaMinutes} min</span></div>
      <p class="muted">Distance from officer base: ${report.responderDistanceKm} km</p>
    </div>`;
  } else {
    html += `<div class="help-block responder-box pending-rescue">
      <h4>🚓 Rescue Response</h4>
      ${
        suggestedResponder
          ? `<div class="help-item"><span>Nearest available team: <b>${escapeHtml(suggestedResponder.name)}</b></span><span>ETA ~${suggestedResponder.etaMinutes} min</span></div>
             <p class="muted">The authority dashboard can dispatch this team. Once the request is marked <b>Dispatched</b>, this team is assigned to the request.</p>`
          : `<p class="muted">Your request is visible to the authority dashboard. Once an officer selects <b>Dispatched</b>, an available rescue team will be assigned and its estimated arrival time will be shown.</p>`
      }
    </div>`;
  }

  if (nearest && ((nearest.shelters && nearest.shelters.length) || (nearest.hospitals && nearest.hospitals.length))) {
    html += `<p class="eta-disclaimer">${t("eta_disclaimer")}</p>`;
  }
  document.getElementById("nearestHelp").innerHTML = html;
  card.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ================= Map =================
const DEFAULT_CENTER = [18.1067, 83.4126]; // Vizianagaram, Andhra Pradesh

function initMap() {
  map = L.map("map").setView(DEFAULT_CENTER, 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 19,
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
  loadMapData();
}

function severityColor(level) {
  return { Critical: "#d92626", High: "#f0883e", Medium: "#e6b800", Low: "#2e9e5b" }[level] || "#999";
}

function circleMarker(lat, lng, color, radius = 9) {
  return L.circleMarker([lat, lng], {
    radius,
    fillColor: color,
    color: "#fff",
    weight: 2,
    fillOpacity: 0.9,
  });
}

async function loadMapData() {
  const [sheltersRes, hospitalsRes, respondersRes, reportsRes] = await Promise.all([
    fetch("/api/shelters").then((r) => r.json()),
    fetch("/api/hospitals").then((r) => r.json()),
    fetch("/api/responders").then((r) => r.json()),
    fetch("/api/reports").then((r) => r.json()),
  ]);
  sheltersData = sheltersRes;
  hospitalsData = hospitalsRes;
  respondersData = respondersRes;
  allReports = reportsRes;
  redrawMap();
  renderReportsTable(allReports);
  renderStats();
}

function redrawMap() {
  if (!markersLayer) return;
  markersLayer.clearLayers();

  sheltersData.forEach((s) => {
    circleMarker(s.lat, s.lng, "#2563eb", 8)
      .bindPopup(`<b>🏠 ${s.name}</b><br>${s.type}<br>Capacity: ${s.occupancy}/${s.capacity}<br>📞 ${s.contact}`)
      .addTo(markersLayer);
  });

  hospitalsData.forEach((h) => {
    circleMarker(h.lat, h.lng, "#059669", 8)
      .bindPopup(`<b>🏥 ${h.name}</b><br>${h.type}${h.emergency ? " · Emergency Ready" : ""}<br>📞 ${h.contact}`)
      .addTo(markersLayer);
  });

  respondersData.forEach((o) => {
    circleMarker(o.lat, o.lng, "#7c3aed", 8)
      .bindPopup(`<b>🚓 ${o.name}</b><br>${o.role}<br>${o.available ? "Available for dispatch" : "Busy"}<br>📞 ${o.contact}`)
      .addTo(markersLayer);
  });

  allReports.forEach((r) => {
    if (r.lat == null || r.lng == null) return;
    const audioLink = r.audioUrl ? `<br><a href="${r.audioUrl}" target="_blank" rel="noopener">🎧 Listen to voice message</a>` : "";
    const responderInfo = r.assignedResponder
      ? `<br>🚓 <b>Officer:</b> ${escapeHtml(r.assignedResponder.name)}<br>⏱️ <b>ETA:</b> ~${r.responderEtaMinutes} min`
      : "";
    circleMarker(r.lat, r.lng, severityColor(r.severity.level), 10)
      .bindPopup(
        `<b>${r.severity.level} · ${r.severity.score}/10</b><br>${escapeHtml(r.text)}<br><i>Status: ${r.status}</i>${responderInfo}${audioLink}`
      )
      .addTo(markersLayer);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ================= Chatbot =================
const chatWindow = document.getElementById("chatWindow");
function addChatMsg(text, who) {
  const div = document.createElement("div");
  div.className = "msg " + who;
  div.textContent = text;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Greet on first load of chat tab
let chatGreeted = false;
document.querySelector('[data-tab="chatbot"]').addEventListener("click", () => {
  if (!chatGreeted) {
    addChatMsg(GREETING_TEXT(), "bot");
    chatGreeted = true;
  }
});
function GREETING_TEXT() {
  const greetings = {
    en: "Hello, I'm the Emergency Assistance bot. Tell me what's happening and your location — I'll give you safety guidance and log a priority request for responders.",
    hi: "नमस्ते, मैं आपातकालीन सहायता बॉट हूँ। मुझे बताएं कि क्या हो रहा है और आपका स्थान।",
    te: "నమస్తే, నేను అత్యవసర సహాయ బాట్‌ని. ఏమి జరుగుతుందో మరియు మీ స్థానం చెప్పండి.",
  };
  return greetings[currentLang] || greetings.en;
}

document.getElementById("chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("chatInput");
  const message = input.value.trim();
  if (!message) return;
  addChatMsg(message, "user");
  input.value = "";

  try {
    const res = await fetch("/api/chatbot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, language: currentLang }),
    });
    const data = await res.json();
    addChatMsg(data.reply, "bot");
  } catch (err) {
    addChatMsg("Sorry, I couldn't process that. Please try again.", "bot");
  }
});

// ================= Dashboard =================
async function refreshDashboard() {
  const res = await fetch("/api/reports");
  allReports = await res.json();
  renderReportsTable(allReports);
  renderStats();
}

async function renderStats() {
  const res = await fetch("/api/stats");
  const stats = await res.json();
  const row = document.getElementById("statsRow");
  row.innerHTML = `
    <div class="stat-box"><div class="num">${stats.total}</div><div class="label">${t("stat_total")}</div></div>
    <div class="stat-box critical"><div class="num">${stats.critical}</div><div class="label">${t("stat_critical")}</div></div>
    <div class="stat-box high"><div class="num">${stats.high}</div><div class="label">${t("stat_high")}</div></div>
    <div class="stat-box pending"><div class="num">${stats.pending}</div><div class="label">${t("stat_pending")}</div></div>
    <div class="stat-box resolved"><div class="num">${stats.resolved}</div><div class="label">${t("stat_resolved")}</div></div>
  `;
}

function renderReportsTable(reports) {
  const filter = document.getElementById("statusFilter").value;
  const filtered = filter === "all" ? reports : reports.filter((r) => r.status === filter);
  const wrap = document.getElementById("reportsTableWrap");

  if (!filtered.length) {
    wrap.innerHTML = `<p class="muted">${t("no_reports")}</p>`;
    return;
  }

  let html = `<table><thead><tr>
    <th>${t("th_id")}</th><th>${t("th_time")}</th><th>${t("th_report")}</th>
    <th>${t("th_people")}</th><th>${t("th_severity")}</th><th>${t("th_location")}</th>
    <th>${t("th_voice")}</th><th>Rescue Officer / ETA</th><th>${t("th_status")}</th>
  </tr></thead><tbody>`;

  filtered.forEach((r) => {
    const rowClass = r.severity.level === "Critical" ? "row-critical" : r.severity.level === "High" ? "row-high" : "";
    const time = new Date(r.createdAt).toLocaleString();
    const loc = r.lat != null ? `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}` : (r.address || "—");
    const audioCell = r.audioUrl
      ? `<audio controls preload="none" src="${r.audioUrl}"></audio>`
      : "—";
    html += `<tr class="${rowClass}">
      <td data-label="${t('th_id')}">${r.id}</td>
      <td data-label="${t('th_time')}">${time}</td>
      <td data-label="${t('th_report')}">${escapeHtml(r.text)}${r.name && r.name !== "Anonymous" ? `<br><span class="muted">— ${escapeHtml(r.name)}${r.phone ? " · " + escapeHtml(r.phone) : ""}</span>` : ""}</td>
      <td data-label="${t('th_people')}">${r.peopleCount || "—"}</td>
      <td data-label="${t('th_severity')}"><span class="pill ${r.severity.level}">${r.severity.level} (${r.severity.score})</span></td>
      <td data-label="${t('th_location')}">${loc}</td>
      <td data-label="${t('th_voice')}" class="audio-cell">${audioCell}</td>
      <td data-label="Rescue Officer / ETA">${
        r.assignedResponder
          ? `<b>🚓 ${escapeHtml(r.assignedResponder.name)}</b><br><span class="muted">Dispatched · ETA ~${r.responderEtaMinutes} min · ${r.responderDistanceKm} km</span>`
          : r.recommendedResponder
            ? `<b>🚓 ${escapeHtml(r.recommendedResponder.name)}</b><br><span class="muted">Recommended · ETA ~${r.recommendedResponderEtaMinutes} min · ${r.recommendedResponderDistanceKm} km</span>`
            : `<span class="muted">No responder available</span>`
      }</td>
      <td data-label="${t('th_status')}">
        <select class="status-select" data-id="${r.id}">
          <option value="pending" ${r.status === "pending" ? "selected" : ""}>Pending</option>
          <option value="dispatched" ${r.status === "dispatched" ? "selected" : ""}>Dispatched</option>
          <option value="resolved" ${r.status === "resolved" ? "selected" : ""}>Resolved</option>
        </select>
      </td>
    </tr>`;
  });

  html += "</tbody></table>";
  wrap.innerHTML = html;

  wrap.querySelectorAll(".status-select").forEach((sel) => {
    sel.addEventListener("change", async (e) => {
      const id = e.target.dataset.id;
      const status = e.target.value;
      await fetch(`/api/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    });
  });
}

document.getElementById("statusFilter").addEventListener("change", () => renderReportsTable(allReports));

document.getElementById("clearDataBtn").addEventListener("click", async () => {
  const confirmed = confirm(
    "This will permanently delete ALL emergency reports for everyone using this app. This cannot be undone. Continue?"
  );
  if (!confirmed) return;
  try {
    await fetch("/api/reports", { method: "DELETE" });
    // Socket event 'reports-cleared' will refresh the UI, but update
    // immediately too in case sockets are momentarily disconnected.
    allReports = [];
    redrawMap();
    renderReportsTable(allReports);
    renderStats();
  } catch (err) {
    alert("Failed to clear reports: " + err.message);
  }
});

// ================= Socket.IO live updates =================
socket.on("new-report", (report) => {
  allReports.push(report);
  redrawMap();
  if (document.getElementById("tab-dashboard").classList.contains("active")) {
    renderReportsTable(allReports);
    renderStats();
  }
});

socket.on("update-report", (updated) => {
  const idx = allReports.findIndex((r) => r.id === updated.id);
  if (idx !== -1) allReports[idx] = updated;
  redrawMap();
  if (document.getElementById("tab-dashboard").classList.contains("active")) {
    renderReportsTable(allReports);
  }
});

socket.on("reports-cleared", () => {
  allReports = [];
  redrawMap();
  if (document.getElementById("tab-dashboard").classList.contains("active")) {
    renderReportsTable(allReports);
    renderStats();
  }
});

socket.on("stats-update", () => {
  if (document.getElementById("tab-dashboard").classList.contains("active")) {
    renderStats();
  }
});

// ================= Init =================
initMap();

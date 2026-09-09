# 🚨 RescueLink — AI-Powered Emergency Response & Disaster Assistance Platform

An AI-assisted emergency management platform built for hackathon demo purposes. Citizens
report emergencies in plain language; an AI triage engine scores severity, extracts key
signals (vulnerable people, disaster type), and surfaces the request — prioritized — on a
real-time authority dashboard, alongside the nearest shelters and hospitals on a live map.

## ✨ Features

- 🚨 **AI-based severity detection** — weighted NLP-style classifier scores every report
  0–10 and labels it Low/Medium/High/Critical, detecting vulnerable people (elderly,
  children, disabled, pregnant, etc.) and disaster type (flood, fire, earthquake, cyclone,
  medical, landslide).
- 📍 **Real-time incident reporting** with browser geolocation or manual address entry.
- 🗺️ **Live map** (Leaflet + OpenStreetMap, no API key needed) showing incidents color-coded
  by severity, plus shelters and hospitals.
- 🏥 **Nearest shelter/hospital lookup** — dynamically ranked from the citizen's actual GPS/geocoded location; the closest shelter and hospital are shown for each request.
- 🤖 **AI chatbot** giving immediate safety guidance (flood/fire/earthquake/cyclone/medical/
  landslide) in English, Hindi, and Telugu.
- 📊 **Authority dashboard** — live-updating (Socket.IO) table of all SOS requests, sorted by
  priority, with status workflow (Pending → Dispatched → Resolved) and stat counters.
- 🚓 **Officer dispatch + ETA** — when an authority officer changes a request to `Dispatched`,
  the system automatically assigns the nearest available rescue team and calculates an estimated
  arrival time from that team's base to the incident. The assigned officer and ETA are visible on
  the dashboard and incident map.
- 🔴 **SOS prioritization** — critical/high requests bubble to the top automatically.
- 🎤 **Voice message reporting** — for low-literacy or illiterate users: tap record, speak
  in any language, and (in supported browsers) live speech-to-text auto-fills the report.
  The raw audio is always saved and playable by responders on the map and dashboard, even
  when no transcript is available.
- 📍 **Works whether you type or speak your address** — typed addresses are geocoded for
  free via OpenStreetMap Nominatim (no API key), with an automatic approximate fallback so
  "nearest shelters/hospitals" never comes back empty.
- 🏷️ **One-tap emergency type selection** — Flood/Cyclone/Fire/Earthquake/Medical/Landslide/
  Other chips give the AI triage engine a confidence boost and work even for someone who
  can't read the description field.
- 🗑️ **Dashboard reset** — a "Clear All Reports" control for wiping demo data between runs.
- 📱 **Low-bandwidth, mobile-friendly** — no heavy frameworks, responsive layout, works on
  slow connections.
- 🌐 **Multi-language** — English, Hindi (हिंदी), Telugu (తెలుగు) UI, chatbot, and voice
  transcription language, easy to extend.
- 🎤 **Voice reporting for non-literate users** — record a spoken description instead of typing.
  Live speech-to-text (where the browser supports it) fills the description automatically;
  the raw audio is always attached to the report so a responder can listen to it directly,
  even if no transcript was produced.
- 🏷️ **Quick emergency-type selection** — flood/cyclone/fire/earthquake/medical/landslide
  chips give the AI a confirmed signal instead of relying on free text alone.
- 🗑️ **Dashboard reset** — a "Clear All Reports" button for wiping demo data between runs.

## 🏗️ Architecture

```
disaster-response-platform/
├── server.js              # Express + Socket.IO backend, REST API
├── severityEngine.js       # AI severity classifier (rule-based, LLM-upgradable)
├── chatbotEngine.js         # Rule-based multi-language safety guidance chatbot
├── data/
│   ├── shelters.json        # Mock shelter locations (Vizianagaram, AP — edit freely)
│   ├── hospitals.json       # Mock hospital locations
│   ├── responders.json      # Mock rescue officer/team base locations
│   └── reports.json         # Persisted incident reports (auto-created/updated)
├── public/
│   ├── index.html            # Single-page app shell (4 tabs)
│   ├── style.css             # Mobile-first styling
│   ├── i18n.js                # Translation dictionary (en/hi/te)
│   ├── app.js                  # Frontend logic: map, chat, dashboard, sockets, voice
│   └── uploads/audio/          # Voice recordings saved here at runtime (auto-created)
├── package.json
└── .env.example
```

**No external paid APIs are required to run this.** Maps use OpenStreetMap tiles (free,
no key). Severity detection and the chatbot run on a fast, deterministic rule-based engine
that works fully offline — ideal for a live demo with no network dependency risk.

### Optional: upgrade severity detection to a real LLM
If you want to demo actual LLM reasoning instead of the rule-based engine:
1. Copy `.env.example` to `.env`
2. Set `USE_LLM=true` and add your `ANTHROPIC_API_KEY`
3. Restart the server — `severityEngine.js` will now call Claude to classify each report.
   The rule-based engine is used automatically as a fallback if the API call fails.

## 🚀 Getting Started

**Requirements:** Node.js 16+ and npm.

```bash
# 1. Install dependencies
npm install

# 2. (Optional) enable LLM mode
cp .env.example .env
# edit .env if you want USE_LLM=true

# 3. Run the server
npm start

# 4. Open the app
# http://localhost:3000
```

The server runs on port 3000 by default (override with `PORT` in `.env`).

## 🧪 Try the demo flow

1. Open the **Report Emergency** tab, click "Use my current location" (or type an address),
   and submit something like:
   > "Water has entered my house. My grandmother cannot walk and we need help."
   You'll instantly see it classified as **Critical/High** with nearest shelters & hospitals.
2. Switch to **Live Map** to see it appear as a colored marker in real time.
3. Switch to **Authority Dashboard** to see it at the top of the prioritized list — update
   its status to "Dispatched" or "Resolved" and watch it sync everywhere instantly
   (Socket.IO push).
4. Try the **AI Assistant** tab and describe a fire, flood, or earthquake to get instant
   safety guidance in English, Hindi, or Telugu (use the language switcher top-right).

## 🎤 Voice reporting (accessibility for non-literate users)

Many people affected by a disaster may not be able to read or type, especially under
stress. The **Record Voice Message** button in the Report form addresses this:

- It always records raw audio (via `MediaRecorder`) and attaches it to the report, so a
  human responder can listen directly from the Authority Dashboard or the map popup.
- Where the browser supports it (Chrome, Edge, and most Android browsers — not currently
  Safari/iOS or Firefox), the **Web Speech API** transcribes speech to text live, filling
  the description field automatically in the selected language (English/Hindi/Telugu), so
  the AI severity engine can still classify it like any typed report.
- If transcription isn't available or the person doesn't type anything, the report is still
  accepted — it's tagged `isVoiceReport: true` with a placeholder description prompting a
  responder to listen to the recording, and given a baseline Medium severity so it's never
  silently dropped.
- Combined with the one-tap emergency-type chips (🌊🌀🔥🏚️🚑⛰️), someone who can't read or
  write at all can still submit a complete, triage-able emergency report using only icons
  and their voice.

No paid speech-to-text API or key is required — this works entirely with free browser
APIs. Microphone access requires the page to be served over `https://` or `localhost`
(both already satisfied when you run this locally).

## ⚠️ Important: this does not connect to real police/fire/ambulance dispatch

There is no public API that lets an app automatically summon government emergency
services — no hackathon or commercial project can do that. **For a real life-threatening
emergency, always call your actual local emergency number** (e.g. 112 in India) — never
rely on this demo app alone.

What this platform *can* do to "reach a real person": see the email alerts section below.

## 📧 Real email alerts to a responder inbox

When enabled, the server automatically emails a real inbox you configure whenever a
report meets a severity threshold (Critical/High by default). This is the one piece of
the platform that genuinely notifies a real person — the recipient could be a local
disaster-management office, an NGO, a volunteer group, or your own family/contacts. A
human still has to read the email and act on it.

**Setup (free, using Gmail):**
1. Copy `.env.example` to `.env`
2. On the Gmail account you'll send *from*, turn on 2-Step Verification, then create an
   [App Password](https://myaccount.google.com/apppasswords) (choose "Mail")
3. Fill in `SMTP_USER` (that Gmail address) and `SMTP_PASS` (the 16-character app password)
4. Set `ALERT_TO_EMAIL` to whoever should receive alerts
5. Set `EMAIL_ALERTS_ENABLED=true` and restart the server (`npm start`)

Any other SMTP provider works too (Outlook, SendGrid, your organization's mail server) —
just change `SMTP_HOST`/`SMTP_PORT` accordingly. Sending is fire-and-forget: a broken or
misconfigured SMTP server is logged to the console but never blocks or breaks report
submission for the citizen.

## ⏱️ Estimated arrival time (ETA)

Every "nearest shelter/hospital" result includes an estimated travel time, calculated from
distance and an assumed average response speed (25 km/h) plus an 8-minute dispatch buffer.
For rescue officers, the same estimate is calculated from the assigned team's base to the
incident. When an authority changes a request to `Dispatched`, the nearest available team is
assigned automatically and its ETA is stored on the request. **This is a planning estimate, not live GPS tracking of a real vehicle** — there's
no real responder to track in this demo. Real travel time can be longer, especially in
flood/storm conditions. The app shows a disclaimer alongside every ETA for this reason.
You can tune `AVG_RESPONSE_SPEED_KMH` and `DISPATCH_PREP_MINUTES` in `server.js` to match
your region.



| Method | Endpoint             | Description                                    |
|--------|-----------------------|-------------------------------------------------|
| GET    | `/api/health`          | Server status + whether LLM mode is on           |
| GET    | `/api/shelters`        | List of shelters                                 |
| GET    | `/api/hospitals`       | List of hospitals                                |
| GET    | `/api/nearest?lat=&lng=` | Closest shelter + hospital to a point (each includes `distanceKm` and `etaMinutes`) |
| GET    | `/api/reports`         | All incident reports, sorted by priority         |
| POST   | `/api/reports`         | Submit a new report `{text, lat, lng, audioData, ...}`   |
| DELETE | `/api/reports`         | Clear all reports (used by "Clear All Reports" button)   |
| PATCH  | `/api/reports/:id`     | Update status `{status: "dispatched"}`           |
| GET    | `/api/stats`           | Dashboard counters                                |
| POST   | `/api/chatbot`         | Get chatbot reply `{message, language}`          |

Real-time events (Socket.IO): `new-report`, `update-report`, `stats-update`.

## 🛠️ Customizing for your region

- Edit `data/shelters.json` / `data/hospitals.json` with real coordinates for your city.
- Edit `DEFAULT_CENTER` in `public/app.js` to re-center the map.
- Add more languages by extending `public/i18n.js` and `chatbotEngine.js`.
- Swap the rule-based severity engine for a trained ML model by replacing
  `classifyRuleBased` in `severityEngine.js` — the rest of the app is unaffected since
  everything consumes the same `{score, level, disasterType, vulnerablePeople}` shape.

## 🎯 Why this matters (hackathon pitch)

During floods, cyclones, earthquakes, and fires, the biggest bottleneck isn't a lack of
willingness to help — it's a lack of *visibility* into where help is needed most urgently.
RescueLink closes that gap: citizens describe their situation in plain language (no forms,
no jargon), AI does the triage instantly, and responders get a live, prioritized, mapped
view of every request — so the person who said *"my grandmother cannot walk and water is
rising"* gets seen before a routine power-outage report.

---
Built as a hackathon project. Not affiliated with, and not a substitute for, official
government emergency services — always call your local emergency number for real
life-threatening situations.

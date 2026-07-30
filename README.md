# 🏎️ KartSport Live Timing & Telemetry Bridge

A lightweight, real-time live timing, telemetry, and track pulse dashboard for KartSport events. This system connects directly to **MYLAPS Orbits (RMonitor TCP Feed)** on the race control computer, streams telemetry to a cloud server, and presents live session leaderboards, driver position gains/losses, and highlight events in a responsive web interface.

---

## 🌟 Key Features

* **Real-time Telemetry:** Live driver positioning, lap counts, gaps, and best lap times over WebSockets.
* **Position Delta Indicators:** Displays green triangles (`▲ X`) for gained grid positions, red triangles (`▼ X`) for lost positions, and neutral indicators (`-`) for held positions relative to the starting grid.
* **Track Pulse Feed:** Automated real-time highlight feed for lead changes and new overall fastest laps.
* **Dual View:** Toggle between **Live Telemetry** and **Day Points Standings**.
* **Zero-Touch Race Day Operation:** Background Windows Service deployment so the bridge runs automatically when the timing laptop turns on—no terminal commands required by race secretaries.

---

## 📐 System Architecture
┌─────────────────────────┐        TCP Stream         ┌─────────────────────────┐│   MYLAPS Orbits 5       │  ───────────────►         │  bridge/orbits-stream   ││ (RMonitor Feed: 50000)  │  (Port 50000 / Local)     │  (Node.js / PM2)        │└─────────────────────────┘                           └────────────┬────────────┘││ HTTP POST▼┌─────────────────────────┐      WebSockets / HTTP    ┌─────────────────────────┐│   Frontend Display      │  ◄──────────────────────  │    Cloud API Server     ││   (public/results.html) │                           │    (Node.js / Express)  │└─────────────────────────┘                           └─────────────────────────┘
---

## 📁 Repository Structure

.├── bridge/│   ├── orbits-stream.js      # TCP listener for Orbits RMonitor feed & cloud relay│   └── mock-orbits.js        # Local test server simulating live Orbits telemetry├── public/│   └── results.html          # Frontend live timing & track pulse dashboard├── install-service.bat       # One-click Windows background service installer├── server.js                 # API and WebSocket web server├── package.json└── README.md
---

## 🚀 Race Control Setup (Timing Laptop)

To set up a timing PC so telemetry flows automatically to the web without manual intervention, follow these steps:

### 1. Enable RMonitor Output in MYLAPS Orbits
1. Open **MYLAPS Orbits 5**.
2. Go to **Scoreboard** / **Distribution**.
3. Enable **RMonitor TCP Server** on port `50000`.

### 2. Install the Automated Background Service
1. Download or clone this repository onto the timing computer.
2. Ensure `bridge/orbits-stream.js` has your correct cloud API URL and Club ID set:
   ```javascript
   const API_SERVER = process.env.API_SERVER || '[https://your-app.onrender.com](https://your-app.onrender.com)';
   const CLUB_ID = process.env.CLUB_ID || 'tokoroa';
Right-click install-service.bat and select Run as administrator.💡 What the installer does automatically:Checks for Node.js (and downloads/installs Node.js LTS silently if missing).Installs required project dependencies and PM2 process manager.Registers bridge/orbits-stream.js as a background Windows Startup service.Starts the bridge service immediately.🛠️ Local Development & TestingYou can simulate a live race without an active Orbits system using the included mock streamer.1. Install DependenciesBashnpm install
2. Start the Web ServerBashnpm start
3. Run the Mock Orbits ServerIn a separate terminal window, launch the mock feed:Bashnode bridge/mock-orbits.js
4. Run the Stream BridgeIn another terminal window, start the bridge stream:Bashnode bridge/orbits-stream.js
5. View the Live DashboardOpen your browser and navigate to:http://localhost:3000/?club=tokoroa
🔒 Environment VariablesThe bridge client and API server accept the following environment configuration options:VariableDefault ValueDescriptionORBITS_HOST127.0.0.1IP address of the Orbits timing computerORBITS_PORT50000Port configured in Orbits for RMonitor TCP feedAPI_SERVERhttps://your-app.onrender.comDeployed cloud server endpointAPI_KEYakc-secret-api-key-2026Authentication key between bridge and APICLUB_IDtokoroaUnique identifier for multi-club routing🛠️ Maintenance & PM2 ManagementIf you need to check or manage the background service on the timing PC via Command Prompt:View service status:DOSpm2 status
View real-time logs:DOSpm2 logs kartsport-bridge
Restart the service:DOSpm2 restart kartsport-bridge
Stop the service:DOSpm2 stop kartsport-bridge
📄 LicenseDistributed under the MIT License. See LICENSE for details.

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const VALID_API_KEY = 'akc-secret-api-key-2026';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory data store per club
const clubDataStore = {};

function broadcastToClub(clubId, payload) {
  const message = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.clubId === clubId) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws, req) => {
  const urlParams = new URLSearchParams(req.url.replace(/^.*\?/, ''));
  const clubId = urlParams.get('club') || 'auckland';
  ws.clubId = clubId;

  // Send current state to newly connected client
  if (clubDataStore[clubId]) {
    if (clubDataStore[clubId].heat) {
      Object.keys(clubDataStore[clubId].heat).forEach(cName => {
        Object.values(clubDataStore[clubId].heat[cName]).forEach(sData => {
          ws.send(JSON.stringify({ type: 'heat', ...sData }));
        });
      });
    }
    if (clubDataStore[clubId].pulse) {
      ws.send(JSON.stringify({ type: 'pulse', events: clubDataStore[clubId].pulse }));
    }
    if (clubDataStore[clubId].points) {
      Object.keys(clubDataStore[clubId].points).forEach(cName => {
        ws.send(JSON.stringify({ type: 'points', className: cName, standings: clubDataStore[clubId].points[cName] }));
      });
    }
  }
});

function checkAuth(req, res) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== VALID_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// 1. Heat / Live Telemetry Endpoint
app.post('/api/results/heat', (req, res) => {
  if (!checkAuth(req, res)) return;
  const clubId = req.headers['x-club-id'] || 'auckland';
  const { className, session, drivers } = req.body;

  const currentSession = session || 'Heat 1';

  if (!clubDataStore[clubId]) clubDataStore[clubId] = { heat: {}, pulse: [], points: {} };
  if (!clubDataStore[clubId].heat) clubDataStore[clubId].heat = {};
  if (!clubDataStore[clubId].heat[className]) clubDataStore[clubId].heat[className] = {};
  
  // Store session under its specific class and session/heat name
  clubDataStore[clubId].heat[className][currentSession] = { className, session: currentSession, drivers };

  broadcastToClub(clubId, { type: 'heat', className, session: currentSession, drivers });
  return res.status(200).json({ status: 'success' });
});

// 2. Track Pulse Events Endpoint
app.post('/api/results/pulse', (req, res) => {
  if (!checkAuth(req, res)) return;
  const clubId = req.headers['x-club-id'] || 'auckland';
  const { event } = req.body;

  if (!clubDataStore[clubId]) clubDataStore[clubId] = { heat: {}, pulse: [], points: {} };
  if (!clubDataStore[clubId].pulse) clubDataStore[clubId].pulse = [];

  clubDataStore[clubId].pulse.unshift({ ...event, timestamp: new Date().toLocaleTimeString() });
  if (clubDataStore[clubId].pulse.length > 15) clubDataStore[clubId].pulse.pop();

  broadcastToClub(clubId, { type: 'pulse', events: clubDataStore[clubId].pulse });
  return res.status(200).json({ status: 'success' });
});

// 3. Points Endpoint
app.post('/api/results/points', (req, res) => {
  if (!checkAuth(req, res)) return;
  const clubId = req.headers['x-club-id'] || 'auckland';
  const { className, standings } = req.body;

  if (!clubDataStore[clubId]) clubDataStore[clubId] = { heat: {}, pulse: [], points: {} };
  if (!clubDataStore[clubId].points) clubDataStore[clubId].points = {};

  clubDataStore[clubId].points[className] = standings;

  broadcastToClub(clubId, { type: 'points', className, standings });
  return res.status(200).json({ status: 'success' });
});

// Clear Data Endpoint
app.post('/api/results/clear', (req, res) => {
  if (!checkAuth(req, res)) return;
  const clubId = req.headers['x-club-id'] || 'auckland';

  clubDataStore[clubId] = { heat: {}, pulse: [], points: {} };
  broadcastToClub(clubId, { type: 'clear' });

  return res.status(200).json({ status: 'cleared' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'results.html'));
});

server.listen(PORT, () => {
  console.log(`🏎️ KartSport Live Timing server running on port ${PORT}`);
});

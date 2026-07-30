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

// In-memory data store for live timing per club
const clubDataStore = {};

// Broadcast helper function
function broadcastToClub(clubId, payload) {
  const message = JSON.stringify(payload);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.clubId === clubId) {
      client.send(message);
    }
  });
}

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const urlParams = new URLSearchParams(req.url.replace(/^.*\?/, ''));
  const clubId = urlParams.get('club') || 'auckland';
  ws.clubId = clubId;

  // Send initial cached state to newly connected client
  if (clubDataStore[clubId]) {
    Object.values(clubDataStore[clubId]).forEach(classData => {
      ws.send(JSON.stringify(classData));
    });
  }
});

// API endpoint for Orbits Bridge Pushes
app.post('/api/results/heat', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const clubId = req.headers['x-club-id'] || 'auckland';

  if (apiKey !== VALID_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }

  const { className, session, drivers } = req.body;

  if (!className || !drivers) {
    return res.status(400).json({ error: 'Missing className or drivers payload' });
  }

  // Save to memory store
  if (!clubDataStore[clubId]) clubDataStore[clubId] = {};
  clubDataStore[clubId][className] = { className, session, drivers };

  // Broadcast to WebSockets subscribers for this specific club
  broadcastToClub(clubId, { className, session, drivers });

  console.log(`[API POST] Received & Broadcasted ${className} (${session}) for club '${clubId}'`);
  return res.status(200).json({ status: 'success' });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'results.html'));
});

server.listen(PORT, () => {
  console.log(`🏎️ KartSport Live Timing server listening on port ${PORT}`);
});

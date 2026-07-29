const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Tenant Club Database Registry (In-memory configuration & race data stores)
const clubs = {
  auckland: {
    id: 'auckland',
    name: 'Auckland Kart Club',
    apiKey: process.env.AKC_API_KEY || 'akc-secret-api-key-2026',
    data: { heat: {}, overall: {} }
  },
  tokoroa: {
    id: 'tokoroa',
    name: 'Tokoroa Kart Club',
    apiKey: process.env.TKC_API_KEY || 'tkc-secret-api-key-2026',
    data: { heat: {}, overall: {} }
  }
};

app.use(express.json({ limit: '10mb' }));

// 1. Zero-Dependency CORS Middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, x-club-id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// 2. Tenant Context Resolver Middleware
function resolveTenant(req, res, next) {
  let clubId = req.headers['x-club-id'] || req.query.club;

  if (!clubId) {
    const host = req.headers.host || '';
    const parts = host.split('.');
    if (parts.length >= 3 && parts[0] !== 'www') {
      clubId = parts[0].toLowerCase();
    }
  }

  if (!clubId || !clubs[clubId]) {
    clubId = 'auckland';
  }

  req.club = clubs[clubId];
  next();
}

// 3. API Key Authorization Middleware
function requireApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'];
  if (!providedKey || providedKey !== req.club.apiKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
  }
  next();
}

// Broadcast real-time updates to connected WebSockets belonging to a specific club
function broadcastToClub(clubId, payload) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client.clubId === clubId) {
      client.send(JSON.stringify(payload));
    }
  });
}

// Static Assets
app.use(express.static(path.join(__dirname, 'public')));

// Initial Snapshot Endpoint (Fallback/Rest Restore)
app.get('/api/results', resolveTenant, (req, res) => {
  res.json({
    clubId: req.club.id,
    clubName: req.club.name,
    results: req.club.data
  });
});

// Ingestion Routes (Trigger Real-time WebSocket Broadcasters)
app.post('/api/results/heat', resolveTenant, requireApiKey, (req, res) => {
  const { className, session, drivers } = req.body;
  if (!className || !session || !Array.isArray(drivers)) {
    return res.status(400).json({ error: 'Invalid payload schema.' });
  }

  if (!req.club.data.heat[className]) {
    req.club.data.heat[className] = {};
  }
  req.club.data.heat[className][session] = drivers;

  // Push update immediately over WebSockets
  broadcastToClub(req.club.id, {
    type: 'HEAT_UPDATE',
    clubId: req.club.id,
    clubName: req.club.name,
    results: req.club.data
  });

  res.json({ status: 'success', club: req.club.id, className, session });
});

app.post('/api/results/overall', resolveTenant, requireApiKey, (req, res) => {
  const { className, standings } = req.body;
  if (!className || !Array.isArray(standings)) {
    return res.status(400).json({ error: 'Invalid payload schema.' });
  }

  req.club.data.overall[className] = standings;

  broadcastToClub(req.club.id, {
    type: 'OVERALL_UPDATE',
    clubId: req.club.id,
    clubName: req.club.name,
    results: req.club.data
  });

  res.json({ status: 'success', club: req.club.id, className });
});

app.post('/api/results/reset', resolveTenant, requireApiKey, (req, res) => {
  req.club.data = { heat: {}, overall: {} };

  broadcastToClub(req.club.id, {
    type: 'RESET',
    clubId: req.club.id,
    clubName: req.club.name,
    results: req.club.data
  });

  res.json({ status: 'success', message: `Data reset for tenant: ${req.club.name}` });
});

// WebSocket Server Handshake & Connection Handling
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let clubId = url.searchParams.get('club');

  if (!clubId) {
    const host = req.headers.host || '';
    const parts = host.split('.');
    if (parts.length >= 3 && parts[0] !== 'www') clubId = parts[0].toLowerCase();
  }

  ws.clubId = (clubId && clubs[clubId]) ? clubId : 'auckland';

  // Deliver current snapshot instantly upon connection
  ws.send(JSON.stringify({
    type: 'INIT',
    clubId: ws.clubId,
    clubName: clubs[ws.clubId].name,
    results: clubs[ws.clubId].data
  }));
});

// Single Page Application Route Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'results.html'));
});

server.listen(PORT, () => {
  console.log(`[KartSport Live Engine] Running on port ${PORT}`);
});
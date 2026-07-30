const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'akc-secret-api-key-2026';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// IN-MEMORY DATA STORE (PER CLUB)
// ==========================================
// Structure: clubDataStore['tokoroa'] = { currentSession: {}, pulseEvents: [] }
const clubDataStore = {};

function getOrCreateClubStore(clubId) {
  const normalizedId = (clubId || 'tokoroa').toLowerCase();
  if (!clubDataStore[normalizedId]) {
    clubDataStore[normalizedId] = {
      heatData: {
        className: 'Select Class',
        session: 'Select Heat / Race',
        drivers: []
      },
      pulseEvents: []
    };
  }
  return clubDataStore[normalizedId];
}

// Security Middleware for API Bridge endpoints
function authenticateBridge(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== API_KEY) {
    return res.status(403).json({ error: 'Unauthorized: Invalid API key' });
  }
  next();
}

// ==========================================
// REST API ENDPOINTS (RECEIVES FROM BRIDGE)
// ==========================================

/**
 * POST /api/results/heat
 * Receives running order / timing board updates from bridge client
 */
app.post('/api/results/heat', authenticateBridge, (req, res) => {
  const clubId = (req.headers['x-club-id'] || 'tokoroa').toLowerCase();
  const { className, session, drivers } = req.body;

  const store = getOrCreateClubStore(clubId);
  store.heatData = {
    className: className || store.heatData.className,
    session: session || store.heatData.session,
    drivers: drivers || []
  };

  // Broadcast to all clients tuned into this specific club
  io.to(clubId).emit('heatUpdate', store.heatData);

  res.status(200).json({ success: true, club: clubId });
});

/**
 * POST /api/results/pulse
 * Receives Track Pulse highlight events (Lead changes, Fastest Laps)
 */
app.post('/api/results/pulse', authenticateBridge, (req, res) => {
  const clubId = (req.headers['x-club-id'] || 'tokoroa').toLowerCase();
  const { event } = req.body;

  if (event) {
    const store = getOrCreateClubStore(clubId);
    
    // Add timestamp and store last 20 events
    const pulseItem = {
      ...event,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    store.pulseEvents.unshift(pulseItem);
    if (store.pulseEvents.length > 20) store.pulseEvents.pop();

    // Broadcast pulse event to room
    io.to(clubId).emit('pulseEvent', pulseItem);
  }

  res.status(200).json({ success: true, club: clubId });
});

/**
 * POST /api/results/clear
 * Clears current telemetry state on Orbits reset
 */
app.post('/api/results/clear', authenticateBridge, (req, res) => {
  const clubId = (req.headers['x-club-id'] || 'tokoroa').toLowerCase();
  const store = getOrCreateClubStore(clubId);

  store.heatData = { className: 'Select Class', session: 'Select Heat / Race', drivers: [] };
  store.pulseEvents = [];

  io.to(clubId).emit('heatUpdate', store.heatData);
  io.to(clubId).emit('clearPulse');

  res.status(200).json({ success: true, club: clubId });
});

// REST Endpoint for initial state retrieval via HTTP GET
app.get('/api/results/:clubId', (req, res) => {
  const clubId = req.params.clubId.toLowerCase();
  const store = getOrCreateClubStore(clubId);
  res.json(store);
});

// ==========================================
// WEBSOCKET REAL-TIME SYNC
// ==========================================
io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);

  // Client joins specific club room (e.g. 'tokoroa', 'auckland')
  socket.on('joinClub', (clubId) => {
    const normalizedId = (clubId || 'tokoroa').toLowerCase();
    
    // Leave previous rooms
    socket.rooms.forEach(room => {
      if (room !== socket.id) socket.leave(room);
    });

    socket.join(normalizedId);
    console.log(`🏎️ Client ${socket.id} subscribed to club: ${normalizedId}`);

    // Immediately push current state to the newly connected browser
    const store = getOrCreateClubStore(normalizedId);
    socket.emit('heatUpdate', store.heatData);
    socket.emit('pulseHistory', store.pulseEvents);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// ==========================================
// SERVER LAUNCH
// ==========================================
server.listen(PORT, () => {
  console.log(`🚀 KartSport Live Timing Server running on port ${PORT}`);
});

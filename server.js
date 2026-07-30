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

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// IN-MEMORY DATA STORE (PER CLUB)
// ==========================================
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
      pulseEvents: [],
      lastActive: 0,
      isLive: false
    };
  }
  return clubDataStore[normalizedId];
}

// Security Middleware
function authenticateBridge(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== API_KEY) {
    return res.status(403).json({ error: 'Unauthorized: Invalid API key' });
  }
  next();
}

// ==========================================
// MONITOR TELEMETRY HEARTBEAT (10s TIMEOUT)
// ==========================================
setInterval(() => {
  const now = Date.now();
  Object.keys(clubDataStore).forEach((clubId) => {
    const store = clubDataStore[clubId];
    // If no telemetry received for more than 12 seconds, mark as offline
    if (store.isLive && (now - store.lastActive > 12000)) {
      store.isLive = false;
      io.to(clubId).emit('orbitStatus', { isLive: false });
      io.emit('clubStatusUpdate', { clubId, isLive: false });
    }
  });
}, 3000);

// ==========================================
// REST API ENDPOINTS
// ==========================================

app.post('/api/results/heat', authenticateBridge, (req, res) => {
  const clubId = (req.headers['x-club-id'] || 'tokoroa').toLowerCase();
  const { className, session, drivers } = req.body;

  const store = getOrCreateClubStore(clubId);
  store.lastActive = Date.now();
  
  const wasOffline = !store.isLive;
  store.isLive = true;

  store.heatData = {
    className: className || store.heatData.className,
    session: session || store.heatData.session,
    drivers: drivers || []
  };

  io.to(clubId).emit('heatUpdate', store.heatData);
  io.to(clubId).emit('orbitStatus', { isLive: true });

  if (wasOffline) {
    io.emit('clubStatusUpdate', { clubId, isLive: true });
  }

  res.status(200).json({ success: true, club: clubId });
});

app.post('/api/results/pulse', authenticateBridge, (req, res) => {
  const clubId = (req.headers['x-club-id'] || 'tokoroa').toLowerCase();
  const { event } = req.body;

  if (event) {
    const store = getOrCreateClubStore(clubId);
    store.lastActive = Date.now();
    
    const pulseItem = {
      ...event,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    store.pulseEvents.unshift(pulseItem);
    if (store.pulseEvents.length > 20) store.pulseEvents.pop();

    io.to(clubId).emit('pulseEvent', pulseItem);
  }

  res.status(200).json({ success: true, club: clubId });
});

app.post('/api/results/clear', authenticateBridge, (req, res) => {
  const clubId = (req.headers['x-club-id'] || 'tokoroa').toLowerCase();
  const store = getOrCreateClubStore(clubId);

  store.heatData = { className: 'Select Class', session: 'Select Heat / Race', drivers: [] };
  store.pulseEvents = [];

  io.to(clubId).emit('heatUpdate', store.heatData);
  io.to(clubId).emit('clearPulse');

  res.status(200).json({ success: true, club: clubId });
});

// Endpoint to fetch live status of all clubs for index.html
app.get('/api/clubs/status', (req, res) => {
  const statuses = {};
  Object.keys(clubDataStore).forEach((clubId) => {
    statuses[clubId] = clubDataStore[clubId].isLive;
  });
  res.json(statuses);
});

// ==========================================
// WEBSOCKET REAL-TIME SYNC
// ==========================================
io.on('connection', (socket) => {
  socket.on('joinClub', (clubId) => {
    const normalizedId = (clubId || 'tokoroa').toLowerCase();
    
    socket.rooms.forEach(room => {
      if (room !== socket.id) socket.leave(room);
    });

    socket.join(normalizedId);

    const store = getOrCreateClubStore(normalizedId);
    socket.emit('heatUpdate', store.heatData);
    socket.emit('pulseHistory', store.pulseEvents);
    socket.emit('orbitStatus', { isLive: store.isLive });
  });
});

server.listen(PORT, () => {
  console.log(`🚀 KartSport Live Timing Server running on port ${PORT}`);
});

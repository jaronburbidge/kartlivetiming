const net = require('net');
const http = require('http');
const https = require('https');
const config = require('./config.json');

// Orbits RMonitor TCP connection settings
const ORBITS_HOST = config.orbitsHost || '127.0.0.1';
const ORBITS_PORT = config.orbitsPort || 50000;

console.log(`[Orbits TCP Stream] Connecting to MYLAPS Orbits at ${ORBITS_HOST}:${ORBITS_PORT}...`);

let socket = new net.Socket();
let buffer = '';
let driverStore = new Map(); // Stores active competitor info indexed by ID/Number
let currentClass = 'Rotax Light';
let currentSession = 'Heat 1';

function connectToOrbits() {
  socket.connect(ORBITS_PORT, ORBITS_HOST, () => {
    console.log('[Orbits TCP Stream] Successfully connected to live feed!');
  });

  socket.on('data', (data) => {
    buffer += data.toString('utf8');
    const lines = buffer.split('\r\n');
    buffer = lines.pop(); // Keep incomplete line fragment in buffer

    lines.forEach(line => parseRMonitorLine(line));
  });

  socket.on('close', () => {
    console.log('[Orbits TCP Stream] Connection lost. Retrying in 3 seconds...');
    setTimeout(connectToOrbits, 3000);
  });

  socket.on('error', (err) => {
    console.error(`[Orbits TCP Stream Error] ${err.message}`);
    socket.destroy();
  });
}

function parseRMonitorLine(line) {
  if (!line || !line.startsWith('$')) return;

  const parts = line.split(',').map(p => p.replace(/^"|"$/g, '').trim());
  const recordType = parts[0];

  switch (recordType) {
    // $COMP: Competitor Registration Record ($COMP, ID, Number, First, Last, Class...)
    case '$COMP': {
      const regId = parts[1];
      const number = parts[2];
      const firstName = parts[3] || '';
      const lastName = parts[4] || '';
      
      driverStore.set(number, {
        number: number,
        name: `${firstName} ${lastName}`.trim() || `Kart #${number}`
      });
      break;
    }

    // $F: Session Header Info ($F, SessionName, EventName...)
    case '$F': {
      if (parts[1]) currentSession = parts[1];
      if (parts[2]) currentClass = parts[2];
      break;
    }

    // $G: Live Position & Timing Grid Record ($G, Position, KartNumber, Laps, BestLap, Gap)
    case '$G': {
      const pos = parts[1];
      const number = parts[2];
      const laps = parts[3] || '0';
      const bestLap = parts[4] || '-';
      const gap = parts[5] || '-';

      if (driverStore.has(number)) {
        const driver = driverStore.get(number);
        driver.position = parseInt(pos, 10) || 999;
        driver.laps = laps;
        driver.bestLap = bestLap;
        driver.gap = gap;
      }
      
      // Trigger instant push to cloud board on running order change
      pushLiveBoardUpdate();
      break;
    }
  }
}

let pushTimeout = null;
function pushLiveBoardUpdate() {
  // Debounce updates to avoid overwhelming the network on simultaneous loop passes
  if (pushTimeout) clearTimeout(pushTimeout);

  pushTimeout = setTimeout(() => {
    const sortedDrivers = Array.from(driverStore.values())
      .filter(d => d.position !== undefined)
      .sort((a, b) => a.position - b.position);

    if (sortedDrivers.length === 0) return;

    const payload = JSON.stringify({
      className: currentClass,
      session: currentSession,
      drivers: sortedDrivers
    });

    sendPayload('/api/results/heat', payload);
  }, 250);
}

function sendPayload(endpoint, jsonPayload) {
  const url = new URL(config.serverUrl + endpoint);
  const client = url.protocol === 'https:' ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(jsonPayload),
      'x-api-key': config.apiKey,
      'x-club-id': config.clubId
    }
  };

  const req = client.request(options, (res) => {
    let responseData = '';
    res.on('data', chunk => responseData += chunk);
    res.on('end', () => {
      console.log(`[Stream Push] Synced ${currentClass} (${currentSession}) - HTTP ${res.statusCode}`);
    });
  });

  req.on('error', (err) => {
    console.error(`[Stream Push Failed] ${err.message}`);
  });

  req.write(jsonPayload);
  req.end();
}

connectToOrbits();

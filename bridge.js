const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const config = require('./config.json');

console.log(`[KartSport Bridge] Initializing for Club: ${config.clubId}`);
console.log(`[KartSport Bridge] Watching Directory: ${config.watchFolder}`);

if (!fs.existsSync(config.watchFolder)) {
  console.log(`[Warning] Target folder absent. Creating watch path...`);
  fs.mkdirSync(config.watchFolder, { recursive: true });
}

fs.watch(config.watchFolder, (eventType, filename) => {
  if (filename && (filename.endsWith('.csv') || filename.endsWith('.txt'))) {
    const filePath = path.join(config.watchFolder, filename);
    console.log(`[File Event] ${eventType} detected on ${filename}`);
    
    // Slight delay to allow Orbits to finish file stream write
    setTimeout(() => parseAndUpload(filePath, filename), 500);
  }
});

function parseAndUpload(filePath, filename) {
  if (!fs.existsSync(filePath)) return;

  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const lines = fileContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    if (lines.length < 2) return;

    const drivers = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(cell => cell.trim().replace(/^"|"$/g, ''));
      if (row.length < 3) continue;

      drivers.push({
        position: row[0] || i,
        number: row[1] || '00',
        name: row[2] || 'Driver ' + i,
        laps: row[3] || '0',
        bestLap: row[4] || '-',
        gap: row[5] || '-'
      });
    }

    // Example Filename structure: "Rotax Max Light_Heat 1.csv"
    const nameParts = path.basename(filename, path.extname(filename)).split('_');
    const className = nameParts[0] || 'Cadet Rocket';
    const session = nameParts[1] || 'Heat 1';

    const payload = JSON.stringify({
      className: className,
      session: session,
      drivers: drivers
    });

    sendPayload('/api/results/heat', payload);
  } catch (err) {
    console.error(`[Error] Parsing failed for ${filename}:`, err.message);
  }
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
      console.log(`[Upload Success] HTTP ${res.statusCode}: ${responseData}`);
    });
  });

  req.on('error', (err) => {
    console.error(`[Upload Failed] Error: ${err.message}`);
  });

  req.write(jsonPayload);
  req.end();
}
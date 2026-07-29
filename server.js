const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const GameLogic = require('./public/compute.js');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Only ever accepts a real 4-digit year, so a junk value can never produce a
// stray file such as `.json` in the data folder.
function yearFile(year) {
  const y = String(year).trim();
  if (!/^\d{4}$/.test(y)) return null;
  return path.join(DATA_DIR, `${y}.json`);
}

// Atomic save: write a temp file and rename over the target. A crash, power cut
// or OneDrive sync landing mid-write can then never leave a truncated,
// unparseable game file behind.
function writeGameFile(file, game) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(game, null, 2));
  fs.renameSync(tmp, file);
}

function readGameFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// The browser can only lock picking at the cutoff while someone has the app
// open. The server owns the clock too, so a cutoff still fires if every device
// is asleep.
function applyAutoCutoff(game, file) {
  let changed = false;
  if (GameLogic.cutoffPassed(game)) {
    GameLogic.lockGame(game);
    changed = true;
  }
  // Also re-derives started/finished on read, so games saved before this
  // distinction existed pick up the right status without needing an edit.
  const statusBefore = game.status;
  GameLogic.syncStatus(game);
  if (game.status !== statusBefore) changed = true;
  if (changed) {
    game.updatedAt = new Date().toISOString();
    writeGameFile(file, game);
  }
  return game;
}

function listYears() {
  const files = fs.readdirSync(DATA_DIR).filter(f => /^\d{4}\.json$/.test(f));
  const games = files.map(f => {
    try {
      const full = path.join(DATA_DIR, f);
      const g = applyAutoCutoff(readGameFile(full), full);
      return {
        year: g.year,
        teamA: g.teamA,
        teamB: g.teamB,
        status: g.status,
        updatedAt: g.updatedAt || null
      };
    } catch (e) {
      console.error(`Skipping unreadable game file ${f}: ${e.message}`);
      return null;
    }
  }).filter(Boolean);
  games.sort((a, b) => b.year - a.year);
  return games;
}

async function handleApi(req, res, pathname) {
  if (pathname === '/api/years' && req.method === 'GET') {
    return sendJSON(res, 200, listYears());
  }

  // Lets the Game Day screen print the address to type into a phone — the
  // browser can't discover the hosting PC's LAN IP on its own.
  if (pathname === '/api/hosts' && req.method === 'GET') {
    return sendJSON(res, 200, { port: PORT, addresses: localIPs() });
  }

  const gameMatch = pathname.match(/^\/api\/game\/(\d{4})$/);
  if (gameMatch && req.method === 'GET') {
    const file = yearFile(gameMatch[1]);
    if (!fs.existsSync(file)) return sendJSON(res, 404, { error: 'Not found' });
    const game = applyAutoCutoff(readGameFile(file), file);
    return sendJSON(res, 200, game);
  }

  if (gameMatch && req.method === 'DELETE') {
    const file = yearFile(gameMatch[1]);
    if (!fs.existsSync(file)) return sendJSON(res, 404, { error: 'Not found' });
    fs.unlinkSync(file);
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/game' && req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJSON(res, 400, { error: 'Invalid JSON' });
    }
    const file = yearFile(body.year);
    if (!file) return sendJSON(res, 400, { error: 'A valid 4-digit year is required.' });
    const invalid = GameLogic.validateGame(body);
    if (invalid) return sendJSON(res, 400, { error: invalid });
    if (fs.existsSync(file)) {
      return sendJSON(res, 409, { error: `A game for ${body.year} already exists.` });
    }
    body.year = parseInt(body.year, 10);
    body.createdAt = new Date().toISOString();
    body.updatedAt = body.createdAt;
    writeGameFile(file, body);
    return sendJSON(res, 201, body);
  }

  if (gameMatch && req.method === 'PUT') {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJSON(res, 400, { error: 'Invalid JSON' });
    }
    const file = yearFile(gameMatch[1]);
    const clientUpdatedAt = body.updatedAt || null;
    body.year = parseInt(gameMatch[1], 10);
    GameLogic.syncStatus(body);

    const invalid = GameLogic.validateGame(body);
    if (invalid) return sendJSON(res, 400, { error: invalid });

    if (fs.existsSync(file)) {
      const existing = readGameFile(file);
      // Optimistic concurrency: every client PUTs the whole game, so without
      // this check two devices editing at once silently overwrite each other.
      if (existing.updatedAt && clientUpdatedAt && existing.updatedAt !== clientUpdatedAt) {
        return sendJSON(res, 409, {
          error: 'This game was changed on another device.',
          conflict: true,
          game: existing
        });
      }
      body.createdAt = existing.createdAt || new Date().toISOString();
    } else {
      body.createdAt = new Date().toISOString();
    }
    body.updatedAt = new Date().toISOString();
    writeGameFile(file, body);
    return sendJSON(res, 200, body);
  }

  sendJSON(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, pathname) {
  let requested = pathname === '/' ? '/index.html' : pathname;
  try {
    requested = decodeURIComponent(requested);
  } catch (e) {
    res.writeHead(400);
    return res.end('Bad request');
  }
  const filePath = path.join(PUBLIC_DIR, requested);

  // path.relative is the reliable containment check — a startsWith() prefix
  // test would also accept a sibling folder like `public-backup`.
  const rel = path.relative(PUBLIC_DIR, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).catch(e => {
      sendJSON(res, 500, { error: e.message });
    });
  } else {
    serveStatic(req, res, pathname);
  }
});

function localIPs() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) results.push(net.address);
    }
  }
  return results;
}

server.listen(PORT, () => {
  console.log('');
  console.log('  Super Bowl Grid Game server is running!');
  console.log('');
  console.log(`  On this PC:      http://localhost:${PORT}`);
  const ips = localIPs();
  if (ips.length) {
    ips.forEach(ip => console.log(`  On your iPad:    http://${ip}:${PORT}`));
  } else {
    console.log('  Could not detect a local network IP. Run "ipconfig" to find one.');
  }
  console.log('');
  console.log('  Make sure the iPad is on the same WiFi network as this PC.');
  console.log('  Press Ctrl+C to stop the server.');
  console.log('');
});

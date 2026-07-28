const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

function yearFile(year) {
  const y = String(year).replace(/[^0-9]/g, '');
  return path.join(DATA_DIR, `${y}.json`);
}

function listYears() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const games = files.map(f => {
    try {
      const g = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8'));
      return {
        year: g.year,
        teamA: g.teamA,
        teamB: g.teamB,
        status: g.status,
        updatedAt: g.updatedAt || null
      };
    } catch (e) {
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

  const gameMatch = pathname.match(/^\/api\/game\/(\d{4})$/);
  if (gameMatch && req.method === 'GET') {
    const file = yearFile(gameMatch[1]);
    if (!fs.existsSync(file)) return sendJSON(res, 404, { error: 'Not found' });
    const game = JSON.parse(fs.readFileSync(file, 'utf8'));
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
    if (!body.year) return sendJSON(res, 400, { error: 'Year is required' });
    const file = yearFile(body.year);
    if (fs.existsSync(file)) {
      return sendJSON(res, 409, { error: `A game for ${body.year} already exists.` });
    }
    body.createdAt = new Date().toISOString();
    body.updatedAt = body.createdAt;
    fs.writeFileSync(file, JSON.stringify(body, null, 2));
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
    body.year = parseInt(gameMatch[1], 10);
    body.updatedAt = new Date().toISOString();
    if (fs.existsSync(file)) {
      const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
      body.createdAt = existing.createdAt || body.updatedAt;
    } else {
      body.createdAt = body.updatedAt;
    }
    fs.writeFileSync(file, JSON.stringify(body, null, 2));
    return sendJSON(res, 200, body);
  }

  sendJSON(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(PUBLIC_DIR, decodeURIComponent(filePath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
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

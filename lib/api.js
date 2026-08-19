// Framework-free API handler shared by the LAN server (server.js) and the
// Vercel serverless entry point (api/[...path].js). Deliberately has no
// dependency on anything LAN-only (selfsigned certs, local IP discovery,
// the combined HTTP/HTTPS dispatcher) so it can be imported into the cloud
// path without dragging that code along.
'use strict';

const crypto = require('crypto');
const GameLogic = require('../public/compute.js');
const LiveScore = require('../server-livescore.js');
const store = require('./store.js');
const auth = require('./auth.js');

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

// getHostInfo is optional: the LAN server passes a closure reporting its own
// port/scheme/IPs so phones can be pointed at it. The cloud deploy has no
// such thing — there's one public origin and the browser already knows it —
// so when it's omitted, /api/hosts reports no addresses, and the client
// falls back to location.origin (see screen-gameday.js / screen-player.js).
// Every host-only route funnels through this. Authorization lives here, at
// the route layer, and deliberately NOT in the store: GET /api/game/:id is
// public, and the writes it triggers on the server's own initiative (the
// live-score refresh below, and applyAutoCutoff inside the store) must keep
// working for an anonymous reader. See lib/auth.js for the threat model.
function denyUnlessHost(req, res) {
  if (auth.isHost(req)) return false;
  sendJSON(res, 401, { error: 'Host sign-in required.', authRequired: true });
  return true;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function handleApi(req, res, pathname, query, getHostInfo) {
  // ---- Session ----
  if (pathname === '/api/session' && req.method === 'GET') {
    return sendJSON(res, 200, { authRequired: auth.authRequired(), host: auth.isHost(req) });
  }

  if (pathname === '/api/session' && req.method === 'POST') {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJSON(res, 400, { error: 'Invalid JSON' });
    }
    if (!auth.authRequired()) return sendJSON(res, 200, { authRequired: false, host: true });
    if (!auth.checkPassword(body.password)) {
      // A fixed delay on failure. Serverless instances share no memory, so a
      // real attempt counter would need a table; this plus a long random
      // password is the accepted trade (see MIGRATION-PLAN.md, Phase 4.1).
      await sleep(400);
      return sendJSON(res, 401, { error: 'That password is not right.', authRequired: true });
    }
    auth.setSessionCookie(res, req);
    return sendJSON(res, 200, { authRequired: true, host: true });
  }

  if (pathname === '/api/session' && req.method === 'DELETE') {
    auth.clearSessionCookie(res, req);
    return sendJSON(res, 200, { authRequired: auth.authRequired(), host: !auth.authRequired() });
  }

  // Enumerating every game anyone ever created is the one endpoint that had
  // to close regardless of which access model won.
  if (pathname === '/api/games' && req.method === 'GET') {
    if (denyUnlessHost(req, res)) return;
    return sendJSON(res, 200, await store.listGames());
  }

  if (pathname === '/api/hosts' && req.method === 'GET') {
    const info = getHostInfo ? getHostInfo() : { port: null, httpsReady: false, addresses: [] };
    return sendJSON(res, 200, info);
  }

  // Feeds the "Games" picker on the New Game setup screen. null distinctly
  // means ESPN couldn't be reached at all (502), vs. a real empty schedule
  // ([], 200) — the client shows different text for each.
  if (pathname === '/api/todays-games' && req.method === 'GET') {
    // Host-only: only the New Game setup screen uses it, and leaving it open
    // would publish a free ESPN proxy on the deploy's shared IPs.
    if (denyUnlessHost(req, res)) return;
    const games = await LiveScore.getTodaysGames(query.get('date'), query.get('league'));
    if (games === null) return sendJSON(res, 502, { error: 'ESPN API not available' });
    return sendJSON(res, 200, { games });
  }

  const gameMatch = pathname.match(/^\/api\/game\/([0-9a-f-]{36})$/i);
  // Public by design: the id is the read capability. It's on the player QR
  // code and the TV deep link, so every guest holds it — which is exactly
  // why it authorizes reading one game and nothing else.
  if (gameMatch && req.method === 'GET') {
    const game = await store.getGame(gameMatch[1]);
    if (!game) return sendJSON(res, 404, { error: 'Not found' });

    // Live scores refresh here rather than on a timer, so they work on a host
    // that keeps no long-lived process. The read we just did supplies the
    // concurrency token, so a save landing between that read and this write
    // wins outright and the client is handed that newer game instead.
    const expectedUpdatedAt = game.updatedAt || null;
    if (await LiveScore.refreshLiveScore(game)) {
      GameLogic.syncStatus(game);
      // Either way the caller wants the winning document: our refreshed one if
      // the write landed, or the newer one that beat us to it.
      const saved = await store.updateGame(gameMatch[1], game, expectedUpdatedAt);
      return sendJSON(res, 200, saved.game);
    }
    return sendJSON(res, 200, game);
  }

  if (gameMatch && req.method === 'DELETE') {
    if (denyUnlessHost(req, res)) return;
    const ok = await store.deleteGame(gameMatch[1]);
    if (!ok) return sendJSON(res, 404, { error: 'Not found' });
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/game' && req.method === 'POST') {
    if (denyUnlessHost(req, res)) return;
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJSON(res, 400, { error: 'Invalid JSON' });
    }
    body.id = crypto.randomUUID();
    const invalid = GameLogic.validateGame(body);
    if (invalid) return sendJSON(res, 400, { error: invalid });
    const game = await store.createGame(body);
    return sendJSON(res, 201, game);
  }

  // Host-only, and that covers phone score entry (#score-<id>) too: it is
  // the same whole-document write the picking screen uses, so a leaked score
  // link would otherwise be able to wipe the grid.
  if (gameMatch && req.method === 'PUT') {
    if (denyUnlessHost(req, res)) return;
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      return sendJSON(res, 400, { error: 'Invalid JSON' });
    }
    const clientUpdatedAt = body.updatedAt || null;
    body.id = gameMatch[1].toLowerCase();
    GameLogic.syncStatus(body);

    const invalid = GameLogic.validateGame(body);
    if (invalid) return sendJSON(res, 400, { error: invalid });

    const result = await store.updateGame(gameMatch[1], body, clientUpdatedAt);
    if (!result.ok) {
      return sendJSON(res, 409, {
        error: 'This game was changed on another device.',
        conflict: true,
        game: result.game
      });
    }
    return sendJSON(res, 200, result.game);
  }

  sendJSON(res, 404, { error: 'Not found' });
}

module.exports = { handleApi, sendJSON, readBody };

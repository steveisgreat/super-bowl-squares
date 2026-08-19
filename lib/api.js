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
async function handleApi(req, res, pathname, query, getHostInfo) {
  if (pathname === '/api/games' && req.method === 'GET') {
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
    const games = await LiveScore.getTodaysGames(query.get('date'), query.get('league'));
    if (games === null) return sendJSON(res, 502, { error: 'ESPN API not available' });
    return sendJSON(res, 200, { games });
  }

  const gameMatch = pathname.match(/^\/api\/game\/([0-9a-f-]{36})$/i);
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
    const ok = await store.deleteGame(gameMatch[1]);
    if (!ok) return sendJSON(res, 404, { error: 'Not found' });
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/game' && req.method === 'POST') {
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

  if (gameMatch && req.method === 'PUT') {
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

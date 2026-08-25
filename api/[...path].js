// Vercel serverless entry point. A thin wrapper, not a rewrite — handleApi
// is already a framework-free (req, res) function (see lib/api.js), written
// once and shared with the LAN server in server.js. No getHostInfo is
// passed: there's one public origin here and the browser already knows it,
// so /api/hosts reports no addresses and the client falls back to
// location.origin (see screen-gameday.js / screen-player.js).
'use strict';

const { handleApi, sendJSON } = require('../lib/api.js');

module.exports = async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    await handleApi(req, res, url.pathname, url.searchParams);
  } catch (e) {
    // The detail goes to the server log, never to the client: a failure down
    // in the Postgres driver puts host names and connection-string fragments
    // in e.message, and this endpoint is reachable by anyone holding a game
    // link.
    console.error(`Unhandled API error on ${url.pathname}: ${e.stack || e.message}`);
    sendJSON(res, 500, { error: 'Something went wrong on the server.' });
  }
};

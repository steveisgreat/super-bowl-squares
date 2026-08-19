// Host authentication for the cloud deploy.
//
// Why this exists, and why it is shaped the way it is (Phase 4.1):
//
// On the LAN, the network was the boundary. In the cloud, the game UUID
// cannot be that boundary, because it is not a secret: it is printed on the
// player QR code (#player-<id>), shown on the TV (#tv-<id>) and handed to
// whoever does score entry (#score-<id>). Every guest at the party has it.
// So the id is treated as a READ capability only — good enough to fetch one
// game, never enough to write or delete one.
//
// Writes are all host writes (the player view is strictly read-only), and
// there is exactly one host, so this is one site-wide password rather than a
// per-game passphrase: a per-game secret would add per-game storage and a
// "which phrase was that game?" problem at a party, and still could not
// scope /api/games, since there is no per-game identity to scope it by.
//
// The session is a stateless signed cookie — no session table, no schema
// change, nothing to keep warm between serverless invocations.
//
// HOST_PASSWORD unset => auth is disabled entirely and every request counts
// as the host. That is what keeps the LAN server behaving exactly as it did
// (no login prompt on the couch), and mirrors the DATABASE_URL switch in
// store.js.
'use strict';

const crypto = require('crypto');

const COOKIE = 'sbs_host';
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days — a season of parties.

function hostPassword() {
  const p = process.env.HOST_PASSWORD;
  return p ? String(p) : null;
}

// Auth is on only when a password is configured.
function authRequired() {
  return hostPassword() !== null;
}

// Signing key. SESSION_SECRET is honored if set, so the host can rotate the
// password without logging every device out (or vice versa); otherwise the
// password itself is the key, which means changing it invalidates every
// outstanding cookie — a reasonable default for "someone got the password".
function signingKey() {
  return process.env.SESSION_SECRET || hostPassword() || '';
}

function sign(value) {
  return crypto.createHmac('sha256', signingKey()).update(value).digest('hex');
}

// Both comparisons below go through timingSafeEqual, which throws on a length
// mismatch — so hash first and compare fixed-length digests. That also stops
// the length of the real password leaking through the comparison.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function checkPassword(candidate) {
  const expected = hostPassword();
  if (expected === null) return false;
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  return safeEqual(candidate, expected);
}

// Cookie payload is `<expiry-epoch-seconds>.<hmac>`. The expiry is inside the
// signed value, so an expired cookie cannot be revived by editing it — the
// client-side Max-Age is only a housekeeping hint.
function issueToken() {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS);
  return `${exp}.${sign(exp)}`;
}

function tokenValid(token) {
  if (typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || !/^[0-9a-f]{64}$/i.test(mac)) return false;
  if (Number(exp) * 1000 < Date.now()) return false;
  return safeEqual(mac, sign(exp));
}

function parseCookies(req) {
  const header = req.headers && req.headers.cookie;
  if (!header) return {};
  const out = {};
  header.split(';').forEach(part => {
    const eq = part.indexOf('=');
    if (eq < 1) return;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

// The one question every guarded route asks. With auth disabled this is
// always true, which is precisely the LAN behavior.
function isHost(req) {
  if (!authRequired()) return true;
  return tokenValid(parseCookies(req)[COOKIE]);
}

// HttpOnly so page scripts can't read it; SameSite=Lax so it still rides
// along when a phone opens a #score-<id> link the host texted over. Secure is
// omitted on plain HTTP so the LAN server (and http://localhost) can still
// set it — in the cloud everything is HTTPS, and Vercel terminates TLS
// upstream, so x-forwarded-proto is the honest signal there.
function cookieHeader(value, maxAge) {
  return [
    `${COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ].join('; ');
}

function isSecureRequest(req) {
  const fwd = req.headers && req.headers['x-forwarded-proto'];
  if (fwd) return String(fwd).split(',')[0].trim() === 'https';
  return !!(req.socket && req.socket.encrypted);
}

function setSessionCookie(res, req) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieHeader(issueToken(), MAX_AGE_SECONDS)}${secure}`);
}

function clearSessionCookie(res, req) {
  const secure = isSecureRequest(req) ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${cookieHeader('', 0)}${secure}`);
}

module.exports = {
  COOKIE,
  authRequired,
  checkPassword,
  isHost,
  setSessionCookie,
  clearSessionCookie
};

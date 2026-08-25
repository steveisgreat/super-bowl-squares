// Zero-dependency tests for host authentication (lib/auth.js) and for the
// authorization decisions the API routes make with it (lib/api.js).
//
// This is the security-relevant half of the server, and the properties below
// are the ones that break silently: a write route that quietly loses its guard
// still works perfectly for the host, so nothing looks wrong until someone
// else uses it.
//
// Run with:  node test-auth.js   (or: npm test)
'use strict';

// Must be settled before lib/store.js is required — it picks its backend once,
// at require time, and these tests must never touch a real database.
delete process.env.DATABASE_URL;

const crypto = require('crypto');
const auth = require('./lib/auth.js');
const { handleApi } = require('./lib/api.js');

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n      ${e.message}`);
  }
}

function eq(actual, expected, what) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what || 'value'}: expected ${b}, got ${a}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------- harness ----------

const PASSWORD = 'correct horse battery staple';
const NONEXISTENT = '00000000-0000-4000-8000-000000000000';

// auth.js reads process.env on every call, so the mode can be flipped per test
// rather than needing a separate process for each.
function withAuth(password, secret) {
  if (password === null) delete process.env.HOST_PASSWORD;
  else process.env.HOST_PASSWORD = password;
  if (secret === undefined || secret === null) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = secret;
}

function fakeReq(method, url, opts) {
  const o = opts || {};
  const headers = Object.assign({ host: 'localhost:3000' }, o.headers);
  if (o.cookie) headers.cookie = o.cookie;
  const req = {
    method,
    url,
    headers,
    socket: { encrypted: !!o.encrypted },
    on(event, cb) {
      // Body streaming, for the routes that read one.
      if (event === 'data' && o.body !== undefined) cb(Buffer.from(o.body));
      if (event === 'end') cb();
      return req;
    },
    destroy() {}
  };
  return req;
}

function fakeRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    getHeader(k) { return this.headers[k.toLowerCase()]; },
    writeHead(status, headers) {
      this.statusCode = status;
      Object.keys(headers || {}).forEach(k => { this.headers[k.toLowerCase()] = headers[k]; });
      return this;
    },
    end(body) { this.body = body === undefined ? '' : String(body); return this; },
    get json() { try { return JSON.parse(this.body); } catch (e) { return null; } }
  };
}

async function call(method, path, opts) {
  const req = fakeReq(method, path, opts);
  const url = new URL(path, 'http://localhost:3000');
  const res = fakeRes();
  await handleApi(req, res, url.pathname, url.searchParams);
  return res;
}

// Signs an expiry the way lib/auth.js documents its cookie payload:
// `<expiry-epoch-seconds>.<hmac>`. Written out longhand rather than reusing the
// module's own signer, so a change to the format has to be a deliberate one.
function mintToken(expSeconds, key) {
  const exp = String(expSeconds);
  return `${exp}.${crypto.createHmac('sha256', key).update(exp).digest('hex')}`;
}

function cookieFrom(res) {
  const header = res.getHeader('set-cookie');
  assert(header, 'expected a Set-Cookie header');
  return String(header).split(';')[0];
}

async function run() {

  // ---------- lib/auth.js ----------

  await check('no password configured disables auth entirely (the LAN default)', () => {
    withAuth(null);
    eq(auth.authRequired(), false, 'authRequired');
    assert(auth.isHost(fakeReq('GET', '/')), 'every request is the host when auth is off');
  });

  await check('a configured password turns auth on and rejects anonymous requests', () => {
    withAuth(PASSWORD);
    eq(auth.authRequired(), true, 'authRequired');
    assert(!auth.isHost(fakeReq('GET', '/')), 'no cookie must not be the host');
  });

  await check('checkPassword accepts only the exact password', () => {
    withAuth(PASSWORD);
    assert(auth.checkPassword(PASSWORD), 'the real password must be accepted');
    assert(!auth.checkPassword(PASSWORD + 'x'), 'a longer near-miss must be rejected');
    assert(!auth.checkPassword(PASSWORD.slice(0, -1)), 'a prefix must be rejected');
    assert(!auth.checkPassword(''), 'empty must be rejected');
    assert(!auth.checkPassword(undefined), 'undefined must be rejected');
    assert(!auth.checkPassword(null), 'null must be rejected');
    assert(!auth.checkPassword(12345), 'a non-string must be rejected');
    assert(!auth.checkPassword({}), 'an object must be rejected');
  });

  await check('checkPassword is false when no password is configured', () => {
    withAuth(null);
    assert(!auth.checkPassword('anything'), 'nothing authenticates against an unset password');
  });

  await check('an issued cookie round-trips back as the host', () => {
    withAuth(PASSWORD);
    const res = fakeRes();
    auth.setSessionCookie(res, fakeReq('POST', '/api/session'));
    assert(auth.isHost(fakeReq('GET', '/', { cookie: cookieFrom(res) })), 'issued cookie must authenticate');
  });

  await check('a tampered signature is rejected', () => {
    withAuth(PASSWORD);
    const res = fakeRes();
    auth.setSessionCookie(res, fakeReq('POST', '/api/session'));
    const cookie = cookieFrom(res);
    const flipped = cookie.slice(0, -1) + (cookie.endsWith('a') ? 'b' : 'a');
    assert(!auth.isHost(fakeReq('GET', '/', { cookie: flipped })), 'a flipped MAC byte must fail');
  });

  await check('the expiry is inside the signature, so it cannot be extended by hand', () => {
    withAuth(PASSWORD);
    const past = Math.floor(Date.now() / 1000) - 60;
    const expired = mintToken(past, PASSWORD);
    assert(!auth.isHost(fakeReq('GET', '/', { cookie: `sbs_host=${expired}` })), 'an expired token must fail');

    // Rewrite the expiry to the far future, keeping the signature that was
    // valid for the old one. This is the whole reason the expiry is signed.
    const future = Math.floor(Date.now() / 1000) + 99999;
    const forged = `${future}.${expired.split('.')[1]}`;
    assert(!auth.isHost(fakeReq('GET', '/', { cookie: `sbs_host=${forged}` })), 'a re-dated token must fail');
  });

  await check('malformed cookies are rejected without throwing', () => {
    withAuth(PASSWORD);
    const junk = [
      '', 'sbs_host=', 'sbs_host=.', 'sbs_host=abc', 'sbs_host=abc.def',
      'sbs_host=123', 'sbs_host=' + 'z'.repeat(64), 'nonsense', '=', ';;;',
      'sbs_host=' + mintToken(Math.floor(Date.now() / 1000) + 600, 'wrong key')
    ];
    junk.forEach(cookie => {
      assert(!auth.isHost(fakeReq('GET', '/', { cookie })), `must reject: ${JSON.stringify(cookie)}`);
    });
  });

  await check('changing the password invalidates outstanding cookies', () => {
    withAuth(PASSWORD);
    const res = fakeRes();
    auth.setSessionCookie(res, fakeReq('POST', '/api/session'));
    const cookie = cookieFrom(res);
    assert(auth.isHost(fakeReq('GET', '/', { cookie })), 'valid before the change');
    withAuth('a completely different password');
    assert(!auth.isHost(fakeReq('GET', '/', { cookie })), 'must not survive a password change');
  });

  await check('SESSION_SECRET decouples the cookie from the password', () => {
    withAuth(PASSWORD, 'a-separate-signing-secret');
    const res = fakeRes();
    auth.setSessionCookie(res, fakeReq('POST', '/api/session'));
    const cookie = cookieFrom(res);
    withAuth('rotated to something else', 'a-separate-signing-secret');
    assert(auth.isHost(fakeReq('GET', '/', { cookie })), 'the cookie must survive a password rotation');
    withAuth(PASSWORD);
  });

  await check('the cookie is HttpOnly, SameSite=Lax and Secure only over HTTPS', () => {
    withAuth(PASSWORD);
    const plain = fakeRes();
    auth.setSessionCookie(plain, fakeReq('POST', '/api/session'));
    const header = String(plain.getHeader('set-cookie'));
    assert(/HttpOnly/.test(header), 'HttpOnly must be set');
    assert(/SameSite=Lax/.test(header), 'SameSite=Lax must be set');
    assert(/Path=\//.test(header), 'Path=/ must be set');
    // Plain HTTP is the LAN server and http://localhost; Secure there would
    // stop the cookie being stored at all.
    assert(!/Secure/.test(header), 'Secure must be omitted on plain HTTP');

    const fwd = fakeRes();
    auth.setSessionCookie(fwd, fakeReq('POST', '/api/session', { headers: { 'x-forwarded-proto': 'https' } }));
    assert(/Secure/.test(String(fwd.getHeader('set-cookie'))), 'Secure must be set behind an HTTPS proxy');

    const tls = fakeRes();
    auth.setSessionCookie(tls, fakeReq('POST', '/api/session', { encrypted: true }));
    assert(/Secure/.test(String(tls.getHeader('set-cookie'))), 'Secure must be set on a direct TLS socket');
  });

  await check('clearing the session expires the cookie immediately', () => {
    withAuth(PASSWORD);
    const res = fakeRes();
    auth.clearSessionCookie(res, fakeReq('DELETE', '/api/session'));
    const header = String(res.getHeader('set-cookie'));
    assert(/Max-Age=0/.test(header), 'Max-Age=0 must be set');
    assert(!auth.isHost(fakeReq('GET', '/', { cookie: cookieFrom(res) })), 'the cleared value must not authenticate');
  });

  // ---------- route authorization (lib/api.js) ----------
  //
  // The guarded routes must refuse an anonymous caller BEFORE reaching the
  // store or the network. Each write below targets an id that does not exist:
  // a 401 proves the guard ran first, where a 404 would prove it did not.

  await check('every write route refuses an anonymous caller with 401', async () => {
    withAuth(PASSWORD);
    const cases = [
      ['GET', '/api/games'],
      ['POST', '/api/game', { body: '{}' }],
      ['PUT', `/api/game/${NONEXISTENT}`, { body: '{}' }],
      ['DELETE', `/api/game/${NONEXISTENT}`],
      ['GET', '/api/todays-games?league=nfl']
    ];
    for (const [method, path, opts] of cases) {
      const res = await call(method, path, opts);
      eq(res.statusCode, 401, `${method} ${path} status`);
      eq(res.json.authRequired, true, `${method} ${path} must tell the client to sign in`);
    }
  });

  await check('reading one game by id stays public — the id is the read capability', async () => {
    withAuth(PASSWORD);
    const res = await call('GET', `/api/game/${NONEXISTENT}`);
    // 404 (not 401) is the point: an anonymous player view got past the guard
    // and all the way to the store, and simply found nothing there.
    eq(res.statusCode, 404, 'an anonymous GET must reach the store');
  });

  await check('with auth disabled the write routes are open again (LAN behavior)', async () => {
    withAuth(null);
    const res = await call('DELETE', `/api/game/${NONEXISTENT}`);
    eq(res.statusCode, 404, 'no password configured means no guard');
    const list = await call('GET', '/api/games');
    eq(list.statusCode, 200, 'the games list is open on the LAN');
  });

  await check('GET /api/session reports the mode without leaking anything', async () => {
    withAuth(null);
    eq((await call('GET', '/api/session')).json, { authRequired: false, host: true }, 'auth off');
    withAuth(PASSWORD);
    eq((await call('GET', '/api/session')).json, { authRequired: true, host: false }, 'auth on, anonymous');
  });

  await check('signing in issues a cookie that then authorizes a guarded route', async () => {
    withAuth(PASSWORD);
    const login = await call('POST', '/api/session', { body: JSON.stringify({ password: PASSWORD }) });
    eq(login.statusCode, 200, 'login status');
    eq(login.json.host, true, 'login must report host');

    const cookie = cookieFrom(login);
    const list = await call('GET', '/api/games', { cookie });
    eq(list.statusCode, 200, 'the session cookie must open /api/games');
  });

  await check('a wrong password is refused and issues no cookie', async () => {
    withAuth(PASSWORD);
    const res = await call('POST', '/api/session', { body: JSON.stringify({ password: 'nope' }) });
    eq(res.statusCode, 401, 'status');
    assert(!res.getHeader('set-cookie'), 'a failed login must not set a cookie');
  });

  await check('a malformed login body is a 400, not a crash or a bypass', async () => {
    withAuth(PASSWORD);
    const res = await call('POST', '/api/session', { body: 'not json' });
    eq(res.statusCode, 400, 'status');
    assert(!res.getHeader('set-cookie'), 'a malformed login must not set a cookie');
  });

  await check('signing out clears the cookie and closes the guarded routes again', async () => {
    withAuth(PASSWORD);
    const login = await call('POST', '/api/session', { body: JSON.stringify({ password: PASSWORD }) });
    const cookie = cookieFrom(login);
    const out = await call('DELETE', '/api/session', { cookie });
    eq(out.statusCode, 200, 'status');
    eq(out.json.host, false, 'signing out must report the caller is no longer the host');
    const cleared = cookieFrom(out);
    eq((await call('GET', '/api/games', { cookie: cleared })).statusCode, 401, 'the cleared cookie must not open /api/games');
  });

  // ---------- report ----------

  console.log('');
  if (failures.length === 0) {
    console.log(`  All ${passed} tests passed.`);
    console.log('');
  } else {
    console.log(`  ${passed} passed, ${failures.length} FAILED:`);
    console.log('');
    failures.forEach(f => console.log(`  ✗ ${f}\n`));
    process.exitCode = 1;
  }
}

run();

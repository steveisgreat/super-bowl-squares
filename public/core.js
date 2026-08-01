// Application core: the server API, the router, and the interval registry.
// Everything hangs off a single global `SBS` namespace — the app is loaded as
// plain <script> tags in dependency order (see index.html), no bundler.
(function () {
  'use strict';

  const SBS = window.SBS = window.SBS || {};

  SBS.appEl = document.getElementById('app');
  SBS.screens = {}; // filled in by the screens-*.js files

  // ---------- API ----------
  async function request(path, opts) {
    let res;
    try {
      res = await fetch(path, opts);
    } catch (e) {
      throw new Error('Could not reach the server. Make sure it\'s running (double-click start-app.bat or start-server.bat in the project folder), then try again.');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      if (res.status === 409 && data && data.conflict) {
        err.conflict = true;
        err.game = data.game;
      }
      throw err;
    }
    return data;
  }

  const json = (method, body) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  SBS.api = {
    getGames: () => request('/api/games'),
    getGame: (id) => request(`/api/game/${id}`),
    createGame: (game) => request('/api/game', json('POST', game)),
    saveGame: (game) => request(`/api/game/${game.id}`, json('PUT', game)),
    deleteGame: (id) => request(`/api/game/${id}`, { method: 'DELETE' }),
    getHosts: () => request('/api/hosts'),
    getTodaysGames: (date, league) => request(`/api/todays-games?${new URLSearchParams({ date: date || '', league: league || '' })}`)
  };

  // Another device saved between our last load and this save. Rather than
  // clobber their changes (the server refuses that now), take theirs and
  // re-render so the host can see the real state.
  SBS.handleConflict = async function (e, id) {
    if (!e || !e.conflict) return false;
    await SBS.ui.showAlert('This game was just changed on another device, so your last change was not saved. Loading the latest version…');
    try {
      const fresh = e.game && e.game.squares ? e.game : await SBS.api.getGame(id);
      SBS.go({ screen: (fresh.status === 'started' || fresh.status === 'finished') ? 'board' : 'picking', game: fresh });
    } catch (err) {
      SBS.go({ screen: 'home' });
    }
    return true;
  };

  // ---------- Router ----------
  let route = { screen: 'home' };

  SBS.getRoute = () => route;
  SBS.currentScreen = () => route.screen;

  SBS.go = function (newRoute) {
    route = newRoute;
    SBS.render();
    window.scrollTo(0, 0);
  };

  SBS.render = function () {
    clearManagedTimers();
    runCleanups();
    const s = SBS.screens;
    if (route.screen === 'home') return s.home();
    if (route.screen === 'setup') return s.setup();
    if (route.screen === 'editGame') return s.editGame(route.game);
    if (route.screen === 'picking') return s.picking(route.game);
    if (route.screen === 'board') return s.board(route.game);
    if (route.screen === 'tv') return s.tv(route.id);
    if (route.screen === 'phone') return s.phone(route.id, route.back);
    if (route.screen === 'player') return s.player(route.id);
  };

  // Deep links, so the TV and the phone can each be pointed straight at the
  // view they need: #tv-<id> (grid on the television) and #score-<id>
  // (quarter entry on a phone). The phone link always opens in its own tab
  // (a new one on the same device, or literally a different phone that
  // scanned the QR code), so there's no shared browser history to "go back"
  // through — the launching screen instead has to be baked into the link
  // itself as an optional `-home`/`-board` suffix, read back here as
  // `route.back`. Defaults to 'board', matching the Game Day screen's own
  // "Phone Score Entry" button, which doesn't bother adding the suffix.
  const ID_RE = '[0-9a-f-]{36}';
  SBS.parseInitialRoute = function () {
    const hash = window.location.hash || '';
    const tv = hash.match(new RegExp(`^#tv-(${ID_RE})$`, 'i'));
    if (tv) return { screen: 'tv', id: tv[1] };
    const phone = hash.match(new RegExp(`^#score-(${ID_RE})(?:-(home|board))?$`, 'i'));
    if (phone) return { screen: 'phone', id: phone[1], back: phone[2] || 'board' };
    // Player companion view: what a grid player sees after scanning the QR
    // code printed/shown at the party — their squares, quarter winners, and
    // a live "how am I doing" readout. Strictly read-only (see screen-player.js).
    const player = hash.match(new RegExp(`^#player-(${ID_RE})$`, 'i'));
    if (player) return { screen: 'player', id: player[1] };
    return { screen: 'home' };
  };

  // ---------- Timers ----------
  // Screens used to leave their intervals running after a re-render; on the
  // picking screen that meant a fresh auto-cutoff watcher per claim, all firing
  // at once. Every interval registers here and is cleared on each render.
  let activeTimers = [];

  function clearManagedTimers() {
    activeTimers.forEach(clearInterval);
    activeTimers = [];
  }

  SBS.setManagedInterval = function (fn, ms) {
    const t = setInterval(fn, ms);
    activeTimers.push(t);
    return t;
  };
  SBS.clearManagedTimers = clearManagedTimers;

  // Same idea for anything else a screen leaves behind — body classes, document
  // listeners. Registered callbacks run once, on the next render.
  let cleanups = [];

  function runCleanups() {
    const pending = cleanups;
    cleanups = [];
    pending.forEach(fn => {
      try { fn(); } catch (e) { console.error('Screen cleanup failed', e); }
    });
  }

  SBS.onLeaveScreen = function (fn) {
    cleanups.push(fn);
  };
})();

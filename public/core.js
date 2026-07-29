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
    getYears: () => request('/api/years'),
    getGame: (year) => request(`/api/game/${year}`),
    createGame: (game) => request('/api/game', json('POST', game)),
    saveGame: (game) => request(`/api/game/${game.year}`, json('PUT', game)),
    deleteGame: (year) => request(`/api/game/${year}`, { method: 'DELETE' }),
    getHosts: () => request('/api/hosts')
  };

  // Another device saved between our last load and this save. Rather than
  // clobber their changes (the server refuses that now), take theirs and
  // re-render so the host can see the real state.
  SBS.handleConflict = async function (e, year) {
    if (!e || !e.conflict) return false;
    await SBS.ui.showAlert('This game was just changed on another device, so your last change was not saved. Loading the latest version…');
    try {
      const fresh = e.game && e.game.squares ? e.game : await SBS.api.getGame(year);
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
    if (route.screen === 'picking') return s.picking(route.game);
    if (route.screen === 'board') return s.board(route.game);
    if (route.screen === 'tv') return s.tv(route.year);
    if (route.screen === 'phone') return s.phone(route.year);
  };

  // Deep links, so the TV and the phone can each be pointed straight at the
  // view they need: #tv-2027 (grid on the television) and #score-2027 (quarter
  // entry on a phone).
  SBS.parseInitialRoute = function () {
    const hash = window.location.hash || '';
    const tv = hash.match(/^#tv-(\d{4})$/);
    if (tv) return { screen: 'tv', year: parseInt(tv[1], 10) };
    const phone = hash.match(/^#score-(\d{4})$/);
    if (phone) return { screen: 'phone', year: parseInt(phone[1], 10) };
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

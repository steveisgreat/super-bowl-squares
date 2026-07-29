// Shared DOM helpers: element building, escaping, money formatting, the modal
// stack, the top bar, and the team colour/logo theming.
(function () {
  'use strict';

  const SBS = window.SBS = window.SBS || {};

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function money(n) {
    if (isNaN(n)) n = 0;
    return '$' + Math.round(n).toLocaleString();
  }

  const OVERLAY_CSS = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:1000; padding:20px;';

  function overlayEl(opacity) {
    const overlay = el('div', '');
    overlay.style.cssText = opacity ? OVERLAY_CSS.replace('0.6', opacity) : OVERLAY_CSS;
    return overlay;
  }

  // Native confirm()/alert() are unreliable on iPad and invisible on an
  // AirPlayed TV, so every prompt goes through these.
  function showModal({ message, okText, cancelText }) {
    return new Promise(resolve => {
      const overlay = overlayEl();
      const box = el('div', 'card');
      box.style.cssText = 'max-width:440px; width:100%; box-shadow: var(--shadow-pop);';
      box.appendChild(el('p', '', message));
      const actions = el('div', 'actions');
      const okBtn = el('button', '', okText || 'OK');
      actions.appendChild(okBtn);
      if (cancelText !== null) {
        const cancelBtn = el('button', 'secondary', cancelText || 'Cancel');
        cancelBtn.addEventListener('click', () => { overlay.remove(); resolve(false); });
        actions.appendChild(cancelBtn);
      }
      okBtn.addEventListener('click', () => { overlay.remove(); resolve(true); });
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }

  const showConfirm = (message) => showModal({ message, okText: 'Confirm', cancelText: 'Cancel' });
  const showAlert = (message) => showModal({ message, okText: 'OK', cancelText: null });

  // Generic multi-button choice modal (used for duplicate-name resolution etc.)
  function showChoice({ message, buttons }) {
    return new Promise(resolve => {
      const overlay = overlayEl();
      const box = el('div', 'card');
      box.style.cssText = 'max-width:480px; width:100%; box-shadow: var(--shadow-pop);';
      box.appendChild(el('p', '', message));
      const actions = el('div', 'actions');
      buttons.forEach(b => {
        const btn = el('button', b.variant || '', b.label);
        btn.addEventListener('click', () => { overlay.remove(); resolve(b.value); });
        actions.appendChild(btn);
      });
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
    });
  }

  function topbar(title, extraButtons, opts) {
    const bar = el('div', 'topbar');
    bar.appendChild(el('h1', '', title));
    const nav = el('div', 'nav');
    if (!opts || opts.hideHome !== true) {
      const homeBtn = el('button', 'secondary', 'Home');
      homeBtn.addEventListener('click', () => SBS.go({ screen: 'home' }));
      nav.appendChild(homeBtn);
    }
    (extraButtons || []).forEach(btn => nav.appendChild(btn));
    bar.appendChild(nav);
    return bar;
  }

  function statusLabel(s) {
    return { setup: 'Setup', picking: 'Picking Squares', started: 'In Progress', finished: 'Finished' }[s] || s;
  }

  function currentDefaultYear() {
    const now = new Date();
    // Super Bowl happens in Feb; the "season year" people use is usually the year of the game itself.
    return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  }

  // ---------- Team colours / logos (auto-detected from free-text team names) ----------
  const DEFAULT_COLORS = { teamA: '#ff6b6b', teamAAlt: '#ffb3b3', teamB: '#4dabf7', teamBAlt: '#a5d8ff' };

  function teamMeta(name) {
    return (window.TeamData && window.TeamData.findTeamMeta(name)) || null;
  }

  function applyTeamColors(game) {
    const root = document.documentElement;
    const metaA = teamMeta(game.teamA);
    const metaB = teamMeta(game.teamB);
    root.style.setProperty('--teamA', metaA ? metaA.primary : DEFAULT_COLORS.teamA);
    root.style.setProperty('--teamA-alt', metaA ? metaA.secondary : DEFAULT_COLORS.teamAAlt);
    root.style.setProperty('--teamB', metaB ? metaB.primary : DEFAULT_COLORS.teamB);
    root.style.setProperty('--teamB-alt', metaB ? metaB.secondary : DEFAULT_COLORS.teamBAlt);
    return { metaA, metaB };
  }

  function resetTeamColors() {
    const root = document.documentElement;
    ['--teamA', '--teamA-alt', '--teamB', '--teamB-alt'].forEach(p => root.style.removeProperty(p));
  }

  const HELMET_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
    <ellipse cx='33' cy='28' rx='25' ry='21' fill='%237b8794'/>
    <path d='M9 32 Q7 48 25 53 L26 44 Q15 40 13 30 Z' fill='%237b8794'/>
    <ellipse cx='33' cy='28' rx='25' ry='21' fill='none' stroke='%234a5773' stroke-width='2'/>
    <path d='M29 39 L47 39 M28 45 L45 45 M30 51 L40 51' stroke='%232a3346' stroke-width='3' stroke-linecap='round'/>
  </svg>`;
  const HELMET_DATA_URI = 'data:image/svg+xml,' + HELMET_SVG.replace(/\s+/g, ' ').trim();

  // Logos come from ESPN's CDN at runtime; the helmet is the offline fallback
  // so the TV layout never shows a broken image — and also what renders for a
  // free-text team name that doesn't match a real NFL team, so a logo icon is
  // always present rather than sometimes missing.
  function teamLogoTag(name, size) {
    const meta = teamMeta(name);
    const s = size || 28;
    if (!meta || !window.TeamData) {
      return `<img src="${HELMET_DATA_URI}" class="team-logo" style="--logo-size:${s}px;" alt="">`;
    }
    const url = window.TeamData.logoUrl(meta);
    return `<img src="${url}" class="team-logo" style="--logo-size:${s}px;" onerror="this.onerror=null;this.src='${HELMET_DATA_URI}';" alt="${escapeHtml(meta.names[0])}">`;
  }

  // ---------- Team badge (colored pill: team color as background, logo, and
  // an auto-picked readable text color) ----------
  // Every place a team name is displayed uses this, so a dark brand color
  // (navy, purple, black...) never becomes low-contrast text on our dark
  // theme — the color becomes the badge's background instead, paired with
  // whichever of near-white/near-black actually reads against it.
  function relLuminance(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const lin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function readableTextColor(bgHex) {
    const lum = relLuminance(bgHex);
    const contrastWhite = 1.05 / (lum + 0.05);
    const contrastBlack = (lum + 0.05) / 0.05;
    return contrastWhite >= contrastBlack ? '#f4f7fa' : '#12181f';
  }

  // `side` ('A' or 'B') only matters as a fallback when the name doesn't
  // match a real NFL team, to pick which of the two default colors to use.
  function teamColor(name, side) {
    const meta = teamMeta(name);
    return meta ? meta.primary : (side === 'B' ? DEFAULT_COLORS.teamB : DEFAULT_COLORS.teamA);
  }

  function teamBadge(name, side, opts) {
    opts = opts || {};
    const bg = teamColor(name, side);
    const fg = readableTextColor(bg);
    const logo = teamLogoTag(name, opts.logoSize || 20);
    const cls = 'team-badge' + (opts.cls ? ' ' + opts.cls : '');
    return `<span class="${cls}" style="background:${bg}; color:${fg};">${logo}<span class="team-badge-name">${escapeHtml(name)}</span></span>`;
  }

  // ---------- Fullscreen ----------
  // iPadOS Safari only exposes the webkit-prefixed calls, and iPhone Safari has
  // no element fullscreen at all — so callers must not depend on this working.
  // The TV view hides its own chrome regardless, which is most of the benefit
  // when the screen is being mirrored to a television anyway.
  const fullscreen = {
    supported() {
      const d = document.documentElement;
      return !!(d.requestFullscreen || d.webkitRequestFullscreen || d.webkitRequestFullScreen);
    },
    active() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement);
    },
    async enter() {
      const d = document.documentElement;
      const fn = d.requestFullscreen || d.webkitRequestFullscreen || d.webkitRequestFullScreen;
      if (!fn) return false;
      try {
        await fn.call(d);
        return true;
      } catch (e) {
        return false;
      }
    },
    async exit() {
      const fn = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen;
      if (!fn) return false;
      try {
        await fn.call(document);
        return true;
      } catch (e) {
        return false;
      }
    },
    onChange(handler) {
      document.addEventListener('fullscreenchange', handler);
      document.addEventListener('webkitfullscreenchange', handler);
      return () => {
        document.removeEventListener('fullscreenchange', handler);
        document.removeEventListener('webkitfullscreenchange', handler);
      };
    }
  };

  // ---------- Screen wake lock ----------
  // The TV grid is meant to sit on screen for hours. If the iPad it is mirrored
  // from auto-locks, AirPlay stops and the television goes dark — so hold a wake
  // lock while the TV view is up, and re-acquire it after the tab is
  // backgrounded (the browser drops the lock on visibility change).
  function keepScreenAwake() {
    if (!('wakeLock' in navigator)) return () => {};
    let lock = null;
    let released = false;

    async function acquire() {
      if (released || document.visibilityState !== 'visible') return;
      try {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => { lock = null; });
      } catch (e) {
        // Denied (often on battery saver) — nothing to do but carry on.
      }
    }

    const onVisible = () => { if (!lock) acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    acquire();

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (lock) { lock.release().catch(() => {}); lock = null; }
    };
  }

  SBS.ui = {
    el, escapeHtml, money, overlayEl, fullscreen, keepScreenAwake,
    showModal, showConfirm, showAlert, showChoice,
    topbar, statusLabel, currentDefaultYear,
    teamMeta, applyTeamColors, resetTeamColors, teamLogoTag,
    teamColor, readableTextColor, teamBadge
  };
})();

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

  const HEADER_ICON = `<svg class="header-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="2" y="2" width="9" height="9" rx="2.5" fill="currentColor"/>
    <rect x="13" y="2" width="9" height="9" rx="2.5" fill="currentColor" opacity="0.75"/>
    <rect x="2" y="13" width="9" height="9" rx="2.5" fill="currentColor" opacity="0.75"/>
    <rect x="13" y="13" width="9" height="9" rx="2.5" fill="currentColor" opacity="0.5"/>
  </svg>`;

  const HOME_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M4 11.5 12 4l8 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6 10v9a1 1 0 0 0 1 1h3.5v-5.5a1.5 1.5 0 0 1 1.5-1.5v0a1.5 1.5 0 0 1 1.5 1.5V20H17a1 1 0 0 0 1-1v-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const TV_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3" y="5" width="18" height="12" rx="2" stroke="currentColor" stroke-width="2"/>
    <path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
  const PHONE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" stroke-width="2"/>
    <path d="M11 18h2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
  const PEOPLE_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="9" cy="8" r="3" stroke="currentColor" stroke-width="2"/>
    <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <circle cx="17" cy="9" r="2.5" stroke="currentColor" stroke-width="2"/>
    <path d="M15.5 14.2c2.8.4 5 2.7 5 5.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

  // Smart TV browsers (Samsung Tizen, LG webOS, generic HbbTV) identify
  // themselves in the UA string even though they otherwise look like a
  // plain desktop Chrome — Tizen's UA has no "Windows"/"Mac OS X"/"Linux"
  // distro marker recognized below, so detectDeviceInfo() falls through to
  // "Desktop". This is a separate, narrower check just for that.
  function isTvBrowser() {
    return /SMART-TV|SmartTV|Tizen|Web0S|WebOS|HbbTV|NETCAST|BRAVIA|GoogleTV|AFT[A-Z]/i.test(navigator.userAgent || '');
  }

  // Phone vs. tablet/desktop, using the same UA heuristic as
  // detectDeviceInfo()'s "Mobile" classification (iPad/Android-tablet
  // excluded so this only flags actual phone-sized screens).
  function isPhone() {
    const ua = navigator.userAgent || '';
    const isTouch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    const isIpad = /iPad/.test(ua) || (/Macintosh/.test(ua) && isTouch);
    return /Mobi|iPhone|Android.*Mobile/.test(ua) && !isIpad;
  }

  // Best-effort device fingerprint for the header icon's hover tooltip —
  // parsed from the UA string, so it's a guess (especially on iPadOS, which
  // reports itself as Mac) rather than a guarantee.
  function detectDeviceInfo() {
    const ua = navigator.userAgent || '';
    const isTouch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
    const isIpad = /iPad/.test(ua) || (/Macintosh/.test(ua) && isTouch);
    let type = 'Desktop';
    if (/Mobi|iPhone|Android.*Mobile/.test(ua) && !isIpad) type = 'Mobile';
    else if (/iPad|Tablet|Android(?!.*Mobile)/.test(ua) || isIpad) type = 'Tablet';

    let os = 'Unknown OS';
    if (isIpad) os = 'iPadOS';
    else if (/iPhone|iOS/.test(ua)) os = 'iOS';
    else if (/Android/.test(ua)) os = 'Android';
    else if (/Windows/.test(ua)) os = 'Windows';
    else if (/Mac OS X/.test(ua)) os = 'macOS';
    else if (/Linux/.test(ua)) os = 'Linux';

    let browser = 'Unknown Browser';
    if (/Edg\//.test(ua)) browser = 'Edge';
    else if (/OPR\//.test(ua)) browser = 'Opera';
    else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
    else if (/CriOS\//.test(ua)) browser = 'Chrome (iOS)';
    else if (/Firefox\//.test(ua)) browser = 'Firefox';
    else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = 'Safari';

    const w = (window.screen && window.screen.width) || window.innerWidth;
    const h = (window.screen && window.screen.height) || window.innerHeight;

    return [
      `Device: ${type}`,
      `OS: ${os}`,
      `Browser: ${browser}`,
      `Screen: ${w}×${h}`,
      `Touch: ${isTouch ? 'Yes' : 'No'}`
    ];
  }

  function topbar(title, extraButtons, opts) {
    const bar = el('div', 'topbar');
    let homeBtn = null;
    if (!opts || opts.hideHome !== true) {
      homeBtn = el('button', 'icon-btn home-btn', HOME_ICON);
      homeBtn.type = 'button';
      homeBtn.setAttribute('aria-label', 'Home');
      homeBtn.title = 'Home';
      homeBtn.addEventListener('click', () => SBS.go({ screen: 'home' }));
    }
    if (homeBtn && opts && opts.homeLeft) bar.appendChild(homeBtn);
    const h1Cls = 'badge-fit' + (opts && opts.pill ? ' brand-pill' : '');
    const h1 = el('h1', h1Cls, (opts && opts.hideIcon ? '' : HEADER_ICON) + title);
    const infoLines = detectDeviceInfo();
    h1.title = infoLines.join('\n');
    // Hover tooltips don't work on touch devices (phone/iPad) or TV
    // remotes, so tapping/clicking the icon also surfaces the same info
    // through the existing cross-device modal.
    h1.style.cursor = 'pointer';
    h1.addEventListener('click', () => showAlert(infoLines.map(escapeHtml).join('<br>')));
    bar.appendChild(h1);
    const nav = el('div', 'nav');
    if (homeBtn && !(opts && opts.homeLeft)) nav.appendChild(homeBtn);
    (extraButtons || []).forEach(btn => nav.appendChild(btn));
    bar.appendChild(nav);
    return bar;
  }

  function statusLabel(s) {
    return { setup: 'Setup', picking: 'Picking Squares', started: 'In Progress', finished: 'Finished' }[s] || s;
  }

  const LEAGUE_LABELS = { nfl: 'NFL', nba: 'NBA', other: 'Other' };
  function leagueLabel(league) { return LEAGUE_LABELS[league] || 'Other'; }

  // League-level (not team-level) logos, from the same ESPN CDN as the team
  // logos above. 'other' has no logo at all — its badge is just the word.
  const LEAGUE_LOGO_URL = {
    nfl: 'https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png',
    nba: 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png'
  };

  function leagueBadge(league) {
    const cls = `league-badge league-${league || 'other'}`;
    const label = leagueLabel(league);
    const logo = LEAGUE_LOGO_URL[league];
    if (!logo) return `<span class="${cls}">${label}</span>`;
    // If the CDN logo 404s, hide it and reveal the text fallback that's
    // already sitting there — same "never show a broken image" rule the
    // team logos follow, just swapping visibility instead of swapping src.
    return `<span class="${cls}" title="${label}">`
      + `<img src="${logo}" class="league-badge-logo" alt="${label}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline';">`
      + `<span class="league-badge-text" style="display:none;">${label}</span>`
      + `</span>`;
  }

  // ---------- Team colours / logos ----------
  // NFL/NBA colors are auto-detected from free-text team names; 'other' has no
  // team database at all, so its colors always come from the host's own
  // color-picker choice on the game (teamAColor/teamBColor).
  const DEFAULT_COLORS = { teamA: '#ff6b6b', teamAAlt: '#ffb3b3', teamB: '#4dabf7', teamBAlt: '#a5d8ff' };

  function teamMeta(name, league) {
    return (window.TeamData && window.TeamData.findTeamMeta(name, league)) || null;
  }

  // Darkens (negative percent) or lightens (positive) a hex color — used to
  // invent a plausible "secondary" shade for a custom 'other'-league color,
  // since the host only picks one color per team.
  function shadeColor(hex, percent) {
    const n = parseInt(String(hex || '').replace('#', ''), 16);
    if (isNaN(n)) return hex;
    const clamp = v => Math.max(0, Math.min(255, v));
    const amt = Math.round(2.55 * percent);
    const r = clamp(((n >> 16) & 255) + amt);
    const g = clamp(((n >> 8) & 255) + amt);
    const b = clamp((n & 255) + amt);
    return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
  }

  // Resolves everything needed to render one side ('A' or 'B') of a game's
  // matchup: brand color pair, font, abbreviation, and whether a real team
  // was actually matched (vs. falling back to defaults).
  function teamStyle(game, side) {
    const name = side === 'A' ? game.teamA : game.teamB;
    const league = game && game.league;
    if (league === 'other') {
      const custom = side === 'A' ? game.teamAColor : game.teamBColor;
      const primary = custom || (side === 'B' ? DEFAULT_COLORS.teamB : DEFAULT_COLORS.teamA);
      return { primary, secondary: shadeColor(primary, -22), font: null, abbr: teamAbbr(name, null), matched: false, league };
    }
    const meta = teamMeta(name, league);
    if (meta) {
      return { primary: meta.primary, secondary: meta.secondary, font: meta.font, abbr: meta.abbr.toUpperCase(), matched: true, league, meta };
    }
    return {
      primary: side === 'B' ? DEFAULT_COLORS.teamB : DEFAULT_COLORS.teamA,
      secondary: side === 'B' ? DEFAULT_COLORS.teamBAlt : DEFAULT_COLORS.teamAAlt,
      font: null, abbr: teamAbbr(name, null), matched: false, league
    };
  }

  function applyTeamColors(game) {
    const root = document.documentElement;
    const a = teamStyle(game, 'A');
    const b = teamStyle(game, 'B');
    root.style.setProperty('--teamA', a.primary);
    root.style.setProperty('--teamA-alt', a.secondary);
    root.style.setProperty('--teamB', b.primary);
    root.style.setProperty('--teamB-alt', b.secondary);
    return { styleA: a, styleB: b };
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
  // free-text team name that doesn't match a real team (or for the 'other'
  // league, which has no logos at all), so a logo icon is always present
  // rather than sometimes missing.
  function teamLogoTag(game, side, size) {
    const style = teamStyle(game, side);
    const s = size || 28;
    if (!style.matched || !window.TeamData) {
      return `<img src="${HELMET_DATA_URI}" class="team-logo" style="--logo-size:${s}px;" alt="">`;
    }
    const url = window.TeamData.logoUrl(style.meta, style.league);
    const name = side === 'A' ? game.teamA : game.teamB;
    return `<img src="${url}" class="team-logo" style="--logo-size:${s}px;" onerror="this.onerror=null;this.src='${HELMET_DATA_URI}';" alt="${escapeHtml(name)}">`;
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

  function teamColor(game, side) {
    return teamStyle(game, side).primary;
  }

  // A short fallback for team names that don't match a known team (so
  // free-text entries still get something reasonable in the abbreviated view).
  function teamAbbr(name, meta) {
    if (meta) return meta.abbr.toUpperCase();
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (words.length > 1) return words.map(w => w[0]).join('').slice(0, 3).toUpperCase();
    return String(name || '').slice(0, 3).toUpperCase();
  }

  // Renders full name and abbreviation together; fitTeamBadges() below picks
  // which one is visible (and whether the logo shows) based on available space.
  function teamBadge(game, side, opts) {
    opts = opts || {};
    const name = side === 'A' ? game.teamA : game.teamB;
    const style = teamStyle(game, side);
    const bg = style.primary;
    const fg = readableTextColor(bg);
    const logo = teamLogoTag(game, side, opts.logoSize || 20);
    const cls = 'team-badge' + (opts.cls ? ' ' + opts.cls : '');
    const fontStyle = style.font ? ` font-family:${style.font}, var(--sans);` : '';
    return `<span class="${cls}" style="background:${bg}; color:${fg};">${logo}<span class="team-badge-name" style="${fontStyle}"><span class="badge-full">${escapeHtml(name)}</span><span class="badge-abbr">${escapeHtml(style.abbr)}</span></span></span>`;
  }

  // Downgrades team-badge display within each `.badge-fit` container, in
  // order, until its content stops overflowing: full name -> abbreviation ->
  // abbreviation with no logo. All badges sharing a container downgrade
  // together so e.g. a matchup header reads consistently on both sides.
  function fitTeamBadges(root) {
    const wraps = (root || document).querySelectorAll('.badge-fit');
    wraps.forEach(wrap => {
      const badges = wrap.querySelectorAll('.team-badge');
      if (!badges.length) return;
      badges.forEach(b => b.classList.remove('mode-abbr', 'mode-nologo'));
      if (wrap.scrollWidth > wrap.clientWidth + 1) {
        badges.forEach(b => b.classList.add('mode-abbr'));
      }
      if (wrap.scrollWidth > wrap.clientWidth + 1) {
        badges.forEach(b => b.classList.add('mode-nologo'));
      }
    });
  }

  let fitResizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(fitResizeTimer);
    fitResizeTimer = setTimeout(() => fitTeamBadges(document), 120);
  });

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
    topbar, statusLabel, leagueLabel, leagueBadge, isTvBrowser, isPhone,
    teamMeta, teamStyle, applyTeamColors, resetTeamColors, teamLogoTag,
    teamColor, readableTextColor, teamBadge, fitTeamBadges, teamAbbr, shadeColor,
    TV_ICON, PHONE_ICON, PEOPLE_ICON
  };
})();

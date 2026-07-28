(function () {
  'use strict';

  const app = document.getElementById('app');

  // ---------- API helpers ----------
  async function api(path, opts) {
    let res;
    try {
      res = await fetch(path, opts);
    } catch (e) {
      throw new Error('Could not reach the server. Make sure it\'s running (double-click start-app.bat or start-server.bat in the project folder), then try again.');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const msg = (data && data.error) || `Request failed (${res.status})`;
      throw new Error(msg);
    }
    return data;
  }
  const getYears = () => api('/api/years');
  const getGame = (year) => api(`/api/game/${year}`);
  const createGame = (game) => api('/api/game', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(game) });
  const saveGame = (game) => api(`/api/game/${game.year}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(game) });
  const deleteGame = (year) => api(`/api/game/${year}`, { method: 'DELETE' });

  // ---------- Router state ----------
  let route = { screen: 'home' };

  function go(newRoute) {
    route = newRoute;
    render();
    window.scrollTo(0, 0);
  }

  // ---------- Utility ----------
  function shuffledDigits() {
    const arr = [0,1,2,3,4,5,6,7,8,9];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function emptyGrid() {
    return new Array(100).fill(null);
  }

  function money(n) {
    if (isNaN(n)) n = 0;
    return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // ---------- Modal (replaces native confirm/alert for reliability on iPad/TV) ----------
  function showModal({ message, okText, cancelText }) {
    return new Promise(resolve => {
      const overlay = el('div', '');
      overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:1000; padding:20px;';
      const box = el('div', 'card');
      box.style.cssText = 'max-width:440px; width:100%; box-shadow:0 10px 40px rgba(0,0,0,0.5);';
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
      const overlay = el('div', '');
      overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:1000; padding:20px;';
      const box = el('div', 'card');
      box.style.cssText = 'max-width:480px; width:100%; box-shadow:0 10px 40px rgba(0,0,0,0.5);';
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

  function currentDefaultYear() {
    const now = new Date();
    // Super Bowl happens in Feb; the "season year" people use is usually the year of the game itself.
    return now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear();
  }

  // ---------- Game computation ----------
  const QUARTERS = ['q1', 'q2', 'q3', 'final'];
  const QLABEL = { q1: 'Q1', q2: 'Q2', q3: 'Q3', final: 'FINAL' };

  function potOf(game) {
    const filled = game.squares.filter(s => s).length;
    return filled * (parseFloat(game.squarePrice) || 0);
  }

  function findCol(game, digit) { return game.axisX ? game.axisX.indexOf(digit) : -1; }
  function findRow(game, digit) { return game.axisY ? game.axisY.indexOf(digit) : -1; }

  // Returns computed results per quarter + cell winner map { "row-col": [labels] }
  function computeGame(game) {
    const pot = potOf(game);
    const basePct = game.payouts || { q1: 25, q2: 25, q3: 25, final: 25 };
    const cellLabels = {}; // key "r-c" -> array of quarter labels
    const out = {};
    let carry = 0;

    QUARTERS.forEach(q => {
      const entry = (game.results && game.results[q]) || {};
      const baseAmount = pot * (parseFloat(basePct[q]) || 0) / 100;
      const amount = baseAmount + carry;
      const hasA = entry.a !== null && entry.a !== undefined && entry.a !== '';
      const hasB = entry.b !== null && entry.b !== undefined && entry.b !== '';
      const res = { amount, baseAmount, carryIn: carry, a: hasA ? Number(entry.a) : null, b: hasB ? Number(entry.b) : null, resolved: false, pushed: false, winnerName: null, row: null, col: null, autoResolved: false };

      if (hasA && hasB && game.axisX && game.axisY) {
        const row = findRow(game, res.a);
        const col = findCol(game, res.b);
        let winRow = row, winCol = col;
        let autoResolved = false;

        let cell = (row >= 0 && col >= 0) ? game.squares[row * 10 + col] : null;

        if (!cell && q === 'final') {
          // Use stored resolution if it matches current a/b; else needs manual re-draw via button.
          const key = `${res.a}-${res.b}`;
          const stored = entry.autoResolve;
          if (stored && stored.key === key && typeof stored.row === 'number') {
            winRow = stored.row;
            winCol = stored.col;
            cell = game.squares[winRow * 10 + winCol];
            autoResolved = true;
          } else {
            winRow = null; winCol = null; cell = null;
          }
        }

        if (cell) {
          res.resolved = true;
          res.winnerName = cell.name;
          res.row = winRow;
          res.col = winCol;
          res.autoResolved = autoResolved;
          const key = `${winRow}-${winCol}`;
          if (!cellLabels[key]) cellLabels[key] = [];
          cellLabels[key].push({ label: QLABEL[q], pushed: false });
          carry = 0;
        } else if (q === 'final') {
          res.resolved = false;
          res.pushed = false;
          res.needsDraw = (row >= 0 && col >= 0);
          carry = 0; // not paid out yet; nothing to carry further
        } else {
          res.resolved = true;
          res.pushed = true;
          res.row = row;
          res.col = col;
          carry += amount;
          if (row >= 0 && col >= 0) {
            const key = `${row}-${col}`;
            if (!cellLabels[key]) cellLabels[key] = [];
            cellLabels[key].push({ label: QLABEL[q], pushed: true });
          }
        }
      } else {
        // Pending: this quarter's displayed amount already includes any carry-in.
        // Don't let that same carry bleed into the quarter after next.
        carry = 0;
      }

      out[q] = res;
    });

    return { pot, results: out, cellLabels };
  }

  // ---------- Rendering: Home ----------
  async function renderHome() {
    resetTeamColors();
    app.innerHTML = '';
    app.appendChild(topbar('Super Bowl Squares', []));
    const main = el('div', 'main');
    app.appendChild(main);

    main.appendChild(el('h2', '', 'Saved Games'));
    const card = el('div', 'card');
    main.appendChild(card);

    let years = [];
    try {
      years = await getYears();
    } catch (e) {
      card.appendChild(el('div', 'error-msg', 'Could not load saved games: ' + e.message));
    }

    if (years.length === 0) {
      card.appendChild(el('p', '', 'No games yet. Start a new one below!'));
    } else {
      const grid = el('div', 'grid-cards');
      years.forEach(y => {
        const c = el('div', 'year-card');
        c.innerHTML = `
          <div class="yr">${y.year}</div>
          <div class="teams">${escapeHtml(y.teamA || '?')} <span style="color:var(--muted)">vs</span> ${escapeHtml(y.teamB || '?')}</div>
          <span class="status status-${y.status}">${statusLabel(y.status)}</span>
        `;
        c.addEventListener('click', () => openYear(y.year, y.status));
        grid.appendChild(c);
      });
      card.appendChild(grid);
    }

    const actions = el('div', 'actions');
    const newBtn = el('button', '', '+ New Game');
    newBtn.addEventListener('click', () => go({ screen: 'setup' }));
    actions.appendChild(newBtn);
    main.appendChild(actions);
  }

  function statusLabel(s) {
    return { setup: 'Setup', picking: 'Picking Squares', started: 'In Progress / Final' }[s] || s;
  }

  async function openYear(year, status) {
    try {
      const game = await getGame(year);
      if (game.status === 'setup' || game.status === 'picking') {
        go({ screen: 'picking', game });
      } else {
        go({ screen: 'board', game });
      }
    } catch (e) {
      showAlert('Failed to load game: ' + e.message);
    }
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- Team colors / logos (auto-detected from free-text team names) ----------
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
    root.style.removeProperty('--teamA');
    root.style.removeProperty('--teamA-alt');
    root.style.removeProperty('--teamB');
    root.style.removeProperty('--teamB-alt');
  }

  const HELMET_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
    <ellipse cx='33' cy='28' rx='25' ry='21' fill='%237b8794'/>
    <path d='M9 32 Q7 48 25 53 L26 44 Q15 40 13 30 Z' fill='%237b8794'/>
    <ellipse cx='33' cy='28' rx='25' ry='21' fill='none' stroke='%234a5773' stroke-width='2'/>
    <path d='M29 39 L47 39 M28 45 L45 45 M30 51 L40 51' stroke='%232a3346' stroke-width='3' stroke-linecap='round'/>
  </svg>`;
  const HELMET_DATA_URI = 'data:image/svg+xml,' + HELMET_SVG.replace(/\s+/g, ' ').trim();

  function teamLogoTag(name, size) {
    const meta = teamMeta(name);
    if (!meta || !window.TeamData) return '';
    const url = window.TeamData.logoUrl(meta);
    const s = size || 28;
    return `<img src="${url}" class="team-logo" style="--logo-size:${s}px;" onerror="this.onerror=null;this.src='${HELMET_DATA_URI}';" alt="${escapeHtml(meta.names[0])}">`;
  }

  // ---------- Players, payments & duplicate-name handling ----------
  const SUBSCRIPT_MAP = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
  const SUBSCRIPT_REV = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

  function toSubscript(n) { return String(n).split('').map(d => SUBSCRIPT_MAP[d] || d).join(''); }
  function fromSubscript(s) { return s.split('').map(c => SUBSCRIPT_REV[c] || '').join(''); }
  function stripSubscript(name) { return String(name).replace(/[₀₁₂₃₄₅₆₇₈₉]+$/, ''); }

  function ensurePlayers(game) {
    if (!game.players) game.players = {};
    return game.players;
  }

  function renameSquares(game, oldName, newName) {
    game.squares.forEach(sq => { if (sq && sq.name === oldName) sq.name = newName; });
    const players = ensurePlayers(game);
    if (players[oldName]) {
      players[newName] = players[oldName];
      delete players[oldName];
    }
  }

  // Groups existing squares by base name (ignoring any subscript) for duplicate detection.
  function collectNameGroups(game) {
    const groups = new Map();
    game.squares.forEach(sq => {
      if (!sq) return;
      const base = stripSubscript(sq.name);
      const key = base.toLowerCase();
      if (!groups.has(key)) groups.set(key, { base, variants: new Map() });
      const g = groups.get(key);
      g.variants.set(sq.name, (g.variants.get(sq.name) || 0) + 1);
    });
    return groups;
  }

  // Resolves the name to actually store for a new pick, prompting the host when
  // it collides with an existing player so they can combine or keep separate
  // (in which case a subscript number is appended, e.g. Steve₁ / Steve₂).
  // Returns null if the host cancels the pick entirely.
  async function resolveNameForPick(game, typedName) {
    const trimmed = typedName.trim();
    const groups = collectNameGroups(game);
    const key = trimmed.toLowerCase();
    if (!groups.has(key)) return trimmed;

    const group = groups.get(key);
    const variantNames = Array.from(group.variants.keys());
    const totalCount = Array.from(group.variants.values()).reduce((a, b) => a + b, 0);

    const choice = await showChoice({
      message: `"${escapeHtml(trimmed)}" already has ${totalCount} square${totalCount === 1 ? '' : 's'} picked (${variantNames.map(v => `"${escapeHtml(v)}"`).join(', ')}). Is this the same person?`,
      buttons: [
        { label: 'Same Person — Combine', value: 'same' },
        { label: 'Different Person — Keep Separate', value: 'separate' },
        { label: 'Cancel', value: null, variant: 'secondary' }
      ]
    });
    if (!choice) return null;

    if (choice === 'same') {
      const primary = variantNames.find(v => stripSubscript(v) === v) || variantNames[0];
      return primary;
    }

    // "separate": figure out the next available subscript index.
    let maxIdx = 0;
    variantNames.forEach(v => {
      if (stripSubscript(v) !== v) {
        const m = v.match(/[₀₁₂₃₄₅₆₇₈₉]+$/);
        if (m) {
          const num = parseInt(fromSubscript(m[0]), 10);
          if (num > maxIdx) maxIdx = num;
        }
      }
    });
    const bareName = variantNames.find(v => stripSubscript(v) === v);
    if (bareName && !variantNames.includes(group.base + toSubscript(1))) {
      renameSquares(game, bareName, group.base + toSubscript(1));
      maxIdx = Math.max(maxIdx, 1);
    }
    return group.base + toSubscript(maxIdx + 1);
  }

  function playerSummaries(game) {
    ensurePlayers(game);
    const counts = {};
    game.squares.forEach(sq => { if (sq) counts[sq.name] = (counts[sq.name] || 0) + 1; });
    return Object.keys(counts).sort((a, b) => a.localeCompare(b)).map(name => {
      const count = counts[name];
      const paid = !!(game.players[name] && game.players[name].paid);
      const owed = count * (parseFloat(game.squarePrice) || 0);
      return { name, count, paid, owed };
    });
  }

  function unpaidTotal(game) {
    return playerSummaries(game).reduce((sum, p) => sum + (p.paid ? 0 : p.owed), 0);
  }

  // Modal for marking players paid/unpaid and removing a player's picks entirely.
  // Shared between Step 2 (picking) and Step 3 (game day) per the spec — someone
  // may call in to claim squares before lock but only pay after the game starts.
  function openManagePlayersModal(game, onUpdate) {
    const overlay = el('div', '');
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; z-index:1000; padding:20px;';
    const box = el('div', 'card manage-modal');
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    async function persistAndRefresh() {
      try {
        const saved = await saveGame(game);
        Object.assign(game, saved);
      } catch (e) {
        showAlert('Failed to save: ' + e.message);
      }
      renderList();
      if (onUpdate) onUpdate();
    }

    function renderList() {
      const summaries = playerSummaries(game);
      box.innerHTML = '';
      const headRow = el('div', 'manage-modal-head');
      headRow.innerHTML = `<h3>💰 Players &amp; Payments</h3>`;
      const closeX = el('button', 'ghost modal-close', '✕');
      closeX.addEventListener('click', () => overlay.remove());
      headRow.appendChild(closeX);
      box.appendChild(headRow);

      if (summaries.length === 0) {
        box.appendChild(el('p', '', 'No squares have been picked yet.'));
      } else {
        const list = el('div', 'player-list');
        summaries.forEach(p => {
          const row = el('div', 'player-row');
          row.innerHTML = `
            <div class="player-info">
              <div class="player-name">${escapeHtml(p.name)}</div>
              <div class="player-sub">${p.count} square${p.count === 1 ? '' : 's'} &middot; ${money(p.owed)} ${p.paid ? 'paid' : 'owed'}</div>
            </div>
            <label class="paid-toggle ${p.paid ? 'is-paid' : ''}">
              <input type="checkbox" ${p.paid ? 'checked' : ''}>
              <span>${p.paid ? 'Paid' : 'Unpaid'}</span>
            </label>
            <button class="danger small">Remove</button>
          `;
          row.querySelector('input[type=checkbox]').addEventListener('change', async (e) => {
            ensurePlayers(game)[p.name] = { paid: e.target.checked };
            await persistAndRefresh();
          });
          row.querySelector('button.danger').addEventListener('click', async () => {
            const startedWarning = game.status === 'started' ? ' The game has already started — this may change quarter results tied to their square(s).' : '';
            const ok = await showConfirm(`Remove all ${p.count} square${p.count === 1 ? '' : 's'} picked by "${p.name}"?${startedWarning} This cannot be undone.`);
            if (!ok) return;
            game.squares.forEach((sq, i) => { if (sq && sq.name === p.name) game.squares[i] = null; });
            delete ensurePlayers(game)[p.name];
            await persistAndRefresh();
          });
          list.appendChild(row);
        });
        box.appendChild(list);
      }

      const unpaid = unpaidTotal(game);
      box.appendChild(el('div', 'unpaid-summary', `Total Unpaid: <strong>${money(unpaid)}</strong>`));
      const closeBtn = el('button', 'secondary', 'Close');
      closeBtn.style.marginTop = '14px';
      closeBtn.addEventListener('click', () => overlay.remove());
      box.appendChild(closeBtn);
    }

    renderList();
  }

  function topbar(title, crumbs) {
    const bar = el('div', 'topbar');
    const h1 = el('h1', '', `<span class="flag">🏈</span> ${title}`);
    bar.appendChild(h1);
    const nav = el('div', 'nav');
    const homeBtn = el('button', 'secondary', 'Home');
    homeBtn.addEventListener('click', () => go({ screen: 'home' }));
    nav.appendChild(homeBtn);
    bar.appendChild(nav);
    return bar;
  }

  // ---------- Rendering: Step 1 Setup ----------
  function renderSetup() {
    resetTeamColors();
    app.innerHTML = '';
    app.appendChild(topbar('New Game — Setup', []));
    const main = el('div', 'main');
    app.appendChild(main);

    const card = el('div', 'card');
    main.appendChild(card);
    card.appendChild(el('h2', '', 'Step 1: Game Setup'));

    const errBox = el('div', 'error-msg hidden');
    card.appendChild(errBox);

    const form = el('div');
    card.appendChild(form);

    form.innerHTML = `
      <div class="row">
        <div>
          <label>Year</label>
          <input type="number" id="f-year" value="${currentDefaultYear()}" min="2000" max="2100">
        </div>
        <div>
          <label>Square Price ($)</label>
          <input type="number" id="f-price" value="10" min="0" step="0.01">
        </div>
      </div>
      <div class="row">
        <div>
          <label>Team A (rows, left side)</label>
          <input type="text" id="f-teamA" placeholder="e.g. Chiefs">
          <div id="preview-teamA" class="team-preview"></div>
        </div>
        <div>
          <label>Team B (columns, top)</label>
          <input type="text" id="f-teamB" placeholder="e.g. Eagles">
          <div id="preview-teamB" class="team-preview"></div>
        </div>
      </div>

      <label>Quarterly Payout — % of Pot</label>
      <div class="row">
        <div><label style="margin-top:0">Q1</label><input type="number" id="f-pq1" value="20" min="0" max="100"></div>
        <div><label style="margin-top:0">Q2</label><input type="number" id="f-pq2" value="20" min="0" max="100"></div>
        <div><label style="margin-top:0">Q3</label><input type="number" id="f-pq3" value="20" min="0" max="100"></div>
        <div><label style="margin-top:0">Final</label><input type="number" id="f-pfinal" value="40" min="0" max="100"></div>
      </div>
      <div id="pct-total" class="pct-total"></div>

      <label>Square Pick Mode</label>
      <div class="radio-group" id="pick-mode-group">
        <div class="pill" data-val="manual">Manual Only</div>
        <div class="pill" data-val="auto">Auto Only</div>
        <div class="pill active" data-val="both">Both (player's choice)</div>
      </div>

      <label>Auto Cutoff Time?</label>
      <div class="toggle-group" id="cutoff-toggle">
        <div class="pill" data-val="yes">Yes</div>
        <div class="pill active" data-val="no">No</div>
      </div>
      <div id="cutoff-time-wrap" class="hidden">
        <label>Cutoff Date &amp; Time</label>
        <input type="datetime-local" id="f-cutoff">
        <p style="color:var(--muted); font-size:0.9rem;">At this time, the app will automatically lock square picking and generate the grid numbers.</p>
      </div>
    `;

    function updateTeamPreview(inputId, previewId) {
      const name = form.querySelector('#' + inputId).value.trim();
      const box = form.querySelector('#' + previewId);
      if (!name) { box.innerHTML = ''; return; }
      const meta = teamMeta(name);
      if (meta) {
        const logo = teamLogoTag(name, 24);
        box.innerHTML = `${logo}<span class="swatch" style="background:${meta.primary}"></span><span class="swatch" style="background:${meta.secondary}"></span><span class="match-txt">Matched: ${meta.names[0].replace(/\b\w/g, c => c.toUpperCase())}</span>`;
      } else {
        box.innerHTML = `<span class="match-txt muted">No NFL team matched — using default colors.</span>`;
      }
    }
    form.querySelector('#f-teamA').addEventListener('input', () => updateTeamPreview('f-teamA', 'preview-teamA'));
    form.querySelector('#f-teamB').addEventListener('input', () => updateTeamPreview('f-teamB', 'preview-teamB'));

    let pickMode = 'both';
    let cutoffEnabled = false;

    form.querySelectorAll('#pick-mode-group .pill').forEach(p => {
      p.addEventListener('click', () => {
        form.querySelectorAll('#pick-mode-group .pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        pickMode = p.dataset.val;
      });
    });

    form.querySelectorAll('#cutoff-toggle .pill').forEach(p => {
      p.addEventListener('click', () => {
        form.querySelectorAll('#cutoff-toggle .pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        cutoffEnabled = p.dataset.val === 'yes';
        form.querySelector('#cutoff-time-wrap').classList.toggle('hidden', !cutoffEnabled);
      });
    });

    function updatePctTotal() {
      const total = ['f-pq1','f-pq2','f-pq3','f-pfinal'].reduce((s, id) => s + (parseFloat(form.querySelector('#' + id).value) || 0), 0);
      const box = form.querySelector('#pct-total');
      box.textContent = `Total: ${total}%`;
      box.className = 'pct-total ' + (total === 100 ? 'ok' : 'bad');
      return total;
    }
    form.querySelectorAll('#f-pq1,#f-pq2,#f-pq3,#f-pfinal').forEach(inp => inp.addEventListener('input', updatePctTotal));
    updatePctTotal();

    const actions = el('div', 'actions');
    const submitBtn = el('button', '', 'Continue to Square Picking →');
    const cancelBtn = el('button', 'secondary', 'Cancel');
    cancelBtn.addEventListener('click', () => go({ screen: 'home' }));
    actions.appendChild(submitBtn);
    actions.appendChild(cancelBtn);
    card.appendChild(actions);

    submitBtn.addEventListener('click', async () => {
      errBox.classList.add('hidden');
      const year = parseInt(form.querySelector('#f-year').value, 10);
      const teamA = form.querySelector('#f-teamA').value.trim() || 'Team A';
      const teamB = form.querySelector('#f-teamB').value.trim() || 'Team B';
      const squarePrice = parseFloat(form.querySelector('#f-price').value) || 0;
      const pq1 = parseFloat(form.querySelector('#f-pq1').value) || 0;
      const pq2 = parseFloat(form.querySelector('#f-pq2').value) || 0;
      const pq3 = parseFloat(form.querySelector('#f-pq3').value) || 0;
      const pfinal = parseFloat(form.querySelector('#f-pfinal').value) || 0;
      const total = pq1 + pq2 + pq3 + pfinal;

      if (!year || year < 2000) {
        return showErr('Please enter a valid year.');
      }
      if (total !== 100) {
        return showErr(`Quarterly payout percentages must add up to 100% (currently ${total}%).`);
      }
      if (cutoffEnabled && !form.querySelector('#f-cutoff').value) {
        return showErr('Please choose a cutoff date & time, or turn off the auto-cutoff option.');
      }

      const game = {
        year, teamA, teamB, squarePrice,
        payouts: { q1: pq1, q2: pq2, q3: pq3, final: pfinal },
        pickMode,
        autoCutoffEnabled: cutoffEnabled,
        autoCutoffTime: cutoffEnabled ? form.querySelector('#f-cutoff').value : null,
        status: 'picking',
        squares: emptyGrid(),
        axisX: null,
        axisY: null,
        results: {},
        players: {}
      };

      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';
      try {
        const saved = await createGame(game);
        go({ screen: 'picking', game: saved });
      } catch (e) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Continue to Square Picking →';
        showErr(e.message);
      }

      function showErr(msg) {
        errBox.textContent = msg;
        errBox.classList.remove('hidden');
      }
    });
  }

  // ---------- Rendering: Step 2 Picking ----------
  function renderPicking(game) {
    applyTeamColors(game);
    app.innerHTML = '';
    app.appendChild(topbar(`${game.teamA} vs ${game.teamB} — ${game.year}`, []));
    const main = el('div', 'main');
    app.appendChild(main);

    main.appendChild(el('h2', '', 'Step 2: Pick Your Squares'));

    const filled = game.squares.filter(s => s).length;
    const unpaid = unpaidTotal(game);
    const strip = el('div', 'stat-strip');
    strip.innerHTML = `
      <div class="stat-box"><div class="val">${filled}/100</div><div class="lbl">Squares Sold</div></div>
      <div class="stat-box"><div class="val">${money(game.squarePrice)}</div><div class="lbl">Per Square</div></div>
      <div class="stat-box"><div class="val">${money(filled * game.squarePrice)}</div><div class="lbl">Pot So Far</div></div>
      <div class="stat-box ${unpaid > 0 ? 'warn' : ''} clickable" id="unpaid-stat"><div class="val">${money(unpaid)}</div><div class="lbl">Unpaid Total</div></div>
      <div class="stat-box"><div class="val">${game.autoCutoffEnabled ? new Date(game.autoCutoffTime).toLocaleString([], {dateStyle:'short', timeStyle:'short'}) : '—'}</div><div class="lbl">Auto Cutoff</div></div>
    `;
    main.appendChild(strip);
    strip.querySelector('#unpaid-stat').addEventListener('click', () => {
      openManagePlayersModal(game, () => go({ screen: 'picking', game }));
    });

    const manageRow = el('div', 'actions');
    manageRow.style.marginBottom = '18px';
    const manageBtn = el('button', 'secondary', '💰 Manage Payments & Players');
    manageBtn.addEventListener('click', () => {
      openManagePlayersModal(game, () => go({ screen: 'picking', game }));
    });
    manageRow.appendChild(manageBtn);
    main.appendChild(manageRow);

    const layout = el('div', 'pick-layout');
    main.appendChild(layout);

    // ---- Left: pick form ----
    const formCard = el('div', 'card');
    layout.appendChild(formCard);
    formCard.appendChild(el('h3', '', 'Claim Squares'));

    const errBox = el('div', 'error-msg hidden');
    formCard.appendChild(errBox);
    function showErr(msg) { errBox.textContent = msg; errBox.classList.remove('hidden'); }
    function clearErr() { errBox.classList.add('hidden'); }

    const formWrap = el('div');
    formWrap.innerHTML = `
      <label>Player Name</label>
      <input type="text" id="p-name" placeholder="Enter name">
      <label># of Squares</label>
      <input type="number" id="p-count" value="1" min="1" max="100">
      <label class="checkbox-label"><input type="checkbox" id="p-paid"> <span>Mark as Paid</span></label>
    `;
    formCard.appendChild(formWrap);

    let mode = game.pickMode === 'both' ? 'auto' : game.pickMode;
    if (game.pickMode === 'both') {
      const modeGroup = el('div', 'radio-group', '');
      modeGroup.style.margin = '14px 0';
      const autoP = el('div', 'pill active', 'Auto Pick'); autoP.dataset.val = 'auto';
      const manP = el('div', 'pill', 'Manual Pick'); manP.dataset.val = 'manual';
      [autoP, manP].forEach(p => {
        p.addEventListener('click', () => {
          modeGroup.querySelectorAll('.pill').forEach(x => x.classList.remove('active'));
          p.classList.add('active');
          mode = p.dataset.val;
        });
      });
      modeGroup.appendChild(autoP);
      modeGroup.appendChild(manP);
      formCard.appendChild(el('label', '', 'Pick Method'));
      formCard.appendChild(modeGroup);
    }

    const actionBtn = el('button', '', game.pickMode === 'manual' ? 'Start Manual Pick' : 'Auto Pick Squares');
    formCard.appendChild(el('div', 'actions', '')).appendChild(actionBtn);

    let manualSelecting = false;
    let manualTarget = 0;
    let manualSelected = [];
    let manualName = '';
    let manualPaid = false;

    const manualBanner = el('div', 'manual-banner hidden');
    formCard.appendChild(manualBanner);

    function updateManualBanner() {
      manualBanner.innerHTML = '';
      manualBanner.classList.toggle('hidden', !manualSelecting);
      if (!manualSelecting) return;
      const txt = el('div', '', `<strong>${escapeHtml(manualName)}</strong>: ${manualSelected.length} / ${manualTarget} selected`);
      manualBanner.appendChild(txt);
      const btns = el('div', '', '');
      btns.style.display = 'flex';
      btns.style.gap = '8px';
      const confirmBtn = el('button', '', 'Confirm');
      confirmBtn.disabled = manualSelected.length === 0;
      confirmBtn.addEventListener('click', confirmManualPick);
      const cancelBtn = el('button', 'secondary', 'Cancel');
      cancelBtn.addEventListener('click', () => {
        manualSelecting = false;
        manualSelected = [];
        renderPicking(game);
      });
      btns.appendChild(confirmBtn);
      btns.appendChild(cancelBtn);
      manualBanner.appendChild(btns);
    }

    async function confirmManualPick() {
      manualSelected.forEach(idx => { game.squares[idx] = { name: manualName }; });
      ensurePlayers(game)[manualName] = { paid: manualPaid };
      manualSelecting = false;
      manualSelected = [];
      await persistAndRefresh();
    }

    actionBtn.addEventListener('click', async () => {
      clearErr();
      const rawName = formWrap.querySelector('#p-name').value.trim();
      const count = parseInt(formWrap.querySelector('#p-count').value, 10);
      const paidChecked = formWrap.querySelector('#p-paid').checked;
      if (!rawName) return showErr('Please enter a player name.');
      if (!count || count < 1) return showErr('Please enter a valid number of squares.');
      const emptyIdx = game.squares.map((s, i) => s ? -1 : i).filter(i => i >= 0);
      if (count > emptyIdx.length) return showErr(`Only ${emptyIdx.length} squares remain.`);

      const name = await resolveNameForPick(game, rawName);
      if (!name) return; // host cancelled at the duplicate-name prompt

      if (mode === 'auto') {
        const shuffled = emptyIdx.sort(() => Math.random() - 0.5);
        for (let i = 0; i < count; i++) {
          game.squares[shuffled[i]] = { name };
        }
        ensurePlayers(game)[name] = { paid: paidChecked };
        await persistAndRefresh();
      } else {
        manualSelecting = true;
        manualTarget = count;
        manualSelected = [];
        manualName = name;
        manualPaid = paidChecked;
        updateManualBanner();
        renderBoardPreview();
      }
    });

    async function persistAndRefresh() {
      try {
        const saved = await saveGame(game);
        go({ screen: 'picking', game: saved });
      } catch (e) {
        showErr('Failed to save: ' + e.message);
      }
    }

    const finishWrap = el('div', 'card');
    finishWrap.innerHTML = `<h3>Host Controls</h3><p style="color:var(--muted)">When picking is complete (or you want to lock it early), generate the grid numbers and begin the game. This cannot be undone.</p>`;
    const lockBtn = el('button', 'danger', '🔒 Finish Picking & Generate Numbers');
    lockBtn.addEventListener('click', async () => {
      const ok = await showConfirm('Lock the grid and randomly generate axis numbers now? Square picking cannot be resumed after this.');
      if (!ok) return;
      startGame();
    });
    finishWrap.appendChild(el('div', 'actions', '')).appendChild(lockBtn);
    layout.appendChild(wrapRight());

    function wrapRight() {
      const right = el('div');
      const boardCard = el('div', 'card');
      boardCard.appendChild(el('h3', '', `Board Preview (${filled}/100 sold) ${manualSelecting ? '— tap empty squares to claim' : ''}`));
      const boardHolder = el('div');
      boardHolder.id = 'board-holder';
      boardCard.appendChild(boardHolder);
      right.appendChild(boardCard);
      right.appendChild(finishWrap);
      renderBoardInto(boardHolder);
      return right;
    }

    function renderBoardPreview() {
      const holder = document.getElementById('board-holder');
      if (holder) renderBoardInto(holder);
      updateManualBanner();
    }

    function renderBoardInto(holder) {
      holder.innerHTML = '';
      const scroll = el('div', 'board-scroll');
      const table = el('div', 'board-table');
      table.appendChild(el('div', 'cell head corner', ''));
      for (let c = 0; c < 10; c++) table.appendChild(el('div', 'cell head x', '?'));
      for (let r = 0; r < 10; r++) {
        table.appendChild(el('div', 'cell head y', '?'));
        for (let c = 0; c < 10; c++) {
          const idx = r * 10 + c;
          const sq = game.squares[idx];
          let cls = 'cell';
          let label = '';
          if (sq) {
            cls += ' filled';
            label = `<div class="name-txt">${escapeHtml(sq.name)}</div>`;
          } else {
            cls += ' empty-pick';
            if (manualSelected.includes(idx)) cls += ' selected';
          }
          const cell = el('div', cls, label);
          if (!sq && manualSelecting) {
            cell.addEventListener('click', () => {
              const pos = manualSelected.indexOf(idx);
              if (pos >= 0) {
                manualSelected.splice(pos, 1);
              } else {
                if (manualSelected.length >= manualTarget) return;
                manualSelected.push(idx);
              }
              renderBoardPreview();
            });
          }
          table.appendChild(cell);
        }
      }
      scroll.appendChild(table);
      holder.appendChild(scroll);
    }

    async function startGame() {
      game.axisX = shuffledDigits();
      game.axisY = shuffledDigits();
      game.status = 'started';
      try {
        const saved = await saveGame(game);
        go({ screen: 'board', game: saved });
      } catch (e) {
        showAlert('Failed to start game: ' + e.message);
      }
    }

    // Auto-cutoff watcher
    if (game.autoCutoffEnabled && game.autoCutoffTime) {
      const cutoffMs = new Date(game.autoCutoffTime).getTime();
      const checkCutoff = () => {
        if (route.screen !== 'picking') return;
        if (Date.now() >= cutoffMs) {
          startGame();
        }
      };
      checkCutoff();
      const timer = setInterval(() => {
        if (route.screen !== 'picking') { clearInterval(timer); return; }
        checkCutoff();
      }, 5000);
    }
  }

  // ---------- Rendering: Step 3 Board / Results ----------
  function renderBoard(game) {
    applyTeamColors(game);
    app.innerHTML = '';
    app.appendChild(topbar(`${game.teamA} vs ${game.teamB} — ${game.year}`, []));
    const main = el('div', 'main');
    app.appendChild(main);

    main.appendChild(el('h2', '', 'Step 3: Game Day'));

    const computed = computeGame(game);

    const strip = el('div', 'stat-strip');
    const filled = game.squares.filter(s => s).length;
    const unpaidNow = unpaidTotal(game);
    strip.innerHTML = `
      <div class="stat-box"><div class="val">${money(computed.pot)}</div><div class="lbl">Total Pot</div></div>
      <div class="stat-box"><div class="val">${filled}/100</div><div class="lbl">Squares Sold</div></div>
      <div class="stat-box"><div class="val">${money(game.squarePrice)}</div><div class="lbl">Per Square</div></div>
      <div class="stat-box ${unpaidNow > 0 ? 'warn' : ''} clickable" id="unpaid-stat"><div class="val">${money(unpaidNow)}</div><div class="lbl">Unpaid Total</div></div>
    `;
    main.appendChild(strip);
    strip.querySelector('#unpaid-stat').addEventListener('click', () => {
      openManagePlayersModal(game, () => go({ screen: 'board', game }));
    });

    const layout = el('div', 'pick-layout');
    layout.style.gridTemplateColumns = '1fr minmax(280px, 380px)';
    main.appendChild(layout);

    // Board
    const boardCard = el('div', 'card');
    layout.appendChild(boardCard);
    const boardHeaderRow = el('div', '', '');
    boardHeaderRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;';
    boardHeaderRow.appendChild(el('h3', '', 'Grid'));
    const headerBtns = el('div', '', '');
    headerBtns.style.cssText = 'display:flex; gap:10px; flex-wrap:wrap;';
    const manageBtn3 = el('button', 'secondary', '💰 Manage Payments & Players');
    manageBtn3.addEventListener('click', () => {
      openManagePlayersModal(game, () => go({ screen: 'board', game }));
    });
    const tvBtn = el('button', 'secondary', '🖥️ Open TV Grid View');
    tvBtn.addEventListener('click', () => {
      window.open(`${location.origin}${location.pathname}#tv-${game.year}`, '_blank');
    });
    headerBtns.appendChild(manageBtn3);
    headerBtns.appendChild(tvBtn);
    boardHeaderRow.appendChild(headerBtns);
    boardCard.appendChild(boardHeaderRow);

    const boardHolder = el('div');
    boardCard.appendChild(boardHolder);
    renderFullBoard(boardHolder, game, computed);

    // Results panel
    const resultsCard = el('div', 'card');
    layout.appendChild(resultsCard);
    resultsCard.appendChild(el('h3', '', 'Quarterly Results'));
    const qgrid = el('div', 'quarters');
    resultsCard.appendChild(qgrid);

    function buildQuarterCards(computedNow) {
      qgrid.innerHTML = '';
      QUARTERS.forEach(q => {
        const res = computedNow.results[q];
        const qcard = el('div', 'qcard');
        const label = q === 'final' ? 'Final Score' : QLABEL[q];
        qcard.innerHTML = `<h4><span>${label}</span><span class="qamt">${money(res.amount)}</span></h4>`;
        const scoreRow = el('div', 'score-inputs');
        scoreRow.innerHTML = `
          <span style="color:var(--teamA); font-size:0.8rem; font-weight:700;">${escapeHtml(game.teamA)}</span>
          <input type="number" min="0" max="9" id="score-${q}-a" value="${res.a === null ? '' : res.a}">
          <span class="vs">–</span>
          <input type="number" min="0" max="9" id="score-${q}-b" value="${res.b === null ? '' : res.b}">
          <span style="color:var(--teamB); font-size:0.8rem; font-weight:700;">${escapeHtml(game.teamB)}</span>
        `;
        qcard.appendChild(scoreRow);

        const outcome = el('div', 'outcome');
        if ((!res.a && res.a !== 0) || (!res.b && res.b !== 0)) {
          outcome.classList.add('pending');
          outcome.textContent = 'Awaiting score entry…';
        } else if (res.resolved && res.pushed) {
          outcome.classList.add('push');
          outcome.textContent = `PUSH — no one in that square. ${money(res.amount)} rolls into next payout.`;
        } else if (res.resolved && res.winnerName) {
          outcome.classList.add('win');
          outcome.textContent = `Winner: ${res.winnerName}${res.autoResolved ? ' (auto-drawn — square was empty)' : ''}`;
        } else if (q === 'final' && res.needsDraw) {
          outcome.classList.add('push');
          outcome.textContent = 'That square is empty! A winner must be randomly drawn.';
        } else {
          outcome.classList.add('pending');
          outcome.textContent = 'Enter last digit of each team\'s score.';
        }
        qcard.appendChild(outcome);

        if (q === 'final' && res.needsDraw) {
          const drawBtn = el('button', '', 'Randomly Draw Winner');
          drawBtn.style.marginTop = '10px';
          drawBtn.addEventListener('click', async () => {
            const winnerIdx = drawFinalWinner(game);
            if (winnerIdx === -1) { showAlert('No squares are filled in — cannot draw a winner.'); return; }
            const row = Math.floor(winnerIdx / 10), col = winnerIdx % 10;
            if (!game.results.final) game.results.final = {};
            game.results.final.autoResolve = { key: `${res.a}-${res.b}`, row, col };
            await persist();
          });
          qcard.appendChild(drawBtn);
        }

        qgrid.appendChild(qcard);

        scoreRow.querySelector(`#score-${q}-a`).addEventListener('input', (e) => onScoreChange(q, 'a', e.target.value));
        scoreRow.querySelector(`#score-${q}-b`).addEventListener('input', (e) => onScoreChange(q, 'b', e.target.value));
      });
    }

    buildQuarterCards(computed);

    function onScoreChange(q, side, val) {
      if (!game.results[q]) game.results[q] = {};
      const num = val === '' ? '' : Math.max(0, Math.min(9, parseInt(val, 10) || 0));
      game.results[q][side] = num;
      if (q === 'final') {
        // clear stale auto-resolve if digits changed
        const entry = game.results.final;
        if (entry.autoResolve && entry.autoResolve.key !== `${entry.a}-${entry.b}`) {
          delete entry.autoResolve;
        }
      }
      persist(true);
    }

    function drawFinalWinner(g) {
      const filledIdx = g.squares.map((s, i) => s ? i : -1).filter(i => i >= 0);
      if (filledIdx.length === 0) return -1;
      let idx = -1;
      let guard = 0;
      while (guard < 5000) {
        const r = Math.floor(Math.random() * 10);
        const c = Math.floor(Math.random() * 10);
        const candidate = r * 10 + c;
        if (g.squares[candidate]) { idx = candidate; break; }
        guard++;
      }
      if (idx === -1) idx = filledIdx[Math.floor(Math.random() * filledIdx.length)];
      return idx;
    }

    let saveTimer = null;
    async function persist(debounce) {
      if (debounce) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(doSave, 500);
      } else {
        await doSave();
      }
    }
    async function doSave() {
      try {
        const saved = await saveGame(game);
        Object.assign(game, saved);
        const newComputed = computeGame(game);
        renderFullBoard(boardHolder, game, newComputed);
        buildQuarterCards(newComputed);
      } catch (e) {
        console.error('Save failed', e);
      }
    }
  }

  function renderFullBoard(holder, game, computed) {
    holder.innerHTML = '';
    const teamBLabel = el('div', 'teamB-label', `${teamLogoTag(game.teamB, 32)}<span>${escapeHtml(game.teamB)}</span>`);
    holder.appendChild(teamBLabel);

    const outer = el('div', 'board-grid-outer');
    const teamALabel = el('div', 'teamA-label', `<span class="teamA-label-text">${escapeHtml(game.teamA)}</span>${teamLogoTag(game.teamA, 32)}`);
    outer.appendChild(teamALabel);

    const scroll = el('div', 'board-scroll');
    const table = el('div', 'board-table');
    table.appendChild(el('div', 'cell head corner', ''));
    for (let c = 0; c < 10; c++) {
      table.appendChild(el('div', 'cell head x', game.axisX ? game.axisX[c] : '?'));
    }
    for (let r = 0; r < 10; r++) {
      table.appendChild(el('div', 'cell head y', game.axisY ? game.axisY[r] : '?'));
      for (let c = 0; c < 10; c++) {
        const idx = r * 10 + c;
        const sq = game.squares[idx];
        const labels = computed.cellLabels[`${r}-${c}`] || [];
        const hasWin = labels.some(l => !l.pushed);
        const hasPush = labels.some(l => l.pushed);
        let cls = 'cell';
        if (sq) cls += ' filled';
        if (hasWin) cls += ' winner';
        else if (hasPush) cls += ' pushed';
        let inner = sq ? `<div class="name-txt">${escapeHtml(sq.name)}</div>` : (hasPush ? '<div class="name-txt">PUSHED</div>' : '');
        let badges = '';
        if (labels.length) {
          badges = `<div class="badges">${labels.map(l => `<span class="badge">${l.label}</span>`).join('')}</div>`;
        }
        table.appendChild(el('div', cls, badges + inner));
      }
    }
    scroll.appendChild(table);
    outer.appendChild(scroll);
    holder.appendChild(outer);
  }

  // ---------- Rendering: TV / Grid-Only View (1080p optimized) ----------
  function renderTV(year) {
    app.innerHTML = '';
    const screenEl = el('div', 'tv-screen');
    app.appendChild(screenEl);

    const header = el('div', 'tv-header');
    screenEl.appendChild(header);

    const boardWrap = el('div', 'tv-board-wrap');
    screenEl.appendChild(boardWrap);

    const exitBtn = el('button', 'tv-exit', '← Exit');
    exitBtn.addEventListener('click', () => {
      window.location.hash = '';
      go({ screen: 'home' });
    });
    screenEl.appendChild(exitBtn);

    let stopped = false;
    let timer = null;

    async function load() {
      if (stopped || route.screen !== 'tv') return;
      try {
        const game = await getGame(year);
        applyTeamColors(game);
        const computed = computeGame(game);
        const filled = game.squares.filter(s => s).length;
        header.innerHTML = `
          <div class="tv-matchup">
            ${teamLogoTag(game.teamA, 64)}
            <span style="color:var(--teamA)">${escapeHtml(game.teamA)}</span>
            <span class="tv-vs">vs</span>
            <span style="color:var(--teamB)">${escapeHtml(game.teamB)}</span>
            ${teamLogoTag(game.teamB, 64)}
          </div>
          <div class="tv-meta">
            <span>${game.year}</span>
            <span>Pot: ${money(computed.pot)}</span>
            <span>${filled}/100 Sold</span>
          </div>
        `;
        renderFullBoard(boardWrap, game, computed);
      } catch (e) {
        header.innerHTML = `<div class="error-msg">Could not load ${year}: ${escapeHtml(e.message)}</div>`;
      }
    }

    load();
    timer = setInterval(() => {
      if (route.screen !== 'tv') { clearInterval(timer); stopped = true; return; }
      load();
    }, 4000);
  }

  // ---------- Main render dispatch ----------
  function render() {
    if (route.screen === 'home') return renderHome();
    if (route.screen === 'setup') return renderSetup();
    if (route.screen === 'picking') return renderPicking(route.game);
    if (route.screen === 'board') return renderBoard(route.game);
    if (route.screen === 'tv') return renderTV(route.year);
  }

  function parseInitialRoute() {
    const m = (window.location.hash || '').match(/^#tv-(\d{4})$/);
    if (m) return { screen: 'tv', year: parseInt(m[1], 10) };
    return { screen: 'home' };
  }

  route = parseInitialRoute();
  render();
})();

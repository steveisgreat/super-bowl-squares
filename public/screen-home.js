// Home (saved games list) and Step 1 (new game setup).
(function () {
  'use strict';

  const SBS = window.SBS = window.SBS || {};
  const { el, escapeHtml, topbar, statusLabel, leagueBadge, showAlert, showConfirm, teamMeta, teamLogoTag, teamBadge, resetTeamColors, fitTeamBadges, isTvBrowser, TV_ICON, PHONE_ICON, PEOPLE_ICON } = SBS.ui;
  const { emptyGrid } = window.GameLogic;
  const { openManagePlayersModal } = SBS.players;

  const EDIT_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M13 6l3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

  const X_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`;

  function todayValue() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // A finished game drops into the archive once its game day has passed —
  // games finishing earlier the same day (e.g. an early window game) stay up
  // top alongside whatever's still in progress, so the room can see the
  // whole day's slate together.
  function isArchived(g) {
    return g.status === 'finished' && g.gameDate !== todayValue();
  }
  SBS.isArchivedGame = isArchived;

  // "2026-02-08" -> "Feb 8, 2026", parsed as a local date so it never shifts
  // a day off from what the host actually picked.
  function formatGameDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  async function openGame(id) {
    try {
      const game = await SBS.api.getGame(id);
      if (game.status === 'setup' || game.status === 'picking') {
        SBS.go({ screen: 'picking', game });
      } else {
        SBS.go({ screen: 'board', game });
      }
    } catch (e) {
      showAlert('Failed to load game: ' + e.message);
    }
  }

  // A read-only popup showing the raw ESPN API payload for one matchup — lets
  // the host sanity-check a bad team match or a stalled score against exactly
  // what the API returned, without opening dev tools.
  function showGameDetailsModal(rawGame) {
    const overlay = SBS.ui.overlayEl('0.65');
    const box = el('div', 'card manage-modal details-modal');
    const head = el('div', 'manage-modal-head');
    head.innerHTML = `<h3>Game Details (API Response)</h3>`;
    const closeBtn = el('button', 'ghost modal-close', 'Close');
    closeBtn.addEventListener('click', () => overlay.remove());
    head.appendChild(closeBtn);
    box.appendChild(head);
    const pre = el('pre', 'details-json', escapeHtml(JSON.stringify(rawGame, null, 2)));
    box.appendChild(pre);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  // Vibrant accent colors used to flash individual letters of the
  // "Picking Squares" status while a game is in the picking phase.
  const PICKING_FX_COLORS = ['#FF3366', '#00FFCC', '#FFD700', '#FF6600', '#9D00FF', '#00FF66', '#FF0055', '#00E5FF'];

  function statusMarkup(g) {
    if (g.status !== 'picking') {
      return `<span class="status status-${g.status}">${statusLabel(g.status)}</span>`;
    }
    const letters = [...statusLabel(g.status)].map(ch => ch === ' '
      ? `<span class="letter space"> </span>`
      : `<span class="letter">${escapeHtml(ch)}</span>`).join('');
    return `<span class="status status-picking status-picking-fx">${letters}</span>`;
  }

  // Periodically wiggles and color-fills a random letter of the "Picking
  // Squares" status pill so an idle-looking card still reads as "in
  // progress" from across the room.
  function attachPickingFx(container) {
    const letters = Array.from(container.querySelectorAll('.letter:not(.space)'));
    if (letters.length === 0) return;
    let lastIndex = -1;
    function trigger() {
      let idx;
      do {
        idx = Math.floor(Math.random() * letters.length);
      } while (idx === lastIndex && letters.length > 1);
      lastIndex = idx;
      const box = letters[idx];
      const color = PICKING_FX_COLORS[Math.floor(Math.random() * PICKING_FX_COLORS.length)];
      box.classList.add('wiggling');
      box.style.borderColor = color;
      box.style.color = color;
      box.style.boxShadow = `0 0 6px ${color}`;
      setTimeout(() => {
        box.style.backgroundColor = color;
        box.style.color = '#0d1117';
        box.style.boxShadow = `0 0 10px ${color}`;
      }, 500);
      setTimeout(() => box.classList.remove('wiggling'), 900);
      setTimeout(() => {
        box.style.backgroundColor = '';
        box.style.borderColor = '';
        box.style.color = '';
        box.style.boxShadow = '';
      }, 1300);
    }
    trigger();
    SBS.setManagedInterval(trigger, 1800);
  }

  function buildGameCard(g) {
    const isTv = isTvBrowser();
    const c = el('div', 'game-card');
    const numbersPicked = g.status === 'started' || g.status === 'finished';
    c.innerHTML = `
      ${isTv ? '' : `<button class="icon-btn game-card-delete" type="button" aria-label="Delete Game" title="Delete Game">${X_ICON}</button>`}
      <span class="game-date">${formatGameDate(g.gameDate)}</span>
      <div class="game-card-meta">
        <div class="game-card-league">${leagueBadge(g.league)}</div>
      </div>
      ${g.description ? `<div class="game-card-desc">${escapeHtml(g.description)}</div>` : ''}
      <div class="teams badge-fit">${teamBadge(g, 'A', { logoSize: 18, cls: 'team-badge-sm' })}<span class="vs-sep">vs</span>${teamBadge(g, 'B', { logoSize: 18, cls: 'team-badge-sm' })}</div>
      ${statusMarkup(g)}
      ${isTv ? '' : `
      <div class="game-card-actions">
        <button class="icon-btn game-card-edit" type="button" aria-label="Edit Game" title="Edit Game"${numbersPicked ? ' disabled' : ''}>${EDIT_ICON}</button>
        <button class="icon-btn game-card-tv" type="button" aria-label="Open TV Grid View" title="TV Grid View">${TV_ICON}</button>
        <button class="icon-btn game-card-phone" type="button" aria-label="Open Phone Score Entry" title="Phone Score Entry">${PHONE_ICON}</button>
        <button class="icon-btn game-card-people" type="button" aria-label="Manage Players" title="Manage Players">${PEOPLE_ICON}</button>
      </div>`}
    `;
    if (g.status === 'picking') {
      attachPickingFx(c.querySelector('.status-picking-fx'));
    }
    if (isTv) {
      // On a TV browser there's nothing to manage — the panel is just a
      // launcher straight into the grid view for that game.
      c.addEventListener('click', () => SBS.go({ screen: 'tv', id: g.id }));
      return c;
    }
    c.addEventListener('click', () => openGame(g.id));
    c.querySelector('.game-card-edit').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (numbersPicked) return;
      try {
        const game = await SBS.api.getGame(g.id);
        SBS.go({ screen: 'editGame', game });
      } catch (err) {
        showAlert('Failed to load game: ' + err.message);
      }
    });
    c.querySelector('.game-card-delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await showConfirm(`Delete this game (${g.teamA || '?'} vs ${g.teamB || '?'})? This cannot be undone.`);
      if (!ok) return;
      try {
        await SBS.api.deleteGame(g.id);
        renderHome();
      } catch (err) {
        showAlert('Failed to delete game: ' + err.message);
      }
    });
    c.querySelector('.game-card-tv').addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(`${location.origin}${location.pathname}#tv-${g.id}`, '_blank');
    });
    c.querySelector('.game-card-phone').addEventListener('click', (e) => {
      e.stopPropagation();
      // Launched straight from Home rather than Game Day, so the phone
      // screen's Back button should return here, not to the board.
      window.open(`${location.origin}${location.pathname}#score-${g.id}-home`, '_blank');
    });
    c.querySelector('.game-card-people').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const game = await SBS.api.getGame(g.id);
        openManagePlayersModal(game, null);
      } catch (err) {
        showAlert('Failed to load game: ' + err.message);
      }
    });
    return c;
  }

  function buildGameGrid(games) {
    const grid = el('div', 'grid-cards');
    games.forEach(g => grid.appendChild(buildGameCard(g)));
    return grid;
  }

  async function renderHome() {
    const app = SBS.appEl;
    resetTeamColors();
    app.innerHTML = '';
    app.appendChild(topbar('<span><span class="brand-dollar">S</span>uper <span class="brand-dollar">S</span>quares</span>', [], { hideHome: true, pill: true }));
    const main = el('div', 'main');
    app.appendChild(main);

    main.appendChild(el('h2', '', 'Saved Games'));
    const card = el('div', 'card');
    main.appendChild(card);

    let games = [];
    try {
      games = await SBS.api.getGames();
    } catch (e) {
      card.appendChild(el('div', 'error-msg', 'Could not load saved games: ' + e.message));
    }

    const active = games.filter(g => !isArchived(g));
    const archived = games.filter(isArchived);

    if (games.length === 0) {
      card.appendChild(el('p', '', 'No games yet. Start a new one below!'));
    } else if (active.length === 0) {
      card.appendChild(el('p', '', 'No active games right now — see the Game Archive below.'));
    } else {
      const grid = buildGameGrid(active);
      card.appendChild(grid);
      fitTeamBadges(grid);
    }

    if (archived.length > 0) {
      const archiveWrap = el('div', 'archive-wrap');
      const toggle = el('button', 'archive-toggle', `<span class="archive-arrow">&#9656;</span> Game Archive (${archived.length})`);
      toggle.type = 'button';
      const archiveCard = el('div', 'card archive-panel collapsed');
      const archiveGrid = buildGameGrid(archived);
      archiveCard.appendChild(archiveGrid);
      toggle.addEventListener('click', () => {
        const collapsed = archiveCard.classList.toggle('collapsed');
        toggle.classList.toggle('open', !collapsed);
        if (!collapsed) fitTeamBadges(archiveGrid);
      });
      archiveWrap.appendChild(toggle);
      archiveWrap.appendChild(archiveCard);
      main.appendChild(archiveWrap);
    }

    const actions = el('div', 'actions');
    const newBtn = el('button', '', '+ New Game');
    newBtn.addEventListener('click', () => SBS.go({ screen: 'setup' }));
    actions.appendChild(newBtn);
    main.appendChild(actions);

    // Games are created/edited/deleted from other devices in the room (a
    // phone setting up a new pool while the TV sits on Home), and there's no
    // push channel — so poll and re-render Home if the saved-games list has
    // changed since we last drew it.
    const fingerprint = games.map(g => g.id + ':' + g.status).sort().join('|');
    SBS.setManagedInterval(async () => {
      let latest;
      try {
        latest = await SBS.api.getGames();
      } catch (e) {
        return;
      }
      const latestFingerprint = latest.map(g => g.id + ':' + g.status).sort().join('|');
      if (latestFingerprint !== fingerprint && SBS.currentScreen() === 'home') {
        SBS.go({ screen: 'home' });
      }
    }, 8000);
  }

  function defaultCutoffValue() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}T18:45`;
  }

  const DEFAULT_OTHER_COLORS = { A: '#ff6b6b', B: '#4dabf7' };

  function renderSetup(editGame) {
    const app = SBS.appEl;
    resetTeamColors();
    app.innerHTML = '';
    app.appendChild(topbar(editGame ? `Edit Game — ${escapeHtml(editGame.description || editGame.gameDate || '')}` : 'New Game — Setup'));
    const main = el('div', 'main');
    app.appendChild(main);

    const gamesCard = el('div', 'card games-picker hidden');
    main.appendChild(gamesCard);

    const card = el('div', 'card');
    main.appendChild(card);
    card.appendChild(el('h2', '', 'Game Setup'));

    const errBox = el('div', 'error-msg hidden');
    card.appendChild(errBox);
    function showErr(msg) {
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
    }

    const form = el('div');
    card.appendChild(form);

    form.innerHTML = `
      <label>League</label>
      <div class="radio-group" id="league-group">
        <div class="pill${!editGame || editGame.league === 'nfl' ? ' active' : ''}" data-val="nfl">NFL</div>
        <div class="pill${editGame && editGame.league === 'nba' ? ' active' : ''}" data-val="nba">NBA</div>
        <div class="pill${editGame && editGame.league === 'other' ? ' active' : ''}" data-val="other">Other</div>
      </div>

      <div class="row">
        <div>
          <label>Square Price ($)</label>
          <input type="number" id="f-price" value="${editGame ? editGame.squarePrice : 10}" min="0" step="0.01">
        </div>
        <div>
          <label>Game Date</label>
          <input type="date" id="f-gamedate" value="${editGame && editGame.gameDate ? editGame.gameDate : todayValue()}">
        </div>
      </div>

      <label>Description</label>
      <input type="text" id="f-description" placeholder="e.g. Super Bowl LX, Office Pool" maxlength="80" value="${editGame ? escapeHtml(editGame.description || '') : ''}">

      <div class="row">
        <div>
          <label>Team A (rows, left side)</label>
          <input type="text" id="f-teamA" placeholder="e.g. Chiefs" value="${editGame ? escapeHtml(editGame.teamA || '') : ''}">
          <div id="preview-teamA" class="team-preview"></div>
        </div>
        <div>
          <label>Team B (columns, top)</label>
          <input type="text" id="f-teamB" placeholder="e.g. Eagles" value="${editGame ? escapeHtml(editGame.teamB || '') : ''}">
          <div id="preview-teamB" class="team-preview"></div>
        </div>
      </div>

      <div class="row hidden" id="other-color-row">
        <div>
          <label>Team A Color</label>
          <input type="color" id="f-teamA-color" value="${editGame && editGame.teamAColor ? editGame.teamAColor : DEFAULT_OTHER_COLORS.A}">
        </div>
        <div>
          <label>Team B Color</label>
          <input type="color" id="f-teamB-color" value="${editGame && editGame.teamBColor ? editGame.teamBColor : DEFAULT_OTHER_COLORS.B}">
        </div>
      </div>

      <label>Quarterly Payout — % of Pot</label>
      <div class="row">
        <div><label style="margin-top:0">Q1</label><input type="number" id="f-pq1" value="${editGame ? editGame.payouts.q1 : 20}" min="0" max="100"></div>
        <div><label style="margin-top:0">Q2</label><input type="number" id="f-pq2" value="${editGame ? editGame.payouts.q2 : 20}" min="0" max="100"></div>
        <div><label style="margin-top:0">Q3</label><input type="number" id="f-pq3" value="${editGame ? editGame.payouts.q3 : 20}" min="0" max="100"></div>
        <div><label style="margin-top:0">Final</label><input type="number" id="f-pfinal" value="${editGame ? editGame.payouts.final : 40}" min="0" max="100"></div>
      </div>
      <div id="pct-total" class="pct-total"></div>

      <label>Square Pick Mode</label>
      <div class="radio-group" id="pick-mode-group">
        <div class="pill${editGame && editGame.pickMode === 'manual' ? ' active' : ''}" data-val="manual">Manual Only</div>
        <div class="pill${editGame && editGame.pickMode === 'auto' ? ' active' : ''}" data-val="auto">Auto Only</div>
        <div class="pill${!editGame || editGame.pickMode === 'both' ? ' active' : ''}" data-val="both">Both (player's choice)</div>
      </div>

      <label>Auto Cutoff Time?</label>
      <div class="toggle-group" id="cutoff-toggle">
        <div class="pill${editGame && editGame.autoCutoffEnabled ? ' active' : ''}" data-val="yes">Yes</div>
        <div class="pill${!editGame || !editGame.autoCutoffEnabled ? ' active' : ''}" data-val="no">No</div>
      </div>
      <div id="cutoff-time-wrap" class="${editGame && editGame.autoCutoffEnabled ? '' : 'hidden'}">
        <label>Cutoff Date &amp; Time</label>
        <input type="datetime-local" id="f-cutoff" step="60" value="${editGame && editGame.autoCutoffTime ? editGame.autoCutoffTime.slice(0, 16) : defaultCutoffValue()}">
        <p style="color:var(--muted); font-size:0.9rem;">At this time, the app will automatically lock square picking and generate the grid numbers.</p>
      </div>

      <label>Simulation Mode?</label>
      <div class="toggle-group" id="simulation-toggle">
        <div class="pill${editGame && editGame.simulation ? ' active' : ''}" data-val="yes">Yes</div>
        <div class="pill${!editGame || !editGame.simulation ? ' active' : ''}" data-val="no">No</div>
      </div>
      <p style="color:var(--muted); font-size:0.9rem;">For testing or demos — instead of pulling a real score, the app invents a random game and plays it out on its own (2-minute quarters) starting the moment you generate the grid numbers.</p>
    `;

    let league = editGame ? (editGame.league || 'nfl') : 'nfl';

    function currentPreviewGame() {
      return {
        teamA: form.querySelector('#f-teamA').value.trim(),
        teamB: form.querySelector('#f-teamB').value.trim(),
        league,
        teamAColor: form.querySelector('#f-teamA-color') ? form.querySelector('#f-teamA-color').value : DEFAULT_OTHER_COLORS.A,
        teamBColor: form.querySelector('#f-teamB-color') ? form.querySelector('#f-teamB-color').value : DEFAULT_OTHER_COLORS.B
      };
    }

    function updateTeamPreview(inputId, previewId, side) {
      const name = form.querySelector('#' + inputId).value.trim();
      const box = form.querySelector('#' + previewId);
      if (league === 'other') {
        box.innerHTML = `<span class="match-txt muted">Using your chosen color below.</span>`;
        return;
      }
      if (!name) { box.innerHTML = ''; return; }
      const meta = teamMeta(name, league);
      if (meta) {
        const pgame = currentPreviewGame();
        const logo = teamLogoTag(pgame, side, 24);
        box.innerHTML = `${logo}<span class="swatch" style="background:${meta.primary}"></span><span class="swatch" style="background:${meta.secondary}"></span><span class="match-txt">Matched: ${meta.names[0].replace(/\b\w/g, c => c.toUpperCase())}</span>`;
      } else {
        box.innerHTML = `<span class="match-txt muted">No ${league.toUpperCase()} team matched — using default colors.</span>`;
      }
    }
    function refreshPreviews() {
      updateTeamPreview('f-teamA', 'preview-teamA', 'A');
      updateTeamPreview('f-teamB', 'preview-teamB', 'B');
    }
    form.querySelector('#f-teamA').addEventListener('input', refreshPreviews);
    form.querySelector('#f-teamB').addEventListener('input', refreshPreviews);

    const otherColorRow = form.querySelector('#other-color-row');
    form.querySelector('#f-teamA-color').addEventListener('input', refreshPreviews);
    form.querySelector('#f-teamB-color').addEventListener('input', refreshPreviews);

    // A "Details" button that pops up the raw ESPN API response for whichever
    // game is currently selected — disabled whenever there's no selection, no
    // games at all, or the picker isn't available in the first place (ESPN
    // down, or the 'other' league, which has no ESPN schedule to query).
    function appendDetailsButton(select, games) {
      const btn = el('button', 'secondary small', 'Details');
      btn.type = 'button';
      btn.disabled = true;
      btn.style.marginTop = '10px';
      btn.addEventListener('click', () => {
        if (!select) return;
        const g = games[select.value];
        if (!g) return;
        showGameDetailsModal(g.raw !== undefined ? g.raw : g);
      });
      gamesCard.appendChild(btn);
      return btn;
    }

    // Lets the host pick that date's matchup instead of typing team names —
    // best-effort against ESPN's unofficial endpoint, so a fetch failure
    // just falls back to manual entry rather than blocking setup. Not
    // available at all for the 'other' league, which has no ESPN schedule.
    async function loadGamesForDate(dateVal) {
      gamesCard.innerHTML = '';
      gamesCard.classList.add('hidden');
      if (league === 'other') return;
      let games;
      try {
        const data = await SBS.api.getTodaysGames(dateVal, league);
        games = data.games || [];
      } catch (e) {
        gamesCard.innerHTML = `<p class="games-picker-msg">ESPN API is not available so Auto Fetch Score will not be available.</p>`;
        appendDetailsButton(null, []);
        gamesCard.classList.remove('hidden');
        return;
      }
      if (games.length === 0) {
        gamesCard.innerHTML = `<p class="games-picker-msg">There are no ${league.toUpperCase()} games on this date so Auto Fetch Score will not be available.</p>`;
        appendDetailsButton(null, []);
        gamesCard.classList.remove('hidden');
        return;
      }
      gamesCard.innerHTML = `
        <label>Games</label>
        <select id="f-games-picker">
          <option value="">Select a game…</option>
          ${games.map((g, i) => `<option value="${i}">${escapeHtml(g.teamA)} @ ${escapeHtml(g.teamB)}</option>`).join('')}
        </select>
        <p class="games-picker-msg">Auto Fetch Score Enabled</p>
      `;
      gamesCard.classList.remove('hidden');
      const select = gamesCard.querySelector('#f-games-picker');
      const detailsBtn = appendDetailsButton(select, games);
      select.addEventListener('change', (e) => {
        const g = games[e.target.value];
        detailsBtn.disabled = !g;
        if (!g) return;
        form.querySelector('#f-teamA').value = g.teamA;
        form.querySelector('#f-teamB').value = g.teamB;
        refreshPreviews();
      });
    }
    loadGamesForDate(form.querySelector('#f-gamedate').value);
    form.querySelector('#f-gamedate').addEventListener('change', (e) => loadGamesForDate(e.target.value));

    function applyLeagueUI() {
      otherColorRow.classList.toggle('hidden', league !== 'other');
      refreshPreviews();
      loadGamesForDate(form.querySelector('#f-gamedate').value);
    }
    form.querySelectorAll('#league-group .pill').forEach(p => {
      p.addEventListener('click', () => {
        form.querySelectorAll('#league-group .pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        league = p.dataset.val;
        applyLeagueUI();
      });
    });
    applyLeagueUI();

    let pickMode = editGame ? editGame.pickMode : 'both';
    let cutoffEnabled = editGame ? !!editGame.autoCutoffEnabled : false;
    let simulationEnabled = editGame ? !!editGame.simulation : false;

    form.querySelectorAll('#simulation-toggle .pill').forEach(p => {
      p.addEventListener('click', () => {
        form.querySelectorAll('#simulation-toggle .pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        simulationEnabled = p.dataset.val === 'yes';
      });
    });

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
      const total = ['f-pq1', 'f-pq2', 'f-pq3', 'f-pfinal'].reduce((s, id) => s + (parseFloat(form.querySelector('#' + id).value) || 0), 0);
      const box = form.querySelector('#pct-total');
      box.textContent = `Total: ${total}%`;
      box.className = 'pct-total ' + (total === 100 ? 'ok' : 'bad');
      return total;
    }
    form.querySelectorAll('#f-pq1,#f-pq2,#f-pq3,#f-pfinal').forEach(inp => inp.addEventListener('input', updatePctTotal));
    updatePctTotal();

    const submitLabel = editGame ? 'Save Changes' : 'Continue to Square Picking';
    const actions = el('div', 'actions');
    const submitBtn = el('button', '', submitLabel);
    const cancelBtn = el('button', 'secondary', 'Cancel');
    cancelBtn.addEventListener('click', () => SBS.go({ screen: 'home' }));
    actions.appendChild(submitBtn);
    actions.appendChild(cancelBtn);
    card.appendChild(actions);

    submitBtn.addEventListener('click', async () => {
      errBox.classList.add('hidden');
      const teamA = form.querySelector('#f-teamA').value.trim() || 'Team A';
      const teamB = form.querySelector('#f-teamB').value.trim() || 'Team B';
      const description = form.querySelector('#f-description').value.trim();
      const gameDate = form.querySelector('#f-gamedate').value || todayValue();
      const squarePrice = parseFloat(form.querySelector('#f-price').value) || 0;
      const pq1 = parseFloat(form.querySelector('#f-pq1').value) || 0;
      const pq2 = parseFloat(form.querySelector('#f-pq2').value) || 0;
      const pq3 = parseFloat(form.querySelector('#f-pq3').value) || 0;
      const pfinal = parseFloat(form.querySelector('#f-pfinal').value) || 0;
      const total = pq1 + pq2 + pq3 + pfinal;

      if (total !== 100) {
        return showErr(`Quarterly payout percentages must add up to 100% (currently ${total}%).`);
      }
      if (cutoffEnabled && !form.querySelector('#f-cutoff').value) {
        return showErr('Please choose a cutoff date & time, or turn off the auto-cutoff option.');
      }

      // Editing only ever touches setup fields (teams, price, payouts, pick
      // mode, cutoff, simulation) — everything else about the game (squares,
      // axis numbers, results, players, status) carries over untouched.
      const game = Object.assign({}, editGame, {
        teamA, teamB, description, gameDate, squarePrice, league,
        payouts: { q1: pq1, q2: pq2, q3: pq3, final: pfinal },
        pickMode,
        autoCutoffEnabled: cutoffEnabled,
        autoCutoffTime: cutoffEnabled ? form.querySelector('#f-cutoff').value : null,
        simulation: simulationEnabled
      });
      if (league === 'other') {
        game.teamAColor = form.querySelector('#f-teamA-color').value;
        game.teamBColor = form.querySelector('#f-teamB-color').value;
      } else {
        game.teamAColor = null;
        game.teamBColor = null;
      }
      if (!editGame) {
        game.status = 'picking';
        game.squares = emptyGrid();
        game.axisX = null;
        game.axisY = null;
        game.results = {};
        game.players = {};
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving…';
      try {
        if (editGame) {
          const saved = await SBS.api.saveGame(game);
          SBS.go({ screen: 'picking', game: saved });
        } else {
          const saved = await SBS.api.createGame(game);
          SBS.go({ screen: 'picking', game: saved });
        }
      } catch (e) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
        if (editGame && await SBS.handleConflict(e, editGame.id)) return;
        showErr(e.message);
      }
    });
  }

  SBS.screens.home = renderHome;
  SBS.screens.setup = renderSetup;
  SBS.screens.editGame = renderSetup;
})();

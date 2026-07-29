// Home (saved games list) and Step 1 (new game setup).
(function () {
  'use strict';

  const SBS = window.SBS = window.SBS || {};
  const { el, escapeHtml, topbar, statusLabel, showAlert, showConfirm, currentDefaultYear, teamMeta, teamLogoTag, teamBadge, resetTeamColors, fitTeamBadges } = SBS.ui;
  const { emptyGrid } = window.GameLogic;

  async function openYear(year) {
    try {
      const game = await SBS.api.getGame(year);
      if (game.status === 'setup' || game.status === 'picking') {
        SBS.go({ screen: 'picking', game });
      } else {
        SBS.go({ screen: 'board', game });
      }
    } catch (e) {
      showAlert('Failed to load game: ' + e.message);
    }
  }

  async function renderHome() {
    const app = SBS.appEl;
    resetTeamColors();
    app.innerHTML = '';
    app.appendChild(topbar('Super Bowl Squares', [], { hideHome: true }));
    const main = el('div', 'main');
    app.appendChild(main);

    main.appendChild(el('h2', '', 'Saved Games'));
    const card = el('div', 'card');
    main.appendChild(card);

    let years = [];
    try {
      years = await SBS.api.getYears();
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
          <button class="ghost small btn-delete year-card-delete">Delete</button>
          <div class="yr">${y.year}</div>
          <div class="teams badge-fit">${teamBadge(y.teamA || '?', 'A', { logoSize: 18, cls: 'team-badge-sm' })}<span class="vs-sep">vs</span>${teamBadge(y.teamB || '?', 'B', { logoSize: 18, cls: 'team-badge-sm' })}</div>
          <span class="status status-${y.status}">${statusLabel(y.status)}</span>
        `;
        c.addEventListener('click', () => openYear(y.year));
        c.querySelector('.year-card-delete').addEventListener('click', async (e) => {
          e.stopPropagation();
          const ok = await showConfirm(`Delete the ${y.year} game (${y.teamA || '?'} vs ${y.teamB || '?'})? This cannot be undone.`);
          if (!ok) return;
          try {
            await SBS.api.deleteGame(y.year);
            renderHome();
          } catch (err) {
            showAlert('Failed to delete game: ' + err.message);
          }
        });
        grid.appendChild(c);
      });
      card.appendChild(grid);
      fitTeamBadges(grid);
    }

    const actions = el('div', 'actions');
    const newBtn = el('button', '', '+ New Game');
    newBtn.addEventListener('click', () => SBS.go({ screen: 'setup' }));
    actions.appendChild(newBtn);
    main.appendChild(actions);
  }

  function renderSetup() {
    const app = SBS.appEl;
    resetTeamColors();
    app.innerHTML = '';
    app.appendChild(topbar('New Game — Setup'));
    const main = el('div', 'main');
    app.appendChild(main);

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

      <label>Simulation Mode?</label>
      <div class="toggle-group" id="simulation-toggle">
        <div class="pill" data-val="yes">Yes</div>
        <div class="pill active" data-val="no">No</div>
      </div>
      <p style="color:var(--muted); font-size:0.9rem;">For testing or demos — instead of pulling a real ESPN score, the app invents a random game and plays it out on its own (2-minute quarters) starting the moment you generate the grid numbers.</p>
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
    let simulationEnabled = false;

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

    const actions = el('div', 'actions');
    const submitBtn = el('button', '', 'Continue to Square Picking');
    const cancelBtn = el('button', 'secondary', 'Cancel');
    cancelBtn.addEventListener('click', () => SBS.go({ screen: 'home' }));
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
        simulation: simulationEnabled,
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
        const saved = await SBS.api.createGame(game);
        SBS.go({ screen: 'picking', game: saved });
      } catch (e) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Continue to Square Picking';
        showErr(e.message);
      }
    });
  }

  SBS.screens.home = renderHome;
  SBS.screens.setup = renderSetup;
})();

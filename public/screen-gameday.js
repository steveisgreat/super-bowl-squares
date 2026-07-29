// Step 3 (score entry on the iPad) and the TV grid-only view (AirPlayed to the
// 1080p screen the room watches).
(function () {
  'use strict';

  const SBS = window.SBS = window.SBS || {};
  const { el, escapeHtml, money, topbar, showAlert, applyTeamColors, teamBadge, fitTeamBadges, readableTextColor } = SBS.ui;
  const { unpaidTotal, openManagePlayersModal } = SBS.players;
  const { QUARTERS, QLABEL, computeGame } = window.GameLogic;

  function renderBoard(game) {
    const app = SBS.appEl;
    applyTeamColors(game);
    app.innerHTML = '';
    const reopen = () => SBS.go({ screen: 'board', game });
    const manageBtn = el('button', 'secondary', 'Manage Players');
    manageBtn.addEventListener('click', () => openManagePlayersModal(game, reopen));
    const tvBtn = el('button', 'secondary', 'Open TV Grid View');
    tvBtn.addEventListener('click', () => {
      window.open(`${location.origin}${location.pathname}#tv-${game.year}`, '_blank');
    });
    const phoneBtn = el('button', 'secondary', 'Phone Score Entry');
    phoneBtn.addEventListener('click', () => showPhoneLink(game.year));
    app.appendChild(topbar(`${teamBadge(game.teamA, 'A', { logoSize: 22, cls: 'team-badge-sm' })}<span class="vs-sep">vs</span>${teamBadge(game.teamB, 'B', { logoSize: 22, cls: 'team-badge-sm' })}<span class="header-year">${game.year}</span>`, [manageBtn, tvBtn, phoneBtn]));
    const main = el('div', 'main');
    app.appendChild(main);

    main.appendChild(el('h2', '', 'Game Day'));

    const computed = computeGame(game);

    const isPotEdited = game.potOverride !== null && game.potOverride !== undefined && game.potOverride !== '';
    const strip = el('div', 'stat-strip');
    const filled = game.squares.filter(s => s).length;
    const unpaidNow = unpaidTotal(game);
    strip.innerHTML = `
      <div class="stat-box">
        <input type="number" id="pot-input" class="val val-input" min="0" step="1" value="${Math.round(computed.pot)}">
        <div class="lbl">Total Pot${isPotEdited ? ' <span class="pot-edited-tag">(edited)</span>' : ''}</div>
      </div>
      <div class="stat-box"><div class="val">${filled}</div><div class="lbl">Squares Sold</div></div>
      <div class="stat-box"><div class="val">${money(game.squarePrice)}</div><div class="lbl">Per Square</div></div>
      <div class="stat-box ${unpaidNow > 0 ? 'warn' : ''} clickable" id="unpaid-stat"><div class="val">${money(unpaidNow)}</div><div class="lbl">Unpaid Total</div></div>
    `;
    main.appendChild(strip);
    strip.querySelector('#unpaid-stat').addEventListener('click', () => openManagePlayersModal(game, reopen));

    // Blanking the field clears the override and falls back to the actual
    // collected total (squares sold × price); typing a number overrides it.
    strip.querySelector('#pot-input').addEventListener('change', async (e) => {
      const raw = e.target.value.trim();
      if (raw === '') {
        game.potOverride = null;
      } else {
        const num = Math.round(parseFloat(raw));
        game.potOverride = (Number.isFinite(num) && num >= 0) ? num : null;
      }
      try {
        const saved = await SBS.api.saveGame(game);
        renderBoard(saved);
      } catch (err) {
        if (await SBS.handleConflict(err, game.year)) return;
        showAlert('Could not save the total pot: ' + err.message);
        renderBoard(game);
      }
    });

    const layout = el('div', 'pick-layout board-first');
    main.appendChild(layout);

    // ---- Board ----
    const boardCard = el('div', 'card');
    layout.appendChild(boardCard);

    const boardHolder = el('div');
    boardCard.appendChild(boardHolder);
    SBS.board.renderFullBoard(boardHolder, game, computed);
    boardCard.appendChild(el('div', 'board-legend', '<span class="legend-chip"></span> Square is claimed but not paid for'));

    // ---- Results panel ----
    const resultsCard = el('div', 'card');
    layout.appendChild(resultsCard);
    resultsCard.appendChild(el('h3', '', 'Quarterly Results'));
    const qgrid = el('div', 'quarters');
    resultsCard.appendChild(qgrid);

    // Quarter cards are built once and then updated in place. Rebuilding them
    // on every save destroyed the score input the host was typing into, which
    // on an iPad also dismissed the keyboard mid-entry.
    const qcards = {};

    function buildQuarterCards(computedNow) {
      qgrid.innerHTML = '';
      QUARTERS.forEach(q => {
        const res = computedNow.results[q];
        const qcard = el('div', 'qcard');
        const label = q === 'final' ? 'Final Score' : QLABEL[q];
        qcard.innerHTML = `<h4><span>${label}</span><span class="qamt"></span></h4>`;
        const scoreRow = el('div', 'score-inputs');
        scoreRow.innerHTML = `
          <div class="score-team badge-fit">
            ${teamBadge(game.teamA, 'A', { logoSize: 16, cls: 'team-badge-sm' })}
            <input type="number" min="0" max="9" id="score-${q}-a" value="${res.a === null ? '' : res.a}">
          </div>
          <span class="vs">–</span>
          <div class="score-team badge-fit">
            ${teamBadge(game.teamB, 'B', { logoSize: 16, cls: 'team-badge-sm' })}
            <input type="number" min="0" max="9" id="score-${q}-b" value="${res.b === null ? '' : res.b}">
          </div>
        `;
        qcard.appendChild(scoreRow);

        const outcome = el('div', 'outcome');
        qcard.appendChild(outcome);
        const actionsEl = el('div', '');
        qcard.appendChild(actionsEl);
        qgrid.appendChild(qcard);

        const inputA = scoreRow.querySelector(`#score-${q}-a`);
        const inputB = scoreRow.querySelector(`#score-${q}-b`);
        inputA.addEventListener('input', (e) => onScoreChange(q, 'a', e.target.value));
        inputB.addEventListener('input', (e) => onScoreChange(q, 'b', e.target.value));
        // Scores are clamped to a single digit on entry; show what was actually
        // stored once the host moves on.
        inputA.addEventListener('blur', () => refreshQuarterCards(computeGame(game)));
        inputB.addEventListener('blur', () => refreshQuarterCards(computeGame(game)));

        qcards[q] = { amtEl: qcard.querySelector('.qamt'), outcome, inputA, inputB, actionsEl };
      });
      refreshQuarterCards(computedNow);
    }

    function refreshQuarterCards(computedNow) {
      QUARTERS.forEach(q => {
        const res = computedNow.results[q];
        const refs = qcards[q];
        if (!refs) return;

        refs.amtEl.textContent = money(res.amount);

        // Never overwrite a field the host is currently typing in.
        [['inputA', 'a'], ['inputB', 'b']].forEach(([key, side]) => {
          const input = refs[key];
          const want = res[side] === null ? '' : String(res[side]);
          if (document.activeElement !== input && input.value !== want) input.value = want;
        });

        const outcome = refs.outcome;
        outcome.className = 'outcome';
        if (res.a === null || res.b === null) {
          outcome.classList.add('pending');
          const rollover = res.carryIn > 0
            ? ` Includes ${money(res.carryIn)} rolled over from an earlier push — it goes to whichever quarter is scored next.`
            : '';
          outcome.textContent = 'Awaiting score entry…' + rollover;
        } else if (res.resolved && res.pushed) {
          outcome.classList.add('push');
          outcome.textContent = `PUSH — no one in that square. ${money(res.amount)} rolls into the next payout.`;
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

        refs.actionsEl.innerHTML = '';
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
          refs.actionsEl.appendChild(drawBtn);
        }
      });
    }

    buildQuarterCards(computed);
    fitTeamBadges(app);

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

    // Uniform pick among the claimed squares.
    function drawFinalWinner(g) {
      const filledIdx = g.squares.map((s, i) => s ? i : -1).filter(i => i >= 0);
      if (filledIdx.length === 0) return -1;
      return filledIdx[Math.floor(Math.random() * filledIdx.length)];
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
        const saved = await SBS.api.saveGame(game);
        Object.assign(game, saved);
        const newComputed = computeGame(game);
        SBS.board.renderFullBoard(boardHolder, game, newComputed);
        refreshQuarterCards(newComputed);
      } catch (e) {
        if (await SBS.handleConflict(e, game.year)) return;
        console.error('Save failed', e);
        showAlert('Could not save the score: ' + e.message);
      }
    }
  }

  // The phone can't be handed a link by the PC, so show the address to type in.
  // The server reports its own LAN IPs (the browser can't discover them).
  async function showPhoneLink(year) {
    const overlay = SBS.ui.overlayEl('0.65');
    const box = el('div', 'card');
    box.style.cssText = 'max-width:520px; width:100%; box-shadow: var(--shadow-pop);';
    box.innerHTML = `<h3 style="margin-top:0">Score entry on your phone</h3>
      <p style="color:var(--muted)">Point your phone's camera at the code, or type the address in (same WiFi as this PC). You can tap in quarter scores there while the grid stays up on the TV.</p>
      <p style="color:var(--muted)">The first time you open it, your phone will warn that the connection isn't private — that's expected on a home network with no internet. Tap "Advanced" then "proceed" to continue.</p>
      <p style="color:var(--muted)">Page won't load at all? On iPhone, go to Settings → Wi-Fi → (ⓘ) next to this network and turn off "Limit IP Address Tracking" — with it on, the phone can't reach other devices on the same network.</p>
      <div class="phone-link-list">Loading addresses…</div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const list = box.querySelector('.phone-link-list');
    try {
      const hosts = await SBS.api.getHosts();
      const path = `${location.pathname}#score-${year}`;
      if (!hosts.addresses.length) {
        list.innerHTML = `<p class="error-msg">No network address found. Run <code>ipconfig</code> on this PC to find its IP.</p>`;
      } else {
        // Show one QR code, for the first (primary) address — a QR per
        // address was confusing when a PC has more than one adapter. Any
        // other addresses are still listed as plain text as a fallback.
        // https + the server's self-signed cert avoids a hard connection
        // failure on phones with "HTTPS-only" mode or a VPN app that
        // force-upgrades insecure connections. Both protocols are served off
        // the same port, so there's nothing extra to open in the firewall.
        const scheme = hosts.httpsReady ? 'https' : 'http';
        const urls = hosts.addresses.map(ip => `${scheme}://${ip}:${hosts.port}${path}`);
        let qr = '';
        try {
          qr = window.QRCode.toSvg(urls[0], 132);
        } catch (err) {
          // A QR failure must not cost the host the address itself.
          console.error('QR encode failed', err);
        }
        const qrBlock = qr
          ? `<div class="phone-qr-block"><div class="phone-qr">${qr}</div><div class="phone-link">${escapeHtml(urls[0])}</div></div>`
          : `<div class="phone-link">${escapeHtml(urls[0])}</div>`;
        const otherUrls = urls.slice(1);
        const otherBlock = otherUrls.length
          ? `<div class="phone-link-fallback">${otherUrls.map(u => `<div class="phone-link">${escapeHtml(u)}</div>`).join('')}</div>`
          : '';
        list.innerHTML = qrBlock + otherBlock;
      }
    } catch (e) {
      list.innerHTML = `<p class="error-msg">Could not read the server's address: ${escapeHtml(e.message)}</p>`;
    }

    const actions = el('div', 'actions');
    const openHere = el('button', 'secondary', 'Open it on this device');
    openHere.addEventListener('click', () => {
      overlay.remove();
      window.open(`${location.origin}${location.pathname}#score-${year}`, '_blank');
    });
    const close = el('button', '', 'Done');
    close.addEventListener('click', () => overlay.remove());
    actions.appendChild(close);
    actions.appendChild(openHere);
    box.appendChild(actions);
  }

  // ---------- TV / grid-only view (1080p, no controls, self-refreshing) ----------
  function renderTV(year) {
    const app = SBS.appEl;
    app.innerHTML = '';
    document.body.classList.add('tv-mode');

    const screenEl = el('div', 'tv-screen');
    app.appendChild(screenEl);

    const header = el('div', 'tv-header');
    screenEl.appendChild(header);

    const tvQuarters = el('div', 'tv-quarters');
    screenEl.appendChild(tvQuarters);

    const boardWrap = el('div', 'tv-board-wrap');
    screenEl.appendChild(boardWrap);

    // Controls fade out so the television shows nothing but the grid; any tap
    // or mouse move brings them back.
    const controls = el('div', 'tv-controls');
    screenEl.appendChild(controls);

    const fsBtn = el('button', 'tv-btn', 'Fullscreen');
    const exitBtn = el('button', 'tv-btn', 'Exit');

    function syncFsLabel() {
      const on = SBS.ui.fullscreen.active();
      fsBtn.textContent = on ? 'Leave Fullscreen' : 'Fullscreen';
      document.body.classList.toggle('tv-fullscreen', on);
    }

    fsBtn.addEventListener('click', async () => {
      if (SBS.ui.fullscreen.active()) {
        await SBS.ui.fullscreen.exit();
      } else if (!await SBS.ui.fullscreen.enter()) {
        // iPhone Safari (and anything else without the API): the view is
        // already edge-to-edge, so just say so rather than failing silently.
        showAlert('This browser won\'t let a web page go fullscreen. The grid is already filling the window — on an iPad, hide Safari\'s toolbar by tapping the grid and scrolling, or add this page to your Home Screen.');
        return;
      }
      syncFsLabel();
    });

    exitBtn.addEventListener('click', async () => {
      if (SBS.ui.fullscreen.active()) await SBS.ui.fullscreen.exit();
      window.location.hash = '';
      try {
        const game = await SBS.api.getGame(year);
        SBS.go({ screen: 'board', game });
      } catch (e) {
        SBS.go({ screen: 'home' });
      }
    });

    controls.appendChild(fsBtn);
    controls.appendChild(exitBtn);

    const stopFsWatch = SBS.ui.fullscreen.onChange(syncFsLabel);
    syncFsLabel();

    let idleTimer = null;
    function wake() {
      screenEl.classList.remove('chrome-hidden');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => screenEl.classList.add('chrome-hidden'), 3000);
    }
    ['mousemove', 'touchstart', 'keydown'].forEach(ev => screenEl.addEventListener(ev, wake));
    wake();

    const releaseWakeLock = SBS.ui.keepScreenAwake();

    // Leaving the TV route tears down everything the screen installed.
    SBS.onLeaveScreen(() => {
      clearTimeout(idleTimer);
      stopFsWatch();
      releaseWakeLock();
      document.body.classList.remove('tv-mode', 'tv-fullscreen');
    });

    // Read-only, single-row summary of all four quarters — full team pills
    // (matching the rest of the app) but no score inputs, so the board
    // underneath keeps almost all of the screen.
    function renderTvQuarters(game, computed) {
      const badgeA = teamBadge(game.teamA, 'A', { logoSize: 18, cls: 'team-badge-sm' });
      const badgeB = teamBadge(game.teamB, 'B', { logoSize: 18, cls: 'team-badge-sm' });
      tvQuarters.innerHTML = QUARTERS.map(q => {
        const res = computed.results[q];
        const scoreTxt = (res.a === null || res.b === null) ? '– – –' : `${res.a}–${res.b}`;
        let statusTxt, statusCls;
        if (res.a === null || res.b === null) {
          statusTxt = 'Awaiting'; statusCls = 'pending';
        } else if (res.resolved && res.pushed) {
          statusTxt = 'PUSH'; statusCls = 'push';
        } else if (res.resolved && res.winnerName) {
          statusTxt = res.winnerName; statusCls = 'win';
        } else if (q === 'final' && res.needsDraw) {
          statusTxt = 'Needs draw'; statusCls = 'push';
        } else {
          statusTxt = '—'; statusCls = 'pending';
        }
        return `
          <div class="tv-qchip ${statusCls}">
            <div class="tvq-top"><span class="tvq-label">${QLABEL[q]}</span><span class="tvq-amt">${money(res.amount)}</span></div>
            <div class="tvq-score badge-fit">
              ${badgeA}
              <span class="tvq-digits">${scoreTxt}</span>
              ${badgeB}
            </div>
            <div class="tvq-status">${escapeHtml(statusTxt)}</div>
          </div>
        `;
      }).join('');
    }

    async function load() {
      if (SBS.currentScreen() !== 'tv') return;
      try {
        const game = await SBS.api.getGame(year);
        applyTeamColors(game);
        const computed = computeGame(game);
        const filled = game.squares.filter(s => s).length;
        header.innerHTML = `
          <div class="tv-meta">
            <span>${game.year}</span>
            <span>Pot: ${money(computed.pot)}</span>
            <span>${filled}/100 Sold</span>
          </div>
        `;
        renderTvQuarters(game, computed);
        fitTeamBadges(tvQuarters);
        SBS.board.renderFullBoard(boardWrap, game, computed);
      } catch (e) {
        header.innerHTML = `<div class="error-msg">Could not load ${year}: ${escapeHtml(e.message)}</div>`;
      }
    }

    load();
    SBS.setManagedInterval(load, 4000);
  }

  SBS.screens.board = renderBoard;
  SBS.screens.tv = renderTV;
})();

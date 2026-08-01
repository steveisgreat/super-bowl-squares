// Step 3 (score entry on the iPad) and the TV grid-only view (AirPlayed to the
// 1080p screen the room watches).
(function () {
  'use strict';

  const SBS = window.SBS = window.SBS || {};
  const { el, escapeHtml, money, topbar, showAlert, applyTeamColors, teamBadge, teamStyle, fitTeamBadges, readableTextColor, isPhone, TV_ICON, PHONE_ICON, PEOPLE_ICON } = SBS.ui;
  const { unpaidTotal, openManagePlayersModal } = SBS.players;
  const { QUARTERS, QLABEL, computeGame, payoutAmount, drawnDigits } = window.GameLogic;

  // Silver Lombardi-style trophy for the NFL quarter-end celebration.
  const TROPHY_NFL_SVG =
    '<svg viewBox="0 0 64 88" xmlns="http://www.w3.org/2000/svg">'
      + '<ellipse cx="32" cy="18" rx="10" ry="17" fill="#cfd2d4" stroke="#8f9296" stroke-width="1"/>'
      + '<ellipse cx="28" cy="12" rx="4" ry="7" fill="#eef0f1" opacity="0.7"/>'
      + '<line x1="32" y1="4" x2="32" y2="32" stroke="#8f9296" stroke-width="1.1"/>'
      + '<line x1="28.6" y1="9" x2="35.4" y2="9" stroke="#8f9296" stroke-width="1"/>'
      + '<line x1="27.6" y1="14" x2="36.4" y2="14" stroke="#8f9296" stroke-width="1"/>'
      + '<line x1="27.6" y1="19" x2="36.4" y2="19" stroke="#8f9296" stroke-width="1"/>'
      + '<line x1="28.6" y1="24" x2="35.4" y2="24" stroke="#8f9296" stroke-width="1"/>'
      + '<path d="M18 34 L46 34 L34 40 L30 40 Z" fill="#d6d9db" stroke="#8f9296" stroke-width="0.8"/>'
      + '<path d="M25 40 L26 66 L23 74 L20 40 Z" fill="#c3c6c8" stroke="#8f9296" stroke-width="0.8"/>'
      + '<path d="M32 40 L32 66 L32 74 L32 40 Z" fill="#d6d9db" stroke="#8f9296" stroke-width="0.8"/>'
      + '<path d="M39 40 L38 66 L41 74 L44 40 Z" fill="#c3c6c8" stroke="#8f9296" stroke-width="0.8"/>'
      + '<rect x="14" y="74" width="36" height="7" rx="1.5" fill="#e4e6e7" stroke="#8f9296" stroke-width="1"/>'
      + '<rect x="10" y="81" width="44" height="6" rx="2" fill="#9a9d9f" stroke="#75787a" stroke-width="1"/>'
      + '<ellipse cx="27" cy="10" rx="2.4" ry="5" fill="#ffffff" opacity="0.55"/>'
    + '</svg>';

  // Gold, basketball-topped trophy (Larry O'Brien-style silhouette) for NBA.
  const TROPHY_NBA_SVG =
    '<svg viewBox="0 0 64 88" xmlns="http://www.w3.org/2000/svg">'
      + '<circle cx="32" cy="19" r="15" fill="#e8b923" stroke="#a67c00" stroke-width="1"/>'
      + '<path d="M32 4 V34" stroke="#a67c00" stroke-width="1.1" fill="none"/>'
      + '<path d="M17.5 19 Q32 24 46.5 19" stroke="#a67c00" stroke-width="1.1" fill="none"/>'
      + '<path d="M20 8 Q28 19 20 30" stroke="#a67c00" stroke-width="1" fill="none"/>'
      + '<path d="M44 8 Q36 19 44 30" stroke="#a67c00" stroke-width="1" fill="none"/>'
      + '<ellipse cx="27" cy="13" rx="4" ry="6" fill="#f7d774" opacity="0.6"/>'
      + '<path d="M18 34 L46 34 L34 40 L30 40 Z" fill="#f0c94a" stroke="#a67c00" stroke-width="0.8"/>'
      + '<path d="M25 40 L26 66 L23 74 L20 40 Z" fill="#e2b93e" stroke="#a67c00" stroke-width="0.8"/>'
      + '<path d="M32 40 L32 66 L32 74 L32 40 Z" fill="#f0c94a" stroke="#a67c00" stroke-width="0.8"/>'
      + '<path d="M39 40 L38 66 L41 74 L44 40 Z" fill="#e2b93e" stroke="#a67c00" stroke-width="0.8"/>'
      + '<rect x="14" y="74" width="36" height="7" rx="1.5" fill="#f3dd8e" stroke="#a67c00" stroke-width="1"/>'
      + '<rect x="10" y="81" width="44" height="6" rx="2" fill="#c9a227" stroke="#8a6c1a" stroke-width="1"/>'
    + '</svg>';

  // Plain gold loving-cup trophy for any 'other' (non-NFL/NBA) sport.
  const TROPHY_OTHER_SVG =
    '<svg viewBox="0 0 64 88" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M20 10 h24 v14 a12 12 0 0 1-24 0 z" fill="#d8b46a" stroke="#8a6c1a" stroke-width="1"/>'
      + '<path d="M20 14 Q8 14 8 24 Q8 32 20 30" fill="none" stroke="#8a6c1a" stroke-width="2.4"/>'
      + '<path d="M44 14 Q56 14 56 24 Q56 32 44 30" fill="none" stroke="#8a6c1a" stroke-width="2.4"/>'
      + '<ellipse cx="26" cy="16" rx="3.5" ry="6" fill="#f0dca0" opacity="0.6"/>'
      + '<rect x="30" y="36" width="4" height="30" fill="#c9a24a" stroke="#8a6c1a" stroke-width="0.8"/>'
      + '<path d="M18 66 L46 66 L40 74 L24 74 Z" fill="#d8b46a" stroke="#8a6c1a" stroke-width="0.8"/>'
      + '<rect x="14" y="74" width="36" height="7" rx="1.5" fill="#e4c98a" stroke="#8a6c1a" stroke-width="1"/>'
      + '<rect x="10" y="81" width="44" height="6" rx="2" fill="#b7924a" stroke="#8a6c1a" stroke-width="1"/>'
    + '</svg>';

  const QR_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
    <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
    <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
    <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20v.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

  const TROPHY_SVGS = { nfl: TROPHY_NFL_SVG, nba: TROPHY_NBA_SVG, other: TROPHY_OTHER_SVG };
  function trophySvgFor(league) { return TROPHY_SVGS[league] || TROPHY_SVGS.other; }

  const CELEBRATION_SPARKLE_SPOTS = [
    [4, 4, 20, 0], [66, 12, 16, 0.5], [10, 55, 14, 1.0], [60, 68, 18, 0.3], [36, -8, 14, 0.8], [70, 88, 16, 1.3]
  ];

  // Small trophy dropped into each winner row's per-quarter pill.
  const MINI_TROPHY_SVG = '<svg viewBox="0 0 16 22" xmlns="http://www.w3.org/2000/svg" width="11" height="15" aria-hidden="true">'
    + '<path d="M3 1h10v4a5 5 0 0 1-10 0V1z" fill="currentColor"/>'
    + '<path d="M3 2H1a2.5 2.5 0 0 0 2.6 3.6" stroke="currentColor" stroke-width="1.3" fill="none"/>'
    + '<path d="M13 2h2a2.5 2.5 0 0 1-2.6 3.6" stroke="currentColor" stroke-width="1.3" fill="none"/>'
    + '<rect x="7" y="10.5" width="2" height="4" fill="currentColor"/>'
    + '<rect x="4.5" y="16" width="7" height="1.8" rx="0.6" fill="currentColor"/>'
    + '<rect x="3.5" y="19" width="9" height="2" rx="0.8" fill="currentColor"/>'
    + '</svg>';

  // ---------- Randomly-drawn Final winner reveal ----------
  // Plays whenever the Final quarter's winning square is empty and gets
  // resolved via the "Randomly Draw Winner" button (board or phone): a big
  // countdown, then a two-wheel slot-machine spin that lands on the drawn
  // square's coordinates. Timed off the shared `drawnAt` timestamp stored on
  // the game so a screen that only learns about it a few seconds late (the
  // next poll) catches up mid-sequence and still lands at the same moment
  // as everyone else, instead of just snapping straight to the result.
  const DRAW_COUNTDOWN_MS = 10000; // 10, 9, ... 1
  const DRAW_SPIN_MS = 10000;
  const DRAW_TOTAL_MS = DRAW_COUNTDOWN_MS + DRAW_SPIN_MS;
  // A screen that notices the draw well after the sequence would already be
  // over everywhere else (TV was off, tab was backgrounded) just skips the
  // animation rather than replaying a stale one.
  const DRAW_CATCHUP_WINDOW_MS = DRAW_TOTAL_MS + 6000;

  function playDrawReveal({ game, row, col, elapsedMs, onDone }) {
    elapsedMs = Math.max(0, elapsedMs || 0);
    const overlay = el('div', 'draw-reveal-overlay');
    const card = el('div', 'draw-reveal-card');
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let cancelled = false;
    let timer = null;

    function finish() {
      if (overlay.parentNode) overlay.remove();
      if (!cancelled && onDone) onDone();
    }
    function cancel() {
      cancelled = true;
      clearTimeout(timer);
      if (overlay.parentNode) overlay.remove();
    }

    function showReveal() {
      const winner = game.squares[row * 10 + col];
      const yDigit = game.axisY ? game.axisY[row] : null;
      const xDigit = game.axisX ? game.axisX[col] : null;
      card.innerHTML = `
        <div class="draw-reveal-label">Winning square</div>
        <div class="draw-reveal-nums">${yDigit === null ? '&ndash;' : yDigit}&nbsp;&ndash;&nbsp;${xDigit === null ? '&ndash;' : xDigit}</div>
        <div class="draw-reveal-name">${winner ? escapeHtml(winner.name) : 'Empty square'}</div>
      `;
      timer = setTimeout(finish, 5000);
    }

    function landWheels(wheelA, wheelB, spinInterval, yDigit, xDigit) {
      clearInterval(spinInterval);
      wheelA.classList.remove('spinning'); wheelA.classList.add('landed');
      wheelB.classList.remove('spinning'); wheelB.classList.add('landed');
      wheelA.textContent = yDigit === null ? '–' : yDigit;
      wheelB.textContent = xDigit === null ? '–' : xDigit;
      timer = setTimeout(showReveal, 900);
    }

    function startSpin(spinElapsedMs) {
      const spinRemaining = Math.max(0, DRAW_SPIN_MS - spinElapsedMs);
      const yDigit = game.axisY ? game.axisY[row] : null;
      const xDigit = game.axisX ? game.axisX[col] : null;
      // Each reel is tinted with its own team's two colors (primary for the
      // border/glow, secondary for the gradient behind the spinning digit)
      // so the wheel that lands on Team A's number reads as A's the whole
      // time it's spinning, not just once it stops.
      const styleA = teamStyle(game, 'A');
      const styleB = teamStyle(game, 'B');
      const wheelVars = s => `--wheel-primary:${s.primary}; --wheel-secondary:${s.secondary}; color:${readableTextColor(s.primary)};`;
      card.innerHTML = `
        <div class="draw-reveal-label">Spinning the grid&hellip;</div>
        <div class="draw-wheels">
          <div class="draw-wheel">
            ${teamBadge(game, 'A', { logoSize: 20, cls: 'team-badge-sm' })}
            <div class="draw-wheel-num spinning" style="${wheelVars(styleA)}">0</div>
          </div>
          <div class="draw-wheel-sep">&ndash;</div>
          <div class="draw-wheel">
            ${teamBadge(game, 'B', { logoSize: 20, cls: 'team-badge-sm' })}
            <div class="draw-wheel-num spinning" style="${wheelVars(styleB)}">0</div>
          </div>
        </div>
      `;
      fitTeamBadges(card);
      const wheels = card.querySelectorAll('.draw-wheel-num');
      const wheelA = wheels[0], wheelB = wheels[1];
      const spinInterval = setInterval(() => {
        wheelA.textContent = Math.floor(Math.random() * 10);
        wheelB.textContent = Math.floor(Math.random() * 10);
      }, 70);
      timer = setTimeout(() => landWheels(wheelA, wheelB, spinInterval, yDigit, xDigit), spinRemaining);
    }

    function tickCountdown(remainingMs) {
      const n = Math.max(1, Math.ceil(remainingMs / 1000));
      card.innerHTML = `
        <div class="draw-reveal-label">Drawing a winner&hellip;</div>
        <div class="draw-countdown-num">${n}</div>
      `;
      if (remainingMs <= 1000) {
        timer = setTimeout(() => startSpin(0), remainingMs);
        return;
      }
      const msIntoSecond = remainingMs - (n - 1) * 1000;
      const nextDelay = msIntoSecond > 0 ? msIntoSecond : 1000;
      timer = setTimeout(() => tickCountdown(remainingMs - nextDelay), nextDelay);
    }

    if (elapsedMs >= DRAW_TOTAL_MS) {
      showReveal();
    } else if (elapsedMs < DRAW_COUNTDOWN_MS) {
      tickCountdown(DRAW_COUNTDOWN_MS - elapsedMs);
    } else {
      startSpin(elapsedMs - DRAW_COUNTDOWN_MS);
    }

    return { cancel };
  }

  function renderBoard(game) {
    const app = SBS.appEl;
    applyTeamColors(game);
    app.innerHTML = '';
    const reopen = () => SBS.go({ screen: 'board', game });
    const phone = isPhone();
    const manageBtn = phone
      ? el('button', 'icon-btn', PEOPLE_ICON)
      : el('button', 'secondary', 'Manage Players');
    manageBtn.type = 'button';
    if (phone) { manageBtn.setAttribute('aria-label', 'Manage Players'); manageBtn.title = 'Manage Players'; }
    manageBtn.addEventListener('click', () => openManagePlayersModal(game, reopen));
    const tvBtn = phone
      ? el('button', 'icon-btn', TV_ICON)
      : el('button', 'secondary', 'Open TV Grid View');
    tvBtn.type = 'button';
    if (phone) { tvBtn.setAttribute('aria-label', 'Open TV Grid View'); tvBtn.title = 'Open TV Grid View'; }
    tvBtn.addEventListener('click', () => {
      window.open(`${location.origin}${location.pathname}#tv-${game.id}`, '_blank');
    });
    const phoneBtn = phone
      ? el('button', 'icon-btn', PHONE_ICON)
      : el('button', 'secondary', 'Phone Score Entry');
    phoneBtn.type = 'button';
    if (phone) { phoneBtn.setAttribute('aria-label', 'Phone Score Entry'); phoneBtn.title = 'Phone Score Entry'; }
    phoneBtn.addEventListener('click', () => showPhoneLink(game.id));
    // Players scan this to open the read-only companion view (their squares,
    // quarter winners, live status) — separate from the host's own score-entry
    // link above, and safe to hand out to anyone in the room.
    const playerBtn = phone
      ? el('button', 'icon-btn', QR_ICON)
      : el('button', 'secondary', 'Player View QR');
    playerBtn.type = 'button';
    if (phone) { playerBtn.setAttribute('aria-label', 'Player View QR'); playerBtn.title = 'Player View QR'; }
    playerBtn.addEventListener('click', () => SBS.playerView.showPlayerLink(game.id));
    const headerMeta = [SBS.ui.leagueBadge(game.league), game.description ? escapeHtml(game.description) : (game.gameDate || '')].filter(Boolean).join(' &middot; ');
    app.appendChild(topbar('', [manageBtn, tvBtn, phoneBtn, playerBtn], { hideIcon: true, homeLeft: true }));
    const main = el('div', 'main');
    app.appendChild(main);

    main.appendChild(el('h2', 'gameday-heading', headerMeta));

    const computed = computeGame(game);

    const isPotEdited = game.potOverride !== null && game.potOverride !== undefined && game.potOverride !== '';
    const strip = el('div', 'stat-strip');
    const filled = game.squares.filter(s => s).length;
    const unpaidNow = unpaidTotal(game);
    strip.innerHTML = `
      <div class="stat-box">
        <div class="pot-input-wrap">
          <span class="pot-currency">$</span>
          <input type="number" id="pot-input" class="val val-input" min="0" step="1" value="${Math.round(computed.pot)}">
        </div>
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
        if (await SBS.handleConflict(err, game.id)) return;
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
            ${teamBadge(game, 'A', { logoSize: 16, cls: 'team-badge-sm' })}
            <input type="number" min="0" id="score-${q}-a" value="${res.a === null ? '' : res.a}">
          </div>
          <span class="vs">–</span>
          <div class="score-team badge-fit">
            ${teamBadge(game, 'B', { logoSize: 16, cls: 'team-badge-sm' })}
            <input type="number" min="0" id="score-${q}-b" value="${res.b === null ? '' : res.b}">
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
        // Re-render with the normalized value once the host moves on.
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

        refs.amtEl.textContent = money(payoutAmount(res));

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
          let winnerTxt = `Winner: ${res.winnerName}`;
          if (res.autoResolved) {
            const digits = drawnDigits(game, res);
            winnerTxt += ` (auto-drawn — square was empty${digits ? `; drawn numbers ${digits.y}-${digits.x}` : ''})`;
          }
          outcome.textContent = winnerTxt;
        } else if (q === 'final' && res.needsDraw) {
          outcome.classList.add('push', 'outcome-needs-draw');
          outcome.textContent = 'That square is empty! A winner must be randomly drawn.';
        } else {
          outcome.classList.add('pending');
          outcome.textContent = 'Enter each team\'s score (the last digit of each determines the winning square).';
        }

        refs.actionsEl.innerHTML = '';
        refs.actionsEl.className = '';
        if (q === 'final' && res.needsDraw) {
          refs.actionsEl.className = 'qcard-actions-center';
          const drawBtn = el('button', '', 'Randomly Draw Winner');
          drawBtn.style.marginTop = '10px';
          drawBtn.addEventListener('click', async () => {
            const winnerIdx = drawFinalWinner(game);
            if (winnerIdx === -1) { showAlert('No squares are filled in — cannot draw a winner.'); return; }
            const row = Math.floor(winnerIdx / 10), col = winnerIdx % 10;
            if (!game.results.final) game.results.final = {};
            const drawnAt = Date.now();
            game.results.final.autoResolve = { key: `${res.row}-${res.col}`, row, col, drawnAt };
            lastSeenDrawAt = drawnAt;
            if (activeDrawReveal) activeDrawReveal.cancel();
            activeDrawReveal = playDrawReveal({ game, row, col, elapsedMs: 0, onDone: () => { activeDrawReveal = null; } });
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
      // Full score is stored and displayed as entered; only its last digit
      // is used to place the square (see computeGame / lastDigit).
      const num = val === '' ? '' : Math.max(0, parseInt(val, 10) || 0);
      game.results[q][side] = num;
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

    // Tracks the most recent Final "Randomly Draw Winner" event this board
    // has already shown a reveal for, so a background poll that picks up a
    // draw triggered elsewhere (e.g. from the phone) still plays the
    // animation here, but one from before this screen was opened doesn't.
    let lastSeenDrawAt = null;
    let activeDrawReveal = null;
    function checkDrawSync(freshGame) {
      const info = freshGame.results && freshGame.results.final && freshGame.results.final.autoResolve;
      if (!info || !info.drawnAt || info.drawnAt === lastSeenDrawAt) return;
      lastSeenDrawAt = info.drawnAt;
      const elapsed = Date.now() - info.drawnAt;
      if (elapsed >= DRAW_CATCHUP_WINDOW_MS) return;
      if (activeDrawReveal) activeDrawReveal.cancel();
      activeDrawReveal = playDrawReveal({ game: freshGame, row: info.row, col: info.col, elapsedMs: elapsed, onDone: () => { activeDrawReveal = null; } });
    }

    async function doSave() {
      try {
        const saved = await SBS.api.saveGame(game);
        Object.assign(game, saved);
        checkDrawSync(game);
        const newComputed = computeGame(game);
        SBS.board.renderFullBoard(boardHolder, game, newComputed);
        fitTeamBadges(boardHolder);
        refreshQuarterCards(newComputed);
      } catch (e) {
        if (await SBS.handleConflict(e, game.id)) return;
        console.error('Save failed', e);
        showAlert('Could not save the score: ' + e.message);
      }
    }

    // Picks up the server's ESPN live-score poll (see server-livescore.js)
    // and any quarter scores it auto-fills, without disturbing a score box
    // the host is actively typing into. Skipped while a manual edit is
    // in flight so the two never race each other.
    let syncing = false;
    async function pollLive() {
      if (saveTimer || syncing) return;
      syncing = true;
      try {
        const fresh = await SBS.api.getGame(game.id);
        if (fresh.updatedAt !== game.updatedAt) {
          Object.assign(game, fresh);
          checkDrawSync(game);
          const newComputed = computeGame(game);
          SBS.board.renderFullBoard(boardHolder, game, newComputed);
          fitTeamBadges(boardHolder);
          refreshQuarterCards(newComputed);
        }
      } catch (e) {
        // Deleted on another device — nothing left here to show.
        if (e && e.status === 404 && SBS.currentScreen() === 'board') {
          SBS.go({ screen: 'home' });
          return;
        }
        // Otherwise best-effort — the host's own edits still save independently.
      } finally {
        syncing = false;
      }
    }
    SBS.setManagedInterval(pollLive, 8000);
    SBS.onLeaveScreen(() => {
      if (activeDrawReveal) { activeDrawReveal.cancel(); activeDrawReveal = null; }
    });
  }

  // The phone can't be handed a link by the PC, so show the address to type in.
  // The server reports its own LAN IPs (the browser can't discover them).
  async function showPhoneLink(id) {
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
      const path = `${location.pathname}#score-${id}`;
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
      window.open(`${location.origin}${location.pathname}#score-${id}`, '_blank');
    });
    const close = el('button', '', 'Done');
    close.addEventListener('click', () => overlay.remove());
    actions.appendChild(close);
    actions.appendChild(openHere);
    box.appendChild(actions);
  }

  // ---------- TV / grid-only view (1080p, no controls, self-refreshing) ----------
  function renderTV(id) {
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
      SBS.go({ screen: 'home' });
    });

    controls.appendChild(fsBtn);
    controls.appendChild(exitBtn);

    const stopFsWatch = SBS.ui.fullscreen.onChange(syncFsLabel);
    syncFsLabel();

    // Best-effort: browsers only grant fullscreen off a user gesture, so this
    // silently no-ops when TV view was reached without one (e.g. the
    // auto-launch on a fresh TV-browser load) — the Fullscreen button in the
    // controls remains the fallback.
    if (!SBS.ui.fullscreen.active()) {
      SBS.ui.fullscreen.enter().then(syncFsLabel);
    }

    let idleTimer = null;
    function wake() {
      screenEl.classList.remove('chrome-hidden');
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => screenEl.classList.add('chrome-hidden'), 3000);
    }
    ['mousemove', 'touchstart', 'keydown'].forEach(ev => screenEl.addEventListener(ev, wake));
    wake();

    const releaseWakeLock = SBS.ui.keepScreenAwake();

    // ---- Quarter-end celebration ----
    // Fires whenever a quarter transitions from unresolved to "has a winner",
    // however that happened: the ESPN live-score poll auto-filling a score,
    // the host typing one in on the board, or a phone score entry — this
    // screen's own 4s poll (see load() below) is what actually notices it.
    // `prevResolved` starts null so the very first load never celebrates
    // quarters that were already won before the TV screen opened.
    let prevResolved = null;
    let celebrationQueue = [];
    let celebrating = false;
    let celebrationEl = null;
    let celebrationDismissTimer = null;
    let celebrationBurstTimer = null;

    // Set once the Final quarter's own celebration card has run its course;
    // the persistent winners summary (built below) takes over the whole
    // screen at that point and load() stops touching the board underneath
    // it — but keeps polling and re-deriving the summary itself, so a score
    // corrected after the fact (a push edited back into a real win, say)
    // still updates the totals and pills instead of freezing forever.
    let finalSummaryShown = false;
    let finalSummaryEl = null;
    let finalSummaryBurstTimer = null;
    let finalSummarySignature = null;
    let lastGame = null;

    // ---- Randomly-drawn Final winner reveal (mirrors the board's) ----
    // While this is playing, the normal quarter-win celebration for Final is
    // held back so the trophy card doesn't pop up mid-spin — checkForNewWinners
    // runs for it once the reveal's onDone fires instead.
    let lastSeenDrawAt = null;
    let activeDrawReveal = null;
    let drawRevealActive = false;

    // Persistent "no winner yet" notice while the Final score is in but its
    // winning square is empty — up for as long as needsDraw stays true.
    let needsDrawBannerEl = null;
    function showNeedsDrawBanner() {
      if (needsDrawBannerEl) return;
      const overlay = el('div', 'tv-needsdraw-overlay');
      overlay.innerHTML = `
        <div class="tv-needsdraw-card">
          <div class="tv-needsdraw-icon">🎟️</div>
          <div class="tv-needsdraw-title">No Winner Yet</div>
          <div class="tv-needsdraw-body">The winning square for the Final score is empty — we'll be randomly picking a winner shortly.</div>
        </div>
      `;
      screenEl.appendChild(overlay);
      needsDrawBannerEl = overlay;
    }
    function hideNeedsDrawBanner() {
      if (needsDrawBannerEl) { needsDrawBannerEl.remove(); needsDrawBannerEl = null; }
    }

    // The grid is only rebuilt when something that actually changes its
    // pixels changes — a claimed/paid square, a quarter badge, or the live
    // winner/near-miss highlight. Without this, every 4s poll rebuilt the
    // whole board even when only the live clock ticked, which snapped the
    // live-winner ping/glow animations back to frame zero and read as a
    // flash every few seconds.
    let lastBoardSignature = null;

    function quarterLabel(q) { return q === 'final' ? 'Final Score' : QLABEL[q]; }

    function checkForNewWinners(computed) {
      const snapshot = {};
      QUARTERS.forEach(q => { snapshot[q] = !!(computed.results[q].resolved && computed.results[q].winnerName); });
      if (prevResolved) {
        QUARTERS.forEach(q => {
          if (snapshot[q] && !prevResolved[q]) {
            const res = computed.results[q];
            celebrationQueue.push({ name: res.winnerName, quarter: quarterLabel(q), amount: money(res.amount), isFinal: q === 'final' });
          }
        });
        if (celebrationQueue.length && !celebrating) playNextCelebration();
      }
      prevResolved = snapshot;
    }

    function moneyPiece() {
      const p = el('div', 'tv-celebration-piece');
      const left = Math.random() * 100;
      const delay = Math.random() * 0.5;
      const dur = 1.7 + Math.random() * 0.9;
      const rot = Math.random() * 360;
      const spin = (360 + Math.random() * 540) * (Math.random() < 0.5 ? -1 : 1);
      const drift = Math.random() * 80 - 40;
      const vars = `animation-duration:${dur}s; animation-delay:${delay}s; --rot:${rot}deg; --spin:${spin}deg; --drift:${drift}px;`;
      if (Math.random() < 0.75) {
        const w = 14 + Math.random() * 6;
        p.style.cssText = `left:${left}%; width:${w}px; height:${w * 0.46}px; background:#3f8f4f; border:1px solid #cfead6; border-radius:2px; display:flex; align-items:center; justify-content:center; color:#cfead6; font-size:${w * 0.4}px; font-weight:800; line-height:1; ${vars}`;
        p.textContent = '$';
      } else {
        const s = 9 + Math.random() * 4;
        p.style.cssText = `left:${left}%; width:${s}px; height:${s}px; border-radius:50%; background:#e8b923; border:1px solid #fbe08a; ${vars}`;
      }
      // The quarter-win celebration always tears its whole overlay down
      // within a minute, but the final summary screen can sit on the TV for
      // hours — without this, every re-burst would leave its pieces in the
      // DOM forever once their fall animation finishes.
      p.addEventListener('animationend', () => p.remove());
      return p;
    }

    function spawnMoneyBurst(container, count) {
      for (let i = 0; i < count; i++) container.appendChild(moneyPiece());
    }

    // Drops the same wandering ✦ sparkles used on the quarter-win trophy
    // onto any trophy wrapper — shared so the final summary's champion
    // trophy reads identically instead of getting its own effect.
    function appendTrophySparkles(wrap) {
      CELEBRATION_SPARKLE_SPOTS.forEach(([x, y, size, delay]) => {
        const sp = el('div', 'tv-celebration-sparkle', '✦');
        sp.style.cssText = `left:${x}px; top:${y}px; font-size:${size}px; animation-delay:${delay}s; animation-duration:${(1.3 + Math.random() * 0.6).toFixed(2)}s;`;
        wrap.appendChild(sp);
      });
    }

    function removeCelebration() {
      clearTimeout(celebrationDismissTimer);
      celebrationDismissTimer = null;
      clearInterval(celebrationBurstTimer);
      celebrationBurstTimer = null;
      if (celebrationEl) { celebrationEl.remove(); celebrationEl = null; }
    }

    function playNextCelebration() {
      if (!celebrationQueue.length) { celebrating = false; return; }
      celebrating = true;
      const item = celebrationQueue.shift();
      removeCelebration();

      const overlay = el('div', 'tv-celebration');
      spawnMoneyBurst(overlay, 50);

      const card = el('div', 'tv-celebration-card');
      const trophyWrap = el('div', 'tv-celebration-trophy');
      trophyWrap.innerHTML = trophySvgFor(lastGame && lastGame.league);
      appendTrophySparkles(trophyWrap);
      card.appendChild(trophyWrap);
      card.appendChild(el('div', 'tv-celebration-quarter', `${escapeHtml(item.quarter)} winner`));
      card.appendChild(el('div', 'tv-celebration-name', escapeHtml(item.name)));
      card.appendChild(el('div', 'tv-celebration-amount', item.amount));
      overlay.appendChild(card);

      screenEl.appendChild(overlay);
      celebrationEl = overlay;

      // Simulation Mode plays through a whole game in 8 minutes (2-minute
      // quarters), so a full 60s banner would eat a quarter of the next
      // quarter's runtime — 30s keeps it snappy without losing the celebration.
      const isSim = !!(lastGame && lastGame.simulation);
      const dismissMs = isSim ? 30000 : 60000;

      // Periodic re-bursts keep it festive across the banner's runtime without
      // nonstop falling money the whole time.
      celebrationBurstTimer = setInterval(() => spawnMoneyBurst(overlay, 18), isSim ? 8000 : 12000);

      celebrationDismissTimer = setTimeout(() => {
        removeCelebration();
        if (item.isFinal) {
          celebrating = false;
          showFinalSummary();
        } else {
          playNextCelebration();
        }
      }, dismissMs);
    }

    // ---- Final summary screen ----
    // Every player who won at least one quarter, ranked by their total
    // winnings (ties share a rank — standard competition ranking, so two
    // people tied for 2nd both show "2nd" and the next rank is 4th).
    // A pushed quarter has no winner of its own — its payout just rolls into
    // whichever quarter is scored next (see compute.js). So a push's credit
    // goes to whoever ends up winning that next quarter: it's shown as an
    // extra gold "Q1 PUSH"-style pill alongside their own quarter win, on
    // top of the dollar total which already includes the carried amount.
    function computeWinnersSummary(computed, game) {
      const byName = new Map();
      let pendingPushLabels = [];
      QUARTERS.forEach(q => {
        const res = computed.results[q];
        if (!res.resolved) return;
        if (res.pushed) {
          pendingPushLabels.push(QLABEL[q]);
          return;
        }
        if (!res.winnerName) return;
        const entry = byName.get(res.winnerName) || { name: res.winnerName, quarters: [], pushLabels: [] };
        entry.quarters.push({ label: QLABEL[q], amount: res.amount, drawn: res.autoResolved ? drawnDigits(game, res) : null });
        if (pendingPushLabels.length) {
          entry.pushLabels = entry.pushLabels.concat(pendingPushLabels);
          pendingPushLabels = [];
        }
        byName.set(res.winnerName, entry);
      });
      const winners = Array.from(byName.values());
      winners.forEach(w => { w.total = w.quarters.reduce((sum, q) => sum + q.amount, 0); });
      winners.sort((a, b) => b.total - a.total);
      let prevTotal = null, prevRank = 0;
      winners.forEach((w, i) => {
        w.rank = (w.total === prevTotal) ? prevRank : i + 1;
        prevTotal = w.total;
        prevRank = w.rank;
      });
      return winners;
    }

    function removeFinalSummary() {
      clearInterval(finalSummaryBurstTimer);
      finalSummaryBurstTimer = null;
      if (finalSummaryEl) { finalSummaryEl.remove(); finalSummaryEl = null; }
    }

    // Replaces the board entirely once the Final celebration card closes, and
    // stays up until the host taps Exit. load() keeps calling this on every
    // poll while it's showing (see below) so a late correction — a push
    // edited back into a real win, a winner's name fixed, and so on — still
    // reaches the screen; the signature check below is what stops that from
    // rebuilding (and re-flashing) the whole overlay on every single poll
    // when nothing about the winners actually changed.
    function showFinalSummary() {
      if (!lastGame) return;
      finalSummaryShown = true;

      const computed = computeGame(lastGame);
      const winners = computeWinnersSummary(computed, lastGame);
      const finalRes = computed.results.final;

      const signature = JSON.stringify({ winners, a: finalRes.a, b: finalRes.b, pot: computed.pot });
      if (signature === finalSummarySignature && finalSummaryEl) return;
      finalSummarySignature = signature;
      removeFinalSummary();

      const overlay = el('div', 'tv-final-summary');
      spawnMoneyBurst(overlay, 40);

      const head = el('div', 'tvfs-head');
      const trophyWrap = el('div', 'tvfs-champion-trophy');
      trophyWrap.innerHTML = trophySvgFor(lastGame && lastGame.league);
      appendTrophySparkles(trophyWrap);
      head.appendChild(trophyWrap);
      head.appendChild(el('div', 'tvfs-eyebrow', 'Game Complete'));
      const scoreLine = el('div', 'tvfs-score badge-fit');
      scoreLine.innerHTML = `
        ${teamBadge(lastGame, 'A', { logoSize: 26, cls: 'team-badge-sm' })}
        <span class="tvfs-score-digits">${finalRes.a}&ndash;${finalRes.b}</span>
        ${teamBadge(lastGame, 'B', { logoSize: 26, cls: 'team-badge-sm' })}
      `;
      head.appendChild(scoreLine);
      head.appendChild(el('div', 'tvfs-sub', `Final pot <span class="tvfs-pot">${money(computed.pot)}</span> &middot; ${winners.length} winner${winners.length === 1 ? '' : 's'}`));
      overlay.appendChild(head);

      const board = el('div', 'tvfs-board');
      winners.forEach(w => {
        const row = el('div', 'tvfs-row' + (w.rank <= 3 ? ' rank-' + w.rank : ''));
        const wonTrophies = w.quarters.map(q => `<span class="tvfs-qtrophy">${MINI_TROPHY_SVG}${q.label}${q.drawn ? ` <span class="tvfs-drawn">(Drawn ${q.drawn.y}-${q.drawn.x})</span>` : ''}</span>`);
        const pushTrophies = w.pushLabels.map(label => `<span class="tvfs-qtrophy">${MINI_TROPHY_SVG}${label} PUSH</span>`);
        const trophies = wonTrophies.concat(pushTrophies).join('');
        row.innerHTML = `
          <div class="tvfs-rank">${w.rank}</div>
          <div class="tvfs-main">
            <div class="tvfs-name">${escapeHtml(w.name)}</div>
            <div class="tvfs-trophies">${trophies}</div>
          </div>
          <div class="tvfs-amount">
            <div class="tvfs-amount-val">${money(w.total)}</div>
            <div class="tvfs-amount-lbl">${w.quarters.length} quarter${w.quarters.length === 1 ? '' : 's'}</div>
          </div>
        `;
        board.appendChild(row);
      });
      overlay.appendChild(board);

      screenEl.appendChild(overlay);
      finalSummaryEl = overlay;
      fitTeamBadges(overlay);

      // Same idea as the quarter celebration's re-bursts, just slower — this
      // screen can be up for a long time, not just a minute.
      finalSummaryBurstTimer = setInterval(() => spawnMoneyBurst(overlay, 14), 14000);
    }

    // Leaving the TV route tears down everything the screen installed.
    SBS.onLeaveScreen(() => {
      clearTimeout(idleTimer);
      stopFsWatch();
      releaseWakeLock();
      removeCelebration();
      removeFinalSummary();
      hideNeedsDrawBanner();
      if (activeDrawReveal) { activeDrawReveal.cancel(); activeDrawReveal = null; }
      celebrationQueue = [];
      document.body.classList.remove('tv-mode', 'tv-fullscreen');
    });

    // Read-only, single-row summary of all four quarters — full team pills
    // (matching the rest of the app) but no score inputs, so the board
    // underneath keeps almost all of the screen.
    function renderTvQuarters(game, computed) {
      const badgeA = teamBadge(game, 'A', { logoSize: 18, cls: 'team-badge-sm' });
      const badgeB = teamBadge(game, 'B', { logoSize: 18, cls: 'team-badge-sm' });
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
          if (res.autoResolved) {
            const digits = drawnDigits(game, res);
            if (digits) statusTxt += ` (Drawn ${digits.y}-${digits.x})`;
          }
        } else if (q === 'final' && res.needsDraw) {
          statusTxt = 'Needs draw'; statusCls = 'push';
        } else {
          statusTxt = '—'; statusCls = 'pending';
        }
        return `
          <div class="tv-qchip ${statusCls}">
            <div class="tvq-top"><span class="tvq-label">${QLABEL[q]}</span><span class="tvq-amt">${money(payoutAmount(res))}</span></div>
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
        const game = await SBS.api.getGame(id);
        lastGame = game;
        applyTeamColors(game);

        // Numbers haven't been drawn yet, so there are no quarter results or
        // winners to show — but the grid itself is exactly what the room
        // wants to watch fill up as people claim squares, so it stays up
        // (with blank "–" axis headers) under the remaining/pot counts.
        if (game.status === 'picking') {
          hideNeedsDrawBanner();
          header.innerHTML = '';
          tvQuarters.innerHTML = '';
          const filled = game.squares.filter(s => s).length;
          const computed = computeGame(game);
          const unpaidNow = unpaidTotal(game);
          const info = el('div', 'tv-picking-info');
          info.innerHTML = `
            <div class="tv-picking-line tv-picking-pill">
              <span>Squares Available: <span class="tv-picking-val">${100 - filled}</span></span>
              <span>Total Pot: <span class="tv-picking-val">${money(computed.pot)}</span></span>
              <span>Unpaid Total: <span class="tv-picking-val ${unpaidNow > 0 ? 'tv-picking-val-warn' : ''}">${money(unpaidNow)}</span></span>
            </div>
          `;
          header.appendChild(info);

          const boardSignature = JSON.stringify({ squares: game.squares, players: game.players });
          if (boardSignature !== lastBoardSignature) {
            lastBoardSignature = boardSignature;
            SBS.board.renderFullBoard(boardWrap, game, computed, null);
            fitTeamBadges(boardWrap);
          }
          return;
        }

        const computed = computeGame(game);

        // A "Randomly Draw Winner" click (board or phone) is resolved and
        // persisted instantly, so the Final quarter already reads as won on
        // this very poll — but the room should see the countdown/spin first.
        // Detect the shared drawnAt timestamp and, if the sequence hasn't
        // already played out elsewhere, run it here too before letting the
        // normal celebration flow announce the winner.
        const finalEntry = game.results && game.results.final;
        const drawInfo = finalEntry && finalEntry.autoResolve;
        if (drawInfo && drawInfo.drawnAt && drawInfo.drawnAt !== lastSeenDrawAt) {
          lastSeenDrawAt = drawInfo.drawnAt;
          const elapsed = Date.now() - drawInfo.drawnAt;
          if (elapsed < DRAW_CATCHUP_WINDOW_MS && !finalSummaryShown) {
            drawRevealActive = true;
            if (activeDrawReveal) activeDrawReveal.cancel();
            activeDrawReveal = playDrawReveal({
              game, row: drawInfo.row, col: drawInfo.col, elapsedMs: elapsed,
              onDone: () => {
                activeDrawReveal = null;
                drawRevealActive = false;
                if (SBS.currentScreen() === 'tv') checkForNewWinners(computeGame(lastGame));
              }
            });
          }
        }

        // Up for as long as the Final score is in but its winning square is
        // still empty — disappears the instant a draw resolves it (needsDraw
        // and resolved/autoResolved are mutually exclusive in computeGame).
        if (computed.results.final.needsDraw) {
          showNeedsDrawBanner();
        } else {
          hideNeedsDrawBanner();
        }

        if (finalSummaryShown) {
          const finalRes = computed.results.final;
          if (finalRes.resolved && finalRes.winnerName) {
            // Still finished — re-derive the summary; it only actually
            // rebuilds the DOM when a correction changed something.
            showFinalSummary();
            return;
          }
          // The host cleared or edited Final back to unresolved — drop back
          // to the live board instead of leaving a stale summary up.
          finalSummaryShown = false;
          finalSummarySignature = null;
          removeFinalSummary();
        }

        if (!drawRevealActive) checkForNewWinners(computed);
        header.innerHTML = '<div class="tv-meta"></div>';
        const liveBar = SBS.board.renderLiveScoreBar(game);
        if (liveBar) header.querySelector('.tv-meta').appendChild(liveBar);
        fitTeamBadges(header);
        renderTvQuarters(game, computed);
        fitTeamBadges(tvQuarters);
        const liveHighlight = window.GameLogic.computeLiveHighlight(game);
        const boardSignature = JSON.stringify({
          squares: game.squares,
          players: game.players,
          cellLabels: computed.cellLabels,
          win: liveHighlight ? liveHighlight.winnerKey : null,
          near: liveHighlight ? Array.from(liveHighlight.nearKeys).sort() : null
        });
        if (boardSignature !== lastBoardSignature) {
          lastBoardSignature = boardSignature;
          SBS.board.renderFullBoard(boardWrap, game, computed, liveHighlight);
          fitTeamBadges(boardWrap);
        }
      } catch (e) {
        // Deleted on another device — nothing left here to show.
        if (e && e.status === 404) {
          SBS.go({ screen: 'home' });
          return;
        }
        header.innerHTML = `<div class="error-msg">Could not load this game: ${escapeHtml(e.message)}</div>`;
      }
    }

    load();
    SBS.setManagedInterval(load, 4000);
  }

  SBS.screens.board = renderBoard;
  SBS.screens.tv = renderTV;
})();

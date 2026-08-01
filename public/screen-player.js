// Player companion view: what a grid player sees after scanning the QR code
// printed or displayed at the party. Read-only — no square picking, no score
// entry, just "how am I doing right now" plus quarter winners so far. Polls
// like the TV/phone screens so it stays live without a manual refresh.
(function () {
  'use strict';

  const SBS = window.SBS = window.SBS || {};
  const { el, escapeHtml, money, showAlert, applyTeamColors, teamBadge, teamAbbr, teamStyle, fitTeamBadges, isPhone } = SBS.ui;
  const { playerSummaries } = SBS.players;
  const { QUARTERS, QLABEL, computeGame, computeLiveHighlight, payoutAmount, drawnDigits } = window.GameLogic;

  const QR_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
    <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
    <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" stroke-width="2"/>
    <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20v.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

  function storageKey(id) { return `sbs-player-view-${id}`; }

  function squareInfo(game, computed, liveHighlight, idx) {
    const row = Math.floor(idx / 10), col = idx % 10;
    const key = `${row}-${col}`;
    const labels = computed.cellLabels[key] || [];
    const won = labels.filter(l => !l.pushed).map(l => l.label);
    const pushed = labels.filter(l => l.pushed).map(l => l.label);
    const isLiveWinner = !!(liveHighlight && liveHighlight.winnerKey === key);
    const isNear = !!(liveHighlight && liveHighlight.nearKeys.has(key));
    let status = 'dormant';
    if (won.length || isLiveWinner) status = 'winning';
    else if (isNear) status = 'threat';
    return {
      idx, row, col, key, won, pushed, isLiveWinner, isNear, status,
      xDigit: game.axisX ? game.axisX[col] : null,
      yDigit: game.axisY ? game.axisY[row] : null
    };
  }

  // "TM1 # | # TM2" — the two digits (the actual score that matters) set off
  // in the accent color so they read at a glance against the team abbreviations.
  function coordHtml(game, info) {
    const abbrA = teamAbbr(game.teamA, teamStyle(game, 'A').meta);
    const abbrB = teamAbbr(game.teamB, teamStyle(game, 'B').meta);
    const y = info.yDigit === null ? '–' : info.yDigit;
    const x = info.xDigit === null ? '–' : info.xDigit;
    return `<span class="coord-team">${escapeHtml(abbrA)}</span> `
      + `<span class="coord-num">${escapeHtml(String(y))}</span>`
      + `<span class="coord-sep">|</span>`
      + `<span class="coord-num">${escapeHtml(String(x))}</span> `
      + `<span class="coord-team">${escapeHtml(abbrB)}</span>`;
  }

  const STATUS_META = {
    winning: { tag: 'Winning', cls: 'status-winning' },
    threat: { tag: 'Hot Threat', cls: 'status-threat' },
    dormant: { tag: 'Dormant', cls: 'status-dormant' }
  };

  function squareDesc(info) {
    if (info.status === 'winning') {
      return info.won.length ? `Already won ${info.won.join(', ')}` : 'Holding the current payout window';
    }
    if (info.status === 'threat') return 'One likely score away from flipping your way';
    return 'Needs a bigger swing to get in play';
  }

  // True once the server has (or will) auto-update this game's score — a real
  // ESPN feed found a match, or the host turned on Simulation Mode. When
  // neither is true, the host is typing quarter scores in by hand: there's no
  // live projection to show a "who's winning right now" readout for, and the
  // running score is meaningless (just a stale placeholder) until the actual
  // quarters get entered.
  function isAutoScored(game) {
    return !!(game.simulation || game.liveScore);
  }

  function hasFinalScore(computed) {
    const f = computed.results.final;
    return f.a !== null && f.a !== undefined && f.a !== '' && f.b !== null && f.b !== undefined && f.b !== '';
  }

  // Sum of every quarter this player has actually won so far. A pushed
  // quarter has no winner of its own (its payout just rolls into whichever
  // quarter is scored next — see compute.js), so it's excluded here same as
  // everywhere else winnings are totaled (the TV screen's final summary).
  function computeTotalWon(computed, playerName) {
    if (!playerName) return 0;
    return QUARTERS.reduce((sum, q) => {
      const res = computed.results[q];
      return (res.resolved && !res.pushed && res.winnerName === playerName) ? sum + res.amount : sum;
    }, 0);
  }

  function renderPlayer(id) {
    const app = SBS.appEl;
    app.innerHTML = '';
    document.body.classList.add('player-mode');
    SBS.onLeaveScreen(() => document.body.classList.remove('player-mode'));

    const wrap = el('div', 'player-screen');
    app.appendChild(wrap);

    const header = el('div', 'player-header');
    wrap.appendChild(header);

    const selectRow = el('div', 'player-select-row');
    wrap.appendChild(selectRow);

    const body = el('div', 'player-body');
    wrap.appendChild(body);

    let game = null;
    let selectedPlayer = null;

    function loadSelectedPlayer() {
      try { return window.localStorage.getItem(storageKey(id)); } catch (e) { return null; }
    }
    function saveSelectedPlayer(name) {
      try {
        if (name) window.localStorage.setItem(storageKey(id), name);
        else window.localStorage.removeItem(storageKey(id));
      } catch (e) { /* private browsing etc — selection just won't persist */ }
    }

    function drawHeader() {
      applyTeamColors(game);
      const live = game.liveScore;
      let tickerHtml = '';
      if (game.status === 'picking' || game.status === 'setup') {
        tickerHtml = `<div class="player-ticker-pending">Squares are being claimed &mdash; the board locks in soon.</div>`;
      } else {
        const computed = computeGame(game);
        const auto = isAutoScored(game);
        const hasFinal = hasFinalScore(computed);
        // A manually-scored game has no live feed to fall back on, so there's
        // nothing meaningful to show but a stale "–" until the host actually
        // enters the Final score — better to show nothing at all than a dash
        // that looks like a score but never updates until the very end.
        const scoreA = live && live.a !== undefined && live.a !== null ? live.a
          : hasFinal ? computed.results.final.a
          : auto ? '–' : '';
        const scoreB = live && live.b !== undefined && live.b !== null ? live.b
          : hasFinal ? computed.results.final.b
          : auto ? '–' : '';
        const statusTxt = game.status === 'finished' ? 'FINAL'
          : (live && live.state === 'in') ? [live.period ? `Q${live.period}` : '', live.clock].filter(Boolean).join(' &middot; ')
          : 'In Progress';
        // Same glowing pill treatment the Home screen's game card uses for a
        // "started" game — a quiet visual cue that this one is live right now.
        const statusCls = 'pt-status' + (game.status === 'started' ? ' is-live' : '');
        tickerHtml = `
          <div class="player-ticker">
            <div class="pt-team">
              ${teamBadge(game, 'A', { logoSize: 20, cls: 'team-badge-sm' })}
              <div class="pt-pts">${scoreA}</div>
            </div>
            <div class="pt-mid">
              <div class="${statusCls}">${statusTxt}</div>
            </div>
            <div class="pt-team">
              ${teamBadge(game, 'B', { logoSize: 20, cls: 'team-badge-sm' })}
              <div class="pt-pts">${scoreB}</div>
            </div>
          </div>
        `;
      }

      header.innerHTML = `
        <div class="player-title-row badge-fit">
          <div class="player-title">Player Grid Watch</div>
        </div>
        ${tickerHtml}
      `;
      const qrBtn = el('button', 'icon-btn player-qr-btn', QR_ICON);
      qrBtn.type = 'button';
      qrBtn.setAttribute('aria-label', 'Show QR code for this screen');
      qrBtn.title = 'Show QR code so others can join';
      qrBtn.addEventListener('click', () => showPlayerLink(id));
      header.querySelector('.player-title-row').prepend(qrBtn);
      fitTeamBadges(header);
    }

    function drawSelect() {
      // Rebuilding the <select> while the host has it open (mid-poll refresh)
      // collapses the dropdown out from under them — skip the rebuild while
      // it's focused and let the next poll after they finish pick up any changes.
      if (document.activeElement && selectRow.contains(document.activeElement)) return;

      const summaries = playerSummaries(game);
      selectRow.innerHTML = '';
      if (!summaries.length) {
        selectRow.appendChild(el('div', 'player-select-empty', 'No squares have been claimed for this game yet.'));
        return;
      }
      const label = el('label', 'player-select-label', 'Viewing squares for');
      const select = el('select', 'player-select');
      select.appendChild(el('option', '', 'Choose your name…'));
      summaries.forEach(p => {
        const opt = el('option', '', escapeHtml(p.name));
        opt.value = p.name;
        if (p.name === selectedPlayer) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', (e) => {
        selectedPlayer = e.target.value || null;
        saveSelectedPlayer(selectedPlayer);
        drawBody();
      });
      selectRow.appendChild(label);
      selectRow.appendChild(select);
    }

    function drawBody() {
      body.innerHTML = '';

      if (game.status === 'setup' || game.status === 'picking') {
        const card = el('div', 'card player-card');
        card.innerHTML = `<p class="player-muted">This board is still filling up. Come back once the host locks it in and the numbers are drawn.</p>`;
        body.appendChild(card);
        return;
      }

      const computed = computeGame(game);
      const liveHighlight = computeLiveHighlight(game);

      const myIdx = game.squares
        .map((sq, i) => (sq && sq.name === selectedPlayer) ? i : -1)
        .filter(i => i >= 0);
      const infos = myIdx.map(i => squareInfo(game, computed, liveHighlight, i));

      // Squares that still have a realistic shot: already won a quarter, are
      // the live winner right now, or are one likely score from becoming it.
      // A square that needs an unlikely swing just clutters this list.
      const inRunning = infos.filter(i => i.status !== 'dormant');

      // "In the running" / "hot threat" are projections off a live score —
      // meaningless for a game the host is scoring by hand, since there's no
      // feed to project from between quarters actually being entered.
      if (selectedPlayer && isAutoScored(game)) {
        // ---- My Squares Status ----
        const statusCard = el('div', 'card player-card');
        statusCard.innerHTML = `<div class="player-card-head"><span class="player-card-title">My Squares Status</span><span class="player-card-sub">${inRunning.length} in the running</span></div>`;
        if (!infos.length) {
          statusCard.appendChild(el('p', 'player-muted', `No squares found for "${escapeHtml(selectedPlayer)}".`));
        } else if (!inRunning.length) {
          statusCard.appendChild(el('p', 'player-muted', `None of your ${infos.length} square${infos.length === 1 ? '' : 's'} are in the running right now — hang tight for the next score.`));
        } else {
          const list = el('div', 'player-square-list');
          inRunning.slice().sort((a, b) => (a.status === b.status ? 0 : a.status === 'winning' ? -1 : 1))
            .forEach(info => {
              const meta = STATUS_META[info.status];
              const row = el('div', 'player-square-item');
              row.innerHTML = `
                <div>
                  <div class="psi-coord">${coordHtml(game, info)}</div>
                  <div class="psi-desc">${escapeHtml(squareDesc(info))}</div>
                </div>
                <span class="psi-tag ${meta.cls}">${meta.tag}</span>
              `;
              list.appendChild(row);
            });
          statusCard.appendChild(list);
        }
        body.appendChild(statusCard);
      }

      if (selectedPlayer && infos.length) {
        // ---- Portfolio pills ----
        const pillCard = el('div', 'card player-card');
        pillCard.innerHTML = `<div class="player-card-head"><span class="player-card-title">My Grid Portfolio</span></div>`;
        const pillsWrap = el('div', 'player-pills');
        infos.forEach(info => {
          const winCount = info.won.length;
          // Absolutely positioned so it overlays the corner rather than
          // sitting inline — the badge must never push the pill wider/taller
          // or the two-column grid's alignment would drift row to row.
          const badge = winCount > 0 ? `<span class="pill-win-badge" title="Won ${winCount} quarter${winCount === 1 ? '' : 's'}">${winCount}</span>` : '';
          const pillCls = info.status === 'winning' ? ' is-live' : info.status === 'threat' ? ' is-threat' : '';
          const pill = el('span', 'player-pill' + pillCls, coordHtml(game, info) + badge);
          pillsWrap.appendChild(pill);
        });
        pillCard.appendChild(pillsWrap);
        body.appendChild(pillCard);
      }

      // ---- Game Winners ----
      const archiveCard = el('div', 'card player-card');
      archiveCard.innerHTML = `<div class="player-card-head"><span class="player-card-title">Game Winners</span></div>`;
      const rows = el('div', 'player-history');
      QUARTERS.forEach(q => {
        const res = computed.results[q];
        const label = q === 'final' ? 'FINAL' : QLABEL[q];
        let scoreTxt = '– : –';
        if (res.a !== null && res.b !== null) scoreTxt = `${res.a} - ${res.b}`;
        let winnerTxt, winnerCls = '';
        if (res.a === null || res.b === null) {
          winnerTxt = 'Locked'; winnerCls = 'ph-pending';
        } else if (res.resolved && res.pushed) {
          winnerTxt = 'Push (rolled over)'; winnerCls = 'ph-pending';
        } else if (res.resolved && res.winnerName) {
          const mine = res.winnerName === selectedPlayer;
          winnerTxt = `${res.winnerName} &middot; ${money(res.amount)}`;
          if (res.autoResolved) {
            const digits = drawnDigits(game, res);
            if (digits) winnerTxt += ` <span class="ph-drawn">(Drawn ${digits.y}-${digits.x})</span>`;
          }
          winnerCls = mine ? 'ph-mine' : 'ph-live';
        } else if (q === 'final' && res.needsDraw) {
          winnerTxt = 'Awaiting draw'; winnerCls = 'ph-pending';
        } else {
          winnerTxt = 'In progress'; winnerCls = 'ph-pending';
        }
        const row = el('div', 'player-history-row');
        row.innerHTML = `
          <div class="ph-q">${label}</div>
          <div class="ph-score">${scoreTxt}</div>
          <div class="ph-winner ${winnerCls}">${winnerTxt}</div>
        `;
        rows.appendChild(row);
      });
      archiveCard.appendChild(rows);
      body.appendChild(archiveCard);

      if (selectedPlayer) {
        // ---- Total Won ---- (updates live as quarters resolve, via the poll)
        const totalWon = computeTotalWon(computed, selectedPlayer);
        const totalCard = el('div', 'card player-card player-total-card');
        totalCard.innerHTML = `
          <div class="player-total-label">Total Won</div>
          <div class="player-total-value${totalWon > 0 ? ' has-winnings' : ''}">${money(totalWon)}</div>
        `;
        body.appendChild(totalCard);
      }

      fitTeamBadges(body);
    }

    function drawAll() {
      if (!game) return;
      drawHeader();
      drawSelect();
      drawBody();
    }

    async function load(initial) {
      try {
        const fresh = await SBS.api.getGame(id);
        if (initial) {
          game = fresh;
          selectedPlayer = loadSelectedPlayer();
          // A remembered name that no longer has squares (removed by the
          // host) shouldn't silently pin the view to an empty state forever.
          if (selectedPlayer && !Object.keys(playerSummaries(fresh).reduce((m, p) => (m[p.name] = 1, m), {})).includes(selectedPlayer)) {
            selectedPlayer = null;
          }
          drawAll();
        } else if (fresh.updatedAt !== (game && game.updatedAt)) {
          game = fresh;
          drawAll();
        }
      } catch (e) {
        if (e && e.status === 404) {
          header.innerHTML = `<div class="error-msg">This game no longer exists.</div>`;
          selectRow.innerHTML = '';
          body.innerHTML = '';
          return;
        }
        if (initial) header.innerHTML = `<div class="error-msg">Could not load this game: ${escapeHtml(e.message)}</div>`;
      }
    }

    load(true);
    SBS.setManagedInterval(() => load(false), 6000);
  }

  // Shows a QR code (and the raw address) linking straight back to this same
  // read-only player screen, so the host — or another player who already has
  // it open — can let someone else scan in without touching the TV/iPad.
  async function showPlayerLink(id) {
    const overlay = SBS.ui.overlayEl('0.65');
    const box = el('div', 'card');
    box.style.cssText = 'max-width:520px; width:100%; box-shadow: var(--shadow-pop);';
    box.innerHTML = `<h3 style="margin-top:0">Scan to view your squares</h3>
      <p style="color:var(--muted)">Point a phone's camera at this code to open the same read-only player view — your squares, quarter winners, and a live status readout. Nothing here can change the game.</p>
      <p style="color:var(--muted)">First time on this WiFi, the phone may warn the connection isn't private — that's expected on a home network. Tap "Advanced" then "proceed" to continue.</p>
      <div class="phone-link-list">Loading addresses…</div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const list = box.querySelector('.phone-link-list');
    try {
      const hosts = await SBS.api.getHosts();
      const path = `${location.pathname}#player-${id}`;
      if (!hosts.addresses.length) {
        list.innerHTML = `<p class="error-msg">No network address found. Run <code>ipconfig</code> on this PC to find its IP.</p>`;
      } else {
        const scheme = hosts.httpsReady ? 'https' : 'http';
        const urls = hosts.addresses.map(ip => `${scheme}://${ip}:${hosts.port}${path}`);
        let qr = '';
        try {
          qr = window.QRCode.toSvg(urls[0], 150);
        } catch (err) {
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
      window.open(`${location.origin}${location.pathname}#player-${id}`, '_blank');
    });
    const close = el('button', '', 'Done');
    close.addEventListener('click', () => overlay.remove());
    actions.appendChild(close);
    actions.appendChild(openHere);
    box.appendChild(actions);
  }

  SBS.screens.player = renderPlayer;
  SBS.playerView = { showPlayerLink };
})();

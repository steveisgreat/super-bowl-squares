// Step 2: claiming squares, and the host control that locks the board.
(function () {
  'use strict';

  const SBS = window.SBS = window.SBS || {};
  const { el, escapeHtml, money, topbar, showConfirm, showAlert, applyTeamColors, teamBadge } = SBS.ui;
  const { unpaidTotal, openManagePlayersModal, resolveNameForPick, markPlayerPaid } = SBS.players;
  const { shuffle, shuffledDigits } = window.GameLogic;

  // Guards the one irreversible action in the app (drawing the axis numbers).
  // Module-level so a re-render can't reset it mid-save.
  let lockInFlight = false;

  function renderPicking(game) {
    const app = SBS.appEl;
    applyTeamColors(game);
    app.innerHTML = '';
    const reopen = () => SBS.go({ screen: 'picking', game });

    const bar = topbar(`${teamBadge(game.teamA, 'A', { logoSize: 22, cls: 'team-badge-sm' })}<span class="vs-sep">vs</span>${teamBadge(game.teamB, 'B', { logoSize: 22, cls: 'team-badge-sm' })}<span class="header-year">${game.year}</span>`);
    const nav = bar.querySelector('.nav');
    const manageBtn = el('button', 'secondary', 'Manage Players');
    manageBtn.addEventListener('click', () => openManagePlayersModal(game, reopen));
    nav.appendChild(manageBtn);
    app.appendChild(bar);

    const main = el('div', 'main');
    app.appendChild(main);

    main.appendChild(el('h2', '', 'Pick Your Squares'));

    const filled = game.squares.filter(s => s).length;
    const unpaid = unpaidTotal(game);

    const strip = el('div', 'stat-strip');
    strip.innerHTML = `
      <div class="stat-box"><div class="val">${filled}</div><div class="lbl">Squares Sold</div></div>
      <div class="stat-box"><div class="val">${100 - filled}</div><div class="lbl">Squares Available</div></div>
      <div class="stat-box"><div class="val">${money(game.squarePrice)}</div><div class="lbl">Per Square</div></div>
      <div class="stat-box"><div class="val">${money(filled * game.squarePrice)}</div><div class="lbl">Pot So Far</div></div>
      <div class="stat-box ${unpaid > 0 ? 'warn' : ''} clickable" id="unpaid-stat"><div class="val">${money(unpaid)}</div><div class="lbl">Unpaid Total</div></div>
      <div class="stat-box"><div class="val">${game.autoCutoffEnabled ? new Date(game.autoCutoffTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}</div><div class="lbl">Auto Cutoff</div></div>
    `;
    main.appendChild(strip);
    strip.querySelector('#unpaid-stat').addEventListener('click', () => openManagePlayersModal(game, reopen));

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
      <label class="checkbox-label"><input type="checkbox" id="p-paid" checked> <span>Mark as Paid</span></label>
    `;
    formCard.appendChild(formWrap);

    let mode = game.pickMode === 'both' ? 'auto' : game.pickMode;
    if (game.pickMode === 'both') {
      const modeGroup = el('div', 'radio-group centered', '');
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

    const actionBtn = el('button', 'pick full-width', game.pickMode === 'manual' ? 'Start Manual Pick' : 'Pick Squares');
    formCard.appendChild(el('div', 'actions', '')).appendChild(actionBtn);

    // ---- Manual selection state ----
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
      manualBanner.appendChild(el('div', '', `<strong>${escapeHtml(manualName)}</strong>: ${manualSelected.length} / ${manualTarget} selected`));
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
      markPlayerPaid(game, manualName, manualPaid);
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
        const shuffled = shuffle(emptyIdx);
        for (let i = 0; i < count; i++) {
          game.squares[shuffled[i]] = { name };
        }
        markPlayerPaid(game, name, paidChecked);
        await persistAndRefresh();
      } else {
        manualSelecting = true;
        manualTarget = count;
        manualSelected = [];
        manualName = name;
        manualPaid = paidChecked;
        updateManualBanner();
        refreshPreview();
      }
    });

    async function persistAndRefresh() {
      try {
        const saved = await SBS.api.saveGame(game);
        SBS.go({ screen: 'picking', game: saved });
      } catch (e) {
        if (await SBS.handleConflict(e, game.year)) return;
        showErr('Failed to save: ' + e.message);
      }
    }

    // ---- Right: board preview + host controls ----
    const finishWrap = el('div', 'card');
    finishWrap.innerHTML = `<h3>Host Controls</h3><p style="color:var(--muted)">When picking is complete (or you want to lock it early), generate the grid numbers and begin the game. This cannot be undone.</p>`;
    const lockBtn = el('button', 'danger', 'Finish Picking & Generate Numbers');
    lockBtn.addEventListener('click', async () => {
      const ok = await showConfirm('Lock the grid and randomly generate axis numbers now? Square picking cannot be resumed after this.');
      if (!ok) return;
      startGame();
    });
    finishWrap.appendChild(el('div', 'actions', '')).appendChild(lockBtn);

    const right = el('div');
    const boardCard = el('div', 'card');
    boardCard.appendChild(el('h3', '', `Board Preview (${filled}/100 sold) ${manualSelecting ? '— tap empty squares to claim' : ''}`));
    const boardHolder = el('div');
    boardHolder.id = 'board-holder';
    boardCard.appendChild(boardHolder);
    boardCard.appendChild(el('div', 'board-legend', '<span class="legend-chip"></span> Square is claimed but not paid for'));
    right.appendChild(boardCard);
    right.appendChild(finishWrap);
    layout.appendChild(right);

    function drawPreview() {
      SBS.board.renderPickBoard(boardHolder, game, {
        selecting: manualSelecting,
        selected: manualSelected,
        target: manualTarget,
        onToggle: (idx) => {
          const pos = manualSelected.indexOf(idx);
          if (pos >= 0) {
            manualSelected.splice(pos, 1);
          } else {
            if (manualSelected.length >= manualTarget) return;
            manualSelected.push(idx);
          }
          refreshPreview();
        }
      });
    }

    function refreshPreview() {
      drawPreview();
      updateManualBanner();
    }

    drawPreview();

    async function startGame() {
      // Latched: without this a double-tap (or a stray timer) could fire two
      // saves that each generate their own axis numbers.
      if (lockInFlight) return;
      lockInFlight = true;
      game.axisX = shuffledDigits();
      game.axisY = shuffledDigits();
      game.status = 'started';
      try {
        const saved = await SBS.api.saveGame(game);
        SBS.go({ screen: 'board', game: saved });
      } catch (e) {
        lockInFlight = false;
        if (await SBS.handleConflict(e, game.year)) return;
        game.status = 'picking';
        showAlert('Failed to start game: ' + e.message);
      }
    }

    // Auto-cutoff watcher. The server locks the board on its own too (so a
    // cutoff still fires with every device asleep); this just makes it prompt
    // while someone is watching.
    if (game.autoCutoffEnabled && game.autoCutoffTime) {
      const cutoffMs = new Date(game.autoCutoffTime).getTime();
      const checkCutoff = () => {
        if (SBS.currentScreen() === 'picking' && Date.now() >= cutoffMs) startGame();
      };
      checkCutoff();
      SBS.setManagedInterval(checkCutoff, 5000);
    }

    // Poll for changes made on another device (the iPad and the PC are often
    // both on this screen). Skipped mid-selection so a half-finished manual
    // pick is never yanked out from under the host.
    SBS.setManagedInterval(async () => {
      if (SBS.currentScreen() !== 'picking' || manualSelecting || lockInFlight) return;
      try {
        const fresh = await SBS.api.getGame(game.year);
        if (fresh.updatedAt && fresh.updatedAt !== game.updatedAt) {
          SBS.go({ screen: (fresh.status === 'started' || fresh.status === 'finished') ? 'board' : 'picking', game: fresh });
        }
      } catch (e) { /* offline or server restarting — try again next tick */ }
    }, 6000);
  }

  SBS.screens.picking = renderPicking;
})();

// Phone score entry: a one-thumb view for updating quarter scores while the
// grid is up on the television. Digits are tapped, not typed — no keyboard
// pops up, and every tap saves immediately.
(function () {
  'use strict';

  const SBS = window.SBS = window.SBS || {};
  const { el, escapeHtml, money, showAlert, applyTeamColors, teamBadge, fitTeamBadges } = SBS.ui;
  const { openManagePlayersModal } = SBS.players;
  const { QUARTERS, QLABEL, computeGame } = window.GameLogic;

  function renderPhone(year) {
    const app = SBS.appEl;
    app.innerHTML = '';
    document.body.classList.add('phone-mode');
    SBS.onLeaveScreen(() => document.body.classList.remove('phone-mode'));

    const wrap = el('div', 'phone-screen');
    app.appendChild(wrap);

    const header = el('div', 'phone-header');
    wrap.appendChild(header);

    const tabs = el('div', 'phone-tabs');
    wrap.appendChild(tabs);

    const panel = el('div', 'phone-panel');
    wrap.appendChild(panel);

    const footer = el('div', 'phone-footer');
    wrap.appendChild(footer);

    let game = null;
    let activeQ = null;
    let saving = false;

    function firstUnscored(g) {
      const c = computeGame(g);
      return QUARTERS.find(q => c.results[q].a === null || c.results[q].b === null) || 'final';
    }

    function draw() {
      if (!game) return;
      const computed = computeGame(game);
      applyTeamColors(game);

      header.innerHTML = `
        <div class="phone-matchup badge-fit">
          ${teamBadge(game.teamA, 'A', { logoSize: 22 })}
          <span class="pm-vs">vs</span>
          ${teamBadge(game.teamB, 'B', { logoSize: 22 })}
        </div>
        <div class="phone-sub">${game.year} &middot; Pot ${money(computed.pot)}</div>
      `;
      fitTeamBadges(header);

      const actions = el('div', 'phone-actions');
      const manageBtn = el('button', 'phone-action-btn', 'Manage Players');
      manageBtn.type = 'button';
      manageBtn.addEventListener('click', () => openManagePlayersModal(game, draw));
      const gridBtn = el('button', 'phone-action-btn', 'Back to Grid');
      gridBtn.type = 'button';
      gridBtn.addEventListener('click', () => SBS.go({ screen: 'board', game }));
      actions.appendChild(manageBtn);
      actions.appendChild(gridBtn);
      header.appendChild(actions);

      // --- quarter tabs ---
      tabs.innerHTML = '';
      QUARTERS.forEach(q => {
        const res = computed.results[q];
        const done = res.a !== null && res.b !== null;
        const tab = el('button', 'phone-tab' + (q === activeQ ? ' active' : '') + (done ? ' done' : ''));
        tab.innerHTML = `<span class="pt-label">${q === 'final' ? 'FINAL' : QLABEL[q]}</span>`;
        tab.addEventListener('click', () => { activeQ = q; draw(); });
        tabs.appendChild(tab);
      });

      // --- active quarter ---
      const res = computed.results[activeQ];
      panel.innerHTML = '';

      const amtRow = el('div', 'phone-amount');
      amtRow.innerHTML = `<span class="pa-label">${activeQ === 'final' ? 'Final Score' : QLABEL[activeQ]} pays</span><span class="pa-value">${money(res.amount)}</span>`;
      panel.appendChild(amtRow);

      panel.appendChild(keypadFor('a', game.teamA, res.a, 'pk-a'));
      panel.appendChild(keypadFor('b', game.teamB, res.b, 'pk-b'));
      fitTeamBadges(panel);

      const outcome = el('div', 'phone-outcome');
      if (res.a === null || res.b === null) {
        outcome.classList.add('pending');
        outcome.textContent = res.carryIn > 0
          ? `Tap the last digit of each score. Includes ${money(res.carryIn)} rolled over from a push.`
          : 'Tap the last digit of each team\'s score.';
      } else if (res.resolved && res.pushed) {
        outcome.classList.add('push');
        outcome.textContent = `PUSH — nobody had that square. ${money(res.amount)} rolls into the next payout.`;
      } else if (res.resolved && res.winnerName) {
        outcome.classList.add('win');
        outcome.textContent = `${res.winnerName}${res.autoResolved ? ' (auto-drawn)' : ''} wins ${money(res.amount)}`;
      } else if (activeQ === 'final' && res.needsDraw) {
        outcome.classList.add('push');
        outcome.textContent = 'That square is empty — a winner has to be drawn.';
      }
      panel.appendChild(outcome);

      if (activeQ === 'final' && res.needsDraw) {
        const drawBtn = el('button', 'phone-draw', 'Randomly Draw Winner');
        drawBtn.addEventListener('click', async () => {
          const filledIdx = game.squares.map((s, i) => s ? i : -1).filter(i => i >= 0);
          if (!filledIdx.length) { showAlert('No squares are filled in — cannot draw a winner.'); return; }
          const idx = filledIdx[Math.floor(Math.random() * filledIdx.length)];
          if (!game.results.final) game.results.final = {};
          game.results.final.autoResolve = { key: `${res.row}-${res.col}`, row: Math.floor(idx / 10), col: idx % 10 };
          await save();
        });
        panel.appendChild(drawBtn);
      }

      // --- footer: winners so far, so the host can read them out ---
      const winners = QUARTERS
        .filter(q => computed.results[q].resolved && computed.results[q].winnerName)
        .map(q => `<div class="pw-row"><span>${q === 'final' ? 'FINAL' : QLABEL[q]}</span><strong>${escapeHtml(computed.results[q].winnerName)}</strong><span class="pw-amt">${money(computed.results[q].amount)}</span></div>`);
      footer.innerHTML = winners.length
        ? `<div class="phone-winners"><div class="pw-head">Winners so far</div>${winners.join('')}</div>`
        : '';
    }

    function keypadFor(side, teamName, current, cls) {
      const box = el('div', 'phone-keypad ' + cls);
      const head = el('div', 'pk-head badge-fit');
      head.innerHTML = `${teamBadge(teamName, side === 'a' ? 'A' : 'B', { logoSize: 18, cls: 'team-badge-sm' })}<span class="pk-current">${current === null || current === '' ? '–' : current}</span>`;
      box.appendChild(head);

      // Full numeric keyboard (phone dialer layout) so multi-digit scores can
      // be typed in, not just a single last-digit tap.
      const pad = el('div', 'pk-grid');
      for (let d = 1; d <= 9; d++) {
        const key = el('button', 'pk-key', String(d));
        key.addEventListener('click', () => appendDigit(side, d));
        pad.appendChild(key);
      }
      const clearKey = el('button', 'pk-key pk-clear', 'Clear');
      clearKey.addEventListener('click', () => setScore(side, ''));
      pad.appendChild(clearKey);

      const zeroKey = el('button', 'pk-key', '0');
      zeroKey.addEventListener('click', () => appendDigit(side, 0));
      pad.appendChild(zeroKey);

      // Spelled out rather than a ⌫ glyph — that renders as a hollow box in
      // some browsers, and this key erases a character.
      const deleteKey = el('button', 'pk-key pk-clear', 'Delete');
      deleteKey.addEventListener('click', () => deleteDigit(side));
      pad.appendChild(deleteKey);

      box.appendChild(pad);
      return box;
    }

    function appendDigit(side, digit) {
      const entry = (game.results[activeQ] || {})[side];
      const cur = entry === null || entry === undefined ? '' : String(entry);
      if (cur.length >= 3) return; // scores don't realistically run past 3 digits
      setScore(side, Number(cur + String(digit)));
    }

    function deleteDigit(side) {
      const entry = (game.results[activeQ] || {})[side];
      const cur = entry === null || entry === undefined ? '' : String(entry);
      const next = cur.slice(0, -1);
      setScore(side, next === '' ? '' : Number(next));
    }

    async function setScore(side, value) {
      if (saving) return;
      if (!game.results[activeQ]) game.results[activeQ] = {};
      game.results[activeQ][side] = value;
      if (activeQ === 'final') {
        const entry = game.results.final;
        if (entry.autoResolve && entry.autoResolve.key !== `${entry.a}-${entry.b}`) delete entry.autoResolve;
      }
      draw(); // optimistic: the tap feels instant, the save follows
      await save();
    }

    async function save() {
      saving = true;
      wrap.classList.add('is-saving');
      try {
        const saved = await SBS.api.saveGame(game);
        game = saved;
        draw();
      } catch (e) {
        if (e && e.conflict) {
          // Someone edited on the iPad at the same moment — take the server's
          // copy rather than fighting over it.
          game = e.game && e.game.squares ? e.game : await SBS.api.getGame(year);
          draw();
          showAlert('That score was changed on another device — showing the latest version.');
        } else {
          showAlert('Could not save: ' + e.message);
        }
      } finally {
        saving = false;
        wrap.classList.remove('is-saving');
      }
    }

    async function load(initial) {
      try {
        const fresh = await SBS.api.getGame(year);
        if (initial) {
          game = fresh;
          activeQ = firstUnscored(fresh);
          if (fresh.status !== 'started' && fresh.status !== 'finished') {
            panel.innerHTML = '';
            footer.innerHTML = '';
            tabs.innerHTML = '';
            header.innerHTML = `<div class="phone-sub">Squares for ${year} are still being picked — score entry opens once the board is locked.</div>`;
            return;
          }
          draw();
        } else if (!saving && fresh.updatedAt !== game.updatedAt) {
          game = fresh;
          draw();
        }
      } catch (e) {
        header.innerHTML = `<div class="error-msg">Could not load ${year}: ${escapeHtml(e.message)}</div>`;
      }
    }

    load(true);
    // Stay in step with edits made on the iPad or PC.
    SBS.setManagedInterval(() => load(false), 6000);
  }

  SBS.screens.phone = renderPhone;
})();

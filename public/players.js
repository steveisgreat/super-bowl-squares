// Players, payments, and duplicate-name handling — the bookkeeping side of the
// board, shared by the picking screen and game day.
(function () {
  'use strict';

  const SBS = window.SBS = window.SBS || {};
  const { el, escapeHtml, money, overlayEl, showChoice, showConfirm, showAlert } = SBS.ui;

  const SUBSCRIPT_MAP = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
  const SUBSCRIPT_REV = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

  function toSubscript(n) { return String(n).split('').map(d => SUBSCRIPT_MAP[d] || d).join(''); }
  function fromSubscript(s) { return s.split('').map(c => SUBSCRIPT_REV[c] || '').join(''); }
  function stripSubscript(name) { return String(name).replace(/[₀₁₂₃₄₅₆₇₈₉]+$/, ''); }

  function ensurePlayers(game) {
    if (!game.players) game.players = {};
    return game.players;
  }

  // Bright, saturated colors chosen to stay readable as text against the
  // dark grid background (--panel2 #232e38) — no dim or near-black hues,
  // and nothing too close to the red used for the unpaid-square warning.
  const PLAYER_COLORS = [
    '#feca57', '#48dbfb', '#1dd1a1', '#a29bfe', '#ff9ff3', '#54a0ff',
    '#00d2d3', '#f368e0', '#ff9f43', '#10ac84', '#c56cf0', '#7bed9f',
    '#70a1ff', '#eccc68', '#ffdd59', '#34e7e4'
  ];

  // Assigns a color the first time a name appears, and never reassigns it
  // afterward — each player keeps one color for the life of the game.
  function ensurePlayerColor(game, name) {
    const players = ensurePlayers(game);
    if (!players[name]) players[name] = { paid: false };
    if (!players[name].color) {
      const used = new Set(Object.values(players).map(p => p.color).filter(Boolean));
      let color = PLAYER_COLORS.find(c => !used.has(c));
      if (!color) color = PLAYER_COLORS[Object.keys(players).length % PLAYER_COLORS.length];
      players[name].color = color;
    }
    return players[name].color;
  }

  // Claiming more squares must never quietly un-pay a player: if Steve already
  // paid and later grabs two more squares with the box unchecked, he stays paid.
  // Only the Manage Payments modal can move someone back to unpaid.
  function markPlayerPaid(game, name, paidChecked) {
    const players = ensurePlayers(game);
    const alreadyPaid = !!(players[name] && players[name].paid);
    const existingColor = players[name] && players[name].color;
    players[name] = { paid: alreadyPaid || !!paidChecked, color: existingColor };
    ensurePlayerColor(game, name);
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
      return variantNames.find(v => stripSubscript(v) === v) || variantNames[0];
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
      const color = ensurePlayerColor(game, name);
      return { name, count, paid, owed, color };
    });
  }

  function unpaidTotal(game) {
    return playerSummaries(game).reduce((sum, p) => sum + (p.paid ? 0 : p.owed), 0);
  }

  // Modal for marking players paid/unpaid and removing a player's picks entirely.
  // Available from both Step 2 and Step 3 on purpose — someone may call in to
  // claim squares before lock but only pay after the game has started.
  function openManagePlayersModal(game, onUpdate) {
    const overlay = overlayEl('0.65');
    const box = el('div', 'card manage-modal');
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    async function persistAndRefresh() {
      try {
        const saved = await SBS.api.saveGame(game);
        Object.assign(game, saved);
      } catch (e) {
        overlay.remove();
        if (await SBS.handleConflict(e, game.year)) return;
        showAlert('Failed to save: ' + e.message);
        return;
      }
      renderList();
      if (onUpdate) onUpdate();
    }

    function renderList() {
      const summaries = playerSummaries(game);
      box.innerHTML = '';
      const headRow = el('div', 'manage-modal-head');
      headRow.innerHTML = `<h3>Manage Players</h3>`;
      const closeX = el('button', 'ghost modal-close', 'Close');
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
            <button class="ghost small btn-delete">Remove</button>
          `;
          row.querySelector('input[type=checkbox]').addEventListener('change', async (e) => {
            const players = ensurePlayers(game);
            players[p.name] = Object.assign({}, players[p.name], { paid: e.target.checked });
            await persistAndRefresh();
          });
          row.querySelector('button.btn-delete').addEventListener('click', async () => {
            const startedWarning = (game.status === 'started' || game.status === 'finished') ? ' The game has already started — this may change quarter results tied to their square(s).' : '';
            const ok = await showConfirm(`Remove all ${p.count} square${p.count === 1 ? '' : 's'} picked by "${escapeHtml(p.name)}"?${startedWarning} This cannot be undone.`);
            if (!ok) return;
            game.squares.forEach((sq, i) => { if (sq && sq.name === p.name) game.squares[i] = null; });
            delete ensurePlayers(game)[p.name];
            await persistAndRefresh();
          });
          list.appendChild(row);
        });
        box.appendChild(list);
      }

      box.appendChild(el('div', 'unpaid-summary', `Total Unpaid: <strong>${money(unpaidTotal(game))}</strong>`));
    }

    renderList();
  }

  SBS.players = {
    ensurePlayers, ensurePlayerColor, markPlayerPaid, renameSquares,
    collectNameGroups, resolveNameForPick,
    playerSummaries, unpaidTotal, openManagePlayersModal,
    toSubscript, fromSubscript, stripSubscript
  };
})();

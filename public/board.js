// The 10x10 grid itself, in its two forms: the pick-time preview (numbers still
// hidden, empty squares tappable) and the full board (axis numbers, winner and
// push badges) used on game day and on the TV.
(function () {
  'use strict';

  const SBS = window.SBS = window.SBS || {};
  const { el, escapeHtml, teamLogoTag, teamColor, readableTextColor } = SBS.ui;

  // Shown instead of the word "FINAL" inside a winning cell's ribbon, so the
  // overall winner reads at a glance instead of blending in with quarterly
  // wins.
  const TROPHY_SVG = `<svg viewBox="0 0 16 16" width="8" height="8" fill="currentColor" aria-hidden="true" style="vertical-align:-1px;">
    <path d="M4 2h8v3a4 4 0 0 1-8 0V2z"/>
    <path d="M4 3H2a2 2 0 0 0 2 3" stroke="currentColor" stroke-width="1.2" fill="none"/>
    <path d="M12 3h2a2 2 0 0 1-2 3" stroke="currentColor" stroke-width="1.2" fill="none"/>
    <rect x="7" y="9" width="2" height="2"/>
    <rect x="5" y="12" width="6" height="1.4" rx="0.5"/>
  </svg>`;

  // The axis bars use a gradient that peaks at the team color in the middle
  // and fades to transparent at both ends, rather than a flat fill.
  function badgeStyle(name, side, axis) {
    const bg = teamColor(name, side);
    const fade = bg + '00';
    const gradientDir = axis === 'x' ? 'to right' : 'to bottom';
    return `background:linear-gradient(${gradientDir}, ${fade}, ${bg}, ${fade}); color:${readableTextColor(bg)};`;
  }

  // A square is flagged when the person holding it still owes for it, so the
  // host can see at a glance who to chase without opening the payments list.
  function unpaidChecker(game) {
    const players = game.players || {};
    return (name) => !(players[name] && players[name].paid);
  }

  // Step 2 preview. `state` is { selecting, selected, target, onToggle }.
  function renderPickBoard(holder, game, state) {
    holder.innerHTML = '';
    const isUnpaid = unpaidChecker(game);
    const scroll = el('div', 'board-scroll');
    const table = el('div', 'board-table');

    table.appendChild(el('div', 'cell head corner', ''));
    for (let c = 0; c < 10; c++) table.appendChild(el('div', 'cell head x pending', '–'));

    for (let r = 0; r < 10; r++) {
      table.appendChild(el('div', 'cell head y pending', '–'));
      for (let c = 0; c < 10; c++) {
        const idx = r * 10 + c;
        const sq = game.squares[idx];
        let cls = 'cell';
        let label = '';
        if (sq) {
          cls += ' filled';
          label = `<div class="name-txt">${escapeHtml(sq.name)}</div>`;
          if (isUnpaid(sq.name)) {
            cls += ' is-unpaid';
          }
        } else {
          cls += ' empty-pick';
          if (state.selected.includes(idx)) cls += ' selected';
        }
        const cell = el('div', cls, label);
        if (!sq && state.selecting) {
          cell.addEventListener('click', () => state.onToggle(idx));
        }
        table.appendChild(cell);
      }
    }

    scroll.appendChild(table);
    holder.appendChild(scroll);
  }

  // Step 3 / TV board, with axis numbers and per-quarter badges.
  function renderFullBoard(holder, game, computed) {
    holder.innerHTML = '';
    const isUnpaid = unpaidChecker(game);

    // A 2x2 grid: teamB's bar sits over the numbered columns (top-right),
    // teamA's bar sits beside the numbered rows (bottom-left) starting flush
    // with the top of the grid's own blank corner cell — not stretched up
    // alongside teamB's bar, which used to leave it starting a row too low.
    const outer = el('div', 'board-grid-outer');
    const teamALabel = el('div', 'teamA-label', `<span class="teamA-label-text">${escapeHtml(game.teamA)}</span>${teamLogoTag(game.teamA, 32)}`);
    teamALabel.style.cssText = badgeStyle(game.teamA, 'A', 'y');
    outer.appendChild(teamALabel);

    const teamBLabel = el('div', 'teamB-label', `${teamLogoTag(game.teamB, 32)}<span>${escapeHtml(game.teamB)}</span>`);
    teamBLabel.style.cssText = badgeStyle(game.teamB, 'B', 'x');
    outer.appendChild(teamBLabel);

    const scroll = el('div', 'board-scroll');
    const table = el('div', 'board-table');

    table.appendChild(el('div', 'cell head corner', ''));
    for (let c = 0; c < 10; c++) {
      table.appendChild(el('div', 'cell head x' + (game.axisX ? '' : ' pending'), game.axisX ? game.axisX[c] : '–'));
    }

    for (let r = 0; r < 10; r++) {
      table.appendChild(el('div', 'cell head y' + (game.axisY ? '' : ' pending'), game.axisY ? game.axisY[r] : '–'));
      for (let c = 0; c < 10; c++) {
        const sq = game.squares[r * 10 + c];
        const labels = computed.cellLabels[`${r}-${c}`] || [];
        const hasWin = labels.some(l => !l.pushed);
        const hasPush = labels.some(l => l.pushed);

        let cls = 'cell';
        if (sq) cls += ' filled';
        if (hasWin) cls += ' winner';
        else if (hasPush) cls += ' pushed';

        const owing = sq && isUnpaid(sq.name);
        if (owing) cls += ' is-unpaid';

        const inner = sq ? `<div class="name-txt">${escapeHtml(sq.name)}</div>` : (hasPush ? '<div class="name-txt">PUSH</div>' : '');
        // A winning square gets a diagonal ribbon across the corner instead
        // of the small badge pills — it deliberately covers where those
        // badges would sit, so the ribbon's own text carries which
        // quarter(s) were won.
        const badges = !labels.length ? '' : hasWin
          ? `<div class="ribbon">${labels.map(l => l.label === 'FINAL' ? TROPHY_SVG : l.label).join(' ')}</div>`
          : `<div class="badges">${labels.map(l => `<span class="badge">${l.label}</span>`).join('')}</div>`;

        table.appendChild(el('div', cls, badges + inner));
      }
    }

    scroll.appendChild(table);
    outer.appendChild(scroll);
    holder.appendChild(outer);

    // Both bars span their full grid cell by default, which includes the
    // blank corner cell's column/row. Inset them by exactly the corner
    // cell's measured size so they start at the first number cell and end
    // at the last, rather than at the table's outer edge.
    const corner = table.querySelector('.cell.head.corner');
    if (corner) {
      const cw = corner.offsetWidth;
      const ch = corner.offsetHeight;
      teamBLabel.style.marginLeft = cw + 'px';
      teamBLabel.style.width = `calc(100% - ${cw}px)`;
      teamALabel.style.marginTop = ch + 'px';
      teamALabel.style.height = `calc(100% - ${ch}px)`;
    }
  }

  SBS.board = { renderPickBoard, renderFullBoard };
})();

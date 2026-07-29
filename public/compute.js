// Pure game logic shared by the browser app, the server (for auto-cutoff
// locking and request validation) and test.js. No DOM, no fs — keep it that way
// so it can be require()'d from Node and loaded with a <script> tag.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GameLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const QUARTERS = ['q1', 'q2', 'q3', 'final'];
  const QLABEL = { q1: 'Q1', q2: 'Q2', q3: 'Q3', final: 'FINAL' };
  const STATUSES = ['setup', 'picking', 'started', 'finished'];

  // Fisher-Yates. Do NOT replace with arr.sort(() => Math.random() - 0.5) —
  // that is not a uniform shuffle and visibly clusters auto-picked squares.
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function shuffledDigits() {
    return shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }

  function emptyGrid() {
    return new Array(100).fill(null);
  }

  // The pot as actually collected: squares claimed times the price per square.
  function actualPotOf(game) {
    const filled = game.squares.filter(s => s).length;
    return filled * (parseFloat(game.squarePrice) || 0);
  }

  // The pot shown as "Total Pot" and used to settle the Final payout: a
  // manually-entered whole-dollar override if one is stored, otherwise the
  // actual collected total. Blanking the override (storing null) falls back
  // to the actual amount. Overrides are always whole dollars.
  function potOf(game) {
    const override = game.potOverride;
    if (override !== null && override !== undefined && override !== '') {
      const n = Math.round(Number(override));
      if (Number.isFinite(n) && n >= 0) return n;
    }
    return actualPotOf(game);
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  // Payout amounts are always displayed as whole dollars (see money() in
  // ui.js), so rounding here must match that or Q1+Q2+Q3+Final won't add up
  // to the Total Pot shown on screen.
  function roundMoney(n) {
    return Math.round(n);
  }

  function findCol(game, digit) { return game.axisX ? game.axisX.indexOf(digit) : -1; }
  function findRow(game, digit) { return game.axisY ? game.axisY.indexOf(digit) : -1; }

  // Returns computed results per quarter + cell winner map { "row-col": [labels] }.
  //
  // Carry ("push") rules: an unclaimed square in Q1-Q3 rolls its payout into the
  // next quarter that actually resolves. A quarter with no score entered yet
  // displays base + carry (that is what it will pay if it is scored next) but
  // does NOT consume the carry — otherwise backfilling quarters out of order
  // would silently lose the rolled-over money.
  function computeGame(game) {
    const pot = potOf(game);
    const actualPot = actualPotOf(game);
    const basePct = game.payouts || { q1: 25, q2: 25, q3: 25, final: 25 };
    const cellLabels = {}; // key "r-c" -> array of quarter labels
    const out = {};
    let carry = 0;

    // Q1-Q3 always come from the system-calculated (actual) pot, never from a
    // manually-edited Total Pot — a shortage or overage on the edited figure
    // should only ever change what Final pays. Final is whatever is left of
    // the (possibly overridden) Total Pot after Q1-Q3, so all four displayed
    // amounts always sum to exactly the displayed Total Pot.
    const baseAmounts = {};
    let nonFinalSum = 0;
    ['q1', 'q2', 'q3'].forEach(q => {
      const amt = roundMoney(actualPot * (parseFloat(basePct[q]) || 0) / 100);
      baseAmounts[q] = amt;
      nonFinalSum += amt;
    });
    baseAmounts.final = roundMoney(pot) - nonFinalSum;

    QUARTERS.forEach(q => {
      const entry = (game.results && game.results[q]) || {};
      const baseAmount = baseAmounts[q];
      const amount = baseAmount + carry;
      const hasA = entry.a !== null && entry.a !== undefined && entry.a !== '';
      const hasB = entry.b !== null && entry.b !== undefined && entry.b !== '';
      const res = { amount, baseAmount, carryIn: carry, a: hasA ? Number(entry.a) : null, b: hasB ? Number(entry.b) : null, resolved: false, pushed: false, needsDraw: false, winnerName: null, row: null, col: null, autoResolved: false };

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
          res.needsDraw = (row >= 0 && col >= 0);
          carry = 0; // paid out to the drawn winner; nothing left to roll
        } else {
          res.resolved = true;
          res.pushed = true;
          res.row = row;
          res.col = col;
          carry = amount;
          if (row >= 0 && col >= 0) {
            const key = `${row}-${col}`;
            if (!cellLabels[key]) cellLabels[key] = [];
            cellLabels[key].push({ label: QLABEL[q], pushed: true });
          }
        }
      }
      // Pending quarter: leave `carry` untouched so it survives to whichever
      // quarter is scored next, even if quarters are filled in out of order.

      out[q] = res;
    });

    // A still-blank quarter only advertises the rolled-over money if no later
    // quarter has already collected it. Without this, scoring Q3 while Q2 is
    // blank leaves Q2 showing a rollover that has already been paid out.
    QUARTERS.forEach((q, i) => {
      const res = out[q];
      if (res.resolved || res.needsDraw || res.carryIn === 0) return;
      const collectedLater = QUARTERS.slice(i + 1).some(later => out[later].resolved || out[later].needsDraw);
      if (collectedLater) {
        res.carryIn = 0;
        res.amount = res.baseAmount;
      }
    });

    return { pot, results: out, cellLabels, unallocated: carry };
  }

  function isDigitPermutation(a) {
    if (!Array.isArray(a) || a.length !== 10) return false;
    const seen = new Set(a);
    if (seen.size !== 10) return false;
    return a.every(n => Number.isInteger(n) && n >= 0 && n <= 9);
  }

  // Server-side guard against a malformed client persisting a corrupt game.
  // Returns an error string, or null when the shape is acceptable.
  function validateGame(game) {
    if (!game || typeof game !== 'object' || Array.isArray(game)) return 'Game must be an object.';

    const year = Number(game.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return 'Year must be a 4-digit year between 2000 and 2100.';

    const price = Number(game.squarePrice);
    if (!Number.isFinite(price) || price < 0) return 'Square price must be a number of 0 or more.';

    if (game.potOverride !== null && game.potOverride !== undefined) {
      const override = Number(game.potOverride);
      if (!Number.isInteger(override) || override < 0) return 'Total pot must be a whole number of 0 or more.';
    }

    if (!Array.isArray(game.squares) || game.squares.length !== 100) return 'Squares must be an array of exactly 100 entries.';
    for (const sq of game.squares) {
      if (sq === null) continue;
      if (typeof sq !== 'object' || Array.isArray(sq)) return 'Each square must be null or an object.';
      if (typeof sq.name !== 'string' || !sq.name.trim()) return 'Each claimed square must have a non-empty name.';
    }

    if (!game.payouts || typeof game.payouts !== 'object') return 'Payouts are required.';
    let total = 0;
    for (const q of QUARTERS) {
      const v = Number(game.payouts[q]);
      if (!Number.isFinite(v) || v < 0) return `Payout for ${QLABEL[q]} must be a number of 0 or more.`;
      total += v;
    }
    if (Math.abs(total - 100) > 0.01) return `Quarterly payout percentages must total 100% (got ${total}%).`;

    if (STATUSES.indexOf(game.status) === -1) return `Status must be one of: ${STATUSES.join(', ')}.`;

    for (const axis of ['axisX', 'axisY']) {
      if (game[axis] === null || game[axis] === undefined) continue;
      if (!isDigitPermutation(game[axis])) return `${axis} must be a permutation of the digits 0-9.`;
    }
    if ((game.status === 'started' || game.status === 'finished') && (!game.axisX || !game.axisY)) return 'A started game must have both axis number rows generated.';

    if (game.results !== undefined && (typeof game.results !== 'object' || game.results === null || Array.isArray(game.results))) return 'Results must be an object.';
    if (game.players !== undefined && (typeof game.players !== 'object' || game.players === null || Array.isArray(game.players))) return 'Players must be an object.';

    return null;
  }

  // True when picking should be locked because the configured cutoff has passed.
  // autoCutoffTime is a datetime-local string, parsed as local time on both
  // the hosting PC and the browser.
  function cutoffPassed(game, now) {
    if (!game || game.status !== 'picking') return false;
    if (!game.autoCutoffEnabled || !game.autoCutoffTime) return false;
    const t = new Date(game.autoCutoffTime).getTime();
    if (isNaN(t)) return false;
    return (now === undefined ? Date.now() : now) >= t;
  }

  // Mutates `game` into a started game with freshly drawn axis numbers.
  function lockGame(game) {
    game.axisX = shuffledDigits();
    game.axisY = shuffledDigits();
    game.status = 'started';
    return game;
  }

  // Once a game is locked (started/finished), its status tracks whether the
  // final score has been entered — set automatically rather than by hand, so
  // clearing the final score puts the game back "in progress" on its own.
  function syncStatus(game) {
    if (game.status !== 'started' && game.status !== 'finished') return game;
    const f = (game.results && game.results.final) || {};
    const hasFinal = f.a !== null && f.a !== undefined && f.a !== '' && f.b !== null && f.b !== undefined && f.b !== '';
    game.status = hasFinal ? 'finished' : 'started';
    return game;
  }

  return {
    QUARTERS, QLABEL, STATUSES,
    shuffle, shuffledDigits, emptyGrid,
    potOf, actualPotOf, findCol, findRow, computeGame,
    validateGame, isDigitPermutation, syncStatus,
    cutoffPassed, lockGame
  };
});

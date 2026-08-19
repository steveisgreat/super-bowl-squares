// fs-backed implementation of the store interface (lib/store.js). One JSON
// file per game in DATA_DIR, moved here unchanged from server.js.
'use strict';

const fs = require('fs');
const path = require('path');
const GameLogic = require('../public/compute.js');

const DATA_DIR = path.join(__dirname, '..', 'data');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Every game gets a server-generated UUID as its permanent identity — this is
// what makes multiple games (any year, any sport) coexist without collision,
// now that a game is no longer keyed by its year. Only ever accepts that exact
// shape, so a junk value can never produce a stray file such as `.json` in
// the data folder.
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function gameFile(id) {
  const s = String(id).trim();
  if (!ID_RE.test(s)) return null;
  return path.join(DATA_DIR, `${s}.json`);
}

// Atomic save: write a temp file and rename over the target. A crash, power cut
// or OneDrive sync landing mid-write can then never leave a truncated,
// unparseable game file behind.
function writeGameFile(file, game) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(game, null, 2));
  fs.renameSync(tmp, file);
}

function readGameFile(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// The browser can only lock picking at the cutoff while someone has the app
// open. The server owns the clock too, so a cutoff still fires if every device
// is asleep.
function applyAutoCutoff(game, file) {
  let changed = false;
  if (GameLogic.cutoffPassed(game)) {
    GameLogic.lockGame(game);
    changed = true;
  }
  // Also re-derives started/finished on read, so games saved before this
  // distinction existed pick up the right status without needing an edit.
  const statusBefore = game.status;
  GameLogic.syncStatus(game);
  if (game.status !== statusBefore) changed = true;
  if (changed) {
    game.updatedAt = new Date().toISOString();
    writeGameFile(file, game);
  }
  return game;
}

async function listGames() {
  const files = fs.readdirSync(DATA_DIR).filter(f => ID_RE.test(f.replace(/\.json$/, '')));
  const games = files.map(f => {
    try {
      const full = path.join(DATA_DIR, f);
      const g = applyAutoCutoff(readGameFile(full), full);
      return {
        id: g.id,
        teamA: g.teamA,
        teamB: g.teamB,
        league: g.league,
        teamAColor: g.teamAColor,
        teamBColor: g.teamBColor,
        description: g.description || '',
        gameDate: g.gameDate,
        status: g.status,
        updatedAt: g.updatedAt || null
      };
    } catch (e) {
      console.error(`Skipping unreadable game file ${f}: ${e.message}`);
      return null;
    }
  }).filter(Boolean);
  games.sort((a, b) => (b.gameDate || '').localeCompare(a.gameDate || ''));
  return games;
}

async function getGame(id) {
  const file = gameFile(id);
  if (!file || !fs.existsSync(file)) return null;
  return applyAutoCutoff(readGameFile(file), file);
}

async function createGame(game) {
  const file = gameFile(game.id);
  game.createdAt = new Date().toISOString();
  game.updatedAt = game.createdAt;
  writeGameFile(file, game);
  return game;
}

// Conditional write — see the concurrency contract in store.js. Everything
// from the existence check to the rename runs synchronously, with no await in
// between, so the event loop cannot interleave another request midway and
// the compare-and-write is effectively one operation. (Two separate OS
// processes sharing this folder could still interleave; that is the limit of
// what a plain file backend can promise, and why Postgres does the check as a
// single conditional statement.)
async function updateGame(id, game, expectedUpdatedAt) {
  const file = gameFile(id);
  const exists = fs.existsSync(file);
  const existing = exists ? readGameFile(file) : null;

  // A conflict needs both sides of the comparison to exist. No token from the
  // caller means "overwrite unconditionally"; no stored timestamp means there
  // is no prior version to have lost to.
  if (existing && existing.updatedAt && expectedUpdatedAt
    && existing.updatedAt !== expectedUpdatedAt) {
    return { ok: false, game: existing };
  }

  game.createdAt = (existing && existing.createdAt) || new Date().toISOString();
  game.updatedAt = new Date().toISOString();
  writeGameFile(file, game);
  return { ok: true, game };
}

async function deleteGame(id) {
  const file = gameFile(id);
  if (!file || !fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}

module.exports = { listGames, getGame, createGame, updateGame, deleteGame };

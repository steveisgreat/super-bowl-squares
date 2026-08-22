// Postgres-backed implementation of the store interface (lib/store.js).
// Whole-document model: `doc` holds the exact same shape store-fs.js writes
// to a JSON file, so no field-by-field mapping is needed. See the top of
// store.js for the full concurrency contract this must honor.
'use strict';

const { neon } = require('@neondatabase/serverless');
const GameLogic = require('../public/compute.js');

const sql = neon(process.env.DATABASE_URL);

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same auto-cutoff-on-read behavior as store-fs.js's applyAutoCutoff, but
// the write-back is an unconditional UPDATE: this is a server-owned
// mutation (the clock passing a deadline), not a client's optimistic-
// concurrency write, so it does not go through the conditional path in
// updateGame.
async function applyAutoCutoff(game) {
  let changed = false;
  if (GameLogic.cutoffPassed(game)) {
    GameLogic.lockGame(game);
    changed = true;
  }
  const statusBefore = game.status;
  GameLogic.syncStatus(game);
  if (game.status !== statusBefore) changed = true;
  if (changed) {
    game.updatedAt = new Date().toISOString();
    await sql`
      update games
      set doc = ${JSON.stringify(game)}::jsonb, updated_at = ${game.updatedAt}::timestamptz
      where id = ${game.id}
    `;
  }
  return game;
}

async function listGames() {
  const rows = await sql`select doc from games order by updated_at desc`;
  const games = [];
  for (const row of rows) {
    const g = await applyAutoCutoff(row.doc);
    games.push({
      id: g.id,
      teamA: g.teamA,
      teamB: g.teamB,
      league: g.league,
      teamAColor: g.teamAColor,
      teamBColor: g.teamBColor,
      description: g.description || '',
      gameDate: g.gameDate,
      kickoffTime: g.kickoffTime || null,
      status: g.status,
      updatedAt: g.updatedAt || null
    });
  }
  games.sort((a, b) => (b.gameDate || '').localeCompare(a.gameDate || ''));
  return games;
}

async function getGame(id) {
  const s = String(id).trim();
  if (!ID_RE.test(s)) return null;
  const rows = await sql`select doc from games where id = ${s}`;
  if (rows.length === 0) return null;
  return applyAutoCutoff(rows[0].doc);
}

async function createGame(game) {
  const now = new Date().toISOString();
  const doc = { ...game, createdAt: now, updatedAt: now };
  await sql`
    insert into games (id, doc, updated_at)
    values (${doc.id}, ${JSON.stringify(doc)}::jsonb, ${now}::timestamptz)
  `;
  return doc;
}

// Conditional write — see the concurrency contract in store.js. This is ONE
// statement: an upsert whose UPDATE branch is gated by a WHERE clause, never
// a read followed by a separate write. A null/absent expectedUpdatedAt makes
// the WHERE clause unconditionally true (never a `= null` comparison, which
// SQL would always evaluate false). On conflict, `createdAt` is pulled back
// out of the row already on disk so it survives the update; `updatedAt` is
// always re-stamped.
async function updateGame(id, game, expectedUpdatedAt) {
  const now = new Date().toISOString();
  const incoming = { ...game, id, createdAt: now, updatedAt: now };
  const expected = expectedUpdatedAt || null;

  const rows = await sql`
    insert into games (id, doc, updated_at)
    values (${id}, ${JSON.stringify(incoming)}::jsonb, ${now}::timestamptz)
    on conflict (id) do update set
      doc = jsonb_set(${JSON.stringify(incoming)}::jsonb, '{createdAt}', games.doc->'createdAt'),
      updated_at = ${now}::timestamptz
    where ${expected}::timestamptz is null
       or games.updated_at = ${expected}::timestamptz
    returning doc
  `;

  if (rows.length > 0) {
    return { ok: true, game: rows[0].doc };
  }

  // The conditional branch above lost — someone else's write already holds
  // this row's updated_at. Fetch the current document purely to report what
  // the caller lost to; the accept/reject decision itself was already made
  // atomically by the statement above, not by this read.
  const current = await sql`select doc from games where id = ${id}`;
  return { ok: false, game: current[0].doc };
}

async function deleteGame(id) {
  const s = String(id).trim();
  if (!ID_RE.test(s)) return false;
  const rows = await sql`delete from games where id = ${s} returning id`;
  return rows.length > 0;
}

module.exports = { listGames, getGame, createGame, updateGame, deleteGame };

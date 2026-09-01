// Postgres-specific tests for lib/store-pg.js.
//
// These cover the cases the backend-agnostic contract suite (test-store.js)
// structurally cannot reach, because it only ever creates documents through
// createGame and so never produces the shapes that broke this file:
//
//   * a stored document with no createdAt key, which makes the STRICT
//     jsonb_set in the upsert return NULL and trip the not-null constraint;
//   * a listGames pass that has to write, where the document in hand is the
//     TRIMMED projection and writing it back would silently gut the game.
//
// Both were real. Reverting either fix makes tests here fail against a real
// database — the first with "null value in column doc violates not-null
// constraint", the second by leaving a game with no squares at all.
//
// ---------------------------------------------------------------------------
// Running these
// ---------------------------------------------------------------------------
//
// They need a real Postgres, so they SKIP (exit 0) unless DATABASE_URL is set.
// That keeps `npm test` green offline while still covering the SQL whenever
// you point it at a database.
//
//   DATABASE_URL=postgres://... node test-store-pg.js
//
// Point it at a THROWAWAY NEON BRANCH, not at production. Like test-store.js
// these only touch rows under freshly generated UUIDs and delete them in a
// finally block, but a branch costs nothing and removes the question entirely:
//
//   npx neonctl branches create --project-id <id> --name tmp-store-pg
//   ... run the tests ...
//   npx neonctl branches delete <branch-id> --project-id <id>
//
// The schema is applied from migrations/001_games.sql on startup, so a fresh
// branch needs no preparation.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

if (!process.env.DATABASE_URL) {
  console.log('');
  console.log('  Skipped: store-pg tests need DATABASE_URL (point it at a Neon branch).');
  console.log('');
  return;
}

const { neon } = require('@neondatabase/serverless');
const store = require('./lib/store-pg.js');
const sql = neon(process.env.DATABASE_URL);

let passed = 0;
const failures = [];
const cleanupIds = [];

async function check(name, fn) {
  try {
    await fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n      ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Postgres jsonb does NOT preserve object key order — it normalises keys on
// storage, where the fs backend round-trips JSON.stringify output verbatim.
// Nothing in the app depends on key order, but comparisons of stored documents
// have to canonicalise or they fail on ordering alone.
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    return Object.keys(v).sort().reduce((o, k) => { o[k] = canonical(v[k]); return o; }, {});
  }
  return v;
}

function eq(actual, expected, what) {
  const a = JSON.stringify(canonical(actual));
  const b = JSON.stringify(canonical(expected));
  if (a !== b) throw new Error(`${what || 'value'}: expected ${b}, got ${a}`);
}

function makeGame(overrides) {
  const id = crypto.randomUUID();
  cleanupIds.push(id);
  return Object.assign({
    id,
    league: 'nfl',
    teamA: 'Chiefs',
    teamB: 'Eagles',
    gameDate: '2026-02-08',
    squarePrice: 10,
    payouts: { q1: 25, q2: 25, q3: 25, final: 25 },
    status: 'picking',
    squares: new Array(100).fill(null),
    axisX: null,
    axisY: null,
    results: {},
    players: {}
  }, overrides || {});
}

// One source of truth for the schema: the migration itself. The HTTP driver
// refuses multiple commands in one prepared statement, so it goes across one
// statement at a time.
async function applySchema() {
  const file = path.join(__dirname, 'migrations', '001_games.sql');
  const statements = fs.readFileSync(file, 'utf8')
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    // sql`` is a tagged template; a plain string has to go through sql.query.
    await sql.query(statement);
  }
}

async function main() {
  await applySchema();

  // ---------- the STRICT jsonb_set trap ----------

  await check('updateGame survives a stored document that has no createdAt', async () => {
    const game = makeGame();
    const legacy = Object.assign({}, game);
    delete legacy.createdAt;
    delete legacy.updatedAt;
    // Written the way a document predating these timestamps would have been.
    await sql`insert into games (id, doc, updated_at) values (${game.id}, ${JSON.stringify(legacy)}::jsonb, now())`;

    const stored = await sql`select doc from games where id = ${game.id}`;
    assert(stored[0].doc.createdAt === undefined, 'precondition: the row must have no createdAt');

    // Unconditional, so this takes the ON CONFLICT DO UPDATE branch where
    // jsonb_set reads games.doc->'createdAt' — SQL NULL for this row.
    const result = await store.updateGame(game.id, makeGame({ id: game.id, teamA: 'Rams' }), null);

    assert(result.ok, 'the write must succeed, not trip the not-null constraint');
    assert(result.game.createdAt, 'createdAt must be backfilled rather than left null');
    eq(result.game.teamA, 'Rams', 'the incoming document must win');
    eq(result.game.squares.length, 100, 'squares must survive');
  });

  await check('an existing createdAt survives the update branch unchanged', async () => {
    const game = makeGame();
    const created = await store.createGame(game);
    const originalCreatedAt = created.createdAt;
    assert(originalCreatedAt, 'precondition: createGame stamps createdAt');

    await new Promise(r => setTimeout(r, 10));
    const result = await store.updateGame(game.id, makeGame({ id: game.id, teamA: 'Bills' }), null);
    assert(result.ok, 'write must succeed');
    eq(result.game.createdAt, originalCreatedAt, 'createdAt must be the original, not re-stamped');
    assert(result.game.updatedAt !== originalCreatedAt, 'updatedAt must be fresh');
  });

  // ---------- listGames trims, but must never write the trimmed document ----------

  await check('a cutoff firing during listGames does not truncate the document', async () => {
    const squares = new Array(100).fill(null);
    squares[0] = { name: 'Steve' };
    squares[42] = { name: 'Colton' };
    const game = makeGame({
      status: 'picking',
      autoCutoffEnabled: true,
      autoCutoffTime: new Date(Date.now() - 60000).toISOString(),
      squares,
      players: { Steve: { paid: true } },
      simulation: true,
      simPlan: { startedAt: new Date().toISOString(), quarterMs: 1000, events: [{ team: 'a', atMs: 1, points: 7 }] }
    });
    await store.createGame(game);

    const row = (await store.listGames()).find(g => g.id === game.id);
    assert(row, 'the game must appear in the listing');
    eq(row.status, 'started', 'the cutoff must have fired and locked the game');

    const after = await store.getGame(game.id);
    eq(after.squares.length, 100, 'squares must survive the cutoff write');
    eq(after.squares[0], { name: 'Steve' }, 'a claimed square must survive');
    eq(after.squares[42], { name: 'Colton' }, 'a second claimed square must survive');
    eq(after.players, { Steve: { paid: true } }, 'players must survive');
    // lockGame deliberately REGENERATES simPlan (a simulated game's trajectory
    // is drawn at lock time), so the original plan is expected to be gone. What
    // matters is that the key still holds a usable plan — had the trimmed
    // document been written back it would be absent entirely.
    assert(after.simPlan && Array.isArray(after.simPlan.events) && after.simPlan.events.length > 0,
      'simPlan must still be present and usable');
    assert(Array.isArray(after.axisX) && after.axisX.length === 10, 'the lock must have drawn axes');
  });

  await check('a status-only write during listGames preserves simPlan exactly', async () => {
    const simPlan = { startedAt: new Date().toISOString(), quarterMs: 1000, events: [{ team: 'a', atMs: 1, points: 7 }] };
    const squares = new Array(100).fill(null);
    squares[7] = { name: 'Karen' };
    // 'started' with a final score: syncStatus flips it to 'finished' so
    // applyAutoCutoff writes — but cutoffPassed is false, so lockGame never
    // runs and nothing is allowed to change simPlan.
    const game = makeGame({
      status: 'started',
      axisX: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      axisY: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      results: { final: { a: 31, b: 38 } },
      squares,
      players: { Karen: { paid: false } },
      simulation: true,
      simPlan
    });
    await store.createGame(game);

    const row = (await store.listGames()).find(g => g.id === game.id);
    eq(row.status, 'finished', 'syncStatus must have flipped the status, forcing a write');

    const after = await store.getGame(game.id);
    eq(after.simPlan, simPlan, 'simPlan must be untouched by a status-only write');
    eq(after.squares[7], { name: 'Karen' }, 'the claimed square must be untouched');
    eq(after.players, { Karen: { paid: false } }, 'players must be untouched');
    eq(after.squares.length, 100, 'squares must still be a full grid');
  });

  await check('the trimmed projection still carries every summary field', async () => {
    const game = makeGame({
      status: 'finished',
      description: 'Super Bowl party',
      kickoffTime: '2026-02-08T23:30:00Z',
      teamAColor: '#336699',
      teamBColor: '#996633',
      results: { final: { a: 31, b: 38 } }
    });
    await store.createGame(game);

    const row = (await store.listGames()).find(g => g.id === game.id);
    assert(row, 'the game must be listed');
    for (const field of ['teamA', 'teamB', 'league', 'gameDate', 'status', 'updatedAt']) {
      assert(row[field] !== undefined && row[field] !== null, `${field} must be present`);
    }
    eq(row.description, 'Super Bowl party', 'description');
    eq(row.kickoffTime, '2026-02-08T23:30:00Z', 'kickoffTime');
    eq(row.teamAColor, '#336699', 'teamAColor');
    assert(row.squares === undefined, 'the summary must not carry the squares array');
  });

  // ---------- the conditional write ----------

  await check('a lost conditional write returns the winning document', async () => {
    const game = makeGame();
    const created = await store.createGame(game);
    const stale = created.updatedAt;

    const winner = await store.updateGame(game.id, makeGame({ id: game.id, teamA: 'Winner' }), stale);
    assert(winner.ok, 'the first write holds the expected token and must win');

    const loser = await store.updateGame(game.id, makeGame({ id: game.id, teamA: 'Loser' }), stale);
    assert(!loser.ok, 'the second write carries a stale token and must lose');
    assert(loser.game, 'the loser must be handed a document to show the user');
    eq(loser.game.teamA, 'Winner', 'that document must be the one that actually won');
  });

  await check('losing the write on a row that no longer exists returns null, not a crash', async () => {
    const game = makeGame();
    const created = await store.createGame(game);
    await store.deleteGame(game.id);
    await sql`insert into games (id, doc, updated_at) values (${game.id}, ${JSON.stringify(created)}::jsonb, now())`;

    // Race the losing write against the row disappearing. Whether the row
    // survives long enough to be re-read is timing-dependent; what must never
    // happen is a TypeError reading current[0].doc.
    const pending = store.updateGame(game.id, makeGame({ id: game.id, teamA: 'Racer' }), '2020-01-01T00:00:00.000Z');
    await sql`delete from games where id = ${game.id}`;
    const result = await pending;

    assert(!result.ok, 'the stale token must lose');
    assert(result.game === null || typeof result.game === 'object',
      'game must be null or a document, never a throw');
  });

  // ---------- report ----------

  for (const id of cleanupIds) {
    try { await store.deleteGame(id); } catch (e) { /* best effort */ }
  }

  console.log('');
  if (failures.length === 0) {
    console.log(`  All ${passed} tests passed.`);
    console.log('');
  } else {
    console.log(`  ${passed} passed, ${failures.length} FAILED:`);
    console.log('');
    failures.forEach(f => console.log(`  ✗ ${f}\n`));
    process.exitCode = 1;
  }
}

main();

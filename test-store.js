// Contract tests for the storage interface (lib/store.js) — see the
// concurrency contract documented at the top of that file. These exercise
// whichever backend lib/store.js currently points to, entirely through the
// five interface functions, so the same suite verifies store-pg.js once it
// exists without any changes here.
//
// Every game created below gets a fresh random UUID and is deleted in a
// finally block, so this is safe to run against the real data/ directory.
//
// Run with:  node test-store.js   (or: npm run test:store)
'use strict';

const crypto = require('crypto');
const store = require('./lib/store.js');

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

function eq(actual, expected, what) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what || 'value'}: expected ${b}, got ${a}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// A minimal but valid-shaped game. Only createGame/updateGame are exercised
// directly, so this does not need to satisfy GameLogic.validateGame — that
// check lives in server.js, not the store.
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
    payouts: { q1: 20, q2: 20, q3: 20, final: 40 },
    status: 'picking',
    squares: new Array(100).fill(null),
    axisX: null,
    axisY: null,
    results: {},
    players: {}
  }, overrides || {});
}

// ---------- report ----------

async function main() {
  // ---------- createGame ----------

  await check('createGame stamps createdAt and updatedAt', async () => {
    const g = makeGame();
    const created = await store.createGame(g);
    assert(created.createdAt, 'createdAt should be set');
    eq(created.updatedAt, created.createdAt, 'a brand-new game has equal createdAt/updatedAt');
  });

  await check('createGame persists — getGame reads it back', async () => {
    const g = makeGame({ teamA: 'Ravens', teamB: 'Broncos' });
    await store.createGame(g);
    const read = await store.getGame(g.id);
    assert(read, 'game should be readable after creation');
    eq(read.teamA, 'Ravens', 'teamA');
    eq(read.teamB, 'Broncos', 'teamB');
  });

  // ---------- getGame / deleteGame ----------

  await check('getGame returns null for an unknown id', async () => {
    eq(await store.getGame(crypto.randomUUID()), null, 'unknown game');
  });

  await check('deleteGame returns false for an unknown id', async () => {
    eq(await store.deleteGame(crypto.randomUUID()), false, 'unknown game delete');
  });

  await check('deleteGame removes a real game and reports true', async () => {
    const g = makeGame();
    await store.createGame(g);
    const ok = await store.deleteGame(g.id);
    eq(ok, true, 'delete result');
    eq(await store.getGame(g.id), null, 'game should be gone');
  });

  // ---------- listGames ----------

  await check('listGames includes a created game with the trimmed summary shape', async () => {
    const g = makeGame({ teamA: 'Bills', teamB: 'Dolphins', description: 'Test matchup' });
    await store.createGame(g);
    const games = await store.listGames();
    const found = games.find(x => x.id === g.id);
    assert(found, 'created game should appear in listGames');
    eq(found.teamA, 'Bills', 'teamA');
    eq(found.teamB, 'Dolphins', 'teamB');
    eq(found.league, 'nfl', 'league');
    eq(found.description, 'Test matchup', 'description');
    eq(found.status, 'picking', 'status');
    assert(found.updatedAt, 'updatedAt should be present');
    // The summary is trimmed — full fields like squares/results must not leak.
    assert(found.squares === undefined, 'listGames must not include squares');
    assert(found.results === undefined, 'listGames must not include results');
  });

  // ---------- updateGame: the concurrency contract ----------

  await check('updateGame: two tabs on the same version — the second is rejected', async () => {
    const g = makeGame();
    const created = await store.createGame(g);

    const tab1 = { ...created, teamA: 'Tab1 edit' };
    const r1 = await store.updateGame(g.id, tab1, created.updatedAt);
    assert(r1.ok, 'first save should succeed');

    const tab2 = { ...created, teamA: 'Tab2 edit' }; // stale token — created.updatedAt
    const r2 = await store.updateGame(g.id, tab2, created.updatedAt);
    assert(!r2.ok, 'second save with a stale token should be rejected');
    eq(r2.game.teamA, 'Tab1 edit', 'conflict response returns the winning document');

    const stored = await store.getGame(g.id);
    eq(stored.teamA, 'Tab1 edit', 'the loser must never reach disk');
  });

  await check('updateGame: a null expectedUpdatedAt overwrites unconditionally', async () => {
    const g = makeGame();
    await store.createGame(g);
    const r = await store.updateGame(g.id, { ...g, teamA: 'Blind write' }, null);
    assert(r.ok, 'a null token must never be treated as a conflict');
    eq((await store.getGame(g.id)).teamA, 'Blind write', 'the blind write should land');
  });

  await check('updateGame: an unknown id upserts rather than failing', async () => {
    const g = makeGame();
    const r = await store.updateGame(g.id, g, null); // never created first
    assert(r.ok, 'writing an unknown id should succeed');
    assert(r.game.createdAt, 'the upsert should stamp a fresh createdAt');
    assert(await store.getGame(g.id), 'the new document should be readable');
  });

  await check('updateGame: createdAt survives an update, updatedAt is re-stamped', async () => {
    const g = makeGame();
    const created = await store.createGame(g);
    await new Promise(resolve => setTimeout(resolve, 5));
    const r = await store.updateGame(g.id, { ...created, teamA: 'Renamed' }, created.updatedAt);
    eq(r.game.createdAt, created.createdAt, 'createdAt must be preserved');
    assert(r.game.updatedAt !== created.updatedAt, 'updatedAt must change on every write');
  });

  // ---------- auto cutoff on read ----------

  await check('getGame locks a picking game whose cutoff has already passed', async () => {
    const g = makeGame({
      status: 'picking',
      autoCutoffEnabled: true,
      autoCutoffTime: new Date(Date.now() - 60000).toISOString()
    });
    await store.createGame(g);
    const read = await store.getGame(g.id);
    eq(read.status, 'started', 'cutoff should lock the game to started');
    assert(Array.isArray(read.axisX) && read.axisX.length === 10, 'axisX should be drawn');
    assert(Array.isArray(read.axisY) && read.axisY.length === 10, 'axisY should be drawn');
  });

  await check('getGame leaves a picking game alone before its cutoff', async () => {
    const g = makeGame({
      status: 'picking',
      autoCutoffEnabled: true,
      autoCutoffTime: new Date(Date.now() + 60000).toISOString()
    });
    await store.createGame(g);
    const read = await store.getGame(g.id);
    eq(read.status, 'picking', 'should remain unlocked before the cutoff');
  });

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

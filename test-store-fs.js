// Tests for the fs backend's write durability (lib/store-fs.js).
//
// Deliberately NOT part of test-store.js: that suite is a backend-agnostic
// contract test and is meant to pass unchanged against Postgres. Everything
// here is specific to writing files, so it requires store-fs directly rather
// than going through lib/store.js.
//
// What this is defending. The atomic save writes a temp file and renames it
// over the target. On Windows that rename fails transiently when something
// else holds a handle on either path for a moment — OneDrive's sync engine or
// an antivirus scanner. Unretried, the host claims a square, the PUT 500s, the
// change is silently gone and an orphaned .tmp is left behind. It first showed
// up as a ~1-in-50 flake in the store tests.
//
// Run with:  node test-store-fs.js   (or: npm test)
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./lib/store-fs.js');

const DATA_DIR = path.join(__dirname, 'data');

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

function makeGame() {
  const id = crypto.randomUUID();
  cleanupIds.push(id);
  return {
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
  };
}

// Replaces fs.renameSync with one that fails `failures` times before working.
// store-fs looks the method up on the fs module at call time, so patching the
// property is enough.
const realRename = fs.renameSync;
function failRenameTimes(count, code) {
  let seen = 0;
  fs.renameSync = (from, to) => {
    if (seen++ < count) {
      const err = new Error(`simulated ${code} on rename`);
      err.code = code;
      throw err;
    }
    return realRename(from, to);
  };
  return () => seen;
}
function restoreRename() {
  fs.renameSync = realRename;
}

function tempFilesFor(id) {
  return fs.readdirSync(DATA_DIR).filter(n => n.startsWith(`${id}.json.`) && n.endsWith('.tmp'));
}

async function main() {

  await check('a transient rename failure is retried and the write still lands', async () => {
    const g = makeGame();
    const attempts = failRenameTimes(2, 'EPERM');
    try {
      await store.createGame(g);
    } finally {
      restoreRename();
    }
    eq(attempts(), 3, 'rename attempts (2 failures then success)');
    const read = await store.getGame(g.id);
    assert(read, 'the game must exist after a retried write');
    eq(read.teamA, 'Chiefs', 'the document must be intact');
    eq(tempFilesFor(g.id).length, 0, 'no temp file may be left behind');
  });

  await check('every retryable rename code is retried', async () => {
    for (const code of ['EPERM', 'EACCES', 'EBUSY']) {
      const g = makeGame();
      const attempts = failRenameTimes(1, code);
      try {
        await store.createGame(g);
      } finally {
        restoreRename();
      }
      eq(attempts(), 2, `${code} must be retried`);
      assert(await store.getGame(g.id), `${code}: the game must exist afterwards`);
    }
  });

  await check('a persistent failure gives up, throws, and leaves no litter', async () => {
    const g = makeGame();
    const attempts = failRenameTimes(Infinity, 'EPERM');
    let threw = null;
    try {
      await store.createGame(g);
    } catch (e) {
      threw = e;
    } finally {
      restoreRename();
    }
    assert(threw, 'a permanently failing rename must surface as an error, not a silent loss');
    eq(threw.code, 'EPERM', 'the original error code must survive');
    eq(attempts(), 5, 'it must stop after RENAME_ATTEMPTS rather than spinning');
    // The point of the unlink in the failure path: a save that could not be
    // completed must not seed the data folder with orphans.
    eq(tempFilesFor(g.id).length, 0, 'the temp file must be cleaned up on failure');
  });

  await check('a non-retryable error fails fast instead of burning the backoff', async () => {
    const g = makeGame();
    const attempts = failRenameTimes(Infinity, 'ENOSPC');
    let threw = null;
    const started = Date.now();
    try {
      await store.createGame(g);
    } catch (e) {
      threw = e;
    } finally {
      restoreRename();
    }
    eq(threw && threw.code, 'ENOSPC', 'the error must propagate');
    eq(attempts(), 1, 'a disk-full error must not be retried');
    assert(Date.now() - started < 50, 'it must not sleep through the backoff for an unretryable error');
  });

  await check('retrying does not corrupt or duplicate the stored document', async () => {
    const g = makeGame();
    await store.createGame(g);
    g.squares[0] = { name: 'Steve' };
    const first = await store.getGame(g.id);

    const attempts = failRenameTimes(3, 'EBUSY');
    let result;
    try {
      result = await store.updateGame(g.id, g, first.updatedAt);
    } finally {
      restoreRename();
    }
    eq(attempts(), 4, 'three failures then success');
    assert(result.ok, 'the conditional write must still succeed');
    const read = await store.getGame(g.id);
    eq(read.squares[0], { name: 'Steve' }, 'the claimed square must be persisted exactly once');
    eq(read.squares.filter(Boolean).length, 1, 'no duplicate writes');
    eq(tempFilesFor(g.id).length, 0, 'no temp file left behind');
  });

  // ---------- startup sweep ----------

  await check('startup clears abandoned temp files but spares in-flight ones', async () => {
    const stale = path.join(DATA_DIR, 'aaaaaaaa-0000-4000-8000-00000000dead.json.99999.tmp');
    const fresh = path.join(DATA_DIR, 'bbbbbbbb-0000-4000-8000-00000000live.json.99999.tmp');
    fs.writeFileSync(stale, '{}');
    fs.writeFileSync(fresh, '{}');
    // Backdate one past the sweep's age threshold.
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(stale, old, old);

    try {
      // The sweep runs at import, so re-import to trigger it.
      for (const k of Object.keys(require.cache)) {
        if (k.includes('store-fs')) delete require.cache[k];
      }
      require('./lib/store-fs.js');

      assert(!fs.existsSync(stale), 'an abandoned temp file must be swept');
      // The critical half: another process may be mid-write right now, and
      // deleting its temp file would corrupt that write.
      assert(fs.existsSync(fresh), 'a recent temp file must be left alone');
    } finally {
      for (const f of [stale, fresh]) {
        try { fs.unlinkSync(f); } catch (e) { /* already gone */ }
      }
    }
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

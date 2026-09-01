// Zero-dependency tests for the ESPN lookup throttle (server-livescore.js).
//
// This is the logic that decides how much traffic a roomful of phones sends to
// an unofficial, undocumented endpoint. It has already been wrong twice in
// ways that were invisible on a laptop and severe on a serverless host, so the
// properties below are pinned down rather than left to inspection:
//
//   * the throttle must survive a process that shares no memory with the last
//     one (every serverless invocation is a fresh instance), and
//   * the slot must be claimed BEFORE the network call, or the whole ESPN
//     round trip is a window in which everyone else still gets through.
//
// No network: global.fetch is stubbed throughout, so a regression that starts
// calling ESPN for real shows up as a count, not as a slow test.
//
// Run with:  node test-livescore.js   (or: npm test)
'use strict';

let passed = 0;
const failures = [];

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

// ---------- harness ----------

let espnCalls = 0;
let order = [];

// findEvent fans out to three dates, so one lookup is three fetches. The stub
// answers with an empty schedule: no match, which is deliberately the WORST
// case — it is the shape an ESPN outage takes, and the case both previous
// throttles failed to cover.
global.fetch = async () => {
  espnCalls++;
  order.push('fetch');
  return { ok: true, json: async () => ({ events: [] }) };
};

const FETCHES_PER_LOOKUP = 3;

// Every serverless invocation is a separate instance with its own module-level
// Maps. Re-requiring after dropping the cache entry is the closest thing to
// that in one process — and it is precisely the condition a process-local
// throttle cannot detect.
function freshInstance() {
  for (const k of Object.keys(require.cache)) {
    if (k.includes('server-livescore')) delete require.cache[k];
  }
  return require('./server-livescore.js');
}

function startedGame(overrides) {
  return Object.assign({
    id: 'game-under-test',
    status: 'started',
    teamA: 'Seahawks',
    teamB: 'Giants',
    league: 'nfl'
  }, overrides || {});
}

const minutesAgo = (n) => new Date(Date.now() - n * 60000).toISOString();

function reset() {
  espnCalls = 0;
  order = [];
}

// Stands in for lib/api.js's claimSlot: the store's conditional write, where
// every concurrent reader carries the same expectedUpdatedAt and exactly one
// can win. `row` is the single shared document all the callers contend for.
function makeRow() {
  return { updatedAt: 't0', writes: 0 };
}

function claimAgainst(row, expectedUpdatedAt, game) {
  return async () => {
    // Yield, so concurrent claimants genuinely interleave here rather than
    // running to completion one at a time.
    await new Promise(r => setImmediate(r));
    if (expectedUpdatedAt !== row.updatedAt) return false;
    row.updatedAt = `t${++row.writes}`;
    row.liveCheckedAt = game.liveCheckedAt;
    return true;
  };
}

async function run() {

  // ---------- what is worth looking up at all ----------

  await check('a game that has not started is never looked up', async () => {
    reset();
    const LS = freshInstance();
    for (const status of ['setup', 'picking', 'finished']) {
      const changed = await LS.refreshLiveScore(startedGame({ status }), async () => true);
      eq(changed, false, `${status} must report no change`);
    }
    eq(espnCalls, 0, 'ESPN calls');
  });

  await check('a simulated game needs no network and claims no slot', async () => {
    reset();
    const LS = freshInstance();
    let claimed = false;
    const game = startedGame({ simulation: true, simPlan: null });
    await LS.refreshLiveScore(game, async () => { claimed = true; return true; });
    eq(espnCalls, 0, 'ESPN calls');
    assert(!claimed, 'a simulated game must not consume the ESPN slot');
  });

  // ---------- the throttle ----------

  await check('a first look-up fans out to three dates and stamps the game', async () => {
    reset();
    const LS = freshInstance();
    const game = startedGame();
    await LS.refreshLiveScore(game, async () => true);
    eq(espnCalls, FETCHES_PER_LOOKUP, 'ESPN calls');
    assert(game.liveCheckedAt, 'liveCheckedAt must be stamped');
  });

  await check('the throttle survives a process that shares no memory', async () => {
    reset();
    const game = startedGame();

    await freshInstance().refreshLiveScore(game, async () => true);
    const afterFirst = espnCalls;
    eq(afterFirst, FETCHES_PER_LOOKUP, 'first instance must look up');

    // A different instance, handed the same persisted document. Nothing but
    // game.liveCheckedAt carries over — which is the entire point.
    const changed = await freshInstance().refreshLiveScore(game, async () => true);
    eq(espnCalls - afterFirst, 0, 'a fresh instance must be throttled by the persisted stamp');
    eq(changed, false, 'a throttled call reports no change');
  });

  await check('the throttle releases once the stamp is old enough', async () => {
    reset();
    const game = startedGame({ liveCheckedAt: minutesAgo(1) });
    await freshInstance().refreshLiveScore(game, async () => true);
    eq(espnCalls, FETCHES_PER_LOOKUP, 'an expired stamp must allow a fresh look-up');
  });

  await check('a stamp dated in the future is treated as stale, not as a block', async () => {
    reset();
    // Clock skew or a hand-edited document must not be able to switch live
    // scores off indefinitely.
    const game = startedGame({ liveCheckedAt: new Date(Date.now() + 3600000).toISOString() });
    await freshInstance().refreshLiveScore(game, async () => true);
    eq(espnCalls, FETCHES_PER_LOOKUP, 'a future stamp must not block look-ups');
  });

  // ---------- the claim ----------

  await check('the slot is claimed BEFORE the network call, not after', async () => {
    reset();
    const LS = freshInstance();
    await LS.refreshLiveScore(startedGame(), async () => { order.push('claim'); return true; });
    // The whole fix in one assertion: everything after the claim is protected
    // by it, and anything fetched before it happened outside the throttle.
    eq(order[0], 'claim', 'the claim must be awaited before the first fetch');
    eq(order.filter(o => o === 'claim').length, 1, 'exactly one claim per look-up');
  });

  await check('losing the claim costs nothing — no fetch at all', async () => {
    reset();
    const LS = freshInstance();
    const changed = await LS.refreshLiveScore(startedGame(), async () => false);
    eq(espnCalls, 0, 'a lost claim must not reach ESPN');
    eq(changed, false, 'a lost claim reports no change');
  });

  await check('fifty concurrent instances produce exactly one ESPN look-up', async () => {
    reset();
    const row = makeRow();
    const N = 50;

    // Fifty separate instances, each having just read the same document — the
    // shape of a full room refreshing at once behind a serverless host.
    const results = await Promise.all(Array.from({ length: N }, async () => {
      const LS = freshInstance();
      const game = startedGame({ updatedAt: row.updatedAt });
      return LS.refreshLiveScore(game, claimAgainst(row, game.updatedAt, game));
    }));

    eq(espnCalls, FETCHES_PER_LOOKUP, 'exactly one look-up may reach ESPN');
    eq(row.writes, 1, 'exactly one claim may win the conditional write');
    eq(results.filter(Boolean).length, 0, 'an empty schedule changes nothing');
  });

  await check('a failed ESPN look-up still leaves the claim in place', async () => {
    reset();
    const LS = freshInstance();
    const game = startedGame();
    const boom = global.fetch;
    global.fetch = async () => { espnCalls++; throw new Error('ESPN is down'); };
    try {
      await LS.refreshLiveScore(game, async () => true);
    } finally {
      global.fetch = boom;
    }
    // An outage must be throttled like any other attempt. This is exactly the
    // case the old liveScore.updatedAt throttle missed, because nothing about
    // the score changed and so nothing was ever written.
    assert(game.liveCheckedAt, 'liveCheckedAt must survive a failed look-up');
    const second = freshInstance();
    const before = espnCalls;
    await second.refreshLiveScore(game, async () => true);
    eq(espnCalls - before, 0, 'a fresh instance must be throttled after a failed look-up');
  });

  // ---------- report ----------

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

run();

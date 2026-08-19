// Polls ESPN's public (unofficial, undocumented) NFL scoreboard endpoint for
// any game that is locked and in progress, so the grid can show a live score
// and so Q1/Q2/Q3/Final can fill themselves in as each quarter ends. This is
// strictly best-effort: if ESPN is unreachable, changes its response shape, or
// doesn't recognize a team name, nothing updates and manual entry (board
// screen / phone) keeps working exactly as before.
const GameLogic = require('./public/compute.js');
const TeamData = require('./public/teams.js');

const SCOREBOARD_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
// Real ESPN lookups are throttled per game rather than run on a timer, so that
// however many clients are polling the board, an unofficial endpoint sees at
// most one request per game in this window.
const ESPN_MIN_INTERVAL_MS = 20000;
const FETCH_TIMEOUT_MS = 8000;

function pad2(n) { return String(n).padStart(2, '0'); }
function dateStr(d) { return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`; }

// 'other' (a custom, non-ESPN-tracked matchup) has no scoreboard endpoint at
// all — every ESPN-backed lookup below short-circuits to null/[] for it.
function scoreboardUrl(league) {
  const sport = TeamData.LEAGUE_SPORT[league];
  if (!sport) return null;
  return `${SCOREBOARD_BASE}/${sport}/${league}/scoreboard`;
}

async function fetchScoreboard(dates, league) {
  const base = scoreboardUrl(league);
  if (!base) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}?dates=${dates}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function abbrOf(name, league) {
  const meta = TeamData.findTeamMeta(name, league);
  return meta ? meta.abbr : null;
}

// Finds the ESPN competition matching both team names within the given
// league. Checks yesterday/today/tomorrow (server-local dates) so a game near
// midnight is never missed just because the server and ESPN disagree on what
// "today" is.
async function findEvent(teamA, teamB, league) {
  const abbrA = abbrOf(teamA, league);
  const abbrB = abbrOf(teamB, league);
  if (!abbrA || !abbrB) return null;

  const now = new Date();
  for (const offset of [0, -1, 1]) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    const data = await fetchScoreboard(dateStr(d), league);
    if (!data || !Array.isArray(data.events)) continue;
    for (const ev of data.events) {
      const comp = ev.competitions && ev.competitions[0];
      if (!comp) continue;
      const abbrs = (comp.competitors || [])
        .map(c => c.team && c.team.abbreviation && c.team.abbreviation.toLowerCase());
      if (abbrs.includes(abbrA) && abbrs.includes(abbrB)) return comp;
    }
  }
  return null;
}

// A competitor's cumulative score through (and including) quarter n, or null
// if ESPN hasn't posted that quarter's line yet.
function cumulativeThrough(competitor, n) {
  const lines = competitor.linescores || [];
  if (!lines.some(s => s.period === n)) return null;
  return lines.filter(s => s.period <= n).reduce((sum, s) => sum + (Number(s.value) || 0), 0);
}

function hasScore(entry) {
  return !!entry && entry.a !== null && entry.a !== undefined && entry.a !== ''
    && entry.b !== null && entry.b !== undefined && entry.b !== '';
}

// Shared by the real ESPN path and the simulation path: stamps `game.liveScore`
// and backfills results.q1/q2/q3/final as each quarter ends, never touching a
// quarter that already has a score. `quarterScoreAt(n)` returns `{a, b}` (the
// cumulative score through the end of quarter n) or null if that quarter's
// data isn't available yet.
function applyLive(game, live, quarterScoreAt) {
  let changed = false;
  const prev = game.liveScore;
  if (!prev || prev.a !== live.a || prev.b !== live.b || prev.period !== live.period
    || prev.clock !== live.clock || prev.state !== live.state) {
    game.liveScore = live;
    changed = true;
  }

  if (!game.results) game.results = {};
  const quarterPeriod = { q1: 1, q2: 2, q3: 3 };
  Object.keys(quarterPeriod).forEach(q => {
    const n = quarterPeriod[q];
    const entry = game.results[q] || {};
    if (hasScore(entry)) return;
    const quarterOver = live.completed || (live.state === 'in' && live.period > n);
    if (!quarterOver) return;
    const score = quarterScoreAt(n);
    if (!score) return;
    game.results[q] = Object.assign({}, entry, score);
    changed = true;
  });

  if (live.completed) {
    const entry = game.results.final || {};
    if (!hasScore(entry)) {
      game.results.final = Object.assign({}, entry, { a: live.a, b: live.b });
      changed = true;
    }
  }

  return changed;
}

// Mutates `game` in place. Returns true if anything actually changed, so the
// caller only writes/bumps updatedAt when there's something new to show.
function applyLiveData(game, comp) {
  const abbrA = abbrOf(game.teamA, game.league);
  const competitors = comp.competitors || [];
  const compA = competitors.find(c => c.team && c.team.abbreviation && c.team.abbreviation.toLowerCase() === abbrA);
  const compB = competitors.find(c => c && c !== compA);
  if (!compA || !compB) return false;

  const status = comp.status || {};
  const type = status.type || {};
  const live = {
    a: Number(compA.score) || 0,
    b: Number(compB.score) || 0,
    period: status.period || 0,
    clock: status.displayClock || '',
    state: type.state || 'pre',
    completed: !!type.completed,
    updatedAt: new Date().toISOString()
  };

  return applyLive(game, live, (n) => {
    const a = cumulativeThrough(compA, n);
    const b = cumulativeThrough(compB, n);
    return (a === null || b === null) ? null : { a, b };
  });
}

// The Simulation Mode equivalent of applyLiveData: no network call, just a
// pure function of wall-clock time against the plan generated when the host
// clicked "Generate Numbers" (see GameLogic.lockGame / buildSimPlan).
function applySimulatedData(game) {
  const plan = game.simPlan;
  if (!plan) return false;
  const state = GameLogic.simLiveState(plan, Date.now());
  const live = {
    a: state.a, b: state.b, period: state.period, clock: state.clock,
    state: state.state, completed: state.completed,
    updatedAt: new Date().toISOString(), simulation: true
  };

  return applyLive(game, live, (n) => ({
    a: GameLogic.simCumulativeThroughQuarter(plan, 'a', n),
    b: GameLogic.simCumulativeThroughQuarter(plan, 'b', n)
  }));
}

// Games for a given date (YYYY-MM-DD, defaults to today) in the given league,
// for the New Game setup screen's "Games" picker. Returns null if ESPN
// couldn't be reached at all (distinct from a real empty schedule, which
// returns []) so the caller can tell those two cases apart. 'other' has no
// ESPN schedule at all, so it always resolves to an empty list.
async function getTodaysGames(ymd, league) {
  if (!TeamData.LEAGUE_SPORT[league]) return [];
  const dates = ymd ? ymd.replace(/-/g, '') : dateStr(new Date());
  const data = await fetchScoreboard(dates, league);
  if (!data) return null;
  if (!Array.isArray(data.events)) return [];
  return data.events.map(ev => {
    const comp = ev.competitions && ev.competitions[0];
    if (!comp) return null;
    const competitors = comp.competitors || [];
    const away = competitors.find(c => c.homeAway === 'away');
    const home = competitors.find(c => c.homeAway === 'home');
    if (!away || !home) return null;
    const nameOf = c => (c.team && (c.team.displayName || c.team.name)) || '';
    const teamA = nameOf(away);
    const teamB = nameOf(home);
    if (!teamA || !teamB) return null;
    // `raw` is ESPN's whole event object for this matchup, unmodified — kept
    // only so the setup screen's "Details" button can show the host exactly
    // what the API returned, for troubleshooting a bad match.
    return { teamA, teamB, raw: ev };
  }).filter(Boolean);
}

// Last completed ESPN check per game, for this process only. The persisted
// `liveScore.updatedAt` above is the real cross-process throttle, but it only
// advances when the score actually changed — so during a genuinely static
// stretch (pre-game, halftime, or an ESPN outage returning nothing) it would
// never move and every read would re-fetch. This backstop closes that gap.
const lastChecked = new Map();

// One in-flight ESPN lookup per game at a time. When a burst of clients polls
// the same game together, the first opens the request and the rest return the
// data they already have rather than queueing behind an 8s network timeout.
const inFlight = new Map();

function checkedRecently(game, now) {
  const stamps = [
    game.liveScore && game.liveScore.updatedAt ? Date.parse(game.liveScore.updatedAt) : null,
    lastChecked.get(game.id)
  ];
  return stamps.some(t => {
    if (!t) return false;
    const age = now - t;
    // A negative age means a clock skew or a hand-edited timestamp from the
    // future; treat that as stale rather than blocking lookups indefinitely.
    return age >= 0 && age < ESPN_MIN_INTERVAL_MS;
  });
}

// Mutates `game` in place and returns true if anything changed, so the caller
// knows to persist it. This replaces the old background poller: a game is now
// only ever looked up because somebody is actually looking at it, which is
// what makes the app work on a host with no long-lived process — and means no
// ESPN traffic at all when nobody has the board open.
async function refreshLiveScore(game) {
  // Only games that are locked and not yet finished are worth tracking;
  // setup/picking games have no score yet and a finished game already has its
  // final score.
  if (!game || game.status !== 'started') return false;

  // A simulated game is a pure function of wall clock against the plan drawn
  // at lock time — no network call, so there is nothing to throttle.
  if (game.simulation) return applySimulatedData(game);

  const now = Date.now();
  if (checkedRecently(game, now)) return false;
  // Check-then-set with no await in between, so the event loop cannot
  // interleave another request between these two lines.
  if (inFlight.has(game.id)) return false;

  const work = (async () => {
    const comp = await findEvent(game.teamA, game.teamB, game.league);
    return applyLiveData(game, comp || {});
  })();
  inFlight.set(game.id, work);

  try {
    return await work;
  } catch (e) {
    // Best-effort by design: a failed lookup leaves the game untouched and
    // manual score entry keeps working exactly as before.
    console.error(`Live score refresh failed for ${game.id}: ${e.message}`);
    return false;
  } finally {
    lastChecked.set(game.id, Date.now());
    inFlight.delete(game.id);
  }
}

module.exports = { refreshLiveScore, getTodaysGames };

# Cloud Migration Plan — $uper-$quares

Moving from a LAN-hosted Node server to Vercel + Neon, while keeping the local/LAN
version working from the same codebase.

**Strategy:** one repo, one codebase, two deployment targets. Storage goes behind an
interface with two backends (`fs` for local, Postgres for cloud). Work happens on the
`cloud` branch; `master` stays shippable throughout.

**Estimate:** ~9–12 hours of build time, excluding account setup and waiting on deploys.

**Existing `data/*.json` is test data and is not migrated.** The cloud database starts
empty.

---

## Model tier legend

| Tier | Use for | Steps |
|---|---|---|
| Human | Account creation, credentials, verification | 0.3, 0.4, 2.4, 3.6, 5.1, 5.2 |
| Haiku | Mechanical edits, known commands, deletion to a list | 0.1, 0.2, 2.3, 3.3, 3.5, 5.3 |
| Sonnet | Contained refactors, known patterns, config | 1.1, 2.1, 2.2, 3.1, 3.2, 3.4, 4.2 |
| Opus | Design changes, correctness-critical, security | 1.2, 1.3, 4.1 |

---

## Phase 0 — Safety net and accounts

Nothing is modified in this phase. It exists so every later step is reversible.

### 0.1 Tag the working local version — `Haiku` — ~2 min

```
git tag local-lan-v1
git push origin local-lan-v1
```

This is the rollback point.

### 0.2 Create the working branch — `Haiku` — ~1 min

```
git checkout -b cloud
```

### 0.3 Create the Neon project — `Human` — ~10 min

Create a project, choose a region near you, copy the **pooled** connection string (the
one containing `-pooler`). Serverless functions open many short-lived connections; the
direct string will exhaust the connection limit. Store it in `.env.local` and add
`.env*` to `.gitignore`.

### 0.4 Link Vercel to GitHub — `Human` — ~10 min

Sign in to Vercel with GitHub and import `steveisgreat/super-bowl-squares`.

Vercel **always deploys on project creation** — there is no import-without-deploy option.
That first deploy will be broken, and that is expected: there is no `vercel.json` yet, so
nothing routes `/api/*` and `index.html` sits in `public/` rather than at the root. Phase
3 fixes it. It cannot affect anything locally.

On the import screen set **Framework Preset: Other**, and leave Build Command and Output
Directory empty — there is no build step. While you are there, add `DATABASE_URL` (the
pooled string from 0.3) as an environment variable scoped to all three environments, so
Phase 3 does not need a second trip.

Note that Production tracks `master`, and `cloud` has not been pushed yet — so until you
push it, Vercel only ever builds `master`.

---

## Phase 1 — Local refactor, no cloud involved

The de-risking phase. Every change here is verified against the known-good local app
before Postgres or Vercel enter the picture.

### 1.1 Extract the storage interface — `Sonnet` — ~2 hr

Create `lib/store.js` defining the contract:

- `listGames()`
- `getGame(id)`
- `createGame(game)`
- `updateGame(id, game, expectedUpdatedAt)`
- `deleteGame(id)`

Create `lib/store-fs.js` implementing it by moving `gameFile`, `readGameFile`,
`writeGameFile`, `listGames` and `applyAutoCutoff` out of `server.js` (currently lines
78–134). Rewrite the `handleApi` handlers to call the interface instead of `fs` directly.

**Acceptance:** `npm start`, app behaves identically, `node test.js` passes.

### 1.2 Invert live scores to refresh-on-read — `Opus` — ~3 hr

The single genuine design change. `startLiveScorePolling` is a 5-second `setInterval`
over a long-lived process; that concept does not exist on Vercel.

- Delete the `setInterval` loop and its `fs` scan in `server-livescore.js`.
- Add `refreshLiveScore(game)` called from the `getGame` path.
- Throttle real ESPN lookups off `game.liveScore.updatedAt` so they fire at most once
  per ~20s per game regardless of how many clients are polling.
- Simulation mode needs no throttle — `simLiveState` is already a pure function of wall
  clock against `simPlan`, so it just computes on read.
- Must behave correctly when several requests arrive concurrently.

The client already polls every 8s (`screen-gameday.js:504`), so observable behavior
should be unchanged. This is also better locally: no ESPN traffic when nobody is
watching the board.

**Acceptance:** simulation mode still ticks the clock down; a real in-progress game still
backfills `results.q1/q2/q3` as quarters end.

### 1.3 Make the concurrency check atomic in the contract — `Opus` — ~1 hr

Today's optimistic concurrency (`server.js:190`) is a read-then-write, which is racy the
moment more than one process serves requests. Fold the check into
`updateGame(id, game, expectedUpdatedAt)` so the fs backend keeps today's behavior while
the Postgres backend can express it as a single conditional
`UPDATE ... WHERE updated_at = $expected`.

**Acceptance:** editing the same game in two browser tabs still produces the 409
"changed on another device" path.

> **Session note:** 1.1 is Sonnet, 1.2–1.3 are Opus. Escalate **in this session** — the
> Opus steps depend directly on the interface just designed.

---

## Phase 2 — Postgres backend, still running locally

Only the storage backend changes here. Running the *local* server against Neon proves the
Postgres implementation before Vercel is added as a second variable.

### 2.1 Create the Neon schema — `Sonnet` — ~30 min

```sql
create table games (
  id uuid primary key,
  doc jsonb not null,
  updated_at timestamptz not null
);
create index games_updated_at_idx on games (updated_at desc);
```

The whole-document model is preserved, so no field-by-field mapping is needed. Add
`@neondatabase/serverless` as a dependency.

### 2.2 Implement `lib/store-pg.js` — `Sonnet` — ~2 hr

Same interface as `store-fs.js`. `updateGame` becomes a single conditional UPDATE
returning a row count, so a zero-row result *is* the conflict.

### 2.3 Select the backend by environment — `Haiku` — ~15 min

`DATABASE_URL` present → Postgres, absent → fs. One small module.

### 2.4 Run the local server against Neon — `Human` — ~30 min

```
DATABASE_URL=... npm start
```

**This is the key checkpoint.** Create, edit, delete, and lock a game. Run a simulated
game end to end. If this works, the only remaining unknown is Vercel's runtime, not your
data layer.

> **Session note:** Phase 1 ends on Opus with a long transcript; Phase 2 is Sonnet and
> Haiku work that does not need it. **Start a new session** with a short brief (the
> interface shape from 1.1, plus the Neon connection details).

---

## Phase 3 — Vercel deployment

### 3.1 Add the serverless entry point — `Sonnet` — ~1 hr

`api/[...path].js` — a catch-all that imports and calls the existing `handleApi`. The
handlers are already framework-free `(req, res)` functions, so this is a thin wrapper,
not a rewrite.

### 3.2 Add `vercel.json` — `Sonnet` — ~45 min

Serve `public/` as static, route `/api/*` to the function. Expect iteration here; routing
config is the usual source of first-deploy friction.

### 3.3 Gate the LAN-only code — `Haiku` — ~45 min

Keep these in `server.js` only, out of anything `api/` imports: the selfsigned cert
generation, `startCombinedServer`'s byte-sniffing multiplexer, `localIPs()` and
`VIRTUAL_ADAPTER_RE`, `logStartup`, and the three `.bat` scripts. Roughly 150 lines that
simply never load in the cloud path.

### 3.4 Replace the `/api/hosts` round-trip — `Sonnet` — ~45 min

In the cloud there is one URL and the browser already knows it. Change the QR/link
generation at `screen-gameday.js:526` and `screen-player.js:393` to use
`location.origin` when no host list is available, keeping existing LAN behavior when
`/api/hosts` does respond.

### 3.5 Pin the Node version — `Haiku` — ~10 min

Add an `engines` field to `package.json` matching a Node version Vercel supports. You are
on v24.18.0 locally; do not assume the platform default matches.

### 3.6 Deploy to a preview URL — `Human` — ~30 min

Push the `cloud` branch; Vercel builds a preview URL automatically. Test from a phone on
**cellular data, not WiFi** — that is the case the whole migration exists to serve.

---

## Phase 4 — Access control

### 4.1 Decide and design the access model — `Opus` — ~1 hr

Today the LAN is the security boundary. On the public internet:

- `GET /api/games` enumerates **every** game anyone has created.
- `DELETE /api/game/:id` succeeds for anyone holding the id.

The enumeration endpoint is the blocker and must change regardless. Beyond that it is a
real choice: a per-game host passphrase, or accept unguessable UUIDs as the only
protection and stop listing games globally.

**Decision: one site-wide host session; the UUID is a read capability only.**

Neither option as written. Pure UUID-only fails on its own premise — the id is not
secret. It is on the player QR code (`#player-<id>`), the TV deep link (`#tv-<id>`) and
the score-entry link (`#score-<id>`), so every guest holds it, and it would authorize
`DELETE` and a whole-document `PUT`. A per-game passphrase is the wrong shape too: there
is one host, so it would add per-game secret storage and a "which phrase was that game?"
problem at a party, and still could not scope `/api/games`, since there is no per-game
identity to scope it by.

| Endpoint | Access |
|---|---|
| `GET /api/game/:id` | public — the id is the read capability |
| `GET /api/hosts` | public (empty in cloud; the player view needs it for the QR) |
| `GET /api/games` | host only — the enumeration blocker, closed |
| `POST /api/game`, `PUT /api/game/:id`, `DELETE /api/game/:id` | host only |
| `GET /api/todays-games` | host only — only setup uses it; no open ESPN proxy |

`HOST_PASSWORD` env var; `POST /api/session` checks it with `timingSafeEqual` and sets a
stateless signed cookie (`<expiry>.<HMAC-SHA256>`, 30 days). No session store, no schema
change, no new dependency. **`HOST_PASSWORD` unset disables auth entirely**, which is
what keeps the LAN server behaving exactly as before — the same switch idiom as
`DATABASE_URL` in `store.js`.

Consequences accepted: phone score entry needs the password (it is the same
whole-document write picking uses); the TV auto-jump in `app.js` falls through to Home
when unsigned rather than prompting on a remote control, and `#tv-<id>` still works; and
there is no real brute-force rate limit on serverless, only a fixed delay on failed
logins plus a long random password.

### 4.2 Implement the chosen model — `Opus` — ~2 hr — **done**

Retiered from Sonnet: 4.1 landed on cookie signing and constant-time comparison, which is
security-critical and expensive to unwind.

- `lib/auth.js` (new) — password check, signed-cookie issue/verify, `isHost(req)`.
- `lib/api.js` — `denyUnlessHost` guards, `/api/session` GET/POST/DELETE. Authorization
  is route-level, never in the store: the server-owned writes an anonymous read triggers
  (live-score refresh, `applyAutoCutoff`) must keep working.
- `public/core.js` — a 401 prompts sign-in once and replays the request, so existing call
  sites keep their shape; `{ prompt: false }` opts out for background polls and the TV.
- `public/ui.js` — `showPasswordPrompt`.
- `public/screen-home.js` — signed-out read-only state, sign-out button.
- `lib/store.js`, `store-fs.js`, `store-pg.js` — unchanged.

> **Session note:** 4.1 is a fresh security design question and Phase 3's deployment
> context is mostly irrelevant to it. **Start a new session** for 4.1, then **stay in
> it** for 4.2, which needs the decision just made.

---

## Phase 5 — Ship

### 5.1 Promote to production — `Human` — ~15 min

Optionally attach a custom domain. Vercel's generated URL works but is hard to read aloud
at a party.

### 5.2 Rehearse with a simulated game — `Human` — ~45 min

Run a full simulated game against production with several phones connected. This is the
only realistic load test before the day itself.

### 5.3 Merge to master — `Haiku` — ~10 min

Only after the cloud version has survived a real game.

---

## Open risks

**No test coverage on the layer being replaced.** `test.js` covers `public/compute.js`
only — pure money math and validation, which the migration does not touch. The storage
layer has zero automated coverage and is exactly what Phases 1 and 2 rewrite. Step 2.4 is
manual verification standing in for that. Worth deciding whether a handful of
store-contract tests are worth ~1 hr before starting Phase 2.

**ESPN's endpoint is unofficial and would be called from Vercel's shared IPs** rather
than your home IP. Rate-limiting or blocking is meaningfully more likely there. The code
already fails soft to manual entry, so it degrades rather than breaks.

**Neon's free tier autosuspends after ~5 minutes idle.** The first request after a quiet
spell absorbs a cold start. Irrelevant during a game, noticeable when opening the app
cold.

**Vercel's Hobby plan is non-commercial-use only.** A squares pool tracking real buy-ins
and payouts is at least arguable against that. Your account, your call — flagging it, not
blocking on it.

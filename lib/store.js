// Storage interface contract. Every backend (fs today, Postgres from Phase 2)
// implements these five functions with identical semantics, so callers never
// need to know which one is in use.
//
//   listGames()                              -> Promise<GameSummary[]>
//   getGame(id)                              -> Promise<Game|null>
//   createGame(game)                         -> Promise<Game>
//   updateGame(id, game, expectedUpdatedAt)  -> Promise<UpdateResult>
//   deleteGame(id)                           -> Promise<boolean>   // false = not found
//
// GameSummary is the trimmed shape listGames() returns: id, teamA, teamB,
// league, teamAColor, teamBColor, description, gameDate, kickoffTime,
// status, updatedAt.
//
// ---------------------------------------------------------------------------
// updateGame and optimistic concurrency
// ---------------------------------------------------------------------------
//
// Every client PUTs the whole game document, so without a concurrency check two
// devices editing at once silently overwrite each other. `expectedUpdatedAt` is
// the caller's assertion about what it last saw.
//
// The check and the write are ONE operation. Callers must never read, compare,
// and then write — that is racy the moment more than one process serves
// requests. The fs backend gets this from doing both inside a single
// synchronous run; Postgres expresses it as one conditional statement.
//
// Resolves to a tagged result, never a bare game, so the outcome can never be
// confused with a field that happens to exist on the document:
//
//   { ok: true,  game }  — written. `game` is the stored document, with a
//                          freshly stamped `updatedAt`.
//   { ok: false, game }  — NOT written, because someone else got there first.
//                          `game` is the current stored document, so the caller
//                          can show the user what it lost to.
//
// Three semantics that are easy to get subtly wrong in SQL, and are therefore
// part of the contract rather than an implementation detail:
//
//   1. `expectedUpdatedAt` null/absent means "I am not asserting anything —
//      overwrite unconditionally". It does NOT mean "expect a null column".
//      A naive `WHERE updated_at = $expected` inverts this: SQL null never
//      compares equal, so every such write would falsely report a conflict.
//      Postgres must branch to an unconditional UPDATE instead.
//
//   2. A STORED document with no `updatedAt` (written before the field existed)
//      also skips the check and is overwritten. There is no prior version to
//      compare against, so there is no conflict to detect.
//
//   3. updateGame UPSERTS. Writing an id that does not exist creates it rather
//      than failing, and stamps a fresh `createdAt`. An existing document keeps
//      its original `createdAt`.
//
// `createdAt` and `updatedAt` are owned by the store: it stamps them on write
// and callers must not set them by hand.

module.exports = process.env.DATABASE_URL
  ? require('./store-pg.js')
  : require('./store-fs.js');

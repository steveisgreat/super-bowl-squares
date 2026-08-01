// Entry point. Loaded last, once every module has registered itself on SBS.
(function () {
  'use strict';

  const SBS = window.SBS;
  const initial = SBS.parseInitialRoute();

  async function boot() {
    // A Samsung/LG TV browser opening the app fresh (no deep link) with
    // exactly one active game going on doesn't need the Home list at all —
    // skip straight to the grid it's there to show. Any other count (zero,
    // or several games running at once) still needs Home so the room can
    // pick.
    if (initial.screen === 'home' && SBS.ui.isTvBrowser()) {
      try {
        const games = await SBS.api.getGames();
        const active = games.filter(g => !SBS.isArchivedGame(g));
        if (active.length === 1) {
          SBS.go({ screen: 'tv', id: active[0].id });
          return;
        }
      } catch (e) {
        // Fall through to Home — better than a blank screen.
      }
    }
    SBS.go(initial);
  }

  boot();
})();

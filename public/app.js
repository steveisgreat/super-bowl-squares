// Entry point. Loaded last, once every module has registered itself on SBS.
(function () {
  'use strict';

  const SBS = window.SBS;
  SBS.go(SBS.parseInitialRoute());
})();

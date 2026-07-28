// Public team facts (names, brand colors, official abbreviations) used to
// auto-detect a matching team logo/colors from free-text team name input.
// Colors/abbreviations are factual data widely published in team brand guides.
// Logos are fetched at runtime from ESPN's public logo CDN by abbreviation —
// no logo images are bundled with this app.
(function (global) {
  'use strict';

  const NFL_TEAMS = [
    { names: ['arizona cardinals', 'cardinals', 'arizona'], abbr: 'ari', primary: '#97233F', secondary: '#000000' },
    { names: ['atlanta falcons', 'falcons', 'atlanta'], abbr: 'atl', primary: '#A71930', secondary: '#000000' },
    { names: ['baltimore ravens', 'ravens', 'baltimore'], abbr: 'bal', primary: '#241773', secondary: '#9E7C0C' },
    { names: ['buffalo bills', 'bills', 'buffalo'], abbr: 'buf', primary: '#00338D', secondary: '#C60C30' },
    { names: ['carolina panthers', 'panthers', 'carolina'], abbr: 'car', primary: '#0085CA', secondary: '#101820' },
    { names: ['chicago bears', 'bears', 'chicago'], abbr: 'chi', primary: '#0B162A', secondary: '#C83803' },
    { names: ['cincinnati bengals', 'bengals', 'cincinnati'], abbr: 'cin', primary: '#FB4F14', secondary: '#000000' },
    { names: ['cleveland browns', 'browns', 'cleveland'], abbr: 'cle', primary: '#311D00', secondary: '#FF3C00' },
    { names: ['dallas cowboys', 'cowboys', 'dallas'], abbr: 'dal', primary: '#003594', secondary: '#869397' },
    { names: ['denver broncos', 'broncos', 'denver'], abbr: 'den', primary: '#FB4F14', secondary: '#002244' },
    { names: ['detroit lions', 'lions', 'detroit'], abbr: 'det', primary: '#0076B6', secondary: '#B0B7BC' },
    { names: ['green bay packers', 'packers', 'green bay'], abbr: 'gb', primary: '#203731', secondary: '#FFB612' },
    { names: ['houston texans', 'texans', 'houston'], abbr: 'hou', primary: '#03202F', secondary: '#A71930' },
    { names: ['indianapolis colts', 'colts', 'indianapolis'], abbr: 'ind', primary: '#002C5F', secondary: '#A2AAAD' },
    { names: ['jacksonville jaguars', 'jaguars', 'jags', 'jacksonville'], abbr: 'jax', primary: '#101820', secondary: '#D7A22A' },
    { names: ['kansas city chiefs', 'chiefs', 'kansas city', 'kc'], abbr: 'kc', primary: '#E31837', secondary: '#FFB81C' },
    { names: ['las vegas raiders', 'raiders', 'las vegas', 'oakland raiders', 'oakland'], abbr: 'lv', primary: '#000000', secondary: '#A5ACAF' },
    { names: ['los angeles chargers', 'chargers', 'san diego chargers'], abbr: 'lac', primary: '#0080C6', secondary: '#FFC20E' },
    { names: ['los angeles rams', 'rams', 'st louis rams'], abbr: 'lar', primary: '#003594', secondary: '#FFA300' },
    { names: ['miami dolphins', 'dolphins', 'miami'], abbr: 'mia', primary: '#008E97', secondary: '#FC4C02' },
    { names: ['minnesota vikings', 'vikings', 'minnesota'], abbr: 'min', primary: '#4F2683', secondary: '#FFC62F' },
    { names: ['new england patriots', 'patriots', 'pats', 'new england'], abbr: 'ne', primary: '#002244', secondary: '#C60C30' },
    { names: ['new orleans saints', 'saints', 'new orleans'], abbr: 'no', primary: '#D3BC8D', secondary: '#101820' },
    { names: ['new york giants', 'giants', 'ny giants'], abbr: 'nyg', primary: '#0B2265', secondary: '#A71930' },
    { names: ['new york jets', 'jets', 'ny jets'], abbr: 'nyj', primary: '#125740', secondary: '#000000' },
    { names: ['philadelphia eagles', 'eagles', 'philadelphia', 'philly'], abbr: 'phi', primary: '#004C54', secondary: '#A5ACAF' },
    { names: ['pittsburgh steelers', 'steelers', 'pittsburgh'], abbr: 'pit', primary: '#FFB612', secondary: '#101820' },
    { names: ['san francisco 49ers', '49ers', 'niners', 'san francisco'], abbr: 'sf', primary: '#AA0000', secondary: '#B3995D' },
    { names: ['seattle seahawks', 'seahawks', 'seattle'], abbr: 'sea', primary: '#002244', secondary: '#69BE28' },
    { names: ['tampa bay buccaneers', 'buccaneers', 'bucs', 'tampa bay', 'tampa'], abbr: 'tb', primary: '#D50A0A', secondary: '#34302B' },
    { names: ['tennessee titans', 'titans', 'tennessee'], abbr: 'ten', primary: '#4B92DB', secondary: '#0C2340' },
    { names: ['washington commanders', 'commanders', 'washington football team', 'redskins', 'washington'], abbr: 'wsh', primary: '#5A1414', secondary: '#FFB612' }
  ];

  function normalize(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  }

  // Finds the best-matching team for free-text input. Prefers the longest
  // matching alias so e.g. "Kansas City Chiefs" beats an accidental partial hit.
  function findTeamMeta(input) {
    const norm = normalize(input);
    if (!norm) return null;
    let best = null;
    let bestLen = 0;
    NFL_TEAMS.forEach(team => {
      team.names.forEach(alias => {
        const a = normalize(alias);
        const re = new RegExp('(^|\\s)' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|\\s)');
        const matches = norm === a || re.test(norm);
        if (matches && a.length > bestLen) {
          best = team;
          bestLen = a.length;
        }
      });
    });
    return best;
  }

  function logoUrl(team) {
    if (!team) return null;
    return `https://a.espncdn.com/i/teamlogos/nfl/500/${team.abbr}.png`;
  }

  global.TeamData = { NFL_TEAMS, findTeamMeta, logoUrl };
})(window);

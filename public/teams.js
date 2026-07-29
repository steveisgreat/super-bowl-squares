// Public team facts (names, brand colors, official abbreviations) used to
// auto-detect a matching team logo/colors from free-text team name input.
// Colors/abbreviations are factual data widely published in team brand guides.
// Logos are fetched at runtime from ESPN's public logo CDN by abbreviation —
// no logo images are bundled with this app.
(function (global) {
  'use strict';

  // `font` is a free Google Font chosen to echo each team's real wordmark
  // style (see NFL_TEAM_FONTS below for the requested style/closest-match
  // notes) — the actual commercial fonts (Aachen Bold, Bank Gothic, Teko's
  // paid cousins, etc.) aren't freely licensable, so this is the nearest
  // free equivalent, reused across teams with a similar look to keep the
  // number of fonts loaded reasonable.
  const NFL_TEAMS = [
    { names: ['arizona cardinals', 'cardinals', 'arizona'], abbr: 'ari', primary: '#97233F', secondary: '#000000', font: "'Staatliches'" },
    { names: ['atlanta falcons', 'falcons', 'atlanta'], abbr: 'atl', primary: '#A71930', secondary: '#000000', font: "'Staatliches'" },
    { names: ['baltimore ravens', 'ravens', 'baltimore'], abbr: 'bal', primary: '#241773', secondary: '#9E7C0C', font: "'Bevan'" },
    { names: ['buffalo bills', 'bills', 'buffalo'], abbr: 'buf', primary: '#00338D', secondary: '#C60C30', font: "'Bebas Neue'" },
    { names: ['carolina panthers', 'panthers', 'carolina'], abbr: 'car', primary: '#0085CA', secondary: '#101820', font: "'Teko'" },
    { names: ['chicago bears', 'bears', 'chicago'], abbr: 'chi', primary: '#0B162A', secondary: '#C83803', font: "'Bevan'" },
    { names: ['cincinnati bengals', 'bengals', 'cincinnati'], abbr: 'cin', primary: '#FB4F14', secondary: '#000000', font: "'Staatliches'" },
    { names: ['cleveland browns', 'browns', 'cleveland'], abbr: 'cle', primary: '#311D00', secondary: '#FF3C00', font: "'Alfa Slab One'" },
    { names: ['dallas cowboys', 'cowboys', 'dallas'], abbr: 'dal', primary: '#003594', secondary: '#869397', font: "'Rye'" },
    { names: ['denver broncos', 'broncos', 'denver'], abbr: 'den', primary: '#FB4F14', secondary: '#002244', font: "'Staatliches'" },
    { names: ['detroit lions', 'lions', 'detroit'], abbr: 'det', primary: '#0076B6', secondary: '#B0B7BC', font: "'Anton'" },
    { names: ['green bay packers', 'packers', 'green bay'], abbr: 'gb', primary: '#203731', secondary: '#FFB612', font: "'Bebas Neue'" },
    { names: ['houston texans', 'texans', 'houston'], abbr: 'hou', primary: '#03202F', secondary: '#A71930', font: "'Bungee'" },
    { names: ['indianapolis colts', 'colts', 'indianapolis'], abbr: 'ind', primary: '#002C5F', secondary: '#A2AAAD', font: "'Zilla Slab'" },
    { names: ['jacksonville jaguars', 'jaguars', 'jags', 'jacksonville'], abbr: 'jax', primary: '#101820', secondary: '#D7A22A', font: "'Orbitron'" },
    { names: ['kansas city chiefs', 'chiefs', 'kansas city', 'kc'], abbr: 'kc', primary: '#E31837', secondary: '#FFB81C', font: "'Zilla Slab'" },
    { names: ['las vegas raiders', 'raiders', 'las vegas', 'oakland raiders', 'oakland'], abbr: 'lv', primary: '#000000', secondary: '#A5ACAF', font: "'Archivo Black'" },
    { names: ['los angeles chargers', 'chargers', 'san diego chargers'], abbr: 'lac', primary: '#0080C6', secondary: '#FFC20E', font: "'Teko'" },
    { names: ['los angeles rams', 'rams', 'st louis rams'], abbr: 'lar', primary: '#003594', secondary: '#FFA300', font: "'Oswald'" },
    { names: ['miami dolphins', 'dolphins', 'miami'], abbr: 'mia', primary: '#008E97', secondary: '#FC4C02', font: "'Oswald'" },
    { names: ['minnesota vikings', 'vikings', 'minnesota'], abbr: 'min', primary: '#4F2683', secondary: '#FFC62F', font: "'Zilla Slab'" },
    { names: ['new england patriots', 'patriots', 'pats', 'new england'], abbr: 'ne', primary: '#002244', secondary: '#C60C30', font: "'Anton'" },
    { names: ['new orleans saints', 'saints', 'new orleans'], abbr: 'no', primary: '#D3BC8D', secondary: '#101820', font: "'Rye'" },
    { names: ['new york giants', 'giants', 'ny giants'], abbr: 'nyg', primary: '#0B2265', secondary: '#A71930', font: "'Bungee'" },
    { names: ['new york jets', 'jets', 'ny jets'], abbr: 'nyj', primary: '#125740', secondary: '#000000', font: "'Archivo Black'" },
    { names: ['philadelphia eagles', 'eagles', 'philadelphia', 'philly'], abbr: 'phi', primary: '#004C54', secondary: '#A5ACAF', font: "'Alfa Slab One'" },
    { names: ['pittsburgh steelers', 'steelers', 'pittsburgh'], abbr: 'pit', primary: '#FFB612', secondary: '#101820', font: "'Oswald'" },
    { names: ['san francisco 49ers', '49ers', 'niners', 'san francisco'], abbr: 'sf', primary: '#AA0000', secondary: '#B3995D', font: "'Bevan'" },
    { names: ['seattle seahawks', 'seahawks', 'seattle'], abbr: 'sea', primary: '#002244', secondary: '#69BE28', font: "'Orbitron'" },
    { names: ['tampa bay buccaneers', 'buccaneers', 'bucs', 'tampa bay', 'tampa'], abbr: 'tb', primary: '#D50A0A', secondary: '#34302B', font: "'Share Tech Mono'" },
    { names: ['tennessee titans', 'titans', 'tennessee'], abbr: 'ten', primary: '#4B92DB', secondary: '#0C2340', font: "'Bebas Neue'" },
    { names: ['washington commanders', 'commanders', 'washington football team', 'redskins', 'washington'], abbr: 'wsh', primary: '#5A1414', secondary: '#FFB612', font: "'Stardos Stencil'" }
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

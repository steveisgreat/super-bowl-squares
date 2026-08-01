// Public team facts (names, brand colors, official abbreviations) used to
// auto-detect a matching team logo/colors from free-text team name input.
// Colors/abbreviations are factual data widely published in team brand guides.
// Logos are fetched at runtime from ESPN's public logo CDN by abbreviation —
// no logo images are bundled with this app.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TeamData = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // `font` is a free Google Font chosen to echo each team's real wordmark
  // style — the actual commercial fonts aren't freely licensable, so this is
  // the nearest free equivalent, reused across teams with a similar look to
  // keep the number of fonts loaded reasonable.
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

  // Same idea for the NBA — official brand colors, and a free-font echo of
  // each team's wordmark style, reused from the same pool as the NFL set.
  const NBA_TEAMS = [
    { names: ['atlanta hawks', 'hawks', 'atlanta'], abbr: 'atl', primary: '#E03A3E', secondary: '#C1D32F', font: "'Oswald'" },
    { names: ['boston celtics', 'celtics', 'boston'], abbr: 'bos', primary: '#007A33', secondary: '#BA9653', font: "'Zilla Slab'" },
    { names: ['brooklyn nets', 'nets', 'brooklyn'], abbr: 'bkn', primary: '#000000', secondary: '#777D84', font: "'Archivo Black'" },
    { names: ['charlotte hornets', 'hornets', 'charlotte'], abbr: 'cha', primary: '#1D1160', secondary: '#00788C', font: "'Teko'" },
    { names: ['chicago bulls', 'bulls', 'chicago'], abbr: 'chi', primary: '#CE1141', secondary: '#000000', font: "'Bebas Neue'" },
    { names: ['cleveland cavaliers', 'cavaliers', 'cavs', 'cleveland'], abbr: 'cle', primary: '#6F263D', secondary: '#FFB81C', font: "'Anton'" },
    { names: ['dallas mavericks', 'mavericks', 'mavs', 'dallas'], abbr: 'dal', primary: '#00538C', secondary: '#002B5E', font: "'Oswald'" },
    { names: ['denver nuggets', 'nuggets', 'denver'], abbr: 'den', primary: '#0E2240', secondary: '#FEC524', font: "'Bevan'" },
    { names: ['detroit pistons', 'pistons', 'detroit'], abbr: 'det', primary: '#C8102E', secondary: '#1D42BA', font: "'Bungee'" },
    { names: ['golden state warriors', 'warriors', 'golden state', 'gsw'], abbr: 'gs', primary: '#1D428A', secondary: '#FFC72C', font: "'Zilla Slab'" },
    { names: ['houston rockets', 'rockets', 'houston'], abbr: 'hou', primary: '#CE1141', secondary: '#000000', font: "'Staatliches'" },
    { names: ['indiana pacers', 'pacers', 'indiana'], abbr: 'ind', primary: '#002D62', secondary: '#FDBB30', font: "'Teko'" },
    { names: ['la clippers', 'clippers', 'los angeles clippers'], abbr: 'lac', primary: '#C8102E', secondary: '#1D428A', font: "'Archivo Black'" },
    { names: ['la lakers', 'lakers', 'los angeles lakers'], abbr: 'lal', primary: '#552583', secondary: '#FDB927', font: "'Oswald'" },
    { names: ['memphis grizzlies', 'grizzlies', 'memphis'], abbr: 'mem', primary: '#5D76A9', secondary: '#12173F', font: "'Bevan'" },
    { names: ['miami heat', 'heat', 'miami'], abbr: 'mia', primary: '#98002E', secondary: '#F9A01B', font: "'Staatliches'" },
    { names: ['milwaukee bucks', 'bucks', 'milwaukee'], abbr: 'mil', primary: '#00471B', secondary: '#EEE1C6', font: "'Anton'" },
    { names: ['minnesota timberwolves', 'timberwolves', 'wolves', 'minnesota'], abbr: 'min', primary: '#0C2340', secondary: '#236192', font: "'Zilla Slab'" },
    { names: ['new orleans pelicans', 'pelicans', 'new orleans'], abbr: 'no', primary: '#0C2340', secondary: '#C8102E', font: "'Rye'" },
    { names: ['new york knicks', 'knicks', 'ny knicks', 'new york'], abbr: 'ny', primary: '#006BB6', secondary: '#F58426', font: "'Bungee'" },
    { names: ['oklahoma city thunder', 'thunder', 'okc', 'oklahoma city'], abbr: 'okc', primary: '#007AC1', secondary: '#EF3B24', font: "'Orbitron'" },
    { names: ['orlando magic', 'magic', 'orlando'], abbr: 'orl', primary: '#0077C0', secondary: '#C4CED4', font: "'Oswald'" },
    { names: ['philadelphia 76ers', '76ers', 'sixers', 'philadelphia', 'philly'], abbr: 'phi', primary: '#006BB6', secondary: '#ED174C', font: "'Alfa Slab One'" },
    { names: ['phoenix suns', 'suns', 'phoenix'], abbr: 'phx', primary: '#1D1160', secondary: '#E56020', font: "'Teko'" },
    { names: ['portland trail blazers', 'trail blazers', 'blazers', 'portland'], abbr: 'por', primary: '#E03A3E', secondary: '#000000', font: "'Bebas Neue'" },
    { names: ['sacramento kings', 'kings', 'sacramento'], abbr: 'sac', primary: '#5A2D81', secondary: '#63727A', font: "'Share Tech Mono'" },
    { names: ['san antonio spurs', 'spurs', 'san antonio'], abbr: 'sa', primary: '#C4CED4', secondary: '#000000', font: "'Anton'" },
    { names: ['toronto raptors', 'raptors', 'toronto'], abbr: 'tor', primary: '#CE1141', secondary: '#000000', font: "'Archivo Black'" },
    { names: ['utah jazz', 'jazz', 'utah'], abbr: 'utah', primary: '#002B5C', secondary: '#F9A01B', font: "'Staatliches'" },
    { names: ['washington wizards', 'wizards', 'washington'], abbr: 'wsh', primary: '#002B5C', secondary: '#E31837', font: "'Stardos Stencil'" }
  ];

  // Which ESPN "sport" family each supported league belongs to, needed to
  // build the scoreboard/logo CDN URLs (`.../sports/{sport}/{league}/...`).
  const LEAGUE_SPORT = { nfl: 'football', nba: 'basketball' };

  const LEAGUES = {
    nfl: { teams: NFL_TEAMS, sport: LEAGUE_SPORT.nfl },
    nba: { teams: NBA_TEAMS, sport: LEAGUE_SPORT.nba }
  };

  function normalize(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  }

  // Finds the best-matching team for free-text input within the given league
  // ('nfl' or 'nba' — 'other' and anything unrecognized has no team data and
  // always returns null). Prefers the longest matching alias so e.g. "Kansas
  // City Chiefs" beats an accidental partial hit.
  function findTeamMeta(input, league) {
    const set = LEAGUES[league];
    if (!set) return null;
    const norm = normalize(input);
    if (!norm) return null;
    let best = null;
    let bestLen = 0;
    set.teams.forEach(team => {
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

  function logoUrl(team, league) {
    if (!team || !LEAGUES[league]) return null;
    return `https://a.espncdn.com/i/teamlogos/${league}/500/${team.abbr}.png`;
  }

  return { NFL_TEAMS, NBA_TEAMS, LEAGUE_SPORT, findTeamMeta, logoUrl };
});
